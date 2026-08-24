import { useState } from 'react'
import { createRun } from '../lib/api.js'

const DEFAULT_INCLUDE = [
  'Studies addressing quantum computing applied to financial risk optimization',
  'LLM or AI orchestration systems for quantum computing workflows',
  'Quantum solvers (QAOA, VQE, quantum annealing) for combinatorial optimization',
  'Quantum circuit synthesis frameworks (Classiq, Qiskit) for financial problems',
  'Enterprise integration of quantum computing platforms',
  'End-to-end quantum computing business platform architectures',
  'Published between 2018 and 2026',
  'Written in English',
  'Peer-reviewed journal articles, conference papers, or arXiv preprints by verified domain experts'
]

const DEFAULT_EXCLUDE = [
  'Pure quantum hardware physics with no software or application relevance',
  'Classical finance with no quantum computing content',
  'Quantum computing in unrelated domains (chemistry, sensing, biology)',
  'Non-peer-reviewed blog posts or vendor marketing',
  'Workshop position papers under 4 pages',
  'Published before 2018 unless foundational (captured via snowballing)',
  'Non-English without authoritative translation'
]

const ALL_SOURCES = [
  { key: 'openalex', label: 'OpenAlex' },
  { key: 'arxiv',   label: 'arXiv'    },
  { key: 'ieee',    label: 'IEEE'     },
  { key: 'crossref', label: 'Crossref' }
]


const inputStyle = {
  width: '100%',
  padding: '10px 14px',
  fontSize: '13px',
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  outline: 'none',
  color: 'var(--text-heading)',
  transition: 'border-color 0.15s',
}

const labelStyle = {
  display: 'block', fontSize: '11px', fontWeight: 500,
  letterSpacing: '0.08em', color: 'var(--text-dim)',
  textTransform: 'uppercase', marginBottom: '8px'
}

function CriteriaEditor({ label, items, onChange }) {
  function update(i, val) {
    const next = [...items]
    next[i] = val
    onChange(next)
  }
  function remove(i) { onChange(items.filter((_, j) => j !== i)) }
  function add()     { onChange([...items, '']) }

  return (
    <div style={{ marginBottom: '16px' }}>
      <label style={labelStyle}>{label}</label>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
          <input
            value={item}
            onChange={e => update(i, e.target.value)}
            style={{ ...inputStyle, fontSize: '12px', padding: '7px 10px' }}
            onFocus={e => e.target.style.borderColor = 'var(--accent-border)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />
          <button
            onClick={() => remove(i)}
            style={{
              flexShrink: 0, width: '28px', height: '34px',
              background: 'transparent', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', color: 'var(--red)',
              cursor: 'pointer', fontSize: '14px'
            }}
          >×</button>
        </div>
      ))}
      <button
        onClick={add}
        style={{
          fontSize: '11px', color: 'var(--accent)',
          background: 'transparent', border: 'none',
          cursor: 'pointer', padding: '4px 0',
          letterSpacing: '0.04em'
        }}
      >+ Añadir criterio</button>
    </div>
  )
}

export default function NewRun({ onRunCreated, projectId = null }) {
  const [topic,       setTopic]       = useState('')
  const [description, setDescription] = useState('')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)
  const [advanced,    setAdvanced]    = useState(false)

  // Config avanzada
  const [sources,     setSources]     = useState(['openalex', 'arxiv', 'ieee', 'crossref'])
const [confidence,  setConfidence]  = useState(0.70)
  const [include,     setInclude]     = useState(DEFAULT_INCLUDE)
  const [exclude,     setExclude]     = useState(DEFAULT_EXCLUDE)

  function toggleSource(key) {
    setSources(prev =>
      prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key]
    )
  }

  async function handleSubmit() {
    if (!topic.trim()) return
    if (sources.length === 0) { setError('Selecciona al menos una fuente'); return }
    setLoading(true)
    setError(null)

    try {
      const config = {
        sources,
        confidenceThreshold: confidence,
        criteria: { include: include.filter(Boolean), exclude: exclude.filter(Boolean) }
      }
      const result = await createRun(topic, description, config, projectId)
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
          Escribe tu tema y los strings de búsqueda, uno por línea.
        </p>
      </div>

      {/* Topic */}
      <div style={{ marginBottom: '14px' }}>
        <label style={labelStyle}>Tema principal</label>
        <input
          type="text"
          value={topic}
          onChange={e => setTopic(e.target.value)}
          placeholder="ej. Quantum computing applied to financial risk optimization"
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          style={inputStyle}
          onFocus={e => e.target.style.borderColor = 'var(--accent-border)'}
          onBlur={e => e.target.style.borderColor = 'var(--border)'}
        />
      </div>

      {/* Strings de búsqueda */}
      <div style={{ marginBottom: '20px' }}>
        <label style={labelStyle}>
          Strings de búsqueda
          <span style={{ fontWeight: 400, textTransform: 'none', marginLeft: '8px', opacity: 0.6 }}>
            uno por línea — opcional
          </span>
        </label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder={'quantum computing portfolio optimization\nQAOA VQE financial risk\nquantum annealing CVaR'}
          rows={4}
          style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
          onFocus={e => e.target.style.borderColor = 'var(--accent-border)'}
          onBlur={e => e.target.style.borderColor = 'var(--border)'}
        />
      </div>

      {/* Toggle configuración avanzada */}
      <button
        onClick={() => setAdvanced(v => !v)}
        style={{
          width: '100%', padding: '9px 14px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          fontSize: '12px', color: 'var(--text-dim)',
          cursor: 'pointer', marginBottom: '16px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          letterSpacing: '0.04em'
        }}
      >
        <span>Configuración avanzada</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: '10px' }}>
          {advanced ? '▲ ocultar' : '▼ mostrar'}
        </span>
      </button>

      {/* Panel avanzado */}
      {advanced && (
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '20px',
          marginBottom: '20px'
        }}>

          {/* Fuentes */}
          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>Fuentes de búsqueda</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {ALL_SOURCES.map(s => (
                <button
                  key={s.key}
                  onClick={() => toggleSource(s.key)}
                  style={{
                    padding: '6px 14px',
                    fontSize: '12px',
                    borderRadius: 'var(--radius)',
                    border: '1px solid',
                    cursor: 'pointer',
                    fontWeight: 500,
                    background: sources.includes(s.key) ? 'var(--accent-dim)' : 'transparent',
                    borderColor: sources.includes(s.key) ? 'var(--accent-border)' : 'var(--border)',
                    color: sources.includes(s.key) ? 'var(--accent)' : 'var(--text-dim)',
                    transition: 'all 0.15s'
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>


          {/* Umbral de confianza */}
          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>
              Umbral de confianza HITL
              <span style={{ marginLeft: '8px', fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--accent)' }}>
                {(confidence * 100).toFixed(0)}%
              </span>
            </label>
            <input
              type="range" min="0.5" max="1" step="0.05"
              value={confidence}
              onChange={e => setConfidence(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent)' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-dim)', marginTop: '4px' }}>
              <span>50% — más HITL</span>
              <span>100% — todo auto</span>
            </div>
          </div>

          {/* Criterios */}
          <CriteriaEditor
            label="Criterios de inclusión"
            items={include}
            onChange={setInclude}
          />
          <CriteriaEditor
            label="Criterios de exclusión"
            items={exclude}
            onChange={setExclude}
          />
        </div>
      )}

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
        {loading ? 'Lanzando búsqueda...' : 'Iniciar búsqueda'}
      </button>
    </div>
  )
}
