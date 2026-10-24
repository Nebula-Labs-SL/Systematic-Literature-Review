import { useEffect, useState } from 'react'
import { getDareScores, overrideDareScore, triggerDare } from '../lib/api.js'

const TIER_STYLE = {
  high:   { label: 'Alto',  bg: '#d1fae5', color: '#065f46', border: '#6ee7b7' },
  medium: { label: 'Medio', bg: '#fef3c7', color: '#92400e', border: '#fcd34d' },
  low:    { label: 'Bajo',  bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
}

const Q_OPTS = [
  { label: 'Y — Sí (1)',        value: 1   },
  { label: 'P — Parcial (0.5)', value: 0.5 },
  { label: 'N — No (0)',        value: 0   },
]

function TierBadge({ tier }) {
  const s = TIER_STYLE[tier] || TIER_STYLE.low
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px',
      background: s.bg, color: s.color,
      border: `1px solid ${s.border}`,
      borderRadius: '12px', fontSize: '11px', fontWeight: 600
    }}>
      {s.label}
    </span>
  )
}

function ScoreBar({ total }) {
  const pct = (total / 4) * 100
  const color = total >= 3 ? '#10b981' : total >= 1.5 ? '#f59e0b' : '#ef4444'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{
        flex: 1, height: '5px',
        background: 'var(--border)', borderRadius: '3px', overflow: 'hidden'
      }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontFamily: 'var(--mono)', fontSize: '12px', fontWeight: 600, color, flexShrink: 0 }}>
        {total?.toFixed(1)}/4
      </span>
    </div>
  )
}

