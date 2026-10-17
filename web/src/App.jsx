import { useState, useEffect, useRef } from 'react'
import isotipo       from './assets/ISOTIPO.svg'
import Projects      from './components/Projects.jsx'
import RunProgress   from './components/RunProgress.jsx'
import HITLReview    from './components/HITLReview.jsx'
import RunHistory    from './components/RunHistory.jsx'
import ResultsTable  from './components/ResultsTable.jsx'
import PRISMADiagram from './components/PRISMADiagram.jsx'
import DAREReview    from './components/DAREReview.jsx'
import DAREResults   from './components/DAREResults.jsx'

const RUN_VIEWS = ['progress', 'hitl', 'results', 'dare', 'dare-results', 'prisma']
const VALID_VIEWS = ['projects', 'history', ...RUN_VIEWS]

function getHashView() {
  const hash = window.location.hash.replace('#', '')
  return VALID_VIEWS.includes(hash) ? hash : 'projects'
}

function Breadcrumb({ view, projectName, runTopic, onBack }) {
  if (!projectName && !runTopic) return null

  const crumbs = [
    { label: 'Projects', onClick: () => onBack('projects') },
  ]
  if (projectName) crumbs.push({ label: projectName, onClick: () => onBack('projects') })
  if (runTopic && RUN_VIEWS.includes(view)) {
    crumbs.push({
      label: runTopic.length > 50 ? runTopic.slice(0, 50) + '…' : runTopic,
      onClick: view !== 'progress' ? () => onBack('progress') : undefined
    })
  }

  return (
    <div style={{
      padding: '6px 32px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg-surface)',
      display: 'flex', alignItems: 'center', gap: 6,
      fontSize: '11px', color: 'var(--text-dim)',
      flexShrink: 0,
    }}>
      {crumbs.map((c, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {i > 0 && <span style={{ opacity: 0.4 }}>/</span>}
          <span
            onClick={c.onClick}
            style={{
              color: c.onClick ? 'var(--accent)' : 'var(--text)',
              cursor: c.onClick ? 'pointer' : 'default',
              fontWeight: i === crumbs.length - 1 ? 500 : 400,
            }}
          >
            {c.label}
          </span>
        </span>
      ))}
    </div>
  )
}

export default function App() {
  const [view,              setViewState]        = useState(getHashView)
  const [runId,             setRunId]            = useState(null)
  const [runStatus,         setRunStatus]        = useState(null)
  const [projectName,       setProjectName]      = useState(null)
  const [runTopic,          setRunTopic]         = useState(null)
  const [selectedProjectId, setSelectedProjectId] = useState(null)

  const scrollRef = useRef(null)

  // Keep hash in sync when we navigate programmatically
  function navigate(newView) {
    window.location.hash = newView
    // setViewState is called via the hashchange listener below
  }

  // Listen to browser back/forward — hash is the source of truth
  useEffect(() => {
    function onHashChange() {
      const v = getHashView()
      setViewState(v)
      if (scrollRef.current) scrollRef.current.scrollTop = 0
    }
    window.addEventListener('hashchange', onHashChange)
    // Set initial hash if missing
    if (!window.location.hash) window.location.hash = 'projects'
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // Scroll to top on view change
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [view])

  function handleGoToHITL(id) {
    setRunId(id)
    navigate('hitl')
  }

  function handleSelectRun(id, meta = {}) {
    setRunId(id)
    if (meta.topic)       setRunTopic(meta.topic)
    if (meta.projectName) setProjectName(meta.projectName)
    navigate('progress')
  }

  function handleProjectSelect(id, name) {
    setSelectedProjectId(id)
    setProjectName(name)
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

  const showBreadcrumb = view !== 'projects' && view !== 'history' && (projectName || runTopic)

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>

      <nav style={{
        flexShrink: 0,
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
            onClick={() => !tab.disabled && navigate(tab.key)}
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

      {showBreadcrumb && (
        <Breadcrumb
          view={view}
          projectName={projectName}
          runTopic={runTopic}
          onBack={navigate}
        />
      )}

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {view === 'projects'     && <Projects       onSelectRun={handleSelectRun} onProjectSelect={handleProjectSelect} initialProjectId={selectedProjectId} />}
        {view === 'history'      && <RunHistory      onSelectRun={handleSelectRun} />}
        {view === 'progress'     && <RunProgress     runId={runId} onGoToHITL={handleGoToHITL} onStatusChange={setRunStatus} />}
        {view === 'hitl'         && <HITLReview      runId={runId} />}
        {view === 'results'      && <ResultsTable    runId={runId} />}
        {view === 'dare'         && <DAREReview      runId={runId} runStatus={runStatus} />}
        {view === 'dare-results' && <DAREResults     runId={runId} projectId={selectedProjectId} />}
        {view === 'prisma'       && <PRISMADiagram   runId={runId} runStatus={runStatus} />}
      </div>
    </div>
  )
}
