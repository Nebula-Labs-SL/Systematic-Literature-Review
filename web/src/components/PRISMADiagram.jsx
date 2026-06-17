import { useEffect, useRef, useState } from 'react'
import { getPrismaSummary } from '../lib/api.js'

const ACTIVE_STATUSES = ['searching', 'search_done', 'screening_done', 'retrieving',
  'stage2_done', 'dare_running', 'dare_done', 'extracting']

// ─── Sub-components ──────────────────────────────────────────────────────────

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
          {value !== null && value !== undefined && (
            <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--text-heading)', flexShrink: 0 }}>
              n = {value}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function DownArrow() {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', paddingLeft: '120px', margin: '2px 0' }}>
      <svg width="16" height="22" viewBox="0 0 16 22">
        <line x1="8" y1="0" x2="8" y2="16" stroke="#cbd5e1" strokeWidth="1.5"/>
        <polygon points="3,12 8,20 13,12" fill="#cbd5e1"/>
      </svg>
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

// Phase label using rotation (avoids writing-mode rendering bugs)
function PhaseLabel({ label }) {
  return (
    <div style={{
      width: '30px',
      flexShrink: 0,
      alignSelf: 'stretch',
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      position: 'relative',
    }}>
      <span style={{
        display: 'block',
        transform: 'rotate(-90deg)',
        whiteSpace: 'nowrap',
        fontSize: '9px',
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'var(--text-dim)',
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

// ─── Main component ───────────────────────────────────────────────────────────

export default function PRISMADiagram({ runId, runStatus }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const diagramRef = useRef(null)
  const isActive   = ACTIVE_STATUSES.includes(runStatus)

  async function load() {
    try   { setData(await getPrismaSummary(runId)) }
    catch (e) { console.error('PRISMA error:', e.message) }
    finally   { setLoading(false) }
  }

  useEffect(() => {
    load()
    if (!isActive) return
    const t = setInterval(load, 10000)
    return () => clearInterval(t)
  }, [runId, isActive])

  async function exportPng() {
    try {
      const mod = await import('html2canvas')
      const html2canvas = mod.default
      const canvas = await html2canvas(diagramRef.current, { backgroundColor: '#f5f6fa', scale: 2 })
      const a = document.createElement('a')
      a.href = canvas.toDataURL('image/png')
      a.download = `prisma-${runId.slice(0, 8)}.png`
      a.click()
    } catch {
      alert('Para exportar PNG instala html2canvas: npm install html2canvas')
    }
  }

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '64px', color: 'var(--text-dim)', fontSize: '13px' }}>
      Cargando diagrama PRISMA...
    </div>
  )
  if (!data) return (
    <div style={{ textAlign: 'center', padding: '64px', color: 'var(--text-dim)', fontSize: '13px' }}>
      No hay datos PRISMA para este run.
    </div>
  )

  const { identification: id, screening: sc, eligibility: el, inclusion: inc } = data

  // Raw counts per source before dedup (for Identification box)
  const rawSourceRows = Object.entries(id.raw_by_source || id.by_source || {})
    .filter(([, v]) => v > 0)
    .map(([k, v]) => [k.charAt(0).toUpperCase() + k.slice(1), v])

  // Screened counts per source after dedup/unscreened removal (for Screening box)
  const screenedSourceRows = Object.entries(sc.by_source || {})
    .filter(([, v]) => v > 0)
    .map(([k, v]) => [k.charAt(0).toUpperCase() + k.slice(1), v])

  // Papers that entered the pipeline but were never screened
  const notScreened = Math.max(0, id.after_dedup - sc.total_screened)

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto', padding: '32px 24px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
        <div>
          <h2 style={{ fontSize: '16px', margin: 0 }}>PRISMA 2020 — Diagrama de flujo</h2>
          {isActive && (
            <p style={{ fontSize: '11px', color: 'var(--accent)', margin: '4px 0 0' }}>
              ● Actualizando cada 10s
            </p>
          )}
        </div>
        <button onClick={exportPng} style={{
          padding: '7px 14px', fontSize: '12px', background: 'var(--bg-surface)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius)',
          cursor: 'pointer', color: 'var(--text)'
        }}>
          Exportar PNG
        </button>
      </div>

      <div ref={diagramRef} style={{ padding: '20px', background: 'var(--bg)', borderRadius: 'var(--radius)' }}>

        {/* ── IDENTIFICACIÓN ── */}
        <Phase label="Identificación">
          <Row
            main={
              <Box accent title="Registros identificados" rows={[
                ...rawSourceRows,
                ['Total (antes de dedup)', id.total_before_dedup],
              ]} />
            }
            side={
              <Box title="Eliminados antes del screening" rows={[
                ['Duplicados eliminados',      id.duplicates_removed],
                ['Sin abstract / no elegibles', notScreened],
              ]} />
            }
          />
        </Phase>

        <DownArrow />

        {/* ── SCREENING ── */}
        <Phase label="Screening">
          <Row
            main={
              <Box accent title="Screening — Título y Abstract" rows={[
                ...screenedSourceRows,
                ['Total cribados', sc.total_screened],
              ]} />
            }
            side={
              <Box title="Registros excluidos" rows={[
                ['Excluidos (título/abstract)', sc.excluded],
              ]} />
            }
          />
        </Phase>

        <DownArrow />

        {/* ── ELEGIBILIDAD ── */}
        <Phase label="Elegibilidad">
          <Row
            main={
              <Box accent title="Buscados para recuperación" rows={[
                ['Incluidos en Stage 1', el.sought_for_retrieval],
              ]} />
            }
            side={
              <Box title="No recuperados" rows={[
                ['Sin open access / fallo', el.not_retrieved],
              ]} />
            }
          />
          <DownArrow />
          <Row
            main={
              <Box accent title="Evaluados para elegibilidad (Stage 2)" rows={[
                ['Evaluados intro/conclusión', el.assessed],
              ]} />
            }
            side={
              <Box title="Informes excluidos" rows={[
                ['Excluidos en Stage 2', el.excluded_with_reasons],
              ]} />
            }
          />
        </Phase>

        <DownArrow />

        {/* ── INCLUSIÓN ── */}
        <Phase label="Inclusión">
          <Row
            main={
              <Box accent title="Estudios incluidos en revisión" rows={[
                ['DARE alto  (≥ 3.0)',    inc.dare_high],
                ['DARE medio (1.5–2.9)',  inc.dare_medium],
                ['DARE bajo  (< 1.5)',    inc.dare_low],
                ['Total incluidos',       inc.total_included],
              ]} />
            }
          />
        </Phase>

      </div>
    </div>
  )
}
