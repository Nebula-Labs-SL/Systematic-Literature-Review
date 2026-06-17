import { useEffect, useState } from 'react'
import { getRun, getRunStats, cancelRun, triggerStage2, triggerDare, triggerExtraction } from '../lib/api.js'
import LogViewer from './LogViewer.jsx'

const STATUS_LABELS = {
  created:        { label: 'Creado',                 color: '#9ca3af' },
  pending:        { label: 'Pendiente...',            color: '#9ca3af' },
  searching:      { label: 'Buscando papers...',      color: '#3b82f6' },
  search_done:    { label: 'Screening Stage 1...',    color: '#8b5cf6' },
  screening_done: { label: 'Stage 1 completo',        color: '#10b981' },
  retrieving:     { label: 'Recuperando textos...',   color: '#3b82f6' },
  stage2_done:    { label: 'Stage 2 completo',        color: '#10b981' },
  dare_running:   { label: 'DARE scoring...',         color: '#8b5cf6' },
  dare_done:      { label: 'DARE completo',           color: '#10b981' },
  extracting:     { label: 'Extrayendo datos...',     color: '#3b82f6' },
  extraction_done:{ label: 'Extracción completa',     color: '#10b981' },
  cancelled:      { label: 'Cancelado',               color: '#f59e0b' },
  error:          { label: 'Error',                   color: '#ef4444' },
}

const RUNNING_STATUSES = ['pending', 'searching', 'search_done', 'retrieving', 'dare_running', 'extracting']

