import Anthropic from '@anthropic-ai/sdk'
import 'dotenv/config'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function generateSearchStrings(topic, description = '') {
  console.log('Generando strings booleanos...')

  const response = await anthropic.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: `You are an expert in systematic literature reviews following PRISMA 2020 and Kitchenham guidelines.

Generate exactly 5 Boolean search strings for a systematic literature review on this topic:

TOPIC: ${topic}
${description ? `ADDITIONAL CONTEXT: ${description}` : ''}

Requirements:
- Each string must follow PICO-structured Boolean methodology (Kitchenham & Charters, 2007)
- Use OR to connect synonyms within concepts
- Use AND to connect concept clusters
- Strings should cover different angles of the topic
- Designed for databases: IEEE Xplore, ACM DL, Scopus, Web of Science, arXiv

Respond ONLY with a JSON array of exactly 5 strings, no other text:
["string1", "string2", "string3", "string4", "string5"]`
    }]
  })

  const text = response.content[0].text.trim()

  try {
    const strings = JSON.parse(text)
    console.log('Strings generados:', strings.length)
    strings.forEach((s, i) => console.log(`  String ${i + 1}: ${s.slice(0, 80)}...`))
    return strings
  } catch {
    console.error('Error parseando strings:', text)
    // Fallback: devolver el topic directamente como string único
    return [topic]
  }
}