import { claudeClient }  from './claude.js'
import { openaiClient }  from './openai.js'
import { geminiClient }  from './gemini.js'

export function getLLMClient(provider = 'claude') {
  switch (provider) {
    case 'claude':  return claudeClient
    case 'openai':  return openaiClient
    case 'gemini':  return geminiClient
    default:        return claudeClient
  }
}