export default function RunProgress({ runId, onGoToHITL, onStatusChange }) {
  const [run,        setRun]        = useState(null)
  const [stats,      setStats]      = useState(null)
  const [events,     setEvents]     = useState([])
  const [refreshing, setRefreshing] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [triggering, setTriggering] = useState(null)  // 'stage2' | 'dare' | 'extract' | null

  async function refresh() {
    setRefreshing(true)
    try {
      const [runData, statsData] = await Promise.all([getRun(runId), getRunStats(runId)])
      setRun(runData)
      setEvents(statsData.prisma_log || [])
      setStats(statsData)
      onStatusChange?.(runData.status)
    } finally {
      setRefreshing(false)
    }
  }

  async function handleCancel() {
    if (!confirm('¿Cancelar este run?')) return
    setCancelling(true)
    try { await cancelRun(runId); await refresh() } finally { setCancelling(false) }
  }

  async function handleTrigger(type) {
    setTriggering(type)
    try {
      if (type === 'stage2')  await triggerStage2(runId)
      if (type === 'dare')    await triggerDare(runId)
      if (type === 'extract') await triggerExtraction(runId)
      await new Promise(r => setTimeout(r, 1500))
      await refresh()
    } catch (e) {
      alert(e.message)
    } finally {
      setTriggering(null)
    }
  }

  const isRunning = RUNNING_STATUSES.includes(run?.status)

  useEffect(() => {
    refresh()
    const interval = setInterval(() => { if (isRunning) refresh() }, 3000)
    return () => clearInterval(interval)
  }, [runId, isRunning])

  if (!run) return (
    <div style={{ textAlign: 'center', padding: '64px', color: 'var(--text-dim)', fontSize: '13px' }}>
      <div style={{
        width: '20px', height: '20px',
        border: '2px solid var(--border)', borderTopColor: 'var(--accent)',
        borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px',
      }} />
      Cargando run...
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  const statusInfo = STATUS_LABELS[run.status] || { label: run.status, color: 'var(--text-dim)' }

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto', padding: '48px 24px' }}>

      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <h2 style={{ fontSize: '18px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          {run.topic}
          {refreshing && (
            <span style={{
              width: '12px', height: '12px',
              border: '2px solid var(--border)', borderTopColor: 'var(--accent)',
              borderRadius: '50%', display: 'inline-block',
              animation: 'spin 0.8s linear infinite', flexShrink: 0,
            }} />
          )}
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{
            display: 'inline-block', width: '6px', height: '6px',
            borderRadius: '50%', background: statusInfo.color,
            boxShadow: `0 0 6px ${statusInfo.color}`,
          }}/>
          <span style={{ fontSize: '12px', color: statusInfo.color, fontWeight: 500 }}>
            {statusInfo.label}
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
            · {new Date(run.created_at).toLocaleString('es-ES')}
          </span>
        </div>
      </div>

      {/* Stats cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '24px' }}>
          {[
            { label: 'Total',      value: stats.total,    color: 'var(--text-heading)' },
            { label: 'Incluidos',  value: stats.included, color: 'var(--green)' },
            { label: 'Excluidos',  value: stats.excluded, color: 'var(--red)' },
            { label: 'Pendientes', value: stats.pending,  color: 'var(--amber)' }
          ].map(s => (
            <div key={s.label} style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '16px 12px', textAlign: 'center'
            }}>
              <div style={{ fontSize: '24px', fontWeight: 700, color: s.color, fontFamily: 'var(--mono)', lineHeight: 1 }}>
                {s.value}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '6px', letterSpacing: '0.04em' }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>

        {/* Stage 2 button */}
        {run.status === 'screening_done' && stats?.included > 0 && (
          <button
            onClick={() => handleTrigger('stage2')}
            disabled={triggering === 'stage2'}
            style={{
              width: '100%', padding: '11px',
              background: 'var(--accent)', color: '#fff',
              border: 'none', borderRadius: 'var(--radius)',
              fontSize: '13px', fontWeight: 600,
              cursor: triggering === 'stage2' ? 'not-allowed' : 'pointer',
              opacity: triggering === 'stage2' ? 0.6 : 1,
            }}
          >
            {triggering === 'stage2' ? 'Iniciando Stage 2...' : `Iniciar Stage 2 — recuperar + evaluar ${stats.included} papers incluidos →`}
          </button>
        )}

        {/* DARE button */}
        {['stage2_done', 'screening_done'].includes(run.status) && (
          <button
            onClick={() => handleTrigger('dare')}
            disabled={triggering === 'dare'}
            style={{
              width: '100%', padding: '11px',
              background: 'var(--accent-dim)', color: 'var(--accent)',
              border: '1px solid var(--accent-border)', borderRadius: 'var(--radius)',
              fontSize: '13px', fontWeight: 600,
              cursor: triggering === 'dare' ? 'not-allowed' : 'pointer',
              opacity: triggering === 'dare' ? 0.6 : 1,
            }}
          >
            {triggering === 'dare' ? 'Iniciando DARE...' : 'Ejecutar DARE scoring →'}
          </button>
        )}

        {/* Extract button */}
        {run.status === 'dare_done' && (
          <button
            onClick={() => handleTrigger('extract')}
            disabled={triggering === 'extract'}
            style={{
              width: '100%', padding: '11px',
              background: 'var(--accent-dim)', color: 'var(--accent)',
              border: '1px solid var(--accent-border)', borderRadius: 'var(--radius)',
              fontSize: '13px', fontWeight: 600,
              cursor: triggering === 'extract' ? 'not-allowed' : 'pointer',
              opacity: triggering === 'extract' ? 0.6 : 1,
            }}
          >
            {triggering === 'extract' ? 'Iniciando extracción...' : 'Extraer datos estructurados →'}
          </button>
        )}

        {/* HITL button */}
        {stats?.pending > 0 && (
          <button
            onClick={() => onGoToHITL(runId)}
            style={{
              width: '100%', padding: '11px',
              background: 'var(--bg-surface)', color: 'var(--text)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius)',
              fontSize: '13px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            Revisar {stats.pending} papers pendientes (HITL) →
          </button>
        )}

        {/* Cancel button */}
        {isRunning && (
          <button
            onClick={handleCancel}
            disabled={cancelling}
            style={{
              width: '100%', padding: '11px',
              background: 'transparent', color: '#ef4444',
              border: '1px solid #ef444466', borderRadius: 'var(--radius)',
              fontSize: '13px', fontWeight: 600,
              cursor: cancelling ? 'not-allowed' : 'pointer',
              opacity: cancelling ? 0.6 : 1,
            }}
          >
            {cancelling ? 'Cancelando...' : 'Cancelar operación'}
          </button>
        )}
      </div>

      {/* PRISMA events log */}
      {events.length > 0 && (
        <div style={{ marginBottom: '8px' }}>
          <p style={{
            fontSize: '11px', fontWeight: 500, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: '10px'
          }}>
            Log PRISMA
          </p>
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', overflow: 'hidden'
          }}>
            {events.map((e, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 14px',
                borderBottom: i < events.length - 1 ? '1px solid var(--border)' : 'none',
                fontSize: '12px',
              }}>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--text)', fontSize: '11px' }}>
                  <span style={{ color: 'var(--accent-border)' }}>[{e.stage}]</span>{' '}{e.event_type}
                </span>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--text-heading)', fontSize: '12px' }}>
                  {e.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live server log */}
      <LogViewer />

    </div>
  )
}
