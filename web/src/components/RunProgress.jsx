import { useEffect, useState } from 'react'
import { getRun, getRunStats } from '../lib/api.js'

const STATUS_LABELS = {
  created:        { label: 'Creado',             color: '#9ca3af' },
  searching:      { label: 'Buscando papers...', color: '#3b82f6' },
  search_done:    { label: 'Screening en curso...', color: '#8b5cf6' },
  screening_done: { label: 'Screening completo', color: '#10b981' },
  error:          { label: 'Error',              color: '#ef4444' }
}

export default function RunProgress({ runId, onGoToHITL }) {
  const [run,       setRun]       = useState(null)
  const [stats,     setStats]     = useState(null)
  const [events,    setEvents]    = useState([])
  const [refreshing, setRefreshing] = useState(false)

  async function refresh() {
    setRefreshing(true)
    try {
      const [runData, statsData] = await Promise.all([
        getRun(runId),
        getRunStats(runId)
      ])
      setRun(runData)
      setEvents(statsData.prisma_log || [])
      setStats(statsData)
    } finally {
      setRefreshing(false)
    }
  }

  // Polling cada 3 segundos mientras el proceso está en curso
  const isRunning = ['pending', 'searching', 'search_done'].includes(run?.status)

  useEffect(() => {
    refresh()
    const interval = setInterval(() => {
      if (isRunning) refresh()
    }, 3000)
    return () => clearInterval(interval)
  }, [runId, isRunning])

  if (!run) return (
    <div style={{ textAlign: 'center', padding: '64px', color: 'var(--text-dim)', fontSize: '13px' }}>
      <div style={{
        width: '20px', height: '20px',
        border: '2px solid var(--border)',
        borderTopColor: 'var(--accent)',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
        margin: '0 auto 16px',
      }} />
      Cargando run...
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  const statusInfo = STATUS_LABELS[run.status] || { label: run.status, color: 'var(--text-dim)' }

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', padding: '48px 24px' }}>

      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <h2 style={{ fontSize: '18px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          {run.topic}
          {refreshing && (
            <span style={{
              width: '12px', height: '12px',
              border: '2px solid var(--border)',
              borderTopColor: 'var(--accent)',
              borderRadius: '50%',
              display: 'inline-block',
              animation: 'spin 0.8s linear infinite',
              flexShrink: 0,
            }} />
          )}
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{
            display: 'inline-block',
            width: '6px', height: '6px',
            borderRadius: '50%',
            background: statusInfo.color,
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
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '10px',
          marginBottom: '24px'
        }}>
          {[
            { label: 'Total',      value: stats.total,    color: 'var(--text-heading)' },
            { label: 'Incluidos',  value: stats.included, color: 'var(--green)' },
            { label: 'Excluidos',  value: stats.excluded, color: 'var(--red)' },
            { label: 'Pendientes', value: stats.pending,  color: 'var(--amber)' }
          ].map(s => (
            <div key={s.label} style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '16px 12px',
              textAlign: 'center'
            }}>
              <div style={{
                fontSize: '24px', fontWeight: 700,
                color: s.color, fontFamily: 'var(--mono)',
                lineHeight: 1
              }}>
                {s.value}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '6px', letterSpacing: '0.04em' }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* PRISMA events log */}
      {events.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <p style={{
            fontSize: '11px', fontWeight: 500,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            color: 'var(--text-dim)', marginBottom: '10px'
          }}>
            Log PRISMA
          </p>
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            overflow: 'hidden'
          }}>
            {events.map((e, i) => (
              <div key={i} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 14px',
                borderBottom: i < events.length - 1 ? '1px solid var(--border)' : 'none',
                fontSize: '12px',
              }}>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--text)', fontSize: '11px' }}>
                  <span style={{ color: 'var(--accent-border)' }}>[{e.stage}]</span>{' '}
                  {e.event_type}
                </span>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--text-heading)', fontSize: '12px' }}>
                  {e.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Botón ir a HITL */}
      {stats?.pending > 0 && (
        <button
          onClick={() => onGoToHITL(runId)}
          style={{
            width: '100%',
            padding: '11px',
            background: 'var(--accent-dim)',
            color: 'var(--accent)',
            border: '1px solid var(--accent-border)',
            borderRadius: 'var(--radius)',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            letterSpacing: '0.02em',
          }}
        >
          Revisar {stats.pending} papers pendientes →
        </button>
      )}
    </div>
  )
}