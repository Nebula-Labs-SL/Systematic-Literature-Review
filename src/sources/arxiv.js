import { XMLParser }   from 'fast-xml-parser'
import { adaptQuery } from '../utils/query-adapter.js'

const parser = new XMLParser({
  ignoreAttributes:    false,
  attributeNamePrefix: '@_',
  isArray: (name) => ['entry', 'author'].includes(name)
})

export async function searchArxiv(query, yearFrom = 2018, yearTo = 2026, maxResults = 300) {
  const results   = []
  const batchSize = 100
  let   start     = 0

  const searchQuery = adaptQuery(query, 'arxiv')

  while (results.length < maxResults) {
    const params = new URLSearchParams({
      search_query: searchQuery,
      start,
      max_results:  batchSize,
      sortBy:       'relevance',
      sortOrder:    'descending'
    })

    const res  = await fetch(`https://export.arxiv.org/api/query?${params}`)
    const text = await res.text()

    const entries = parseArxivXML(text, yearFrom, yearTo)

    if (!entries.length) break

    results.push(...entries)

    if (entries.length < batchSize) break
    start += batchSize

    await new Promise(r => setTimeout(r, 3000)) // arXiv rate limit
  }

  return results.slice(0, maxResults)
}

function parseArxivXML(xml, yearFrom, yearTo) {
  const feed    = parser.parse(xml)
  const entries = feed?.feed?.entry

  if (!Array.isArray(entries) || !entries.length) return []

  return entries.reduce((acc, entry) => {
    const title     = entry.title?.toString().replace(/\s+/g, ' ').trim()
    const abstract  = entry.summary?.toString().replace(/\s+/g, ' ').trim() || null
    const published = entry.published?.toString() || ''
    const year      = published ? parseInt(published.slice(0, 4)) : null

    if (!title) return acc
    if (year && (year < yearFrom || year > yearTo)) return acc

    const id      = entry.id?.toString() || null
    const arxivId = id?.match(/abs\/([^v]+)/)?.[1] || null

    const doi = entry['arxiv:doi']?.toString().trim() || null

    const authors = (entry.author || []).map(a => a.name?.toString()).filter(Boolean)

    acc.push({
      title,
      abstract,
      doi,
      year,
      authors,
      url:       id,
      source:    'arxiv',
      source_id: arxivId
    })

    return acc
  }, [])
}