function DARECard({ score, onSave }) {
  const [editing,  setEditing]  = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [draft,    setDraft]    = useState({
    q1: score.q1, q2: score.q2, q3: score.q3, q4: score.q4,
    justification: score.justification
  })

  const study = score.studies

  async function handleSave() {
    setSaving(true)
    try {
      await onSave(score.id, draft)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '16px',
      marginBottom: '12px'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '10px' }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', margin: '0 0 4px', lineHeight: 1.4 }}>
            {study?.title}
          </p>
          <p style={{ fontSize: '11px', color: 'var(--text-dim)', margin: 0 }}>
            {Array.isArray(study?.authors) ? study.authors.slice(0, 3).join(', ') : study?.authors || '—'}
            {study?.year ? ` · ${study.year}` : ''}
            {' · '}<span style={{ textTransform: 'capitalize' }}>{study?.source}</span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
          <TierBadge tier={score.tier} />
          {score.by_human && (
            <span style={{ fontSize: '10px', color: 'var(--accent)', border: '1px solid var(--accent-border)', padding: '1px 6px', borderRadius: '8px' }}>
              HITL
            </span>
          )}
        </div>
      </div>

      <ScoreBar total={score.total} />

      {/* Q scores */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', margin: '12px 0' }}>
        {['q1', 'q2', 'q3', 'q4'].map((q, i) => (
          <div key={q} style={{
            background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: '6px', padding: '8px', textAlign: 'center'
          }}>
            <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginBottom: '4px' }}>
              {['Scope', 'Method', 'Results', 'Relevance'][i]}
            </div>
            {editing ? (
              <select
                value={draft[q]}
                onChange={e => setDraft(d => ({ ...d, [q]: Number(e.target.value) }))}
                style={{
                  width: '100%', background: 'var(--bg-surface)',
                  border: '1px solid var(--accent-border)',
                  borderRadius: '4px', padding: '2px', fontSize: '11px', color: 'var(--text)'
                }}
              >
                {Q_OPTS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            ) : (
              <div style={{
                fontSize: '18px', fontWeight: 700, fontFamily: 'var(--mono)',
                color: score[q] === 1 ? '#10b981' : score[q] === 0.5 ? '#f59e0b' : '#ef4444'
              }}>
                {score[q] === 1 ? 'Y' : score[q] === 0.5 ? 'P' : 'N'}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Justification */}
      <div style={{ fontSize: '12px', color: 'var(--text)', lineHeight: 1.5, marginBottom: '10px' }}>
        {editing ? (
          <textarea
            value={draft.justification || ''}
            onChange={e => setDraft(d => ({ ...d, justification: e.target.value }))}
            rows={3}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'var(--bg)', border: '1px solid var(--accent-border)',
              borderRadius: '4px', padding: '8px', fontSize: '12px',
              color: 'var(--text)', resize: 'vertical'
            }}
          />
        ) : (
          <p style={{ margin: 0, color: 'var(--text-dim)', fontStyle: 'italic' }}>
            {score.justification || 'Sin justificación'}
          </p>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '8px' }}>
        {editing ? (
          <>
            <button onClick={handleSave} disabled={saving} style={{
              padding: '6px 14px', fontSize: '12px', background: 'var(--accent)',
              color: '#fff', border: 'none', borderRadius: 'var(--radius)',
              cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1
            }}>
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
            <button onClick={() => setEditing(false)} style={{
              padding: '6px 14px', fontSize: '12px', background: 'transparent',
              color: 'var(--text-dim)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', cursor: 'pointer'
            }}>
              Cancelar
            </button>
          </>
        ) : (
          <button onClick={() => setEditing(true)} style={{
            padding: '6px 14px', fontSize: '12px', background: 'transparent',
            color: 'var(--accent)', border: '1px solid var(--accent-border)',
            borderRadius: 'var(--radius)', cursor: 'pointer'
          }}>
            Editar puntuación
          </button>
        )}
      </div>
    </div>
  )
}

const Q_LABEL = v => v === 1 ? 'Y' : v === 0.5 ? 'P' : 'N'

// Tier / Q fill colours (ARGB: FF + hex RGB)
const TIER_FILL  = { high: 'FFD4EDDA', medium: 'FFFFF3CD', low: 'FFF8D7DA' }
const Q_FILL     = { Y: 'FFD4EDDA', P: 'FFFFF3CD', N: 'FFF8D7DA' }
const HEADER_FILL = 'FF1A1A2E'

async function exportXlsx(scores, runId) {
  const XLSX = await import('xlsx')

  const headers = [
    'Title', 'Authors', 'Year', 'Source', 'DOI / URL',
    'Q1 Scope', 'Q2 Method', 'Q3 Results', 'Q4 Relevance',
    'Total', 'Tier', 'By Human', 'Justification'
  ]

  const dataRows = scores.map(s => {
    const link = s.studies?.doi ? `https://doi.org/${s.studies.doi}` : (s.studies?.url || '')
    return [
      s.studies?.title || '',
      Array.isArray(s.studies?.authors) ? s.studies.authors.join('; ') : (s.studies?.authors || ''),
      s.studies?.year || '',
      s.studies?.source?.toUpperCase() || '',
      link,
      Q_LABEL(s.q1), Q_LABEL(s.q2), Q_LABEL(s.q3), Q_LABEL(s.q4),
      s.total != null ? parseFloat(s.total.toFixed(1)) : '',
      s.tier || '',
      s.by_human ? 'Y' : 'N',
      s.justification || '',
    ]
  })

  const wsData = [headers, ...dataRows]
  const ws = XLSX.utils.aoa_to_sheet(wsData)

  // Column widths
  ws['!cols'] = [
    { wch: 60 },  // Title
    { wch: 30 },  // Authors
    { wch: 6  },  // Year
    { wch: 10 },  // Source
    { wch: 40 },  // DOI/URL
    { wch: 8  },  // Q1
    { wch: 8  },  // Q2
    { wch: 8  },  // Q3
    { wch: 8  },  // Q4
    { wch: 7  },  // Total
    { wch: 9  },  // Tier
    { wch: 8  },  // By Human
    { wch: 80 },  // Justification
  ]

  // Freeze header row
  ws['!freeze'] = { xSplit: 0, ySplit: 1 }

  // Style cells
  const range = XLSX.utils.decode_range(ws['!ref'])
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C })
      if (!ws[addr]) continue

      const isHeader = R === 0
      const colName  = headers[C]
      const cellVal  = ws[addr].v

      let fill = isHeader ? HEADER_FILL : 'FFFFFFFF'
      if (!isHeader) {
        if (colName === 'Tier' && TIER_FILL[cellVal])   fill = TIER_FILL[cellVal]
        if (['Q1 Scope','Q2 Method','Q3 Results','Q4 Relevance'].includes(colName) && Q_FILL[cellVal]) fill = Q_FILL[cellVal]
      }

      ws[addr].s = {
        font:      { bold: isHeader, color: { rgb: isHeader ? 'FFFFFFFF' : '00000000' }, sz: 10, name: 'Calibri' },
        fill:      { patternType: 'solid', fgColor: { rgb: fill } },
        alignment: { wrapText: colName === 'Justification' || colName === 'Title', vertical: 'top', horizontal: 'left' },
        border: {
          top:    { style: 'thin', color: { rgb: 'FFCCCCCC' } },
          bottom: { style: 'thin', color: { rgb: 'FFCCCCCC' } },
          left:   { style: 'thin', color: { rgb: 'FFCCCCCC' } },
          right:  { style: 'thin', color: { rgb: 'FFCCCCCC' } },
        }
      }
    }
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'DARE Scores')

  // Summary sheet
  const tiers = ['high', 'medium', 'low']
  const summaryData = [
    ['Tier', 'Count'],
    ...tiers.map(t => [t, scores.filter(s => s.tier === t).length]),
    [],
    ['Total scored', scores.length],
    ['Human overrides', scores.filter(s => s.by_human).length],
  ]
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData)
  wsSummary['!cols'] = [{ wch: 18 }, { wch: 10 }]
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary')

  XLSX.writeFile(wb, `dare-scores-${runId.slice(0, 8)}.xlsx`, { bookType: 'xlsx', cellStyles: true })
}

