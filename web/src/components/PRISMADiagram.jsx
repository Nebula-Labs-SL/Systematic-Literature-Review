import { useEffect, useRef, useState } from 'react'
import { getPrismaSummary, getProjectPrismaSummary } from '../lib/api.js'

const ACTIVE_STATUSES = ['searching', 'search_done', 'screening_done', 'retrieving',
  'stage2_done', 'dare_running', 'dare_done', 'extracting']

function Box({ title, rows = [], accent = false, style = {} }) {
  return (
    <div style={{
      background: accent ? 'var(--accent-dim)' : 'var(--bg-surface)',
      border: `1px solid ${accent ? 'var(--accent-border)' : 'var(--border)'}`,
      borderRadius: 'var(--radius)',
      padding: '12px 14px',
      fontSize: '12px',
      ...style
    }}>
      <p style={{
        fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em',
        color: accent ? 'var(--accent)' : 'var(--text-heading)',
        margin: '0 0 8px', textTransform: 'uppercase'
      }}>
        {title}
      </p>
      {rows.map(([label, value], i) => (
        <div key={i} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px',
          padding: '3px 0',
          borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none',
          color: value === null ? 'var(--text-dim)' : 'var(--text)'
        }}>
          <span>{label}</span>
          {value != null && (
            <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--text-heading)', flexShrink: 0 }}>
              n = {value}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function DownArrow({ n }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', paddingLeft: '112px', margin: '2px 0', gap: '10px' }}>
      <svg width="16" height="22" viewBox="0 0 16 22" style={{ flexShrink: 0 }}>
        <line x1="8" y1="0" x2="8" y2="16" stroke="#cbd5e1" strokeWidth="1.5"/>
        <polygon points="3,12 8,20 13,12" fill="#cbd5e1"/>
      </svg>
      {n != null && (
        <span style={{ fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>
          n = {n}
        </span>
      )}
    </div>
  )
}

function RightArrow() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0, padding: '0 4px' }}>
      <svg width="36" height="16" viewBox="0 0 36 16">
        <line x1="0" y1="8" x2="29" y2="8" stroke="#cbd5e1" strokeWidth="1.5"/>
        <polygon points="23,3 33,8 23,13" fill="#cbd5e1"/>
      </svg>
    </div>
  )
}

function PhaseLabel({ label }) {
  return (
    <div style={{
      width: '30px', flexShrink: 0, alignSelf: 'stretch',
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden', position: 'relative',
    }}>
      <span style={{
        display: 'block', transform: 'rotate(-90deg)', whiteSpace: 'nowrap',
        fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: 'var(--text-dim)',
      }}>
        {label}
      </span>
    </div>
  )
}

function Phase({ label, children }) {
  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch' }}>
      <PhaseLabel label={label} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {children}
      </div>
    </div>
  )
}

function Row({ main, side }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0' }}>
      <div style={{ flex: 1 }}>{main}</div>
      {side && <><RightArrow /><div style={{ minWidth: '200px' }}>{side}</div></>}
    </div>
  )
}

