import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Wifi, WifiOff, Clock, AlertCircle, CheckCircle2, Info, MessageSquare, RefreshCw, Trash2 } from 'lucide-react'
import api from '../services/api'
import { socket } from '../services/socket'

const LEVEL_STYLES = {
  success: { bg: 'bg-green-500/10',  text: 'text-green-400',  border: 'border-green-500/20', icon: CheckCircle2 },
  error:   { bg: 'bg-red-500/10',    text: 'text-red-400',    border: 'border-red-500/20',   icon: AlertCircle },
  warn:    { bg: 'bg-amber-500/10',  text: 'text-amber-400',  border: 'border-amber-500/20', icon: AlertCircle },
  info:    { bg: 'bg-blue-500/10',   text: 'text-blue-400',   border: 'border-blue-500/20',  icon: Info },
  msg:     { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20',icon: MessageSquare },
}

const STATUS_CONFIG = {
  connected:    { label: 'Conectado',    color: 'bg-green-500',  icon: Wifi },
  qr_ready:     { label: 'Esperando QR', color: 'bg-amber-400',  icon: Clock },
  connecting:   { label: 'Conectando',   color: 'bg-blue-400',   icon: RefreshCw },
  disconnected: { label: 'Desconectado', color: 'bg-gray-500',   icon: WifiOff },
}

function fmtTime(isoStr) {
  const d = new Date(isoStr)
  return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function LogEntry({ entry }) {
  const s = LEVEL_STYLES[entry.level] || LEVEL_STYLES.info
  const Icon = s.icon
  return (
    <div className={`flex gap-3 px-4 py-2 border-b ${s.border} ${s.bg} hover:opacity-90 transition-opacity`}>
      <Icon size={14} className={`${s.text} mt-0.5 shrink-0`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-mono ${s.text}`}>{fmtTime(entry.ts)}</span>
          {entry.tenantName && (
            <span className="text-xs bg-white/5 text-gray-400 px-1.5 py-0.5 rounded font-medium truncate max-w-[140px]">
              {entry.tenantName}
            </span>
          )}
        </div>
        <p className="text-sm text-gray-200 mt-0.5 break-words">{entry.message}</p>
        {entry.meta && Object.keys(entry.meta).length > 0 && (
          <p className="text-xs text-gray-500 mt-0.5 font-mono">
            {JSON.stringify(entry.meta)}
          </p>
        )}
      </div>
    </div>
  )
}

function LineCard({ line }) {
  const cfg = STATUS_CONFIG[line.status] || STATUS_CONFIG.disconnected
  const Icon = cfg.icon
  const isQr = line.status === 'qr_ready'
  const isConn = line.status === 'connected'
  const isMeta = line.canal === 'meta'
  return (
    <div className={`rounded-xl border p-4 ${isMeta ? 'border-blue-500/30 bg-blue-500/5' : isConn ? 'border-green-500/30 bg-green-500/5' : isQr ? 'border-amber-400/30 bg-amber-400/5 animate-pulse' : 'border-gray-700 bg-gray-800/40'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${isMeta ? 'bg-blue-500' : cfg.color}`} />
          <div className="min-w-0">
            <p className={`text-sm font-semibold truncate ${line.esPrincipal ? 'text-brand' : 'text-gray-200'}`}>
              {line.nombre}
              {line.pausado && <span className="ml-2 text-xs text-orange-400 font-normal">(pausado)</span>}
            </p>
            {line.zona && <p className="text-xs text-gray-500">{line.zona}</p>}
          </div>
        </div>
        <div className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full shrink-0 ${
          isMeta  ? 'bg-blue-500/20 text-blue-400' :
          isConn  ? 'bg-green-500/20 text-green-400' :
          isQr    ? 'bg-amber-500/20 text-amber-400' :
          line.status === 'connecting' ? 'bg-blue-500/20 text-blue-400' :
          'bg-gray-700 text-gray-400'
        }`}>
          <Icon size={11} className={line.status === 'connecting' ? 'animate-spin' : ''} />
          {isMeta ? 'Conectado (Meta API)' : cfg.label}
        </div>
      </div>
      {line.phone && (
        <p className="text-xs text-gray-500 mt-2 font-mono">+{line.phone}</p>
      )}
      {isQr && (
        <p className="text-xs text-amber-400 mt-2">⏱ QR activo — expira en 3 min si no se escanea</p>
      )}
    </div>
  )
}

export default function AuditoriaPage() {
  const [logs, setLogs]       = useState([])
  const [autoScroll, setAutoScroll] = useState(true)
  const [filter, setFilter]   = useState('all')
  const logRef = useRef(null)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['audit-status'],
    queryFn:  () => api.get('/audit?limit=200'),
    refetchInterval: 15_000,
  })

  // Cargar logs iniciales
  useEffect(() => {
    if (data?.logs) setLogs(data.logs)
  }, [data])

  // Socket — logs en tiempo real
  useEffect(() => {
    socket.emit('join:audit')
    const handler = (entry) => {
      setLogs(prev => {
        const next = [...prev, entry]
        return next.length > 500 ? next.slice(-500) : next
      })
    }
    socket.on('audit:log', handler)
    return () => socket.off('audit:log', handler)
  }, [])

  // Auto-scroll al último log
  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  const lines  = [...(data?.lines || [])].sort((a, b) => {
    if (a.esPrincipal) return -1
    if (b.esPrincipal) return  1
    const order = { connected: 0, qr_ready: 1, connecting: 2, disconnected: 3 }
    return (order[a.status] ?? 3) - (order[b.status] ?? 3)
  })
  const connected = lines.filter(l => l.status === 'connected').length
  const qrWaiting = lines.filter(l => l.status === 'qr_ready').length

  const filteredLogs = filter === 'all' ? logs : logs.filter(l => l.level === filter)

  const FILTERS = [
    { key: 'all',     label: 'Todo' },
    { key: 'msg',     label: 'Mensajes' },
    { key: 'success', label: 'Conexiones' },
    { key: 'warn',    label: 'Alertas' },
    { key: 'error',   label: 'Errores' },
  ]

  return (
    <div className="flex flex-col h-full bg-[#111b21] text-gray-100">

      {/* Header */}
      <div className="bg-[#202c33] px-6 py-4 border-b border-gray-800 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white">Panel de Auditoría</h1>
            <p className="text-xs text-gray-400 mt-0.5">Monitoreo en tiempo real del sistema</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-3 text-sm">
              <span className="text-green-400 font-medium">{connected} conectadas</span>
              {qrWaiting > 0 && <span className="text-amber-400 font-medium animate-pulse">{qrWaiting} esperando QR</span>}
              <span className="text-gray-500">{lines.length} total</span>
            </div>
            <button onClick={() => refetch()} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
              <RefreshCw size={14} className="text-gray-400" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">

        {/* Sidebar — estado de líneas */}
        <div className="w-72 shrink-0 border-r border-gray-800 flex flex-col bg-[#161d22]">
          <div className="px-4 py-3 border-b border-gray-800">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Estado de líneas</p>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {isLoading && (
              <p className="text-center text-gray-500 text-sm py-8">Cargando...</p>
            )}
            {lines.map(line => (
              <LineCard key={line.tenantId} line={line} />
            ))}
          </div>
        </div>

        {/* Log panel */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* Log toolbar */}
          <div className="bg-[#202c33] px-4 py-2 border-b border-gray-800 flex items-center justify-between gap-3 shrink-0">
            <div className="flex gap-1">
              {FILTERS.map(f => (
                <button key={f.key} onClick={() => setFilter(f.key)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    filter === f.key ? 'bg-brand/20 text-brand' : 'text-gray-400 hover:bg-white/5'
                  }`}>
                  {f.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{filteredLogs.length} entradas</span>
              <button onClick={() => setAutoScroll(v => !v)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${autoScroll ? 'bg-brand/20 text-brand' : 'text-gray-500 hover:bg-white/5'}`}>
                {autoScroll ? '⬇ Auto' : 'Manual'}
              </button>
              <button onClick={() => setLogs([])}
                className="p-1.5 rounded text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="Limpiar logs">
                <Trash2 size={13} />
              </button>
            </div>
          </div>

          {/* Log entries */}
          <div
            ref={logRef}
            onScroll={(e) => {
              const el = e.currentTarget
              const isAtBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 50
              setAutoScroll(isAtBottom)
            }}
            className="flex-1 overflow-y-auto bg-[#111b21]"
          >
            {filteredLogs.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-500">
                <Info size={32} className="opacity-30" />
                <p className="text-sm">Sin entradas de log aún</p>
                <p className="text-xs">Los eventos del sistema aparecerán aquí en tiempo real</p>
              </div>
            )}
            {filteredLogs.map(entry => (
              <LogEntry key={entry.id} entry={entry} />
            ))}
          </div>

          {/* Footer status */}
          <div className="bg-[#202c33] px-4 py-2 border-t border-gray-800 flex items-center gap-2 shrink-0">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <p className="text-xs text-gray-500">En vivo · actualizando cada 15s · {filteredLogs.length} entradas visibles</p>
          </div>
        </div>
      </div>
    </div>
  )
}
