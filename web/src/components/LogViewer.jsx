import { useEffect, useRef, useState } from 'react'
import { createLogStream } from '../lib/api.js'

const LEVEL_COLOR = {
  info:  '#94a3b8',
  warn:  '#f59e0b',
  error: '#ef4444',
}

export default function LogViewer({ maxLines = 200 }) {
  const [lines,  setLines]  = useState([])
  const [paused, setPaused] = useState(false)
  const bottomRef = useRef(null)
  const pausedRef = useRef(false)

  useEffect(() => {
    const es = createLogStream()

    es.onmessage = (e) => {
      const line = JSON.parse(e.data)
      setLines(prev => {
        const next = [...prev, line]
        return next.length > maxLines ? next.slice(-maxLines) : next
      })
    }

    es.onerror = () => es.close()

    return () => es.close()
  }, [])

  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  useEffect(() => {
    if (!paused) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines, paused])

  function formatTs(iso) {
    return iso.slice(11, 19)
  }

  return (
    <div style={{ marginTop: '24px' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '8px'
      }}>
        <p style={{
          fontSize: '11px', fontWeight: 500, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: 'var(--text-dim)', margin: 0
        }}>
          Log del servidor
        </p>
        <button
          onClick={() => setPaused(p => !p)}
          style={{
            fontSize: '11px', padding: '2px 8px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            color: 'var(--text-dim)',
            cursor: 'pointer'
          }}
        >
          {paused ? '▶ Reanudar' : '⏸ Pausar'}
        </button>
      </div>

      <div style={{
        background: '#0f1117',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        fontFamily: 'var(--mono)',
        fontSize: '11px',
        lineHeight: '1.6',
        padding: '12px',
        height: '260px',
        overflowY: 'auto',
        overflowX: 'hidden',
      }}>
        {lines.length === 0 && (
          <span style={{ color: '#4b5563' }}>En espera de logs...</span>
        )}
        {lines.map((line, i) => (
          <div key={i} style={{ display: 'flex', gap: '10px', wordBreak: 'break-all' }}>
            <span style={{ color: '#374151', flexShrink: 0 }}>{formatTs(line.ts)}</span>
            <span style={{ color: LEVEL_COLOR[line.level] || '#94a3b8' }}>
              {line.message}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
