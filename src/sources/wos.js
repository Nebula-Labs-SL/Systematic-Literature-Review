import { adaptQuery } from '../utils/query-adapter.js'
import 'dotenv/config'

const WOS_API_KEY = process.env.WOS_API_KEY

// Switch between Starter and Expanded API via env var
// Starter (free): no abstracts — Expanded (institutional): includes abstracts
const WOS_API_TYPE = process.env.WOS_API_TYPE || 'starter' // 'starter' | 'expanded'
const BASE_URL = WOS_API_TYPE === 'expanded'
  ? 'https://api.clarivate.com/apis/wos'
  : 'https://api.clarivate.com/apis/wos-starter/v1'

/**
 * Web of Science search — supports both Starter and Expanded APIs.
 *
 * Starter API: title, authors, DOI, year, keywords (no abstracts)
 * Expanded API: all fields including abstracts
 *
 * Set WOS_API_TYPE=expanded in .env when using institutional API key.
 */
export async function searchWos(query, yearFrom = 2018, yearTo = 2026, maxResults = 500) {
  if (!WOS_API_KEY) {
    console.warn('[wos] WOS_API_KEY not set — skipping')
    return []
  }

  const adaptedQuery = adaptQuery(query, 'wos')
  const wosQuery = `TS=(${adaptedQuery}) AND PY=(${yearFrom}-${yearTo})`

  console.log(`[wos] Using ${WOS_API_TYPE} API`)

  if (WOS_API_TYPE === 'expanded') {
    return searchExpanded(wosQuery, maxResults)
  }
  return searchStarter(wosQuery, maxResults)
}

// ─── Starter API ─────────────────────────────────────────────────────────────

async function searchStarter(wosQuery, maxResults) {
  const results = []
  let page = 1
  const perPage = 50

  while (results.length < maxResults) {
    const params = new URLSearchParams({
      db: 'WOS', q: wosQuery, limit: perPage, page,
    })

    const res = await fetch(`${BASE_URL}/documents?${params}`, {
      headers: { 'X-ApiKey': WOS_API_KEY, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(30000)
    })

    if (!res.ok) {
      console.error(`[wos] Starter API error (${res.status}): ${await res.text().catch(() => res.statusText)}`)
      break
    }

    const data = await res.json()
    const hits = data.hits || []
    if (!hits.length) break

    results.push(...hits.map(normalizeStarter))

    const totalFound = data.metadata?.total || 0
    if (results.length >= totalFound || hits.length < perPage) break

    page++
    await new Promise(r => setTimeout(r, 1000))
  }

  console.log(`[wos] WARNING: Starter API does not return abstracts. Papers will have abstract=null.`)
  console.log(`[wos] Set WOS_API_TYPE=expanded with institutional key to get abstracts.`)
  return results.slice(0, maxResults)
}

// ─── Expanded API ────────────────────────────────────────────────────────────

async function searchExpanded(wosQuery, maxResults) {
  const results = []
  let firstRecord = 1
  const perPage = 100 // Expanded allows up to 100

  while (results.length < maxResults) {
    const params = new URLSearchParams({
      databaseId: 'WOS',
      usrQuery:   wosQuery,
      count:      perPage,
      firstRecord,
    })

    const res = await fetch(`${BASE_URL}?${params}`, {
      headers: { 'X-ApiKey': WOS_API_KEY, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(30000)
    })

    if (!res.ok) {
      console.error(`[wos] Expanded API error (${res.status}): ${await res.text().catch(() => res.statusText)}`)
      break
    }

    const data = await res.json()
    const records = data.Data?.Records?.records?.REC || []
    if (!records.length) break

    results.push(...records.map(normalizeExpanded))

    const totalFound = data.QueryResult?.RecordsFound || 0
    if (results.length >= totalFound || records.length < perPage) break

    firstRecord += perPage
    await new Promise(r => setTimeout(r, 1000))
  }

  return results.slice(0, maxResults)
}

// ─── Normalizers ─────────────────────────────────────────────────────────────

function normalizeStarter(raw) {
  const names = raw.names?.authors || []
  const authors = names.map(a => a.displayName || a.wosStandard || '').filter(Boolean)

  return {
    title:     raw.title || 'Untitled',
    abstract:  null,
    doi:       raw.identifiers?.doi || null,
    year:      raw.source?.publishYear || null,
    authors,
    url:       raw.links?.record || null,
    source:    'wos',
    source_id: raw.uid || null
  }
}

function normalizeExpanded(rec) {
  const staticData = rec.static_data || {}
  const summary    = staticData.summary || {}
  const fullRecord = staticData.fullrecord_metadata || {}
  const titles     = summary.titles?.title || []
  const names      = summary.names?.name || []
  const abstracts  = fullRecord.abstracts?.abstract?.abstract_text?.p || []

  const title   = titles.find(t => t.type === 'item')?.content || 'Untitled'
  const authors = names
    .filter(n => n.role === 'author')
    .map(n => n.full_name || n.wos_standard || '')
    .filter(Boolean)

  const doi = rec.dynamic_data?.cluster_related?.identifiers?.identifier
    ?.find(id => id.type === 'doi')?.value || null

  const year = summary.pub_info?.pubyear ? Number(summary.pub_info.pubyear) : null

  const abstractText = Array.isArray(abstracts)
    ? abstracts.join(' ')
    : (typeof abstracts === 'string' ? abstracts : null)

  return {
    title,
    abstract:  abstractText,
    doi,
    year,
    authors,
    url:       null,
    source:    'wos',
    source_id: rec.UID || null
  }
}
