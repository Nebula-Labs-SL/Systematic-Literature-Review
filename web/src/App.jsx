import { useState } from 'react'
import NewRun      from './components/NewRun.jsx'
import RunProgress from './components/RunProgress.jsx'
import HITLReview  from './components/HITLReview.jsx'

export default function App() {
  const [view,   setView]   = useState('new')   // new | progress | hitl
  const [runId,  setRunId]  = useState(null)

  function handleRunCreated(id) {
    setRunId(id)
    setView('progress')
  }

  function handleGoToHITL(id) {
    setRunId(id)
    setView('hitl')
  }

  const tabs = [
    { key: 'new',      label: 'Nueva búsqueda' },
    { key: 'progress', label: 'Progreso',       disabled: !runId },
    { key: 'hitl',     label: 'Revisión HITL',  disabled: !runId }
  ]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

      {/* Navbar */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(10, 11, 14, 0.9)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
        padding: '0 32px',
        display: 'flex', alignItems: 'center', gap: '28px',
        height: '52px',
      }}>
        <span style={{
          fontFamily: 'var(--mono)',
          fontWeight: 500,
          fontSize: '12px',
          color: 'var(--accent)',
          letterSpacing: '0.08em',
          marginRight: '4px',
        }}>
          SLR // Nebula Labs
        </span>

        <div style={{ width: '1px', height: '16px', background: 'var(--border-light)' }} />

        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => !tab.disabled && setView(tab.key)}
            style={{
              background: 'none',
              border: 'none',
              padding: '4px 0',
              fontSize: '12px',
              fontWeight: view === tab.key ? 500 : 400,
              letterSpacing: '0.02em',
              cursor: tab.disabled ? 'not-allowed' : 'pointer',
              color: tab.disabled
                ? 'var(--border-light)'
                : view === tab.key ? 'var(--accent)' : 'var(--text)',
              borderBottom: view === tab.key
                ? '1px solid var(--accent)'
                : '1px solid transparent',
              transition: 'color 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {view === 'new'      && <NewRun      onRunCreated={handleRunCreated} />}
      {view === 'progress' && <RunProgress runId={runId} onGoToHITL={handleGoToHITL} />}
      {view === 'hitl'     && <HITLReview  runId={runId} />}
    </div>
  )
}