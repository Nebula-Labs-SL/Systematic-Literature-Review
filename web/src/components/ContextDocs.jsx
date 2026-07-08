import { useState, useEffect, useRef } from 'react'
import { getContextDocs, uploadContextDoc, deleteContextDoc } from '../lib/api.js'

export default function ContextDocs({ projectId }) {
  const [docs, setDocs]       = useState([])
  const [uploading, setUploading] = useState(false)
  const [error, setError]     = useState(null)
  const inputRef              = useRef(null)

  useEffect(() => {
    if (projectId) load()
  }, [projectId])

  async function load() {
    try {
      const data = await getContextDocs(projectId)
      setDocs(data)
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type !== 'application/pdf') {
      setError('Only PDF files are supported')
      return
    }
    setUploading(true)
    setError(null)
    try {
      await uploadContextDoc(projectId, file)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function handleDelete(docId) {
    try {
      await deleteContextDoc(projectId, docId)
      setDocs(prev => prev.filter(d => d.id !== docId))
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>Context Documents</span>
          <span style={{ fontSize: 12, color: 'var(--text-dim)', marginLeft: 8 }}>
            PDFs injected as context into screening prompts to reduce "maybe" decisions
          </span>
        </div>
        <button
          className="btn-primary"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          style={{ fontSize: 12, padding: '5px 12px' }}
        >
          {uploading ? 'Uploading...' : '+ Upload PDF'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          style={{ display: 'none' }}
          onChange={handleUpload}
        />
      </div>

      {error && (
        <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 10 }}>{error}</div>
      )}

      {docs.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-dim)', fontStyle: 'italic' }}>
          No documents uploaded. Upload PDFs (e.g. protocol, domain background) to give the screening agent better context.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {docs.map(doc => (
            <div
              key={doc.id}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'var(--bg)', borderRadius: 6, padding: '8px 12px',
                border: '1px solid var(--border)'
              }}
            >
              <div>
                <span style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'var(--mono)' }}>
                  {doc.filename}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 10 }}>
                  {Math.round(doc.file_size / 1024)} KB
                </span>
              </div>
              <button
                onClick={() => handleDelete(doc.id)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-dim)', fontSize: 18, lineHeight: 1, padding: '0 4px'
                }}
                title="Remove document"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