export default function DAREReview({ runId, runStatus }) {
  const [data,         setData]         = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [triggering,   setTriggering]   = useState(false)
  const [filterTier,   setFilterTier]   = useState('all')

  const canTrigger = ['stage2_done', 'screening_done', 'dare_done', 'extraction_done'].includes(runStatus)

  async function load() {
    try {
      const d = await getDareScores(runId)
      setData(d)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [runId])

  async function handleTrigger() {
    setTriggering(true)
    try {
      await triggerDare(runId)
      await new Promise(r => setTimeout(r, 2000))
      await load()
    } catch (e) {
      alert(e.message)
    } finally {
      setTriggering(false)
    }
  }

  async function handleSave(scoreId, draft) {
    await overrideDareScore(runId, scoreId, draft)
    await load()
  }

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '64px', color: 'var(--text-dim)', fontSize: '13px' }}>
      Cargando puntuaciones QAC...
    </div>
  )

  const scores = data?.scores || []
  const high   = scores.filter(s => s.tier === 'high').length
  const medium = scores.filter(s => s.tier === 'medium').length
  const low    = scores.filter(s => s.tier === 'low').length
  const agreement = data?.agreement_rate

  const filtered = filterTier === 'all' ? scores : scores.filter(s => s.tier === filterTier)

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '48px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '16px', margin: 0 }}>Revisión QAC</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          {scores.length > 0 && (
            <button onClick={() => exportXlsx(scores, runId)} style={{
              padding: '7px 14px', fontSize: '12px', background: 'var(--bg-surface)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius)',
              cursor: 'pointer', color: 'var(--text)'
            }}>
              Exportar Excel
            </button>
          )}
          {canTrigger && scores.length === 0 && (
            <button onClick={handleTrigger} disabled={triggering} style={{
              padding: '9px 18px', fontSize: '13px', fontWeight: 600,
              background: 'var(--accent)', color: '#fff',
              border: 'none', borderRadius: 'var(--radius)',
              cursor: triggering ? 'not-allowed' : 'pointer', opacity: triggering ? 0.6 : 1
            }}>
              {triggering ? 'Iniciando...' : 'Ejecutar QAC scoring →'}
            </button>
          )}
        </div>
      </div>

      {scores.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '48px',
          color: 'var(--text-dim)', fontSize: '13px',
          border: '1px dashed var(--border)', borderRadius: 'var(--radius)'
        }}>
          {canTrigger
            ? 'Haz clic en "Ejecutar QAC scoring" para evaluar la calidad de los estudios incluidos.'
            : 'No hay puntuaciones QAC todavía. El run debe estar en estado stage2_done.'}
        </div>
      )}

      {scores.length > 0 && (
        <>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px' }}>
            {[
              { label: 'Alto (≥3)',    value: high,   color: '#10b981' },
              { label: 'Medio (1.5+)', value: medium, color: '#f59e0b' },
              { label: 'Bajo (<1.5)',  value: low,    color: '#ef4444' },
              { label: 'Total',        value: scores.length, color: 'var(--text-heading)' },
            ].map(s => (
              <div key={s.label} style={{
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', padding: '14px 12px', textAlign: 'center'
              }}>
                <div style={{ fontSize: '22px', fontWeight: 700, color: s.color, fontFamily: 'var(--mono)' }}>
                  {s.value}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {agreement !== null && (
            <div style={{
              fontSize: '12px', color: 'var(--text-dim)', marginBottom: '16px',
              padding: '8px 12px', background: 'var(--bg-surface)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius)'
            }}>
              Acuerdo inter-evaluador (IA vs. humano): <strong style={{ color: 'var(--text)' }}>
                {(agreement * 100).toFixed(1)}%
              </strong>
            </div>
          )}

          {/* Filter */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            {['all', 'high', 'medium', 'low'].map(t => (
              <button
                key={t}
                onClick={() => setFilterTier(t)}
                style={{
                  padding: '5px 12px', fontSize: '11px',
                  background: filterTier === t ? 'var(--accent)' : 'var(--bg-surface)',
                  color:      filterTier === t ? '#fff' : 'var(--text)',
                  border:     `1px solid ${filterTier === t ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: '20px', cursor: 'pointer', fontWeight: filterTier === t ? 600 : 400
                }}
              >
                {t === 'all' ? `Todos (${scores.length})` : t === 'high' ? `Alto (${high})` : t === 'medium' ? `Medio (${medium})` : `Bajo (${low})`}
              </button>
            ))}
          </div>

          {filtered.map(score => (
            <DARECard key={score.id} score={score} onSave={handleSave} />
          ))}
        </>
      )}
    </div>
  )
}
