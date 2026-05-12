const API_URL = (import.meta.env.VITE_API_URL || '') + '/api'

export async function createRun(topic, description, config = {}) {
  const res = await fetch(`${API_URL}/runs/create`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ topic, description, config })
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

export async function cancelRun(runId) {
  const res = await fetch(`${API_URL}/runs/${runId}/cancel`, { method: 'POST' })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}