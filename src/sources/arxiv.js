export async function searchArxiv(query, yearFrom = 2018, yearTo = 2026, maxResults = 300) {
  const results  = []
  const batchSize = 100
  let   start    = 0

  const searchQuery = `all:${encodeURIComponent(query)}`

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

    // arXiv returns XML 
    const entries = parseArxivXML(text, yearFrom, yearTo)

    if (!entries.length) break

    results.push(...entries)

    if (entries.length < batchSize) break
    start += batchSize

    await new Promise(r => setTimeout(r, 3000)) // arXiv asks for 3s between requests
  }

  return results.slice(0, maxResults)
}

function parseArxivXML(xml, yearFrom, yearTo) {
  const results = []

  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g
  let   match

  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1]

    const id        = extractTag(entry, 'id')
    const title     = extractTag(entry, 'title')?.replace(/\s+/g, ' ').trim()
    const abstract  = extractTag(entry, 'summary')?.replace(/\s+/g, ' ').trim()
    const published = extractTag(entry, 'published')
    const year      = published ? parseInt(published.slice(0, 4)) : null

    if (year && (year < yearFrom || year > yearTo)) continue

    const authorRegex = /<author>[\s\S]*?<name>(.*?)<\/name>[\s\S]*?<\/author>/g
    const authors     = []
    let   authorMatch
    while ((authorMatch = authorRegex.exec(entry)) !== null) {
      authors.push(authorMatch[1])
    }

    const doiMatch = entry.match(/<arxiv:doi[^>]*>(.*?)<\/arxiv:doi>/)
    const doi      = doiMatch ? doiMatch[1].trim() : null

    // ID de arXiv (ej. http://arxiv.org/abs/2401.12345v1 → 2401.12345)
    const arxivId = id?.match(/abs\/([^v]+)/)?.[1] || null

    if (!title) continue

    results.push({
      title,
      abstract,
      doi,
      year,
      authors,
      url:       id || null,
      source:    'arxiv',
      source_id: arxivId
    })
  }

  return results
}

function extractTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`))
  return match ? match[1].trim() : null
}