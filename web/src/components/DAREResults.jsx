import { useEffect, useRef, useState } from 'react'
import { getDareScores, getProjectDareScores, generateLimitations, getPdfUrl, uploadStudyPdf } from '../lib/api.js'
import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, HeadingLevel, WidthType } from 'docx'

const TIER_COLOR = {
  high:   { bg: '#d1fae5', color: '#065f46', border: '#6ee7b7', label: 'High' },
  medium: { bg: '#fef3c7', color: '#92400e', border: '#fcd34d', label: 'Medium' },
  low:    { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5', label: 'Low' },
}

async function exportWord(scores, id) {
  const hasLimitations = scores.some(s => s.limitations_text)

  const cell = (text, bold = false, width) => new TableCell({
    ...(width ? { width: { size: width, type: WidthType.PERCENTAGE } } : {}),
    children: [new Paragraph({ children: [new TextRun({ text: String(text ?? '—'), bold, size: 16 })] })]
  })

  const headers = ['Title', 'Authors', 'Year', 'Source', 'Q1', 'Q2', 'Q3', 'Q4', 'Total', 'Tier', 'Justification']
  if (hasLimitations) headers.push('Limitaciones')

  const headerRow = new TableRow({
    children: headers.map(h => cell(h, true)),
    tableHeader: true
  })

  const dataRows = scores.map(s => {
    const cols = [
      cell(s.studies?.title),
      cell(Array.isArray(s.studies?.authors) ? s.studies.authors.join('; ') : (s.studies?.authors || '')),
      cell(s.studies?.year),
      cell(s.studies?.source?.toUpperCase()),
      cell(s.q1), cell(s.q2), cell(s.q3), cell(s.q4),
      cell(s.total?.toFixed(2)),
      cell(s.tier),
      cell(s.justification),
    ]
    if (hasLimitations) cols.push(cell(s.limitations_text || '—'))
    return new TableRow({ children: cols })
  })

  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ text: 'SLR Nebula Labs — DARE Results', heading: HeadingLevel.HEADING_1 }),
        new Paragraph({
          children: [new TextRun({ text: `${scores.length} papers · ${new Date().toLocaleDateString('es-ES')}`, size: 18, color: '888888' })]
        }),
        new Paragraph({ text: '' }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [headerRow, ...dataRows]
        })
      ]
    }]
  })

  const blob = await Packer.toBlob(doc)
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `dare-results-${id.slice(0, 8)}.docx`
  a.click()
  URL.revokeObjectURL(a.href)
}

export default function DAREResults({ runId, projectId }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [minTier, setMinTier] = useState('medium')
  const [expanded, setExpanded] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const pollRef = useRef(null)

  const id = projectId || runId

  async function load(quiet = false) {
    if (!quiet) setLoading(true)
    try {
      const d = projectId ? await getProjectDareScores(projectId) : await getDareScores(runId)
      setData(d)
      return d
    } catch (e) { console.error(e) }
    finally { if (!quiet) setLoading(false) }
  }

  useEffect(() => {
    load().then(d => {
      // If generation was in progress (some but not all have limitations), resume polling
      const inc = (d?.scores || []).filter(s => ['high', 'medium'].includes(s.tier))
      if (inc.length > 0 && inc.some(s => s.limitations_text) && !inc.every(s => s.limitations_text)) {
        startPolling()
      }
    })
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [id])

  function startPolling() {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      const fresh = await load(true)
      const inc = (fresh?.scores || []).filter(s => ['high', 'medium'].includes(s.tier))
      if (inc.length > 0 && inc.every(s => s.limitations_text)) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }, 8000)
  }

  async function handleGenerateLimitations() {
    try {
      await generateLimitations(projectId)
      startPolling()
    } catch (e) { alert('Error: ' + e.message) }
  }

  async function handleRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

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
  const hasLimitations    = included.some(s => s.limitations_text)
  const limitationsDone   = included.length > 0 && included.every(s => s.limitations_text)
  const limitationsRunning = hasLimitations && !limitationsDone || !!pollRef.current

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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={handleRefresh} disabled={refreshing} style={{
            padding: '7px 10px', fontSize: '12px', background: 'var(--bg-surface)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            cursor: refreshing ? 'not-allowed' : 'pointer', color: 'var(--text-dim)',
            opacity: refreshing ? 0.5 : 1
          }} title="Refresh data">
            {refreshing ? '...' : '↻'}
          </button>
          {projectId && (
            <button
              onClick={handleGenerateLimitations}
              disabled={limitationsRunning}
              title={limitationsDone ? 'Regenerate limitations' : 'Generate limitations for all included papers'}
              style={{
                padding: '7px 14px', fontSize: '12px',
                background: limitationsRunning ? 'var(--bg-surface)' : limitationsDone ? 'var(--accent-dim)' : 'var(--accent)',
                color: limitationsRunning || limitationsDone ? 'var(--text)' : '#000',
                border: `1px solid ${limitationsDone ? 'var(--accent-border)' : 'var(--border)'}`,
                borderRadius: 'var(--radius)', cursor: limitationsRunning ? 'not-allowed' : 'pointer',
                opacity: limitationsRunning ? 0.7 : 1
              }}
            >
              {limitationsRunning ? '⏳ Generating...' : limitationsDone ? '✓ Limitations ready' : '✦ Generate Limitations'}
            </button>
          )}
          <button onClick={() => exportWord(included, id)} style={{
            padding: '7px 14px', fontSize: '12px', background: 'var(--bg-surface)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            cursor: 'pointer', color: 'var(--text)'
          }}>
            Export Word ({included.length})
          </button>
        </div>
      </div>

      {/* Limitations in-progress notice */}
      {limitationsRunning && (
        <div style={{
          padding: '10px 14px', marginBottom: 16, fontSize: 12,
          background: 'var(--accent-dim)', border: '1px solid var(--accent-border)',
          borderRadius: 'var(--radius)', color: 'var(--accent)'
        }}>
          Generating limitations with AI — this may take a few minutes. The column will appear automatically when ready.
        </div>
      )}

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
        <PaperRow
          key={score.id}
          score={score}
          expanded={expanded === score.id}
          onToggle={() => setExpanded(expanded === score.id ? null : score.id)}
          showLimitations={hasLimitations}
        />
      ))}

      {/* Excluded papers */}
      {excluded.length > 0 && (
        <>
          <p style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--red)', margin: '24px 0 10px' }}>
            Excluded by DARE threshold — {excluded.length} papers
          </p>
          {excluded.map(score => (
            <PaperRow
              key={score.id}
              score={score}
              expanded={expanded === score.id}
              onToggle={() => setExpanded(expanded === score.id ? null : score.id)}
              dimmed
            />
          ))}
        </>
      )}
    </div>
  )
}

