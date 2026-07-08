import { useState, useEffect } from 'react'
import { getProjects, createProject, deleteProject, getProjectRuns } from '../lib/api.js'
import ContextDocs  from './ContextDocs.jsx'
import DAREResults  from './DAREResults.jsx'
import PRISMADiagram from './PRISMADiagram.jsx'
import NewRun from './NewRun.jsx'

const STATUS_COLOR = {
  created:         '#9ca3af',
  pending:         '#9ca3af',
  searching:       '#3b82f6',
  search_done:     '#8b5cf6',
  screening_done:  '#10b981',
  retrieving:      '#3b82f6',
  stage2_done:     '#10b981',
  dare_running:    '#8b5cf6',
  dare_done:       '#10b981',
  extracting:      '#3b82f6',
  extraction_done: '#10b981',
  cancelled:       '#f59e0b',
  error:           '#ef4444',
}

const STATUS_LABEL = {
  created:         'Created',
  pending:         'Pending',
  searching:       'Searching',
  search_done:     'Stage 1',
  screening_done:  'Stage 1 done',
  retrieving:      'Retrieving',
  stage2_done:     'Stage 2 done',
  dare_running:    'DARE running',
  dare_done:       'DARE done',
  extracting:      'Extracting',
  extraction_done: 'Complete',
  cancelled:       'Cancelled',
  error:           'Error',
}

const labelStyle = {
  display: 'block', fontSize: '11px', fontWeight: 500,
  letterSpacing: '0.08em', color: 'var(--text-dim)',
  textTransform: 'uppercase', marginBottom: '8px'
}

const inputStyle = {
  width: '100%', padding: '10px 14px', fontSize: '13px',
  background: 'var(--bg-surface)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)', outline: 'none',
  color: 'var(--text-heading)', transition: 'border-color 0.15s',
}

const PROJECT_TABS = [
  { key: 'runs',    label: 'Runs' },
  { key: 'dare',    label: 'DARE Results' },
  { key: 'prisma',  label: 'PRISMA Flow' },
  { key: 'context', label: 'Context Docs' },
]

