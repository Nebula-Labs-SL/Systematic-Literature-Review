import { supabase } from '../db/client.js'

export async function loadContextDocs(runId) {
  const { data: run } = await supabase
    .from('runs')
    .select('project_id')
    .eq('id', runId)
    .single()

  if (!run?.project_id) return ''

  const { data } = await supabase
    .from('context_docs')
    .select('filename, content')
    .eq('project_id', run.project_id)
    .order('created_at', { ascending: true })

  if (!data?.length) return ''

  const block = data
    .map(d => `--- Document: ${d.filename} ---\n${d.content.slice(0, 8000)}`)
    .join('\n\n')

  return `CONTEXT DOCUMENTS PROVIDED BY THE RESEARCHER:\nThe following documents provide background context about the research topic. Use them to better interpret paper relevance.\n\n${block}\n\n`
}