function PaperRow({ score, expanded, onToggle, dimmed, showLimitations }) {
  const study    = score.studies
  const tier     = TIER_COLOR[score.tier] || TIER_COLOR.low
  const [pdfLoading, setPdfLoading] = useState(false)
  const [uploading,  setUploading]  = useState(false)
  const uploadRef = useRef(null)

  async function downloadPdf(e) {
    e.stopPropagation()
    if (study?.pdf_storage_path) {
      setPdfLoading(true)
      try {
        const { url } = await getPdfUrl(study.id)
        const res = await fetch(url)
        const blob = await res.blob()
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        const safeTitle = (study.title || 'paper').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60)
        a.download = `${safeTitle}.pdf`
        a.click()
        URL.revokeObjectURL(a.href)
      } catch { alert('Could not download PDF') }
      finally { setPdfLoading(false) }
    } else if (study?.full_text_url) {
      window.open(study.full_text_url, '_blank')
    }
  }

  async function handleUpload(e) {
    e.stopPropagation()
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      await uploadStudyPdf(study.id, file)
      study.pdf_storage_path = `uploaded`
    } catch (err) { alert('Upload failed: ' + err.message) }
    finally { setUploading(false) }
  }

  const hasPdf = study?.pdf_storage_path || study?.full_text_url

  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', marginBottom: '8px',
      opacity: dimmed ? 0.6 : 1
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', cursor: 'pointer' }} onClick={onToggle}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {hasPdf ? (
            <button
              onClick={downloadPdf}
              disabled={pdfLoading}
              style={{
                fontSize: '11px', padding: '3px 9px', borderRadius: '6px', cursor: 'pointer',
                background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-dim)'
              }}
            >
              {pdfLoading ? '...' : '↓ PDF'}
            </button>
          ) : (
            <>
              <input ref={uploadRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={handleUpload} />
              <button
                onClick={e => { e.stopPropagation(); uploadRef.current?.click() }}
                disabled={uploading}
                title="Upload PDF manually"
                style={{
                  fontSize: '11px', padding: '3px 9px', borderRadius: '6px', cursor: 'pointer',
                  background: 'var(--bg)', border: '1px dashed var(--border)', color: 'var(--text-dim)'
                }}
              >
                {uploading ? '...' : '↑ PDF'}
              </button>
            </>
          )}
          <span style={{ fontFamily: 'var(--mono)', fontSize: '13px', fontWeight: 700, color: tier.color }}>
            {score.total?.toFixed(1)}/4
          </span>
        </div>
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
            <p style={{ fontSize: '12px', color: 'var(--text-dim)', fontStyle: 'italic', margin: '0 0 10px', lineHeight: 1.5 }}>
              {score.justification}
            </p>
          )}

          {showLimitations && (
            <div style={{
              marginTop: 10, padding: '10px 12px',
              background: 'var(--accent-dim)', border: '1px solid var(--accent-border)',
              borderRadius: 'var(--radius)'
            }}>
              <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)', margin: '0 0 6px' }}>
                Limitaciones relativas a la tesis
              </p>
              <p style={{ fontSize: '12px', color: 'var(--text)', margin: 0, lineHeight: 1.6 }}>
                {score.limitations_text || <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>Not generated yet</span>}
              </p>
            </div>
          )}

          {!hasPdf && study?.doi && (
            <a
              href={`https://doi.org/${study.doi}`}
              target="_blank"
              rel="noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ display: 'block', marginTop: 10, fontSize: '11px', color: 'var(--text-dim)' }}
            >
              View on doi.org →
            </a>
          )}
        </div>
      )}
    </div>
  )
}