export default function Projects({ onSelectRun }) {
  const [projects,       setProjects]       = useState([])
  const [selected,       setSelected]       = useState(null)
  const [runs,           setRuns]           = useState([])
  const [projectTab,     setProjectTab]     = useState('runs')
  const [showNewProject, setShowNewProject] = useState(false)
  const [showNewRun,     setShowNewRun]     = useState(false)
  const [newName,        setNewName]        = useState('')
  const [newDesc,        setNewDesc]        = useState('')
  const [creating,       setCreating]       = useState(false)
  const [error,          setError]          = useState(null)

  useEffect(() => { loadProjects() }, [])

  useEffect(() => {
    if (selected) loadRuns(selected.id)
  }, [selected])

  async function loadProjects() {
    try {
      const data = await getProjects()
      setProjects(data)
    } catch (e) { setError(e.message) }
  }

  async function loadRuns(projectId) {
    try {
      const data = await getProjectRuns(projectId)
      setRuns(data)
    } catch { setRuns([]) }
  }

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const p = await createProject(newName.trim(), newDesc.trim())
      setProjects(prev => [p, ...prev])
      setSelected(p); setProjectTab('runs')
      setNewName('')
      setNewDesc('')
      setShowNewProject(false)
    } catch (e) { setError(e.message) }
    finally { setCreating(false) }
  }

  async function handleDelete(projectId) {
    if (!confirm('Delete this project and all its context documents?')) return
    try {
      await deleteProject(projectId)
      setProjects(prev => prev.filter(p => p.id !== projectId))
      if (selected?.id === projectId) { setSelected(null); setRuns([]) }
    } catch (e) { setError(e.message) }
  }

  function handleRunCreated(runId) {
    setShowNewRun(false)
    loadRuns(selected.id)
    onSelectRun(runId)
  }

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 52px)' }}>

      {/* Sidebar — project list */}
      <div style={{
        width: 260, flexShrink: 0,
        borderRight: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        display: 'flex', flexDirection: 'column'
      }}>
        <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>
            Projects
          </span>
          <button
            onClick={() => setShowNewProject(v => !v)}
            style={{
              fontSize: 18, lineHeight: 1, background: 'none', border: 'none',
              cursor: 'pointer', color: 'var(--accent)', padding: '0 4px'
            }}
            title="New project"
          >+</button>
        </div>

        {showNewProject && (
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
            <input
              autoFocus
              placeholder="Project name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              style={{ ...inputStyle, marginBottom: 8, fontSize: 12, padding: '7px 10px' }}
            />
            <input
              placeholder="Description (optional)"
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              style={{ ...inputStyle, marginBottom: 8, fontSize: 12, padding: '7px 10px' }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                style={{
                  flex: 1, padding: '6px', fontSize: 12, fontWeight: 600,
                  background: 'var(--accent)', color: '#000',
                  border: 'none', borderRadius: 'var(--radius)',
                  cursor: creating || !newName.trim() ? 'not-allowed' : 'pointer',
                  opacity: creating || !newName.trim() ? 0.5 : 1
                }}
              >
                {creating ? '...' : 'Create'}
              </button>
              <button
                onClick={() => setShowNewProject(false)}
                style={{
                  padding: '6px 10px', fontSize: 12,
                  background: 'transparent', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)', cursor: 'pointer', color: 'var(--text-dim)'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {projects.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
              No projects yet.<br />Create one to get started.
            </div>
          ) : projects.map(p => (
            <div
              key={p.id}
              onClick={() => setSelected(p)}
              style={{
                padding: '12px 16px', cursor: 'pointer',
                background: selected?.id === p.id ? 'var(--accent-dim)' : 'transparent',
                borderLeft: `2px solid ${selected?.id === p.id ? 'var(--accent)' : 'transparent'}`,
                transition: 'background 0.1s',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-heading)', marginBottom: 2 }}>
                {p.name}
              </div>
              {p.description && (
                <div style={{ fontSize: 11, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.description}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {!selected ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dim)', fontSize: 13 }}>
            Select or create a project to get started.
          </div>
        ) : showNewRun ? (
          <div>
            <div style={{ padding: '16px 32px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                onClick={() => setShowNewRun(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 13 }}
              >
                ← Back to {selected.name}
              </button>
            </div>
            <NewRun onRunCreated={handleRunCreated} projectId={selected.id} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

            {/* Project header + sub-tabs */}
            <div style={{ padding: '20px 32px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <h2 style={{ fontSize: 16, marginBottom: 2 }}>{selected.name}</h2>
                  {selected.description && (
                    <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: 0 }}>{selected.description}</p>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(selected.id)}
                  style={{
                    fontSize: 11, color: 'var(--red)', background: 'none',
                    border: '1px solid rgba(240,79,90,0.3)', borderRadius: 'var(--radius)',
                    padding: '4px 10px', cursor: 'pointer'
                  }}
                >
                  Delete
                </button>
              </div>
              <div style={{ display: 'flex', gap: 24 }}>
                {PROJECT_TABS.map(t => (
                  <button
                    key={t.key}
                    onClick={() => setProjectTab(t.key)}
                    style={{
                      background: 'none', border: 'none', padding: '4px 0', fontSize: 12,
                      fontWeight: projectTab === t.key ? 500 : 400,
                      color: projectTab === t.key ? 'var(--accent)' : 'var(--text-dim)',
                      borderBottom: `1px solid ${projectTab === t.key ? 'var(--accent)' : 'transparent'}`,
                      cursor: 'pointer', marginBottom: -1
                    }}
                  >{t.label}</button>
                ))}
              </div>
            </div>

            {/* Sub-tab content */}
            <div style={{ flex: 1, overflowY: 'auto' }}>

              {projectTab === 'runs' && (
                <div style={{ padding: '24px 32px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                      {runs.length} run{runs.length !== 1 ? 's' : ''} in this project
                    </span>
                    <button
                      onClick={() => setShowNewRun(true)}
                      style={{
                        fontSize: 12, fontWeight: 600,
                        background: 'var(--accent)', color: '#000',
                        border: 'none', borderRadius: 'var(--radius)',
                        padding: '6px 14px', cursor: 'pointer'
                      }}
                    >
                      + New Search
                    </button>
                  </div>

                  {runs.length === 0 ? (
                    <div style={{
                      background: 'var(--bg-surface)', border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)', padding: '32px', textAlign: 'center',
                      color: 'var(--text-dim)', fontSize: 13
                    }}>
                      No searches yet. Click "New Search" to launch one using this project's context.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {runs.map(run => (
                        <div
                          key={run.id}
                          onClick={() => onSelectRun(run.id)}
                          style={{
                            background: 'var(--bg-surface)', border: '1px solid var(--border)',
                            borderRadius: 'var(--radius)', padding: '12px 16px',
                            cursor: 'pointer', display: 'flex', alignItems: 'center',
                            justifyContent: 'space-between', transition: 'border-color 0.15s'
                          }}
                          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-border)'}
                          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                        >
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-heading)', marginBottom: 3 }}>
                              {run.topic}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
                              {new Date(run.created_at).toLocaleString('es-ES')}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{
                              width: 6, height: 6, borderRadius: '50%',
                              background: STATUS_COLOR[run.status] || '#9ca3af',
                              boxShadow: `0 0 5px ${STATUS_COLOR[run.status] || '#9ca3af'}`
                            }} />
                            <span style={{ fontSize: 11, color: STATUS_COLOR[run.status] || 'var(--text-dim)', fontWeight: 500 }}>
                              {STATUS_LABEL[run.status] || run.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {projectTab === 'dare' && (
                <div>
                  {runs.length > 1 && (
                    <div style={{ padding: '12px 32px 0', fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>
                      Aggregated across {runs.length} runs. Papers duplicated across runs may appear more than once.
                    </div>
                  )}
                  <DAREResults projectId={selected.id} />
                </div>
              )}

              {projectTab === 'prisma' && (
                <div>
                  {runs.length > 1 && (
                    <div style={{ padding: '12px 32px 0', fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>
                      Aggregated across {runs.length} runs. Cross-run deduplication is not performed — totals are approximate.
                    </div>
                  )}
                  <PRISMADiagram projectId={selected.id} />
                </div>
              )}

              {projectTab === 'context' && (
                <div style={{ padding: '24px 32px' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 16 }}>
                    PDFs uploaded here are injected as context into the screening agent prompts for all runs in this project, reducing "maybe" decisions.
                  </p>
                  <ContextDocs projectId={selected.id} />
                </div>
              )}

            </div>
          </div>
        )}
      </div>
    </div>
  )
}
