import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

const DECISION_COLORS = {
  include: { bg: 'rgba(16,208,128,0.08)', border: 'rgba(16,208,128,0.25)', color: 'var(--green)',  label: 'Incluido'  },
  exclude: { bg: 'rgba(240,79,90,0.08)',  border: 'rgba(240,79,90,0.25)',  color: 'var(--red)',    label: 'Excluido'  },
  maybe:   { bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.25)', color: 'var(--amber)',  label: 'Pendiente' },
  null:    { bg: 'transparent',           border: 'var(--border)',          color: 'var(--text-dim)', label: 'Sin decisión' }
}

function badge(decision) {
  const d = DECISION_COLORS[decision] || DECISION_COLORS.null
  return (
    <span style={{
      fontSize: '10px', fontWeight: 600, padding: '2px 8px',
      borderRadius: '4px', border: `1px solid ${d.border}`,
      background: d.bg, color: d.color, letterSpacing: '0.04em',
      whiteSpace: 'nowrap'
    }}>
      {d.label}
    </span>
  )
}

function exportCSV(papers) {
  const headers = ['Título', 'Autores', 'Año', 'Fuente', 'DOI', 'URL', 'Abstract', 'Decisión', 'Confianza', 'Razón', 'Por humano']
  const rows = papers.map(p => {
    const d = p.decision
    return [
      p.title        || '',
      p.authors      || '',
      p.year         || '',
      p.source       || '',
      p.doi          || '',
      p.url          || (p.doi ? `https://doi.org/${p.doi}` : ''),
      (p.abstract    || '').replace(/\n/g, ' '),
      d?.decision    || 'sin decisión',
      d?.confidence != null ? (d.confidence * 100).toFixed(0) + '%' : '',
      (d?.reason     || '').replace(/\n/g, ' '),
      d?.by_human ? 'Sí' : 'No'
    ].map(v => `"${String(v).replace(/"/g, '""')}"`)
  })

  const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `slr-results-${Date.now()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function ResultsTable({ runId }) {
  const [papers,  setPapers]  = useState([])
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState('all')
  const [search,  setSearch]  = useState('')
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data, error } = await supabase
        .from('studies')
        .select(`
          id, title, abstract, doi, url, year, source, authors,
          screening_decisions (
            id, decision, reason, confidence, by_human
          )
        `)
        .eq('run_id', runId)
        .or('is_duplicate.eq.false,is_duplicate.is.null')
        .order('created_at', { ascending: true })

      if (!error) {
        setPapers(data.map(s => ({
          ...s,
          decision: s.screening_decisions?.at(-1) || null
        })))
      }
      setLoading(false)
    }
    load()
  }, [runId])

  const filtered = papers.filter(p => {
    const d = p.decision?.decision || 'maybe'
    if (filter !== 'all' && d !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      return (p.title || '').toLowerCase().includes(q) ||
             (p.authors || '').toLowerCase().includes(q) ||
             (p.abstract || '').toLowerCase().includes(q)
    }
    return true
  })

  const counts = {
    include: papers.filter(p => p.decision?.decision === 'include').length,
    exclude: papers.filter(p => p.decision?.decision === 'exclude').length,
    maybe:   papers.filter(p => !p.decision || p.decision?.decision === 'maybe').length,
  }

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '64px', color: 'var(--text-dim)', fontSize: '13px' }}>
      Cargando resultados...
    </div>
  )

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '40px 24px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '18px', marginBottom: '4px' }}>Tabla de resultados</h1>
          <p style={{ fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>
            {papers.length} papers · {counts.include} incluidos · {counts.exclude} excluidos · {counts.maybe} pendientes
          </p>
        </div>
        <button
          onClick={() => exportCSV(filtered)}
          style={{
            padding: '8px 16px', fontSize: '12px', fontWeight: 600,
            background: 'var(--accent-dim)', color: 'var(--accent)',
            border: '1px solid var(--accent-border)', borderRadius: 'var(--radius)',
            cursor: 'pointer', letterSpacing: '0.04em'
          }}
        >
          Exportar CSV ({filtered.length})
        </button>
      </div>

      {/* Filtros + búsqueda */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {[
          { key: 'all',     label: `Todos (${papers.length})` },
          { key: 'include', label: `Incluidos (${counts.include})` },
          { key: 'exclude', label: `Excluidos (${counts.exclude})` },
          { key: 'maybe',   label: `Pendientes (${counts.maybe})` },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            style={{
              padding: '5px 12px', fontSize: '12px', borderRadius: 'var(--radius)',
              border: '1px solid', cursor: 'pointer',
              borderColor: filter === tab.key ? 'var(--accent-border)' : 'var(--border)',
              background:  filter === tab.key ? 'var(--accent-dim)' : 'transparent',
              color:       filter === tab.key ? 'var(--accent)' : 'var(--text)',
              fontWeight:  filter === tab.key ? 500 : 400,
            }}
          >
            {tab.label}
          </button>
        ))}
        <input
          placeholder="Buscar por título, autor, abstract..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            marginLeft: 'auto', padding: '5px 12px', fontSize: '12px',
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', color: 'var(--text-heading)',
            outline: 'none', minWidth: '220px'
          }}
        />
      </div>

      {/* Tabla */}
      <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
              {['Título', 'Autores', 'Año', 'Fuente', 'Decisión', 'Conf.', 'Razón'].map(h => (
                <th key={h} style={{
                  padding: '10px 12px', textAlign: 'left', fontSize: '10px',
                  fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: 'var(--text-dim)', whiteSpace: 'nowrap'
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)' }}>
                  No hay resultados.
                </td>
              </tr>
            ) : filtered.map((p, i) => {
              const d = p.decision
              const isExpanded = expanded === p.id
              return (
                <>
                  <tr
                    key={p.id}
                    onClick={() => setExpanded(isExpanded ? null : p.id)}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      background: i % 2 === 0 ? 'transparent' : 'var(--bg-surface)',
                      cursor: 'pointer',
                      transition: 'background 0.1s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                    onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'var(--bg-surface)'}
                  >
                    {/* Título */}
                    <td style={{ padding: '10px 12px', maxWidth: '300px' }}>
                      <div style={{
                        fontWeight: 500, color: 'var(--text-heading)', lineHeight: 1.4,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                      }}>
                        {p.title || '—'}
                      </div>
                      {p.doi && (
                        <a
                          href={`https://doi.org/${p.doi}`}
                          target="_blank" rel="noreferrer"
                          onClick={e => e.stopPropagation()}
                          style={{ fontSize: '10px', color: 'var(--text-dim)', textDecoration: 'none', fontFamily: 'var(--mono)' }}
                        >
                          ↗ {p.doi}
                        </a>
                      )}
                    </td>
                    {/* Autores */}
                    <td style={{ padding: '10px 12px', color: 'var(--text-dim)', maxWidth: '160px' }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.authors || '—'}
                      </div>
                    </td>
                    {/* Año */}
                    <td style={{ padding: '10px 12px', color: 'var(--text-dim)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
                      {p.year || '—'}
                    </td>
                    {/* Fuente */}
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      <span style={{
                        fontSize: '10px', background: 'var(--bg-elevated)', padding: '2px 7px',
                        borderRadius: '4px', color: 'var(--text-dim)', fontFamily: 'var(--mono)'
                      }}>
                        {p.source?.toUpperCase() || '—'}
                      </span>
                    </td>
                    {/* Decisión */}
                    <td style={{ padding: '10px 12px' }}>
                      {badge(d?.decision || null)}
                    </td>
                    {/* Confianza */}
                    <td style={{ padding: '10px 12px', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
                      {d?.confidence != null
                        ? <span style={{ color: d.confidence >= 0.7 ? 'var(--green)' : d.confidence >= 0.5 ? 'var(--amber)' : 'var(--red)' }}>
                            {(d.confidence * 100).toFixed(0)}%
                          </span>
                        : '—'}
                    </td>
                    {/* Razón */}
                    <td style={{ padding: '10px 12px', color: 'var(--text)', maxWidth: '280px' }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d?.reason || '—'}
                      </div>
                    </td>
                  </tr>

                  {/* Fila expandida con abstract */}
                  {isExpanded && (
                    <tr key={`${p.id}-exp`} style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                      <td colSpan={7} style={{ padding: '16px 20px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                          <div>
                            <p style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-dim)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>Abstract</p>
                            <p style={{ fontSize: '12px', color: 'var(--text)', lineHeight: 1.6 }}>
                              {p.abstract || 'Sin abstract disponible'}
                            </p>
                          </div>
                          <div>
                            <p style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-dim)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>Decisión Claude</p>
                            <p style={{ fontSize: '12px', color: 'var(--text)', lineHeight: 1.6 }}>
                              {d?.reason || 'Sin razón registrada'}
                            </p>
                            {d?.by_human && (
                              <span style={{ fontSize: '10px', color: 'var(--accent)', marginTop: '8px', display: 'block' }}>
                                Revisado por humano
                              </span>
                            )}
                            {p.url && (
                              <a href={p.url} target="_blank" rel="noreferrer" style={{ fontSize: '11px', color: 'var(--text-dim)', display: 'block', marginTop: '8px' }}>
                                ↗ Ver paper original
                              </a>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>

      {filtered.length > 0 && (
        <p style={{ fontSize: '11px', color: 'var(--text-dim)', textAlign: 'center', marginTop: '12px' }}>
          Haz clic en una fila para ver el abstract completo · {filtered.length} resultados mostrados
        </p>
      )}
    </div>
  )
}
