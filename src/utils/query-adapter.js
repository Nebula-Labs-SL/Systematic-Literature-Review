/**
 * Splits a Boolean string on top-level AND operators (not inside parentheses).
 * "CLUSTER_A AND CLUSTER_B" → ['CLUSTER_A', 'CLUSTER_B']
 * Returns the original string wrapped in an array if no top-level AND is found.
 */
function parseClusters(boolStr) {
  const str = boolStr.trim()
  const clusters = []
  let depth = 0
  let start = 0

  for (let i = 0; i < str.length; i++) {
    if (str[i] === '(') depth++
    else if (str[i] === ')') depth--

    if (depth === 0) {
      const ahead = str.slice(i)
      const m = ahead.match(/^\s+AND\s+/i)
      if (m) {
        clusters.push(str.slice(start, i).trim())
        i += m[0].length - 1
        start = i + 1
      }
    }
  }

  const tail = str.slice(start).trim()
  if (tail) clusters.push(tail)
  return clusters.length > 1 ? clusters : [str]
}

/**
 * Extracts quoted phrases (and unquoted fallback) from an OR-connected cluster.
 * '("large language model" OR "LLM" OR "NLP")' → ['large language model', 'LLM', 'NLP']
 */
function extractTerms(cluster) {
  const inner = cluster.replace(/^\s*\(+/, '').replace(/\)+\s*$/, '')
  const terms = []

  const re = /"([^"]+)"/g
  let m
  while ((m = re.exec(inner)) !== null) terms.push(m[1])

  // Fallback for unquoted clusters: split on OR, skip operator keywords
  if (terms.length === 0) {
    inner.split(/\s+OR\s+/i).forEach(t => {
      const w = t.trim().replace(/[()]/g, '')
      if (w && !['OR', 'AND', 'ANDNOT'].includes(w.toUpperCase())) terms.push(w)
    })
  }

  return terms
}

/**
 * arXiv: (all:"term1" OR all:term2) AND (all:"term3" OR all:term4)
 * Each term gets its own `all:` prefix so arXiv treats them as field queries,
 * not literal text. Multi-word terms are quoted.
 */
function buildArxivQuery(parsed) {
  return parsed.map(({ terms }) => {
    const parts = terms.map(t => `all:${t.includes(' ') ? `"${t}"` : t}`).join(' OR ')
    return `(${parts})`
  }).join(' AND ')
}

/**
 * OpenAlex / Crossref: space-separated terms stripped of Boolean syntax.
 * These APIs use relevance scoring — Claude's screening handles false positives.
 */
function buildRelevanceQuery(parsed) {
  const all = parsed.flatMap(({ terms }) => terms)
  return [...new Set(all)].join(' ')
}

/**
 * Returns a query string adapted for the target source's search API.
 *
 * - arxiv:    Boolean format using per-term `all:` prefixes
 * - ieee:     Raw Boolean string (IEEE Xplore supports AND/OR natively)
 * - openalex: Relevance terms (no Boolean support in `search` param)
 * - crossref: Relevance terms (no Boolean support in `query` param)
 */
export function adaptQuery(rawQuery, source) {
  const isBooleanString = /\bAND\b|\bOR\b/i.test(rawQuery)
  if (!isBooleanString) return rawQuery

  const clusters = parseClusters(rawQuery)
  const parsed   = clusters.map(c => ({ raw: c, terms: extractTerms(c) }))

  switch (source) {
    case 'arxiv':    return buildArxivQuery(parsed)
    case 'ieee':     return rawQuery
    case 'openalex': return buildRelevanceQuery(parsed)
    case 'crossref': return buildRelevanceQuery(parsed)
    default:         return rawQuery
  }
}
