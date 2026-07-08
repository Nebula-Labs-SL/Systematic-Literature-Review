import { useState } from 'react'
import isotipo       from './assets/ISOTIPO.svg'
import Projects      from './components/Projects.jsx'
import RunProgress   from './components/RunProgress.jsx'
import HITLReview    from './components/HITLReview.jsx'
import RunHistory    from './components/RunHistory.jsx'
import ResultsTable  from './components/ResultsTable.jsx'
import PRISMADiagram from './components/PRISMADiagram.jsx'
import DAREReview    from './components/DAREReview.jsx'
import DAREResults   from './components/DAREResults.jsx'

export default function App() {
  const [view,      setView]      = useState('projects')
  const [runId,     setRunId]     = useState(null)
  const [runStatus, setRunStatus] = useState(null)

  function handleGoToHITL(id) {
    setRunId(id)
    setView('hitl')
  }

  function handleSelectRun(id) {
    setRunId(id)
    setView('progress')
  }

  const tabs = [
    { key: 'projects',     label: 'Projects' },
    { key: 'history',      label: 'History' },
    { key: 'progress',     label: 'Progress',      disabled: !runId },
    { key: 'hitl',         label: 'HITL Review',   disabled: !runId },
    { key: 'results',      label: 'HITL Results',  disabled: !runId },
    { key: 'dare',         label: 'DARE',          disabled: !runId },
    { key: 'dare-results', label: 'DARE Results',  disabled: !runId },
    { key: 'prisma',       label: 'PRISMA Flow',   disabled: !runId },
  ]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

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
              background: 'none', border: 'none',
              padding: '4px 0', fontSize: '12px',
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

      {view === 'projects'     && <Projects       onSelectRun={handleSelectRun} />}
      {view === 'history'      && <RunHistory    onSelectRun={handleSelectRun} />}
      {view === 'progress'     && <RunProgress   runId={runId} onGoToHITL={handleGoToHITL} onStatusChange={setRunStatus} />}
      {view === 'hitl'         && <HITLReview    runId={runId} />}
      {view === 'results'      && <ResultsTable  runId={runId} />}
      {view === 'dare'         && <DAREReview    runId={runId} runStatus={runStatus} />}
      {view === 'dare-results' && <DAREResults   runId={runId} />}
      {view === 'prisma'       && <PRISMADiagram runId={runId} runStatus={runStatus} />}
    </div>
  )
}
