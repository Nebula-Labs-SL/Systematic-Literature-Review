import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '../db/client.js'
import { logPrismaEvent, logAudit } from '../utils/prisma-logger.js'
import 'dotenv/config'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function buildDarePrompt(title, abstract, introText, conclusionText) {
  const sections = []
  if (introText)      sections.push(`INTRODUCTION:\n${introText.slice(0, 3000)}`)
  if (conclusionText) sections.push(`CONCLUSION:\n${conclusionText.slice(0, 2000)}`)
  if (!introText && !conclusionText && abstract) sections.push(`ABSTRACT:\n${abstract}`)

  const textBlock = sections.length
    ? sections.join('\n\n')
    : 'No full text available — evaluate from title only.'

  return `You are applying the Kitchenham DARE quality assessment rubric for a systematic review on Quantum Computing Business Platforms (QCBP).

Score each criterion: Y=1.0, P=0.5 (partial), N=0.0

Q1 — SCOPE: Are the scope and objectives appropriate and precisely defined?
Q2 — METHODOLOGY: Is the methodology valid and reproducible?
Q3 — RESULTS: Are results clearly stated and supported by evidence?
Q4 — RELEVANCE: Is the contribution directly relevant to QCBP?
  (quantum computing platform, AI/LLM orchestration, quantum finance,
   enterprise quantum integration, or end-to-end quantum architecture)

PAPER:
Title: ${title}

${textBlock}

Respond ONLY with JSON — no markdown, no explanation:
{
  "q1": 0 | 0.5 | 1,
  "q2": 0 | 0.5 | 1,
  "q3": 0 | 0.5 | 1,
  "q4": 0 | 0.5 | 1,
  "justification": "2-3 sentences citing specific evidence for Q1-Q4 scores",
  "confidence": 0.0-1.0
}`
}

export async function runDareAgent(runId, options = {}, onProgress = null) {
  const { model = 'claude-opus-4-6', delayMs = 600 } = options

  console.log('\n── DARE Agent iniciado ────────────────────────────────')
  console.log(`Run ID: ${runId}`)

  const { data: studies, error } = await supabase
    .from('studies')
    .select('id, title, abstract, intro_text, conclusion_text, screening_decisions!inner(decision, stage)')
    .eq('run_id', runId)
    .eq('is_duplicate', false)
    .eq('screening_decisions.stage', 'intro_conclusion')
    .eq('screening_decisions.decision', 'include')

  if (error || !studies?.length) {
    // Fall back to Stage 1 included papers if no Stage 2 decisions exist
    const { data: stage1Studies } = await supabase
      .from('studies')
      .select('id, title, abstract, intro_text, conclusion_text, screening_decisions!inner(decision, stage)')
      .eq('run_id', runId)
      .eq('is_duplicate', false)
      .eq('screening_decisions.stage', 'title_abstract')
      .eq('screening_decisions.decision', 'include')

    if (!stage1Studies?.length) {
      console.log('No hay papers incluidos para DARE.')
      return { high: 0, medium: 0, low: 0 }
    }

    return runDareOnStudies(runId, stage1Studies, model, delayMs, onProgress)
  }

  return runDareOnStudies(runId, studies, model, delayMs, onProgress)
}

async function runDareOnStudies(runId, studies, model, delayMs, onProgress) {
  const allIds = studies.map(s => s.id)
  const { data: existing } = await supabase
    .from('dare_scores')
    .select('study_id')
    .in('study_id', allIds)

  const alreadyScored = new Set((existing || []).map(d => d.study_id))
  const toScore = studies.filter(s => !alreadyScored.has(s.id))

  console.log(`DARE a evaluar: ${toScore.length} (${alreadyScored.size} ya hechos)`)

  const counts = { high: 0, medium: 0, low: 0 }

  for (let i = 0; i < toScore.length; i++) {
    const study = toScore[i]
    const hasText = study.intro_text || study.conclusion_text
    console.log(`[dare] ${i + 1}/${toScore.length} ${hasText ? '✓' : '✗'} ${study.title?.slice(0, 55)}...`)

    try {
      const response = await anthropic.messages.create({
        model,
        max_tokens: 500,
        messages: [{ role: 'user', content: buildDarePrompt(
          study.title, study.abstract, study.intro_text, study.conclusion_text
        )}]
      })

      const raw  = response.content[0].text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '')
      const result = JSON.parse(raw)

      const total = (result.q1 || 0) + (result.q2 || 0) + (result.q3 || 0) + (result.q4 || 0)
      const tier  = total >= 3.0 ? 'high' : total >= 1.5 ? 'medium' : 'low'
      counts[tier]++

      const { error: insertErr } = await supabase.from('dare_scores').insert({
        study_id:      study.id,
        run_id:        runId,
        q1:            Number(result.q1) || 0,
        q2:            Number(result.q2) || 0,
        q3:            Number(result.q3) || 0,
        q4:            Number(result.q4) || 0,
        total,
        tier,
        justification: result.justification || null,
        confidence:    result.confidence != null ? Number(result.confidence) : null,
        by_human:      false
      })
      if (insertErr) console.error(`[dare] Insert error study ${study.id}:`, insertErr.message)

      await logAudit(runId, null, `dare.${tier}`, 'study', study.id,
        { q1: result.q1, q2: result.q2, q3: result.q3, q4: result.q4, total, tier },
        { model, has_full_text: !!hasText }
      )

      console.log(`  → ${total.toFixed(1)}/4 [${tier.toUpperCase()}]`)

    } catch (err) {
      console.error(`[dare] Error ${study.id}:`, err.message)
    }

    if (onProgress) onProgress(Math.round(((i + 1) / toScore.length) * 100))
    await new Promise(r => setTimeout(r, delayMs))
  }

  await logPrismaEvent(runId, 'quality', 'dare_high',   counts.high)
  await logPrismaEvent(runId, 'quality', 'dare_medium', counts.medium)
  await logPrismaEvent(runId, 'quality', 'dare_low',    counts.low)

  await supabase.from('runs')
    .update({ status: 'dare_done', updated_at: new Date() })
    .eq('id', runId)

  console.log(`── DARE completado — High:${counts.high} Medium:${counts.medium} Low:${counts.low}`)
  return counts
}
