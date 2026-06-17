import { EventEmitter } from 'events'

const emitter    = new EventEmitter()
emitter.setMaxListeners(100)

const recentLogs = []
const MAX_HISTORY = 300

const _log   = console.log.bind(console)
const _error = console.error.bind(console)
const _warn  = console.warn.bind(console)

function broadcast(level, args) {
  const message = args.map(a => {
    if (a instanceof Error) return a.stack || a.message
    if (typeof a === 'object' && a !== null) return JSON.stringify(a)
    return String(a)
  }).join(' ')

  const line = { ts: new Date().toISOString(), level, message }
  recentLogs.push(line)
  if (recentLogs.length > MAX_HISTORY) recentLogs.shift()
  emitter.emit('log', line)
}

console.log   = (...args) => { _log(...args);   broadcast('info',  args) }
console.error = (...args) => { _error(...args); broadcast('error', args) }
console.warn  = (...args) => { _warn(...args);  broadcast('warn',  args) }

export function getRecentLogs() { return [...recentLogs] }
export function onLog(cb)       { emitter.on('log', cb) }
export function offLog(cb)      { emitter.off('log', cb) }
