import { adaptQuery } from '../utils/query-adapter.js'

export async function searchCrossref(query, yearFrom = 2018, yearTo = 2026, maxResults = 200) {
  const results   = []
  const batchSize = 100
  let   offset    = 0

  while (results.length < maxResults) {
    const params = new URLSearchParams({
      query: adaptQuery(query, 'crossref'),
      rows:          batchSize,
      offset,
      filter:        `from-pub-date:${yearFrom},until-pub-date:${yearTo},type:journal-article`,
      select:        'DOI,title,abstract,published,author,URL,container-title',
      mailto:        'oscar@tecnun.es'  // polite pool — mejor rate limit
    })

    const res  = await fetch(`https://api.crossref.org/works?${params}`)
    const data = await res.json()

    const items = data.message?.items
    if (!items?.length) break

    results.push(...items.map(normalizeCrossref).filter(Boolean))

    if (items.length < batchSize) break
    offset += batchSize

    await new Promise(r => setTimeout(r, 1000))
  }

  return results.slice(0, maxResults)
}

function extractTitle(raw) {
  if (!raw.title) return 'Sin título'
  return Array.isArray(raw.title) ? raw.title[0] : raw.title
}

function extractYear(raw) {
  const date = raw.published?.['date-parts']?.[0]?.[0]
  return date ? parseInt(date) : null
}

function normalizeCrossref(raw) {
  if (!raw.DOI) return null

  return {
    title:    extractTitle(raw),
    abstract: raw.abstract?.replace(/<[^>]+>/g, '').trim() || null,
    doi:      raw.DOI,
    year:     extractYear(raw),
    authors:  raw.author?.map(a =>
      [a.given, a.family].filter(Boolean).join(' ')
    ).filter(Boolean) || [],
    url:      raw.URL || null,
    source:   'crossref',
    source_id: raw.DOI
  }
}

export async function enrichByDOI(doi) {
  const res  = await fetch(
    `https://api.crossref.org/works/${encodeURIComponent(doi)}?mailto=oscar@tecnun.es`
  )
  if (!res.ok) return null

  const data = await res.json()
  return normalizeCrossref(data.message)
}