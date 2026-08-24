import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

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

export default function HITLReview({ runId }) {
    const [papers, setPapers] = useState([])
    const [_counts, _setCounts] = useState({ maybe: 0, include: 0, exclude: 0 })
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState('maybe') // maybe | include | exclude | all
    const [minConfidence, setMinConfidence] = useState(0)

    // Cargar papers con sus decisiones
    async function loadPapers() {
        setLoading(true)

        // Traemos studies con su decisión de screening
        const { data, error } = await supabase
            .from('studies')
            .select(`
        id, title, abstract, doi, year, source,
        screening_decisions (
          id, decision, reason, confidence, by_human
        )
      `)
            .eq('run_id', runId)
            .or('is_duplicate.eq.false,is_duplicate.is.null')
            .order('created_at', { ascending: true })

        if (error) {
            console.error('Error cargando papers:', error.message)
            setLoading(false)
            return
        }

        // Aplanar — cada study tiene un array de decisions, nos quedamos con la última
        const normalized = data.map(study => ({
            ...study,
            decision: study.screening_decisions?.at(-1) || null
        }))

        setPapers(normalized)
        setLoading(false)
    }

    useEffect(() => { loadPapers() }, [runId])

    // Guardar decisión humana
    async function handleDecide(studyId, _existingDecisionId, newDecision) {
        // Obtener usuario Oscar (admin)
        const { data: user } = await supabase
            .from('users')
            .select('id')
            .eq('email', 'oscar@tecnun.es')
            .single()

        // Insertar nueva decisión humana
        const { error } = await supabase
            .from('screening_decisions')
            .insert({
                study_id: studyId,
                stage: 'title_abstract',
                decision: newDecision,
                reason: 'Human override via HITL review interface',
                confidence: 1.0,
                by_human: true,
                created_by: user?.id
            })

        if (error) {
            console.error('Error guardando decisión:', error.message)
            return
        }

        // Actualizar estado local sin recargar todo
        setPapers(prev => prev.map(p =>
            p.id === studyId
                ? { ...p, decision: { decision: newDecision, confidence: 1.0, by_human: true } }
                : p
        ))

    }

    // Apply confidence filter first, then tab filter
    const confFiltered = minConfidence > 0
      ? papers.filter(p => (p.decision?.confidence ?? 0) >= minConfidence / 100)
      : papers

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
                        onClick={() => setFilter(tab.key)}
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
                filtered.map(paper => (
                    <PaperCard
                        key={paper.id}
                        study={paper}
                        decision={paper.decision}
                        onDecide={handleDecide}
                        showActions={filter === 'maybe' || filter === 'all'}
                    />
                ))
            )}
        </div>
    )
}