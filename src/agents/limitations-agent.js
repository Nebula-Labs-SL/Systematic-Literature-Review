import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '../db/client.js'
import 'dotenv/config'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function buildThesisContext(projectId) {
  const [projectRes, docsRes] = await Promise.all([
    supabase.from('projects').select('name, description').eq('id', projectId).single(),
    supabase.from('context_docs').select('filename, content').eq('project_id', projectId).order('created_at', { ascending: true })
  ])

  const project = projectRes.data
  let ctx = `THESIS: ${project?.name || 'Research thesis'}\n`
  if (project?.description) ctx += `Description: ${project.description}\n`

  const docs = docsRes.data || []
  if (docs.length) {
    ctx += '\nCONTEXT DOCUMENTS:\n'
    for (const doc of docs) {
      ctx += `\n--- ${doc.filename} ---\n${doc.content.slice(0, 4000)}\n`
    }
  }

  return ctx
}

async function generateLimitations(study, thesisContext) {
  const textParts = [
    study.abstract       ? `ABSTRACT:\n${study.abstract}`           : '',
    study.intro_text     ? `INTRODUCTION:\n${study.intro_text}`     : '',
    study.conclusion_text ? `CONCLUSION:\n${study.conclusion_text}` : '',
  ].filter(Boolean)

  const noFullText = !study.intro_text && !study.conclusion_text

  const paperContent = textParts.join('\n\n').slice(0, 12000)

  const prompt = `You are a doctoral research assistant specializing in systematic literature reviews.

THESIS CONTEXT:
${thesisContext}

PAPER TO ANALYZE:
Title: ${study.title || 'Unknown'}
Authors: ${Array.isArray(study.authors) ? study.authors.join(', ') : (study.authors || 'N/A')}
Year: ${study.year || 'N/A'}
${noFullText ? '(Only abstract available — full text could not be retrieved)' : ''}

${paperContent}

TASK:
Write an academic paragraph (150-250 words) about the "limitations relative to the thesis" that explains:
1. What this paper contributes to the thesis research topic
2. What aspects this paper does NOT cover that the thesis must address
3. Why this gap justifies the need and contribution of the thesis

Write in formal academic tone, third person. Be specific to the paper's actual content and directly relevant to the thesis context. Return only the paragraph, no headings or labels.`

  try {
    const response = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages:   [{ role: 'user', content: prompt }]
    })
    return response.content[0].text.trim()
  } catch (e) {
    console.error(`[limitations] Claude error for "${study.title?.slice(0, 50)}":`, e.message)
    return null
  }
}

export async function runLimitationsAgent(projectId, onProgress) {
  console.log(`\n── Limitations Agent — project ${projectId} ────`)

  const { data: runs } = await supabase
    .from('runs')
    .select('id')
    .eq('project_id', projectId)

  if (!runs?.length) return { done: 0, skipped: 0 }

  // Fetch per-run to bypass Supabase db-max-rows=1000 limit
  const allScores = []
  for (const run of runs) {
    const { data } = await supabase
      .from('dare_scores')
      .select('id, tier, limitations_text, studies(id, title, authors, year, abstract, intro_text, conclusion_text)')
      .eq('run_id', run.id)
      .in('tier', ['high', 'medium'])
    if (data) allScores.push(...data)
  }

  const total = allScores.length
  console.log(`Included papers to analyze: ${total}`)

  if (!total) return { done: 0, skipped: 0 }

  const thesisContext = await buildThesisContext(projectId)
  let done = 0, skipped = 0

  for (let i = 0; i < allScores.length; i++) {
    const score  = allScores[i]
    const study  = score.studies

    if (!study) { skipped++; continue }

    // Skip already generated
    if (score.limitations_text) {
      done++
      onProgress?.({ done: i + 1, total, current: study.title, cached: true })
      continue
    }

    console.log(`[limitations] ${i + 1}/${total} "${study.title?.slice(0, 60)}"`)

    const text = await generateLimitations(study, thesisContext)

    if (text) {
      await supabase
        .from('dare_scores')
        .update({ limitations_text: text })
        .eq('id', score.id)
      done++
    } else {
      skipped++
    }

    onProgress?.({ done: i + 1, total, current: study.title })
    await new Promise(r => setTimeout(r, 300))
  }

  console.log(`── Limitations done: ${done} generated | ${skipped} skipped`)
  return { done, skipped }
}
