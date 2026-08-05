// In-memory audit log buffer — last 500 entries
const MAX_ENTRIES = 500
const logs = []
let _io = null

function setIO(io) { _io = io }

const LEVELS = { info: 'info', warn: 'warn', error: 'error', success: 'success', msg: 'msg' }

function addLog(level, tenantId, tenantName, message, meta = {}) {
  const entry = {
    id:         Date.now() + Math.random(),
    ts:         new Date().toISOString(),
    level,
    tenantId:   tenantId || null,
    tenantName: tenantName || null,
    message,
    meta,
  }
  logs.push(entry)
  if (logs.length > MAX_ENTRIES) logs.splice(0, logs.length - MAX_ENTRIES)
  if (_io) _io.to('audit:room').emit('audit:log', entry)
  return entry
}

const audit = {
  info:    (tenantId, name, msg, meta) => addLog(LEVELS.info,    tenantId, name, msg, meta),
  warn:    (tenantId, name, msg, meta) => addLog(LEVELS.warn,    tenantId, name, msg, meta),
  error:   (tenantId, name, msg, meta) => addLog(LEVELS.error,   tenantId, name, msg, meta),
  success: (tenantId, name, msg, meta) => addLog(LEVELS.success, tenantId, name, msg, meta),
  msg:     (tenantId, name, msg, meta) => addLog(LEVELS.msg,     tenantId, name, msg, meta),
  // Para eventos sin tenant específico (sistema)
  system:  (msg, meta) => addLog(LEVELS.info, null, 'Sistema', msg, meta),
  getLogs: (limit = 200) => logs.slice(-limit),
  setIO,
}

module.exports = audit
