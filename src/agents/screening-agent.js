import Anthropic              from '@anthropic-ai/sdk'
import { supabase }           from '../db/client.js'
import { logPrismaEvent, logAudit } from '../utils/prisma-logger.js'
import 'dotenv/config'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })


const SLR_CRITERIA = {
  include: [
    'Studies addressing quantum computing applied to financial risk optimization',
    'LLM or AI orchestration systems for quantum computing workflows',
    'Quantum solvers (QAOA, VQE, quantum annealing) for combinatorial optimization',
    'Quantum circuit synthesis frameworks (Classiq, Qiskit) for financial problems',
    'Enterprise integration of quantum computing platforms',
    'End-to-end quantum computing business platform architectures',
    'Published between 2018 and 2026',
    'Written in English',
    'Peer-reviewed journal articles, conference papers, or arXiv preprints by verified domain experts'
  ],
  exclude: [
    'Pure quantum hardware physics with no software or application relevance',
    'Classical finance with no quantum computing content',
    'Quantum computing in unrelated domains (chemistry, sensing, biology)',
    'Non-peer-reviewed blog posts or vendor marketing',
    'Workshop position papers under 4 pages',
    'Published before 2018 unless foundational (captured via snowballing)',
    'Non-English without authoritative translation'
  ]
}


function buildScreeningPrompt(title, abstract, criteria = null) {
  const active = criteria || SLR_CRITERIA
  return `You are a systematic literature review screening agent. Your task is to screen a paper for inclusion in a systematic literature review.

INCLUSION CRITERIA (paper must meet at least one):
${active.include.map(c => `- ${c}`).join('\n')}

EXCLUSION CRITERIA (paper is excluded if it meets any):
${active.exclude.map(c => `- ${c}`).join('\n')}

PAPER TO SCREEN:
Title: ${title}
Abstract: ${abstract || 'No abstract available'}

Respond ONLY with a JSON object in this exact format, no other text:
{
  "decision": "include" | "exclude" | "maybe",
  "reason": "One clear sentence explaining the decision referencing specific criteria",
  "confidence": 0.0-1.0,
  "criteria_matched": ["list of matched inclusion or exclusion criteria"]
}`
}


async function screenWithClaude(title, abstract, model = 'claude-opus-4-6', criteria = null) {
  const response = await anthropic.messages.create({
    model,
    max_tokens: 300,
    messages: [{
      role:    'user',
      content: buildScreeningPrompt(title, abstract, criteria)
    }]
  })

  const raw = response.content[0].text.trim()
  const text = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()

  try {
    return JSON.parse(text)
  } catch {
    console.error('Claude no devolvió JSON válido:', text)
    return {
      decision:         'maybe',
      reason:           'Error parsing agent response — requires human review',
      confidence:       0.0,
      criteria_matched: []
    }
  }
}


async function saveDecision(studyId, result, agentUserId) {
  const { data, error } = await supabase
    .from('screening_decisions')
    .insert({
      study_id:   studyId,
      stage:      'title_abstract',
      decision:   result.decision,
      reason:     result.reason,
      confidence: result.confidence,
      by_human:   false,
      created_by: agentUserId
    })
    .select()
    .single()

  if (error) {
    console.error('Error guardando decisión:', error.message)
    return null
  }

  return data
}


export async function runScreeningAgent(runId, options = {}) {
  const {
    confidenceThreshold = 0.70,
    batchSize           = 10,
    delayMs             = 500,
    model               = 'claude-opus-4-6',
    criteria            = null
  } = options

  console.log('\n── Screening Agent iniciado ───────────────────────────')
  console.log(`Run ID: ${runId}`)
  console.log(`Umbral de confianza para HITL: ${confidenceThreshold}`)

  const { data: agentUser } = await supabase
    .from('users')
    .select('id')
    .eq('email', 'ai-agent@system')
    .single()

  const agentUserId = agentUser?.id || null

  const { data: allStudies, error } = await supabase
    .from('studies')
    .select('id, title, abstract')
    .eq('run_id', runId)
    .eq('is_duplicate', false)
    .limit(10000)

  if (error || !allStudies) {
    console.error('Error obteniendo studies:', error?.message)
    return
  }

  // Filtrar los que ya tienen decisión
  const allIds = allStudies.map(s => s.id)
  const { data: existing } = await supabase
    .from('screening_decisions')
    .select('study_id')
    .eq('stage', 'title_abstract')
    .in('study_id', allIds)

  const alreadyScreened = new Set((existing || []).map(d => d.study_id))
  const studies = allStudies.filter(s => !alreadyScreened.has(s.id))

  console.log(`Papers totales: ${allStudies.length} | Ya screened: ${alreadyScreened.size} | A evaluar: ${studies.length}`)

  console.log(`Papers a evaluar: ${studies.length}`)

  const counts = {
    include:  0,
    exclude:  0,
    maybe:    0,
    hitl:     0,
    error:    0
  }

  for (let i = 0; i < studies.length; i += batchSize) {
    const batch = studies.slice(i, i + batchSize)

    for (const study of batch) {
      const { data: runCheck } = await supabase.from('runs').select('status').eq('id', runId).single()
      if (runCheck?.status === 'cancelled') {
        console.log('\nRun cancelado — screening agent detenido.')
        return counts
      }

      console.log(`[screening] Procesando ${i + 1}/${studies.length}: ${study.title?.slice(0, 60)}...`)

      try {
        const result = await screenWithClaude(study.title, study.abstract, model, criteria)

        const needsHITL = result.confidence < confidenceThreshold

        if (needsHITL) {
          result.decision = 'maybe'
          result.reason   = `[HITL required — confidence ${result.confidence}] ${result.reason}`
          counts.hitl++
        } else {
          counts[result.decision]++
        }

        await saveDecision(study.id, result, agentUserId)

        await logAudit(
          runId,
          agentUserId,
          `decision.ta.${result.decision}`,
          'study',
          study.id,
          result,
          {
            model:      'claude-opus-4-6',
            confidence: result.confidence,
            hitl:       needsHITL
          }
        )

      } catch (err) {
        console.error(`\nError procesando study ${study.id}:`, err.message)
        counts.error++
      }

      await new Promise(r => setTimeout(r, delayMs))
    }
  }

  console.log('\n')

  await logPrismaEvent(runId, 'screening', 'screened_title_abstract', studies.length)
  await logPrismaEvent(runId, 'screening', 'excluded_ta',             counts.exclude)
  await logPrismaEvent(runId, 'screening', 'included_ta',             counts.include)
  await logPrismaEvent(runId, 'screening', 'maybe_ta',                counts.maybe)
  await logPrismaEvent(runId, 'screening', 'hitl_required',           counts.hitl,
    `Confidence below ${confidenceThreshold}`)

  await supabase
    .from('runs')
    .update({ status: 'screening_done', updated_at: new Date() })
    .eq('id', runId)

  console.log('── Screening Agent completado ─────────────────────────')
  console.log(`Total evaluados:  ${studies.length}`)
  console.log(`Include:          ${counts.include}`)
  console.log(`Exclude:          ${counts.exclude}`)
  console.log(`Maybe / HITL:     ${counts.maybe} (${counts.hitl} requieren revisión humana)`)
  console.log(`Errores:          ${counts.error}`)

  return counts
}