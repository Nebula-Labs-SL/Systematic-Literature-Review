import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '../db/client.js'
import { logPrismaEvent, logAudit } from '../utils/prisma-logger.js'
import 'dotenv/config'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function buildExtractionPrompt(study) {
  const sections = []
  if (study.intro_text)      sections.push(`INTRODUCTION:\n${study.intro_text.slice(0, 3000)}`)
  if (study.conclusion_text) sections.push(`CONCLUSION:\n${study.conclusion_text.slice(0, 2000)}`)
  if (!sections.length && study.abstract) sections.push(`ABSTRACT:\n${study.abstract}`)

  const textBlock = sections.length
    ? sections.join('\n\n')
    : 'No full text — extract from title only.'

  return `Extract structured data from this paper for a systematic review on Quantum Computing Business Platforms (QCBP).

QCBP LAYERS (select all that apply):
L1 - LLM / AI Orchestration
L2 - Quantum Solver & Circuit Design (QAOA, VQE, annealing)
L3 - Financial Risk Application
L4 - Enterprise Integration
L5 - End-to-End QCBP Architecture

RESEARCH QUESTIONS (select all that apply):
RQ1 - LLM/AI orchestration for quantum workflows
RQ2 - Quantum solver design for combinatorial optimization
RQ3 - Financial risk quantification via quantum computing
RQ4 - Enterprise integration of quantum platforms
RQ5 - End-to-end QCBP architecture

PAPER:
Title: ${study.title}
Authors: ${Array.isArray(study.authors) ? study.authors.join(', ') : (study.authors || 'Unknown')}
Year: ${study.year || 'Unknown'}
Venue: ${study.venue || study.source || 'Unknown'}

${textBlock}

Respond ONLY with JSON — no markdown, no explanation:
{
  "citation": "Authors (year). Title. Venue.",
  "qcbp_layers": ["L1", "L2"],
  "research_questions": ["RQ1"],
  "methodology": "brief method description",
  "key_finding": "main contribution in one sentence",
  "quantitative_evidence": "specific numbers/metrics cited, or null",
  "limitations": "stated limitations, or null"
}`
}

export async function runExtractionAgent(runId, options = {}, onProgress = null) {
  const { model = 'claude-opus-4-6', delayMs = 600 } = options

  console.log('\n── Extraction Agent iniciado ──────────────────────────')
  console.log(`Run ID: ${runId}`)

  const { data: scores, error } = await supabase
    .from('dare_scores')
    .select('study_id')
    .eq('run_id', runId)
    .in('tier', ['high', 'medium'])

  if (error || !scores?.length) {
    console.log('No hay estudios DARE high/medium para extraer.')
    return { extracted: 0 }
  }

  const scoreIds = scores.map(s => s.study_id)

  const { data: studies } = await supabase
    .from('studies')
    .select('id, title, abstract, authors, year, venue, source, intro_text, conclusion_text')
    .in('id', scoreIds)

  const { data: existing } = await supabase
    .from('extractions')
    .select('study_id')
    .in('study_id', scoreIds)

  const alreadyDone = new Set((existing || []).map(e => e.study_id))
  const toExtract   = (studies || []).filter(s => !alreadyDone.has(s.id))

  console.log(`A extraer: ${toExtract.length} (${alreadyDone.size} ya hechos)`)

  let extracted = 0

  for (let i = 0; i < toExtract.length; i++) {
    const study = toExtract[i]
    console.log(`[extraction] ${i + 1}/${toExtract.length} ${study.title?.slice(0, 55)}...`)

    try {
      const response = await anthropic.messages.create({
        model,
        max_tokens: 800,
        messages: [{ role: 'user', content: buildExtractionPrompt(study) }]
      })

      const raw    = response.content[0].text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '')
      const result = JSON.parse(raw)

      await supabase.from('extractions').insert({
        study_id:              study.id,
        run_id:                runId,
        qcbp_layers:           result.qcbp_layers           || [],
        research_questions:    result.research_questions    || [],
        methodology:           result.methodology           || null,
        key_finding:           result.key_finding           || null,
        quantitative_evidence: result.quantitative_evidence || null,
        limitations:           result.limitations           || null
      })

      await logAudit(runId, null, 'extraction.done', 'study', study.id, result, { model })

      extracted++
      console.log(`  → ${result.qcbp_layers?.join('+') || '?'} | ${result.research_questions?.join('+') || '?'}`)

    } catch (err) {
      console.error(`[extraction] Error ${study.id}:`, err.message)
    }

    if (onProgress) onProgress(Math.round(((i + 1) / toExtract.length) * 100))
    await new Promise(r => setTimeout(r, delayMs))
  }

  await logPrismaEvent(runId, 'extraction', 'extracted_total', extracted)
  await supabase.from('runs')
    .update({ status: 'extraction_done', updated_at: new Date() })
    .eq('id', runId)

  console.log(`── Extraction completada: ${extracted} estudios`)
  return { extracted }
}
