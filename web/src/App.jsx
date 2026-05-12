import { useState } from 'react'
import isotipo      from './assets/ISOTIPO.svg'
import NewRun       from './components/NewRun.jsx'
import RunProgress  from './components/RunProgress.jsx'
import HITLReview   from './components/HITLReview.jsx'
import RunHistory   from './components/RunHistory.jsx'
import ResultsTable from './components/ResultsTable.jsx'

export default function App() {
  const [view,   setView]   = useState('new')   // new | progress | hitl | history
  const [runId,  setRunId]  = useState(null)

  function handleRunCreated(id) {
    setRunId(id)
    setView('progress')
  }

  function handleGoToHITL(id) {
    setRunId(id)
    setView('hitl')
  }

  function handleSelectRun(id) {
    setRunId(id)
    setView('progress')
  }

  const tabs = [
    { key: 'new',      label: 'Nueva búsqueda' },
    { key: 'history',  label: 'Historial' },
    { key: 'progress', label: 'Progreso',      disabled: !runId },
    { key: 'hitl',     label: 'Revisión HITL', disabled: !runId },
    { key: 'results',  label: 'Resultados',    disabled: !runId }
  ]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

      {/* Navbar */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(245, 246, 250, 0.95)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
        padding: '0 32px',
        display: 'flex', alignItems: 'center', gap: '28px',
        height: '52px',
      }}>
        <img src={isotipo} alt="Nebula Labs" style={{ height: '24px' }} />

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
                ? 'var(--text-dim)'
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

      {view === 'new'      && <NewRun       onRunCreated={handleRunCreated} />}
      {view === 'history'  && <RunHistory   onSelectRun={handleSelectRun} />}
      {view === 'progress' && <RunProgress  runId={runId} onGoToHITL={handleGoToHITL} />}
      {view === 'hitl'     && <HITLReview   runId={runId} />}
      {view === 'results'  && <ResultsTable runId={runId} />}
    </div>
  )
}
