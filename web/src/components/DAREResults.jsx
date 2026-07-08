import { useEffect, useState } from 'react'
import { getDareScores } from '../lib/api.js'

const TIER_COLOR = {
  high:   { bg: '#d1fae5', color: '#065f46', border: '#6ee7b7', label: 'High' },
  medium: { bg: '#fef3c7', color: '#92400e', border: '#fcd34d', label: 'Medium' },
  low:    { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5', label: 'Low' },
}

function exportCsv(scores, runId) {
  const headers = ['title', 'authors', 'year', 'source', 'q1', 'q2', 'q3', 'q4', 'total', 'tier', 'justification']
  const esc = v => {
    if (v == null) return ''
    const s = String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }
  const rows = scores.map(s => [
    s.studies?.title,
    Array.isArray(s.studies?.authors) ? s.studies.authors.join('; ') : (s.studies?.authors || ''),
    s.studies?.year,
    s.studies?.source,
    s.q1, s.q2, s.q3, s.q4,
    s.total?.toFixed(2), s.tier, s.justification
  ].map(esc).join(','))
  const csv = [headers.join(','), ...rows].join('\r\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `dare-results-${runId.slice(0, 8)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

export default function DAREResults({ runId }) {
  const [data,      setData]      = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [minTier,   setMinTier]   = useState('medium') // 'high' | 'medium' | 'low'
  const [expanded,  setExpanded]  = useState(null)

  useEffect(() => {
    async function load() {
      try { setData(await getDareScores(runId)) }
      catch (e) { console.error(e) }
      finally { setLoading(false) }
    }
    load()
  }, [runId])

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '64px', color: 'var(--text-dim)', fontSize: '13px' }}>
      Loading DARE results...
    </div>
  )

  const scores = data?.scores || []

  const tierRank = { high: 3, medium: 2, low: 1 }
  const minRank  = tierRank[minTier] || 2

  const included = scores.filter(s => tierRank[s.tier] >= minRank)
  const excluded = scores.filter(s => tierRank[s.tier] < minRank)

  if (scores.length === 0) return (
    <div style={{ textAlign: 'center', padding: '64px', color: 'var(--text-dim)', fontSize: '13px',
      border: '1px dashed var(--border)', borderRadius: 'var(--radius)', margin: '48px 24px' }}>
      No DARE scores yet. Run DARE scoring first.
    </div>
  )

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto', padding: '48px 24px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '16px', margin: '0 0 4px' }}>DARE Results</h2>
          <p style={{ fontSize: '11px', color: 'var(--text-dim)', margin: 0 }}>
            Final included papers after quality assessment
          </p>
        </div>
        <button onClick={() => exportCsv(included, runId)} style={{
          padding: '7px 14px', fontSize: '12px', background: 'var(--bg-surface)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius)',
          cursor: 'pointer', color: 'var(--text)'
        }}>
          Export CSV ({included.length})
        </button>
      </div>

      {/* Tier threshold selector */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px',
        padding: '12px 16px', background: 'var(--bg-surface)',
        border: '1px solid var(--border)', borderRadius: 'var(--radius)'
      }}>
        <span style={{ fontSize: '12px', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
          Include papers from:
        </span>
        {['high', 'medium', 'low'].map(t => (
          <button key={t} onClick={() => setMinTier(t)} style={{
            padding: '4px 12px', fontSize: '11px', borderRadius: '20px', cursor: 'pointer',
            fontWeight: minTier === t ? 600 : 400,
            background: minTier === t ? TIER_COLOR[t].bg : 'transparent',
            color: minTier === t ? TIER_COLOR[t].color : 'var(--text-dim)',
            border: `1px solid ${minTier === t ? TIER_COLOR[t].border : 'var(--border)'}`,
          }}>
            {TIER_COLOR[t].label}+
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-dim)' }}>
          <strong style={{ color: 'var(--text-heading)' }}>{included.length}</strong> included ·{' '}
          <strong style={{ color: 'var(--red)' }}>{excluded.length}</strong> excluded
        </span>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '24px' }}>
        {(['high', 'medium', 'low']).map(tier => {
          const count = scores.filter(s => s.tier === tier).length
          const isIncl = tierRank[tier] >= minRank
          return (
            <div key={tier} style={{
              background: 'var(--bg-surface)', border: `1px solid ${isIncl ? TIER_COLOR[tier].border : 'var(--border)'}`,
              borderRadius: 'var(--radius)', padding: '14px 12px', textAlign: 'center',
              opacity: isIncl ? 1 : 0.5
            }}>
              <div style={{ fontSize: '22px', fontWeight: 700, color: TIER_COLOR[tier].color, fontFamily: 'var(--mono)' }}>
                {count}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px' }}>
                {TIER_COLOR[tier].label} {isIncl ? '✓' : '✗'}
              </div>
            </div>
          )
        })}
      </div>

      {/* Included papers */}
      <p style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)', marginBottom: '10px' }}>
        Included — {included.length} papers
      </p>
      {included.map(score => (
        <PaperRow key={score.id} score={score} expanded={expanded === score.id} onToggle={() => setExpanded(expanded === score.id ? null : score.id)} />
      ))}

      {/* Excluded papers */}
      {excluded.length > 0 && (
        <>
          <p style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--red)', margin: '24px 0 10px' }}>
            Excluded by DARE threshold — {excluded.length} papers
          </p>
          {excluded.map(score => (
            <PaperRow key={score.id} score={score} expanded={expanded === score.id} onToggle={() => setExpanded(expanded === score.id ? null : score.id)} dimmed />
          ))}
        </>
      )}
    </div>
  )
}

function PaperRow({ score, expanded, onToggle, dimmed }) {
  const study = score.studies
  const tier  = TIER_COLOR[score.tier] || TIER_COLOR.low

  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', marginBottom: '8px',
      opacity: dimmed ? 0.6 : 1, cursor: 'pointer'
    }} onClick={onToggle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px' }}>
        <span style={{
          fontSize: '10px', padding: '2px 8px', borderRadius: '12px', flexShrink: 0, fontWeight: 600,
          background: tier.bg, color: tier.color, border: `1px solid ${tier.border}`
        }}>
          {tier.label}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-heading)', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {study?.title}
          </p>
          <p style={{ fontSize: '11px', color: 'var(--text-dim)', margin: 0 }}>
            {Array.isArray(study?.authors) ? study.authors.slice(0, 2).join(', ') : study?.authors}
            {study?.year ? ` · ${study.year}` : ''} · {study?.source}
          </p>
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: '13px', fontWeight: 700, color: tier.color, flexShrink: 0 }}>
          {score.total?.toFixed(1)}/4
        </span>
      </div>

      {expanded && (
        <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px', margin: '12px 0 10px' }}>
            {['q1','q2','q3','q4'].map((q, i) => (
              <div key={q} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginBottom: '4px' }}>
                  {['Scope','Method','Results','Relevance'][i]}
                </div>
                <div style={{ fontSize: '16px', fontWeight: 700, fontFamily: 'var(--mono)',
                  color: score[q] === 1 ? '#10b981' : score[q] === 0.5 ? '#f59e0b' : '#ef4444' }}>
                  {score[q] === 1 ? 'Y' : score[q] === 0.5 ? 'P' : 'N'}
                </div>
              </div>
            ))}
          </div>
          {score.justification && (
            <p style={{ fontSize: '12px', color: 'var(--text-dim)', fontStyle: 'italic', margin: 0, lineHeight: 1.5 }}>
              {score.justification}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