export default function PRISMADiagram({ runId, projectId, runStatus }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const diagramRef = useRef(null)
  const isActive   = ACTIVE_STATUSES.includes(runStatus)
  const entityId = projectId || runId

  async function load() {
    try   { setData(projectId ? await getProjectPrismaSummary(projectId) : await getPrismaSummary(runId)) }
    catch (e) { console.error('PRISMA error:', e.message) }
    finally   { setLoading(false) }
  }

  useEffect(() => {
    load()
    if (!isActive) return
    const t = setInterval(load, 10000)
    return () => clearInterval(t)
  }, [entityId, isActive])

  async function exportPng() {
    try {
      const mod = await import('html2canvas')
      const canvas = await mod.default(diagramRef.current, { backgroundColor: '#f5f6fa', scale: 2 })
      const a = document.createElement('a')
      a.href = canvas.toDataURL('image/png')
      a.download = `prisma-${entityId.slice(0, 8)}.png`
      a.click()
    } catch {
      alert('Install html2canvas first: npm install html2canvas')
    }
  }

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '64px', color: 'var(--text-dim)', fontSize: '13px' }}>
      Loading PRISMA diagram...
    </div>
  )
  if (!data) return (
    <div style={{ textAlign: 'center', padding: '64px', color: 'var(--text-dim)', fontSize: '13px' }}>
      No PRISMA data available for this run.
    </div>
  )

  const { identification: id, screening: sc, eligibility: el, inclusion: inc } = data

  const rawSourceRows = Object.entries(id.raw_by_source || id.by_source || {})
    .filter(([, v]) => v > 0)
    .map(([k, v]) => [k.charAt(0).toUpperCase() + k.slice(1), v])

  const rawTotal = rawSourceRows.reduce((sum, [, v]) => sum + v, 0)

  const screenedSourceRows = Object.entries(sc.by_source || {})
    .filter(([, v]) => v > 0)
    .map(([k, v]) => [k.charAt(0).toUpperCase() + k.slice(1), v])

  const notScreened  = Math.max(0, id.after_dedup - sc.total_screened)
  const retrieved    = Math.max(0, (el.sought_for_retrieval || 0) - (el.not_retrieved || 0))

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 24px' }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
        <div>
          <h2 style={{ fontSize: '16px', margin: 0 }}>PRISMA 2020 — Flow Diagram</h2>
          {isActive && (
            <p style={{ fontSize: '11px', color: 'var(--accent)', margin: '4px 0 0' }}>
              ● Updating every 10s
            </p>
          )}
        </div>
        <button onClick={exportPng} style={{
          padding: '7px 14px', fontSize: '12px', background: 'var(--bg-surface)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius)',
          cursor: 'pointer', color: 'var(--text)'
        }}>
          Export PNG
        </button>
      </div>

      <div ref={diagramRef} style={{ padding: '20px', background: 'var(--bg)', borderRadius: 'var(--radius)' }}>

        {/* ── IDENTIFICATION ── */}
        <Phase label="Identification">
          <Row
            main={
              <Box accent title="Records identified" rows={[
                ...rawSourceRows,
                ['Total (before dedup)', rawTotal],
              ]} />
            }
            side={
              <Box title="Removed before screening" rows={[
                ['Duplicates removed',          id.duplicates_removed],
                ['No abstract / not eligible',  notScreened],
              ]} />
            }
          />
        </Phase>

        <DownArrow n={sc.total_screened} />

        {/* ── SCREENING (title/abstract + full-text) ── */}
        <Phase label="Screening">
          <Row
            main={
              <Box accent title="Title & Abstract Screening" rows={[
                ...screenedSourceRows,
                ['Total screened', sc.total_screened],
              ]} />
            }
            side={
              <Box title="Records excluded" rows={[
                ['Excluded (title/abstract)', sc.excluded],
              ]} />
            }
          />

          <DownArrow n={el.sought_for_retrieval} />

          <Row
            main={
              <Box accent title="Sought for retrieval" rows={[
                ['Stage 1 included', el.sought_for_retrieval],
              ]} />
            }
            side={
              <Box title="Not retrieved" rows={[
                ['No open access / failed', el.not_retrieved],
              ]} />
            }
          />

          <DownArrow n={el.sought_for_retrieval} />

          <Row
            main={
              <Box accent title="Full-text assessed for eligibility (Stage 2)" rows={[
                ['Assessed intro/conclusion', el.assessed],
                ['Full-text retrieved', retrieved],
                ['Assessed via abstract only', Math.max(0, (el.sought_for_retrieval || 0) - retrieved)],
              ]} />
            }
            side={
              <Box title="Reports excluded" rows={[
                ['Excluded in Stage 2',    el.excluded_with_reasons],
                ...(el.pending_hitl > 0 ? [['Pending HITL review', el.pending_hitl]] : []),
              ]} />
            }
          />
        </Phase>

        <DownArrow n={inc.total_included} />

        {/* ── INCLUSION ── */}
        <Phase label="Inclusion">
          <Row
            main={
              <Box accent title="Studies included in review" rows={[
                ['DARE high  (≥ 3.0)',   inc.dare_high],
                ['DARE medium (1.5–2.9)', inc.dare_medium],
                ['DARE low  (< 1.5)',     inc.dare_low],
                ['Total included',        inc.total_included],
              ]} />
            }
          />
        </Phase>

      </div>
    </div>
  )
}
