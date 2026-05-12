import 'dotenv/config'

export async function searchIEEE(query, yearFrom = 2018, yearTo = 2026, maxResults = 200) {
  const results   = []
  const batchSize = 25
  let   start     = 1

  while (results.length < maxResults) {
    const params = new URLSearchParams({
      querytext:   query,
      start_year:  yearFrom,
      end_year:    yearTo,
      start_record: start,
      max_records: batchSize,
      sort_field:  'relevance',
      apikey:      process.env.IEEE_API_KEY
    })

    const res  = await fetch(`https://ieeexploreapi.ieee.org/api/v1/search/articles?${params}`)

    if (!res.ok) {
      console.error(`IEEE API error: ${res.status} ${res.statusText}`)
      break
    }

    const data = await res.json()

    if (!data.articles?.length) break

    results.push(...data.articles.map(normalizeIEEE))

    if (results.length >= data.total_records) break
    if (data.articles.length < batchSize)     break

    start += batchSize
    await new Promise(r => setTimeout(r, 1000))
  }

  return results.slice(0, maxResults)
}

function normalizeIEEE(raw) {
  return {
    title:    raw.title || 'Sin título',
    abstract: raw.abstract || null,
    doi:      raw.doi || null,
    year:     raw.publication_year ? parseInt(raw.publication_year) : null,
    authors:  raw.authors?.authors?.map(a => a.full_name).filter(Boolean) || [],
    url:      raw.html_url || raw.pdf_url || null,
    source:   'ieee',
    source_id: raw.article_number?.toString() || null
  }
}