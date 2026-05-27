import Anthropic    from '@anthropic-ai/sdk'
import 'dotenv/config'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * Returns true if the string is already a structured Boolean query:
 * one or more parenthesised OR-clusters connected by top-level AND.
 * Examples that pass:
 *   ("LLM" OR "NLP") AND ("quantum computing")
 *   ("a" OR "b") AND ("c" OR "d") AND ("e")
 */
export function isStructuredBoolean(str) {
  return /\([^)]+\)\s+AND\s+\([^)]+\)/i.test(str.trim())
}

/**
 * Asks Claude to convert any query (keywords, natural language, partial Boolean)
 * into a structured Boolean string of the form:
 *   ("term1" OR "term2") AND ("term3" OR "term4")
 *
 * Returns the original string unchanged if Claude fails or returns something
 * that doesn't look like a Boolean string.
 */
export async function normalizeToBoolean(query, topic = '') {
  const prompt = `You are a systematic literature review expert following PRISMA 2020 and Kitchenham guidelines.

Convert the following search input into a structured Boolean search string for academic databases.

REQUIRED FORMAT:
("synonym1" OR "synonym2" OR "synonym3") AND ("concept2a" OR "concept2b")

RULES:
- Identify the 2 main conceptual clusters in the input
- Cluster 1: all synonyms and variants of the first concept, quoted and joined with OR
- Cluster 2: all synonyms and variants of the second concept, quoted and joined with OR
- Multi-word phrases must be in double quotes
- Single-word acronyms may be unquoted
- Connect clusters with AND
- Return ONLY the Boolean string — no explanation, no markdown, no extra text
${topic ? `\nRESEARCH CONTEXT: ${topic}` : ''}

INPUT: ${query}`

  try {
    const response = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages:   [{ role: 'user', content: prompt }]
    })

    const result = response.content[0].text.trim()

    // Sanity check: if Claude returned something that looks like a Boolean string, use it
    if (isStructuredBoolean(result)) return result

    console.warn(`[normalizer] Claude output does not look like a Boolean string — using original.\nOutput: ${result}`)
    return query

  } catch (err) {
    console.error('[normalizer] Claude call failed:', err.message)
    return query
  }
}

/**
 * Ensures a search string is in structured Boolean form.
 * If it already is, returns it immediately (no API call).
 * Otherwise, normalizes it through Claude.
 */
export async function ensureBoolean(query, topic = '') {
  if (isStructuredBoolean(query)) return query
  console.log(`[normalizer] Non-Boolean input detected — normalizing: "${query.slice(0, 60)}..."`)
  return normalizeToBoolean(query, topic)
}
