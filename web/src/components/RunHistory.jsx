import { useEffect, useState } from 'react'
import { getAllRuns } from '../lib/api.js'

const STATUS_COLORS = {
  pending:        '#9ca3af',
  searching:      '#3b82f6',
  search_done:    '#8b5cf6',
  screening_done: '#10b981',
  cancelled:      '#f59e0b',
  error:          '#ef4444',
}

const STATUS_LABELS = {
  pending:        'Pendiente',
  searching:      'Buscando...',
  search_done:    'Screening en curso...',
  screening_done: 'Completado',
  cancelled:      'Cancelado',
  error:          'Error',
}

export default function RunHistory({ onSelectRun }) {
  const [runs,    setRuns]    = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAllRuns()
      .then(setRuns)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '64px', color: 'var(--text-dim)', fontSize: '13px' }}>
      Cargando historial...
    </div>
  )

  if (runs.length === 0) return (
    <div style={{ textAlign: 'center', padding: '64px', color: 'var(--text-dim)', fontSize: '13px' }}>
      No hay runs anteriores.
    </div>
  )

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', padding: '48px 24px' }}>
      <p style={{
        fontSize: '11px', fontWeight: 500,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'var(--text-dim)', marginBottom: '12px'
      }}>
        Historial de búsquedas
      </p>

      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden'
      }}>
        {runs.map((run, i) => {
          const color = STATUS_COLORS[run.status] || '#9ca3af'
          const label = STATUS_LABELS[run.status] || run.status
          return (
            <div
              key={run.id}
              onClick={() => onSelectRun(run.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderBottom: i < runs.length - 1 ? '1px solid var(--border)' : 'none',
                cursor: 'pointer',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover, rgba(255,255,255,0.03)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-heading)', fontWeight: 500 }}>
                  {run.topic}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
                  {new Date(run.created_at).toLocaleString('es-ES')}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <span style={{
                  display: 'inline-block',
                  width: '6px', height: '6px',
                  borderRadius: '50%',
                  background: color,
                  boxShadow: `0 0 5px ${color}`,
                }} />
                <span style={{ fontSize: '11px', color, fontWeight: 500 }}>
                  {label}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>→</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
