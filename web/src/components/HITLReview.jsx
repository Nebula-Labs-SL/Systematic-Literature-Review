import { useEffect, useState } from 'react'
import { decideStudy, runStudyDare, getRunPapers } from '../lib/api.js'

// ─── Tarjeta individual de un paper ─────────────────────────────────────────

function PaperCard({ study, decision, onDecide, showActions }) {
    const [loading, setLoading] = useState(false)

    const confidence = decision?.confidence ?? 0
    const confidenceColor = confidence < 0.5
        ? 'var(--red)'
        : confidence < 0.7
            ? 'var(--amber)'
            : 'var(--green)'

    async function handleDecide(newDecision) {
        setLoading(true)
        await onDecide(study.id, decision?.id, newDecision)
        setLoading(false)
    }

    return (
        <div style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '16px',
            marginBottom: '10px',
            background: 'var(--bg-surface)',
        }}>
            {/* Cabecera */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{
                    fontSize: '10px',
                    fontFamily: 'var(--mono)',
                    background: 'var(--bg-elevated)',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    color: 'var(--text-dim)',
                    letterSpacing: '0.05em',
                }}>
                    {study.source?.toUpperCase()} · {study.year}
                </span>
                {decision && (
                    <span style={{
                        fontSize: '11px',
                        fontFamily: 'var(--mono)',
                        color: confidenceColor,
                        fontWeight: 500,
                    }}>
                        {(confidence * 100).toFixed(0)}% conf
                    </span>
                )}
            </div>

            {/* Título */}
            <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', lineHeight: 1.5, color: 'var(--text-heading)' }}>
                {study.title}
            </h3>

            {/* Abstract */}
            <p style={{
                fontSize: '12px',
                color: 'var(--text)',
                marginBottom: '10px',
                lineHeight: 1.6,
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden'
            }}>
                {study.abstract || 'Sin abstract disponible'}
            </p>

            {/* Razón del screening */}
            {decision?.reason && (
                <div style={{
                    background: 'rgba(0, 212, 200, 0.05)',
                    border: '1px solid var(--accent-border)',
                    borderRadius: 'var(--radius)',
                    padding: '8px 12px',
                    marginBottom: '12px',
                    fontSize: '11px',
                    color: 'var(--text)',
                    lineHeight: 1.6,
                }}>
                    {decision.reason}
                </div>
            )}

            {/* DOI link */}
            {study.doi && (
                <a
                    href={`https://doi.org/${study.doi}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                        fontSize: '11px',
                        fontFamily: 'var(--mono)',
                        color: 'var(--text-dim)',
                        marginBottom: '12px',
                        display: 'block',
                        textDecoration: 'none',
                    }}
                >
                    ↗ doi.org/{study.doi}
                </a>
            )}

            {/* Action buttons — only for pending papers */}
            {showActions && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => handleDecide('include')} disabled={loading} style={{
                  flex: 1, padding: '8px', background: 'rgba(16,208,128,0.08)',
                  color: 'var(--green)', border: '1px solid rgba(16,208,128,0.25)',
                  borderRadius: 'var(--radius)', cursor: loading ? 'not-allowed' : 'pointer',
                  fontWeight: 600, fontSize: '12px', opacity: loading ? 0.4 : 1,
                }}>
                  ✓ Include
                </button>
                <button onClick={() => handleDecide('exclude')} disabled={loading} style={{
                  flex: 1, padding: '8px', background: 'rgba(240,79,90,0.08)',
                  color: 'var(--red)', border: '1px solid rgba(240,79,90,0.25)',
                  borderRadius: 'var(--radius)', cursor: loading ? 'not-allowed' : 'pointer',
                  fontWeight: 600, fontSize: '12px', opacity: loading ? 0.4 : 1,
                }}>
                  ✗ Exclude
                </button>
              </div>
            )}
        </div>
    )
}

// ─── Panel de estadísticas ───────────────────────────────────────────────────

function StatsBar({ counts }) {
    const total = counts.include + counts.exclude + counts.maybe

    return (
        <div style={{
            display: 'flex',
            gap: '10px',
            marginBottom: '20px',
        }}>
            {[
                { label: 'Pendientes', value: counts.maybe,   color: 'var(--amber)' },
                { label: 'Incluidos',  value: counts.include, color: 'var(--green)' },
                { label: 'Excluidos',  value: counts.exclude, color: 'var(--red)' },
                { label: 'Total',      value: total,          color: 'var(--text-heading)' }
            ].map(stat => (
                <div key={stat.label} style={{
                    flex: 1, textAlign: 'center',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    padding: '14px 8px',
                }}>
                    <div style={{
                        fontSize: '22px', fontWeight: 700,
                        color: stat.color, fontFamily: 'var(--mono)',
                        lineHeight: 1,
                    }}>
                        {stat.value}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '6px', letterSpacing: '0.04em' }}>
                        {stat.label}
                    </div>
                </div>
            ))}
        </div>
    )
}

// ─── Componente principal ────────────────────────────────────────────────────

const PAGE_SIZE = 50

export default function HITLReview({ runId }) {
    const [papers,       setPapers]       = useState([])
    const [loading,      setLoading]      = useState(true)
    const [loadError,    setLoadError]    = useState(null)
    const [filter,       setFilter]       = useState('maybe')
    const [minConfidence, setMinConfidence] = useState(0)
    const [searchQuery,  setSearchQuery]  = useState('')
    const [decideError,  setDecideError]  = useState(null)
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

    async function loadPapers() {
        setLoading(true)
        setLoadError(null)
        try {
            const data = await getRunPapers(runId, 'hitl')
            setPapers(data)
        } catch (e) {
            console.error('Error cargando papers:', e.message)
            setLoadError(e.message)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        setVisibleCount(PAGE_SIZE)
        loadPapers()
    }, [runId])

    // Guardar decisión humana via servidor (usa supabaseAdmin para evitar RLS)
    async function handleDecide(studyId, _existingDecisionId, newDecision) {
        setDecideError(null)
        try {
            await decideStudy(studyId, newDecision)
        } catch (e) {
            console.error('Error guardando decisión:', e.message)
            setDecideError(e.message)
            return
        }

        // Actualizar estado local sin recargar todo
        setPapers(prev => prev.map(p =>
            p.id === studyId
                ? { ...p, decision: { decision: newDecision, confidence: 1.0, by_human: true } }
                : p
        ))

        // Auto-run QAC for newly included papers so they appear in QAC Results
        if (newDecision === 'include') {
            runStudyDare(studyId, runId).catch(e =>
                console.warn('[hitl] QAC auto-score failed:', e.message)
            )
        }
    }

    // Apply text search, then confidence filter, then tab filter
    const searchFiltered = searchQuery.trim()
      ? papers.filter(p => {
          const q = searchQuery.toLowerCase()
          return p.title?.toLowerCase().includes(q) || p.abstract?.toLowerCase().includes(q)
        })
      : papers

    const confFiltered = minConfidence > 0
      ? searchFiltered.filter(p => (p.decision?.confidence ?? 0) >= minConfidence / 100)
      : searchFiltered

    const counts = {
      maybe:   confFiltered.filter(p => !p.decision?.decision || p.decision.decision === 'maybe').length,
      include: confFiltered.filter(p => p.decision?.decision === 'include').length,
      exclude: confFiltered.filter(p => p.decision?.decision === 'exclude').length,
    }

    const filtered = confFiltered.filter(p => {
        if (filter === 'all') return true
        const d = p.decision?.decision
        if (filter === 'maybe') return !d || d === 'maybe'
        return d === filter
    })

    if (loading) return (
        <div style={{ textAlign: 'center', padding: '64px', color: 'var(--text-dim)', fontSize: '13px' }}>
            Cargando papers...
        </div>
    )

    if (loadError) return (
        <div style={{ textAlign: 'center', padding: '64px', color: 'var(--red)', fontSize: '13px' }}>
            Error: {loadError}
        </div>
    )

    return (
        <div style={{ maxWidth: '760px', margin: '0 auto', padding: '48px 24px' }}>

            {/* Header */}
            <div style={{ marginBottom: '28px' }}>
                <h1 style={{ fontSize: '18px', marginBottom: '6px' }}>
                    Revisión HITL — Screening T&A
                </h1>
                <p style={{ fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>
                    run:{runId}
                </p>
            </div>

            {/* Stats */}
            <StatsBar counts={counts} />

            {/* Búsqueda */}
            <div style={{ marginBottom: '16px' }}>
                <input
                    type="text"
                    placeholder="Buscar por título o abstract..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    style={{
                        width: '100%', boxSizing: 'border-box',
                        padding: '8px 14px', fontSize: '13px',
                        background: 'var(--bg-surface)', border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)', color: 'var(--text-heading)',
                        outline: 'none',
                    }}
                />
            </div>

            {decideError && (
                <div style={{
                    padding: '10px 14px', marginBottom: 12, fontSize: 12,
                    background: 'rgba(240,79,90,0.08)', border: '1px solid rgba(240,79,90,0.25)',
                    borderRadius: 'var(--radius)', color: 'var(--red)'
                }}>
                    Error al guardar decisión: {decideError}
                </div>
            )}

            {/* Filtros */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '20px' }}>
                {[
                    { key: 'maybe',   label: `Pendientes (${counts.maybe})` },
                    { key: 'include', label: `Incluidos (${counts.include})` },
                    { key: 'exclude', label: `Excluidos (${counts.exclude})` },
                    { key: 'all',     label: 'Todos' }
                ].map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => { setFilter(tab.key); setVisibleCount(PAGE_SIZE) }}
                        style={{
                            padding: '5px 12px',
                            borderRadius: 'var(--radius)',
                            border: '1px solid',
                            borderColor: filter === tab.key ? 'var(--accent-border)' : 'var(--border)',
                            background: filter === tab.key ? 'var(--accent-dim)' : 'transparent',
                            color: filter === tab.key ? 'var(--accent)' : 'var(--text)',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: filter === tab.key ? 500 : 400,
                            transition: 'all 0.15s',
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Filtro de confianza */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                    Confianza mínima
                </span>
                <input
                    type="range" min={0} max={100} step={5}
                    value={minConfidence}
                    onChange={e => setMinConfidence(Number(e.target.value))}
                    style={{ flex: 1 }}
                />
                <span style={{ fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--accent)', minWidth: '36px', textAlign: 'right' }}>
                    {minConfidence}%
                </span>
            </div>

            {/* Lista de papers */}
            {filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-dim)', fontSize: '13px' }}>
                    {filter === 'maybe'
                        ? 'Todo revisado. No quedan papers pendientes.'
                        : 'No hay papers en esta categoría.'}
                </div>
            ) : (
                <>
                    {filtered.slice(0, visibleCount).map(paper => (
                        <PaperCard
                            key={paper.id}
                            study={paper}
                            decision={paper.decision}
                            onDecide={handleDecide}
                            showActions={filter === 'maybe' || filter === 'all'}
                        />
                    ))}
                    {visibleCount < filtered.length && (
                        <div style={{ textAlign: 'center', padding: '16px 0 32px' }}>
                            <button
                                onClick={() => setVisibleCount(v => v + PAGE_SIZE)}
                                style={{
                                    padding: '8px 24px', fontSize: '12px', fontWeight: 500,
                                    background: 'var(--bg-surface)', border: '1px solid var(--border)',
                                    borderRadius: 'var(--radius)', color: 'var(--text-dim)',
                                    cursor: 'pointer'
                                }}
                            >
                                Mostrar más ({filtered.length - visibleCount} restantes)
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}