import { useState } from 'react'
import { createRun } from '../lib/api.js'

export default function NewRun({ onRunCreated }) {
  const [topic,       setTopic]       = useState('')
  const [description, setDescription] = useState('')
  const [loading,     setLoading]     = useState(false)
  const [strings,     setStrings]     = useState([])  // eslint-disable-line no-unused-vars
  const [error,       setError]       = useState(null)

  async function handleSubmit() {
    if (!topic.trim()) return
    setLoading(true)
    setError(null)
    setStrings([])

    try {
      const result = await createRun(topic, description)
      onRunCreated(result.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const disabled = loading || !topic.trim()

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', padding: '48px 24px' }}>

      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '20px', marginBottom: '8px' }}>Nueva revisión sistemática</h1>
        <p style={{ fontSize: '13px', color: 'var(--text-dim)', lineHeight: 1.6 }}>
          Describe tu revisión en lenguaje natural. Claude generará los strings de búsqueda automáticamente.
        </p>
      </div>

      {/* Topic */}
      <div style={{ marginBottom: '14px' }}>
        <label style={{
          display: 'block', fontSize: '11px', fontWeight: 500,
          letterSpacing: '0.08em', color: 'var(--text-dim)',
          textTransform: 'uppercase', marginBottom: '8px'
        }}>
          Tema principal
        </label>
        <input
          type="text"
          value={topic}
          onChange={e => setTopic(e.target.value)}
          placeholder="ej. Quantum computing applied to financial risk optimization"
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          style={{
            width: '100%',
            padding: '10px 14px',
            fontSize: '13px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            outline: 'none',
            color: 'var(--text-heading)',
            transition: 'border-color 0.15s',
          }}
          onFocus={e => e.target.style.borderColor = 'var(--accent-border)'}
          onBlur={e => e.target.style.borderColor = 'var(--border)'}
        />
      </div>

      {/* Description */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{
          display: 'block', fontSize: '11px', fontWeight: 500,
          letterSpacing: '0.08em', color: 'var(--text-dim)',
          textTransform: 'uppercase', marginBottom: '8px'
        }}>
          Contexto adicional
          <span style={{ fontWeight: 400, textTransform: 'none', marginLeft: '8px', opacity: 0.6 }}>
            opcional
          </span>
        </label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="ej. Específicamente QAOA y VQE para portfolio optimization y VaR/CVaR en contexto enterprise. Rango 2018–2026."
          rows={3}
          style={{
            width: '100%',
            padding: '10px 14px',
            fontSize: '13px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            outline: 'none',
            resize: 'vertical',
            color: 'var(--text-heading)',
            lineHeight: 1.6,
            transition: 'border-color 0.15s',
          }}
          onFocus={e => e.target.style.borderColor = 'var(--accent-border)'}
          onBlur={e => e.target.style.borderColor = 'var(--border)'}
        />
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: 'rgba(240, 79, 90, 0.08)',
          border: '1px solid rgba(240, 79, 90, 0.25)',
          borderRadius: 'var(--radius)',
          padding: '10px 14px',
          marginBottom: '16px',
          fontSize: '12px',
          color: 'var(--red)',
        }}>
          {error}
        </div>
      )}

      {/* Botón */}
      <button
        onClick={handleSubmit}
        disabled={disabled}
        style={{
          width: '100%',
          padding: '11px',
          background: disabled ? 'var(--bg-elevated)' : 'var(--accent)',
          color: disabled ? 'var(--text-dim)' : '#000',
          border: '1px solid',
          borderColor: disabled ? 'var(--border)' : 'var(--accent)',
          borderRadius: 'var(--radius)',
          fontSize: '13px',
          fontWeight: 600,
          cursor: disabled ? 'not-allowed' : 'pointer',
          letterSpacing: '0.02em',
          transition: 'opacity 0.15s',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {loading ? 'Generando strings y lanzando búsqueda...' : 'Iniciar búsqueda'}
      </button>

      {/* Strings generados */}
      {strings.length > 0 && (
        <div style={{ marginTop: '28px' }}>
          <p style={{
            fontSize: '11px', fontWeight: 500,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            color: 'var(--text-dim)', marginBottom: '12px'
          }}>
            Strings booleanos generados
          </p>
          {strings.map((s, i) => (
            <div key={i} style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '10px 14px',
              marginBottom: '8px',
              fontSize: '11px',
              fontFamily: 'var(--mono)',
              color: 'var(--text)',
              lineHeight: 1.7,
            }}>
              <span style={{ color: 'var(--accent)', marginRight: '10px' }}>
                [{String(i + 1).padStart(2, '0')}]
              </span>
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}