import { supabase } from "../db/client.js";
import { logAudit, logPrismaEvent } from "../utils/prisma-logger.js";
import { runScreeningAgent } from "./screening-agent.js";

const AGENT_USER_ID = null

//OpenAlex API

const searchOpenAlex = async(query, yearFrom=2018, yearTo=2026, perPage=200) =>{
    const params = new URLSearchParams({
        search: query,
        filter: `publication_year:${yearFrom}-${yearTo},language:en`,
        per_page: perPage,
        select: 'id, title, abstract_inverted_index, publication_year, authorships, doi, primary_location, open_access',
        mailto: 'oscar.gallego@nebulalabs.es'
    })
    const url = `https://api.openalex.org/works?${params}`;
    console.log(`Buscando en OpenAlex: ${query}`);

    const res = await fetch(url);
    const data = await res.json()

    if(!data.results){
        console.error('No result from OpenAlex: ', data);
        return[];
    }

    console.log(`OpenAlex: ${data.meta?.count} total results, recieved ${data.results.length}`);
    return data.results;
}

//OpenAlex saves abstracts as inverted indxs and the text needs to be sorted by position.

const reconstructAbstract = (invertedIndex) =>{
    if(!invertedIndex) return null;

    const words = []
    for(const [word, positions] of Object.entries(invertedIndex)){
        for(const pos of positions){
            words[pos] = word
        }
    }
    return words.filter(Boolean).join(' ');
}

const normalizeRecord = (raw) =>{
    return {
        title: raw.title || 'No title',
        abstract: reconstructAbstract(raw.abstract_inverted_index),
        doi: raw.doi?.replace('https://doi.org/', '') || null,
        year: raw.publication_year,
        authors: raw.authorships?.map(a => a.author?.display_name).filter(Boolean) || [],
        url: raw.primary_location?.landing_page_url || raw.doi || null,
        source: 'OpenAlex',
        source_id: raw.id
    }
}

//Delete duplicate studies
const deduplicateStudies = async(runId, studies) =>{
    let duplicate = 0;
    for(const study of studies){
        if(!study.doi) continue;
        // search if doi already exists in DB
        const {data: existing} = await supabase.from('studies').select('id').eq('run_id', runId).eq('doi', study.doi).maybeSingle();
        if(existing){
            study.is_duplicate = true;
            duplicate++;
        }
    }
    return {studies, duplicate}
}

//Save papers in DB
const saveStudies = async (runId, studies) => {
    const records = studies.map(s=>({
        ...s,
        run_id: runId
    }))
    const batchSize = 100;
    let inserted = 0;
    for(let i = 0; i<records.length; i += batchSize){
        const batch = records.slice(i, i + batchSize);
        const { data, error } = await supabase.from('studies').insert(batch).select('id');
        if(error) console.error('Batch insetion failed: ' , error.message);
        inserted += data.length;
        console.log(`Saved ${inserted}/${records.length} papers...`)
    }
    return inserted;
}

export const runSearchAgent = async (topic, strings, runId, options = {}) => {
    const {yearFrom = 2018, yearTo = 2026} = options
    console.log('SEARCH AGENT INITIATED');;
    console.log(`Topic: ${topic}`);

    const { error: updateError } = await supabase.from('runs').update({
        status: 'searching',
        updated_at: new Date()
    }).eq('id', runId);

    if(updateError){
        console.error('Error updating run status: ', updateError.message);
        return null
    }

    const run = { id: runId }
    console.log(`Run iniciado: ${run.id}`);


    const allResults = [];

    for(const [index, searchString] of strings.entries()){
        console.log(`\nString ${index+1}/${strings.length}`)

        const raw = await searchOpenAlex(searchString, yearFrom, yearTo);
        const normalized = raw.map(item => normalizeRecord(item));

        await logPrismaEvent(
            run.id,
            'identification',
            `records_openalex_strings${index+1}`,
            normalized.length,
            `Query: "${searchString}"`
        )
        allResults.push(...normalized);

        //Little pause for preventing API saturation
        await new Promise (r => {
            setTimeout(r,1000)
        })
    }
    await logPrismaEvent(
        run.id,
        'identification',
        `total_before_dedup`,
        allResults.length,
        `OpenAlex - all strings combined`
    )

    const { studies, duplicate } = await deduplicateStudies(run.id, allResults);

    await logPrismaEvent(
        run.id,
        'identification',
        `duplicates_removed`,
        duplicate,
        `Deduplication by DOI`
    )

    const afterDedup = studies.filter(s=> !s.is_duplicate)

    await logPrismaEvent(
        run.id,
        'identification',
        `after_dedup`,
        afterDedup.length
    )

    const inserted = await saveStudies(run.id, studies)

    console.log('\nSearch agent completed');
    console.log(`Papers found: ${allResults.length}`);
    console.log(`Duplicates marked: ${duplicate}`);
    console.log(`Unique Papers: ${afterDedup.length}`);
    console.log(`Saved in DB : ${inserted}`);

    console.log('\nLaunching screening agent...');
    await runScreeningAgent(run.id);

    return run.id;
}
