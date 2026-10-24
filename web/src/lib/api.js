const API_URL = (import.meta.env.VITE_API_URL || '') + '/api'

export async function createRun(topic, description, config = {}, project_id = null) {
  const res = await fetch(`${API_URL}/runs/create`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, description, config, project_id })
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getRun(runId) {
  const res = await fetch(`${API_URL}/runs/${runId}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getRunStats(runId) {
  const res = await fetch(`${API_URL}/runs/${runId}/stats`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getAllRuns() {
  const res = await fetch(`${API_URL}/runs`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getRunPapers(runId) {
  const res = await fetch(`${API_URL}/runs/${runId}/papers?limit=9999`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function cancelRun(runId) {
  const res = await fetch(`${API_URL}/runs/${runId}/cancel`, { method: 'POST' })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function deleteRun(runId) {
  const res = await fetch(`${API_URL}/runs/${runId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function triggerStage2(runId, options = {}) {
  const res = await fetch(`${API_URL}/runs/${runId}/screening/stage2`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options)
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function triggerDare(runId, options = {}) {
  const res = await fetch(`${API_URL}/runs/${runId}/dare`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options)
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function triggerExtraction(runId, options = {}) {
  const res = await fetch(`${API_URL}/runs/${runId}/extract`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options)
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getDareScores(runId) {
  const res = await fetch(`${API_URL}/runs/${runId}/dare-scores`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function overrideDareScore(runId, scoreId, data) {
  const res = await fetch(`${API_URL}/runs/${runId}/dare-scores/${scoreId}/override`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getExtractions(runId) {
  const res = await fetch(`${API_URL}/runs/${runId}/extractions`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getPrismaSummary(runId) {
  const res = await fetch(`${API_URL}/runs/${runId}/prisma-summary`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getProjects() {
  const res = await fetch(`${API_URL}/projects`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function createProject(name, description = '') {
  const res = await fetch(`${API_URL}/projects`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description })
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function deleteProject(projectId) {
  const res = await fetch(`${API_URL}/projects/${projectId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getProjectRuns(projectId) {
  const res = await fetch(`${API_URL}/projects/${projectId}/runs`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getContextDocs(projectId) {
  const res = await fetch(`${API_URL}/projects/${projectId}/context-docs`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function uploadContextDoc(projectId, file) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${API_URL}/projects/${projectId}/context-docs`, {
    method: 'POST',
    body: form
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function deleteContextDoc(projectId, docId) {
  const res = await fetch(`${API_URL}/projects/${projectId}/context-docs/${docId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getProjectDareScores(projectId) {
  const res = await fetch(`${API_URL}/projects/${projectId}/dare-scores`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getProjectPrismaSummary(projectId) {
  const res = await fetch(`${API_URL}/projects/${projectId}/prisma-summary`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function generateLimitations(projectId) {
  const res = await fetch(`${API_URL}/projects/${projectId}/generate-limitations`, { method: 'POST' })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getPdfUrl(studyId) {
  const res = await fetch(`${API_URL}/studies/${studyId}/pdf-url`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function uploadStudyPdf(studyId, file) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${API_URL}/studies/${studyId}/upload-pdf`, { method: 'POST', body: form })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function triggerRetrieval(runId) {
  const res = await fetch(`${API_URL}/runs/${runId}/retrieval`, { method: 'POST' })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function decideStudy(studyId, decision) {
  const res = await fetch(`${API_URL}/studies/${studyId}/decide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision })
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function runStudyDare(studyId, runId) {
  const res = await fetch(`${API_URL}/studies/${studyId}/dare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ run_id: runId })
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export function createLogStream() {
  return new EventSource(`${API_URL}/logs/stream`)
}
