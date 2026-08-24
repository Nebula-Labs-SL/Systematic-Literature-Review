import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '../db/client.js'
import { logPrismaEvent, logAudit } from '../utils/prisma-logger.js'
import { loadContextDocs } from '../utils/context-loader.js'
import 'dotenv/config'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function buildStage2Prompt(title, abstract, intro, conclusion, criteria, contextText = '') {
  const textSections = []
  if (intro)      textSections.push(`INTRODUCTION:\n${intro.slice(0, 3000)}`)
  if (conclusion) textSections.push(`CONCLUSION:\n${conclusion.slice(0, 2000)}`)
  if (!intro && !conclusion) textSections.push(`ABSTRACT (no full text available):\n${abstract || 'N/A'}`)

  return `${contextText}You are performing Stage 2 eligibility assessment for a systematic literature review.
At this stage you have access to the introduction and conclusion of the paper, not just the title and abstract.
Apply stricter criteria — only papers directly addressing the research question should be included.

INCLUSION CRITERIA:
${criteria.include.map(c => `- ${c}`).join('\n')}

EXCLUSION CRITERIA:
${criteria.exclude.map(c => `- ${c}`).join('\n')}

PAPER:
Title: ${title}

${textSections.join('\n\n')}

Respond ONLY with JSON:
{
  "decision": "include" | "exclude" | "maybe",
  "reason": "one sentence citing specific evidence from intro/conclusion and the matched criterion",
  "confidence": 0.0-1.0,
  "criteria_matched": ["list of criteria"]
}`
}

async function screenStage2(study, criteria, model, contextText = '') {
  const response = await anthropic.messages.create({
    model,
    max_tokens: 400,
    messages: [{
      role:    'user',
      content: buildStage2Prompt(
        study.title,
        study.abstract,
        study.intro_text,
        study.conclusion_text,
        criteria,
        contextText
      )
    }]
  })

  const raw = response.content[0].text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '')
  try {
    return JSON.parse(raw)
  } catch {
    return { decision: 'maybe', reason: 'Parse error — requires human review', confidence: 0.0, criteria_matched: [] }
  }
}

export async function runStage2ScreeningAgent(runId, options = {}) {
  const {
    confidenceThreshold = 0.75,  // Stricter than Stage 1
    model               = 'claude-opus-4-6',
    criteria            = null,
    delayMs             = 800
  } = options

  console.log('\n── Stage 2 Screening Agent iniciado ──────────────────')
  console.log(`Run ID: ${runId} | Umbral: ${confidenceThreshold}`)

  // Get Stage 1 included papers (with or without full text — we screen all of them)
  const { data: studies, error } = await supabase
    .from('studies')
    .select('id, title, abstract, intro_text, conclusion_text, full_text_status, screening_decisions!inner(decision, stage)')
    .eq('run_id', runId)
    .eq('is_duplicate', false)
    .eq('screening_decisions.stage', 'title_abstract')
    .eq('screening_decisions.decision', 'include')

  if (error || !studies?.length) {
    console.log('No hay papers incluidos en Stage 1.')
    return
  }

  // Skip papers that already have a Stage 2 decision
  const allIds = studies.map(s => s.id)
  const { data: existing } = await supabase
    .from('screening_decisions')
    .select('study_id')
    .eq('stage', 'intro_conclusion')
    .in('study_id', allIds)

  const alreadyDone = new Set((existing || []).map(d => d.study_id))
  const toScreen    = studies.filter(s => !alreadyDone.has(s.id))

  console.log(`Stage 1 incluidos: ${studies.length} | Ya con Stage 2: ${alreadyDone.size} | A evaluar: ${toScreen.length}`)

  const activeCriteria = criteria || {
    include: ['Paper directly addresses the stated research question with empirical or theoretical evidence'],
    exclude: ['Paper only tangentially mentions the topic without substantive contribution']
  }

  const contextText = await loadContextDocs(runId)
  if (contextText) console.log(`[stage2] Context docs loaded (${contextText.length} chars)`)

  const counts = { include: 0, exclude: 0, maybe: 0, hitl: 0 }

  for (const study of toScreen) {
    const hasFullText = study.intro_text || study.conclusion_text
    console.log(`[stage2] ${hasFullText ? '✓ texto' : '✗ solo abstract'} | ${study.title?.slice(0, 55)}...`)

    try {
      const result     = await screenStage2(study, activeCriteria, model, contextText)
      const needsHITL  = result.confidence < confidenceThreshold

      if (needsHITL) {
        result.decision = 'maybe'
        result.reason   = `[HITL Stage 2 — conf ${result.confidence.toFixed(2)}] ${result.reason}`
        counts.hitl++
      } else {
        counts[result.decision]++
      }

      await supabase.from('screening_decisions').insert({
        study_id:   study.id,
        stage:      'intro_conclusion',
        decision:   result.decision,
        reason:     result.reason,
        confidence: result.confidence,
        by_human:   false
      })

      await logAudit(runId, null, `decision.ic.${result.decision}`, 'study', study.id, result, {
        model,
        has_full_text: !!hasFullText,
        hitl: needsHITL
      })

    } catch (err) {
      console.error(`[stage2] Error ${study.id}:`, err.message)
    }

    await new Promise(r => setTimeout(r, delayMs))
  }

  await logPrismaEvent(runId, 'eligibility', 'assessed_intro_conclusion', toScreen.length)
  await logPrismaEvent(runId, 'eligibility', 'eligible_included',         counts.include)
  await logPrismaEvent(runId, 'eligibility', 'eligible_excluded',         counts.exclude)
  await logPrismaEvent(runId, 'eligibility', 'eligible_hitl',             counts.hitl)

  await supabase.from('runs').update({ status: 'stage2_done', updated_at: new Date() }).eq('id', runId)

  console.log('── Stage 2 completado ─────────────────────────────────')
  console.log(`Include: ${counts.include} | Exclude: ${counts.exclude} | HITL: ${counts.hitl}`)
  return counts
}
