import { adaptQuery } from '../utils/query-adapter.js'

export async function searchOpenAlex(query, yearFrom = 2018, yearTo = 2026, maxResults = 500) {
  const results = []
  let   cursor  = '*'
  const perPage = 200

  while (results.length < maxResults) {
    const params = new URLSearchParams({
      search:   adaptQuery(query, 'openalex'),
      filter:   `publication_year:${yearFrom}-${yearTo},language:en`,
      per_page: perPage,
      cursor,
      select:   'id,title,abstract_inverted_index,publication_year,authorships,doi,primary_location',
      mailto:   'oscar@tecnun.es'
    })

    const res  = await fetch(`https://api.openalex.org/works?${params}`)
    const data = await res.json()

    if (!data.results?.length) break

    results.push(...data.results.map(normalizeOpenAlex))

    if (!data.meta?.next_cursor || data.results.length < perPage) break
    cursor = data.meta.next_cursor

    await new Promise(r => setTimeout(r, 500))
  }

  return results
}

function reconstructAbstract(invertedIndex) {
  if (!invertedIndex) return null
  const words = []
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions) words[pos] = word
  }
  return words.filter(Boolean).join(' ')
}

function normalizeOpenAlex(raw) {
  return {
    title:     raw.title || 'Sin título',
    abstract:  reconstructAbstract(raw.abstract_inverted_index),
    doi:       raw.doi?.replace('https://doi.org/', '') || null,
    year:      raw.publication_year,
    authors:   raw.authorships?.map(a => a.author?.display_name).filter(Boolean) || [],
    url:       raw.primary_location?.landing_page_url || null,
    source:    'openalex',
    source_id: raw.id
  }
}