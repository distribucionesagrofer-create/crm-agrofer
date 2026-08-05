import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, Wifi, WifiOff, Smartphone, Eye, Trash2, X, RefreshCw, Pencil, PauseCircle, PlayCircle, Eraser, MoreVertical, Inbox, QrCode, KeyRound } from 'lucide-react'
import api from '../services/api'
import { socket } from '../services/socket'

const WA = {
  connected:    { dot: 'bg-green-500',  label: 'Conectado',    text: 'text-green-600' },
  qr_ready:     { dot: 'bg-yellow-400', label: 'Escanea QR',   text: 'text-yellow-600' },
  connecting:   { dot: 'bg-blue-400 animate-pulse', label: 'Conectando…', text: 'text-blue-500' },
  disconnected: { dot: 'bg-gray-300',   label: 'Desconectado', text: 'text-gray-400' },
}

const QR_SECONDS = 180 // 3 minutos — igual al backend

function QRModal({ vendedor, onClose }) {
  const [qr, setQr]           = useState(null)
  const [status, setStatus]   = useState(vendedor.whatsapp?.status || 'disconnected')
  const [countdown, setCountdown] = useState(QR_SECONDS)
  const [expired, setExpired] = useState(false)
  const timerRef              = useRef(null)
  const qc                    = useQueryClient()

  // ── Vinculación alterna por código de 8 dígitos (sin cámara/QR) ──
  const [modo, setModo]               = useState('qr') // 'qr' | 'pairing'
  const [telefono, setTelefono]       = useState('')
  const [pairingCode, setPairingCode] = useState(null)
  const [pairingError, setPairingError] = useState('')
  const [pairingLoading, setPairingLoading] = useState(false)

  const pedirCodigo = async () => {
    const limpio = telefono.replace(/\D/g, '')
    if (limpio.length < 10) { setPairingError('Ingresa el número completo con indicativo de país (ej: 57...)'); return }
    setPairingError('')
    setPairingCode(null)
    setPairingLoading(true)
    try {
      await api.post('/whatsapp/pairing-code', { vendedorId: vendedor._id, phoneNumber: limpio })
    } catch (e) {
      setPairingError(e?.error || 'Error solicitando el código')
      setPairingLoading(false)
    }
  }

  const clearTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null } }

  const startCountdown = useCallback(() => {
    clearTimer()
    setCountdown(QR_SECONDS)
    setExpired(false)
    timerRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearTimer()
          setExpired(true)
          setQr(null)
          return 0
        }
        return c - 1
      })
    }, 1000)
  }, [])

  const regenerarQR = () => {
    clearTimer()
    setQr(null)
    setExpired(false)
    setStatus('connecting')
    api.post('/whatsapp/connect', { vendedorId: vendedor._id }).catch(() => {})
  }

  useEffect(() => {
    const onQr = (data) => { setQr(data); setStatus('qr_ready'); startCountdown() }
    const onConnected = () => {
      clearTimer()
      setStatus('connected')
      setQr(null)
      qc.invalidateQueries(['vendedores'])
      setTimeout(onClose, 2200)
    }
    const onLoading = () => { clearTimer(); setStatus('connecting'); setQr(null) }
    const onDisc    = () => { clearTimer(); setStatus('disconnected'); setQr(null) }
    const onPairingCode  = (code) => { setPairingCode(code); setPairingLoading(false) }
    const onPairingError = (msg)  => { setPairingError(msg); setPairingLoading(false) }

    socket.on('whatsapp:qr',          onQr)
    socket.on('whatsapp:connected',   onConnected)
    socket.on('whatsapp:loading',     onLoading)
    socket.on('whatsapp:disconnected',onDisc)
    socket.on('whatsapp:pairing_code',  onPairingCode)
    socket.on('whatsapp:pairing_error', onPairingError)

    socket.emit('join:vendedor', vendedor._id, () => {
      api.post('/whatsapp/connect', { vendedorId: vendedor._id }).catch(() => {})
    })

    return () => {
      socket.off('whatsapp:qr',          onQr)
      socket.off('whatsapp:connected',   onConnected)
      socket.off('whatsapp:loading',     onLoading)
      socket.off('whatsapp:disconnected',onDisc)
      socket.off('whatsapp:pairing_code',  onPairingCode)
      socket.off('whatsapp:pairing_error', onPairingError)
      clearTimer()
    }
  }, [vendedor._id])

  const mins = Math.floor(countdown / 60)
  const secs = countdown % 60
  const pct  = (countdown / QR_SECONDS) * 100
  const urgent = countdown <= 30

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">

        {/* Header verde */}
        <div className="bg-gradient-to-br from-green-500 to-emerald-600 px-6 pt-5 pb-6 text-white">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-[11px] font-bold opacity-70 uppercase tracking-widest">Conectar WhatsApp</p>
              <h3 className="font-bold text-xl mt-0.5 leading-tight">{vendedor.nombre}</h3>
              {vendedor.zona && <p className="text-xs opacity-60 mt-0.5">{vendedor.zona}</p>}
            </div>
            <button onClick={onClose}
              className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition-colors mt-0.5">
              <X size={15} />
            </button>
          </div>

          {/* Pill de estado */}
          <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
            status === 'connected'  ? 'bg-white text-green-700' :
            status === 'qr_ready'  ? 'bg-yellow-400/30 text-white' :
            status === 'connecting' ? 'bg-white/20 text-white' :
            'bg-white/10 text-white/70'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              status === 'connected'  ? 'bg-green-500' :
              status === 'qr_ready'  ? 'bg-yellow-300 animate-pulse' :
              status === 'connecting' ? 'bg-blue-200 animate-pulse' :
              'bg-white/30'
            }`} />
            {status === 'connected'  ? 'Conectado' :
             status === 'qr_ready'  ? 'Escanea el código QR' :
             status === 'connecting' ? 'Conectando…' :
             'Esperando…'}
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5">

          {/* ── CONECTADO ── */}
          {status === 'connected' && (
            <div className="flex flex-col items-center py-5 gap-3 text-center">
              <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center ring-4 ring-green-100">
                <span className="text-4xl">✅</span>
              </div>
              <div>
                <p className="font-bold text-gray-800 text-lg">¡WhatsApp conectado!</p>
                <p className="text-sm text-gray-400 mt-1">Esta ventana se cerrará automáticamente</p>
              </div>
            </div>
          )}

          {/* ── CONECTANDO ── */}
          {status === 'connecting' && (
            <div className="flex flex-col items-center py-6 gap-4 text-center">
              <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center ring-4 ring-blue-100">
                <RefreshCw size={34} className="text-blue-400 animate-spin" />
              </div>
              <div>
                <p className="font-semibold text-gray-700">Iniciando sesión…</p>
                <p className="text-sm text-gray-400 mt-1">Espera mientras carga WhatsApp Web</p>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1">
                <div className="bg-blue-400 h-1 rounded-full w-2/3 animate-pulse" />
              </div>
            </div>
          )}

          {/* ── QR LISTO ── */}
          {modo === 'qr' && status === 'qr_ready' && qr && !expired && (
            <div className="flex flex-col items-center gap-4">
              {/* QR con overlay urgente */}
              <div className="relative">
                <img src={qr} alt="QR WhatsApp"
                  className={`w-52 h-52 rounded-2xl border-4 transition-all ${urgent ? 'border-orange-300' : 'border-gray-100'} shadow-sm`} />
                {urgent && (
                  <div className="absolute inset-0 bg-white/85 rounded-2xl flex flex-col items-center justify-center gap-1">
                    <p className="text-5xl font-black text-orange-500 leading-none">{countdown}</p>
                    <p className="text-xs font-bold text-orange-400 uppercase tracking-wider">segundos</p>
                  </div>
                )}
              </div>

              {/* Barra countdown */}
              <div className="w-full">
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-gray-400">Tiempo para escanear</span>
                  <span className={`font-bold tabular-nums ${urgent ? 'text-orange-500' : 'text-gray-500'}`}>
                    {mins}:{String(secs).padStart(2, '0')}
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                  <div className={`h-1.5 rounded-full transition-all duration-1000 ${
                    pct > 50 ? 'bg-green-400' : pct > 20 ? 'bg-yellow-400' : 'bg-orange-500'
                  }`} style={{ width: `${pct}%` }} />
                </div>
              </div>

              {/* Instrucciones */}
              <div className="bg-gray-50 rounded-xl px-4 py-3 w-full space-y-1.5">
                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Cómo vincular</p>
                {[
                  ['1.', 'Abre WhatsApp en tu celular'],
                  ['2.', 'Toca (⋮) → Dispositivos vinculados'],
                  ['3.', 'Toca "Vincular un dispositivo"'],
                  ['4.', 'Apunta la cámara al código QR'],
                ].map(([n, t]) => (
                  <div key={n} className="flex items-start gap-2 text-xs text-gray-500">
                    <span className="font-bold text-brand shrink-0">{n}</span>
                    <span>{t}</span>
                  </div>
                ))}
              </div>

              <button onClick={() => { setModo('pairing'); setPairingCode(null); setPairingError('') }}
                className="text-xs text-gray-400 hover:text-brand underline underline-offset-2 transition-colors">
                ¿No puedes escanear? Vincula con un código de 8 dígitos
              </button>
            </div>
          )}

          {/* ── QR GENERANDO ── */}
          {modo === 'qr' && status === 'qr_ready' && !qr && !expired && (
            <div className="flex flex-col items-center py-8 gap-3">
              <QrCode size={40} className="text-yellow-400 animate-pulse" />
              <p className="text-sm text-gray-500">Generando código QR…</p>
            </div>
          )}

          {/* ── QR EXPIRADO ── */}
          {modo === 'qr' && expired && (
            <div className="flex flex-col items-center py-5 gap-4 text-center">
              <div className="w-20 h-20 bg-orange-50 rounded-full flex items-center justify-center ring-4 ring-orange-100">
                <span className="text-4xl">⏱️</span>
              </div>
              <div>
                <p className="font-bold text-gray-800">Código expirado</p>
                <p className="text-sm text-gray-400 mt-1">El QR tiene 3 minutos de validez</p>
              </div>
              <button onClick={regenerarQR}
                className="flex items-center gap-2 bg-brand text-white text-sm font-bold px-6 py-2.5 rounded-xl hover:bg-brand/90 active:scale-95 transition-all shadow-md shadow-brand/20">
                <RefreshCw size={15} /> Generar nuevo QR
              </button>
              <button onClick={() => { setModo('pairing'); setPairingCode(null); setPairingError('') }}
                className="text-xs text-gray-400 hover:text-brand underline underline-offset-2 transition-colors">
                ¿No puedes escanear? Vincula con un código de 8 dígitos
              </button>
            </div>
          )}

          {/* ── VINCULAR POR CÓDIGO DE 8 DÍGITOS ── */}
          {modo === 'pairing' && (
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 bg-brand/10 rounded-full flex items-center justify-center">
                <KeyRound size={28} className="text-brand" />
              </div>

              {!pairingCode ? (
                <>
                  <div className="w-full">
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Número de WhatsApp (con indicativo de país)</label>
                    <input value={telefono} onChange={e => setTelefono(e.target.value)}
                      placeholder="573001234567"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand font-mono" />
                  </div>
                  {pairingError && <p className="text-xs text-red-500 text-center">{pairingError}</p>}
                  <button onClick={pedirCodigo} disabled={pairingLoading}
                    className="flex items-center gap-2 bg-brand text-white text-sm font-bold px-6 py-2.5 rounded-xl hover:bg-brand/90 active:scale-95 transition-all shadow-md shadow-brand/20 disabled:opacity-50">
                    {pairingLoading ? <RefreshCw size={15} className="animate-spin" /> : <KeyRound size={15} />}
                    {pairingLoading ? 'Generando código…' : 'Obtener código'}
                  </button>
                </>
              ) : (
                <>
                  {status === 'disconnected' && (
                    <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-2.5 w-full">
                      <p className="text-xs text-red-600 font-medium text-center">
                        Este código ya no sirve — la sesión se cerró. Pide uno nuevo.
                      </p>
                    </div>
                  )}
                  <p className={`text-3xl font-black tracking-[0.3em] font-mono ${status === 'disconnected' ? 'text-gray-300 line-through' : 'text-gray-800'}`}>{pairingCode}</p>
                  <div className="bg-gray-50 rounded-xl px-4 py-3 w-full space-y-1.5">
                    <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Cómo vincular</p>
                    {[
                      ['1.', 'Abre WhatsApp en tu celular'],
                      ['2.', 'Toca (⋮) → Dispositivos vinculados'],
                      ['3.', 'Toca "Vincular con número de teléfono"'],
                      ['4.', 'Escribe este código de 8 dígitos'],
                    ].map(([n, t]) => (
                      <div key={n} className="flex items-start gap-2 text-xs text-gray-500">
                        <span className="font-bold text-brand shrink-0">{n}</span>
                        <span>{t}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <button onClick={() => { setModo('qr'); setPairingCode(null); setPairingError('') }}
                className="text-xs text-gray-400 hover:text-brand underline underline-offset-2 transition-colors">
                ← Volver al código QR
              </button>
            </div>
          )}

          {/* ── DESCONECTADO esperando ── */}
          {modo === 'qr' && status === 'disconnected' && !expired && (
            <div className="flex flex-col items-center py-8 gap-3 text-center">
              <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center">
                <WifiOff size={36} className="text-gray-300" />
              </div>
              <p className="text-sm text-gray-400">Iniciando conexión…</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function EditarVendedorModal({ vendedor, onClose }) {
  const [form, setForm] = useState({
    nombre:          vendedor.nombre,
    zona:            vendedor.zona || '',
    tipo:            vendedor.tipo || 'vendedor',
    soloMonitoreo:   vendedor.soloMonitoreo    || false,
    monitorearGrupos:vendedor.monitorearGrupos || false,
  })
  const [error, setError] = useState('')
  const qc = useQueryClient()

  const guardar = useMutation({
    mutationFn: () => api.patch(`/vendedores/${vendedor._id}`, {
      nombre:           form.nombre,
      zona:             form.zona,
      tipo:             form.tipo,
      soloMonitoreo:    form.soloMonitoreo,
      monitorearGrupos: form.monitorearGrupos,
    }),
    onSuccess: (res) => {
      const zonaChanged = res.vendedor?.zona !== vendedor.zona
      if (zonaChanged) {
        setError(`✅ Zona actualizada — los clientes de ${vendedor.nombre} también actualizaron su zona.`)
        setTimeout(() => { qc.invalidateQueries(['vendedores']); onClose() }, 2000)
      } else {
        qc.invalidateQueries(['vendedores']); onClose()
      }
    },
    onError: (e) => setError(e?.error || 'Error al guardar'),
  })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-80 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold">Editar línea</h3>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Nombre</label>
            <input className="input" placeholder="Nombre de la línea" value={form.nombre}
              onChange={e => setForm({ ...form, nombre: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Zona</label>
            <input className="input" placeholder="Ej: Norte, Sur, Centro…" value={form.zona}
              onChange={e => setForm({ ...form, zona: e.target.value })} />
          </div>
          {/* Tipo de línea */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tipo de línea</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { val: 'vendedor',      label: '🧑‍💼 Vendedor',      desc: 'Gestiona clientes y leads' },
                { val: 'comunicacion',  label: '📢 Comunicación',   desc: 'Marketing, sin crear clientes' },
              ].map(opt => (
                <label key={opt.val}
                  className={`flex flex-col gap-0.5 p-2.5 rounded-xl border cursor-pointer transition-colors ${form.tipo === opt.val ? 'border-brand bg-brand/5' : 'border-gray-200 hover:border-gray-300'}`}>
                  <input type="radio" name="tipo" value={opt.val} checked={form.tipo === opt.val}
                    onChange={() => setForm({ ...form, tipo: opt.val })} className="hidden" />
                  <span className="text-xs font-semibold text-gray-800">{opt.label}</span>
                  <span className="text-[10px] text-gray-400">{opt.desc}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Modo solo monitoreo */}
          <div className="space-y-2 pt-1 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Modo de línea</p>
            <label className="flex items-start gap-3 p-3 bg-amber-50 rounded-xl cursor-pointer">
              <input type="checkbox" checked={form.soloMonitoreo}
                onChange={e => setForm({ ...form, soloMonitoreo: e.target.checked })}
                className="accent-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-amber-800">👁 Solo monitoreo</p>
                <p className="text-[10px] text-amber-600 mt-0.5">Los mensajes llegan al inbox pero NO se crean leads, ni se activan flujos ni IA. Para supervisar sin interferir.</p>
              </div>
            </label>
            <label className="flex items-start gap-3 p-3 bg-blue-50 rounded-xl cursor-pointer">
              <input type="checkbox" checked={form.monitorearGrupos}
                onChange={e => setForm({ ...form, monitorearGrupos: e.target.checked })}
                className="accent-blue-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-blue-800">👥 Ver grupos de WhatsApp</p>
                <p className="text-[10px] text-blue-600 mt-0.5">Los mensajes de grupos aparecen en el inbox (solo lectura). No responde automáticamente.</p>
              </div>
            </label>
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button onClick={() => guardar.mutate()} disabled={!form.nombre || guardar.isPending}
              className="btn-primary flex-1 disabled:opacity-40">
              {guardar.isPending ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function NuevoVendedorModal({ onClose }) {
  const [form, setForm] = useState({ nombre: '', zona: '' })
  const [error, setError] = useState('')
  const qc = useQueryClient()

  const crear = useMutation({
    mutationFn: () => api.post('/vendedores', form),
    onSuccess: () => { qc.invalidateQueries(['vendedores']); onClose() },
    onError: (e) => setError(e?.error || 'Error al crear'),
  })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-80 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold">Nueva línea</h3>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          <input className="input" placeholder="Nombre de la línea" value={form.nombre}
            onChange={e => setForm({ ...form, nombre: e.target.value })} />
          <input className="input" placeholder="Zona (ej: Norte, Sur, Centro)" value={form.zona}
            onChange={e => setForm({ ...form, zona: e.target.value })} />
          {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button onClick={() => crear.mutate()} disabled={!form.nombre || crear.isPending}
              className="btn-primary flex-1 disabled:opacity-40">
              {crear.isPending ? 'Creando…' : 'Crear'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function VendedorMenu({ vendedor, onLimpiar, onEliminar }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(v => !v)}
        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        title="Más opciones">
        <MoreVertical size={15} />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-50 bg-white rounded-xl shadow-xl border border-gray-200 py-1 w-48 text-sm">
          <button
            onClick={() => { setOpen(false); onLimpiar() }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-orange-600 hover:bg-orange-50 transition-colors">
            <Inbox size={14} /> Limpiar inbox
          </button>
          <div className="border-t border-gray-100 my-1" />
          <button
            onClick={() => { setOpen(false); onEliminar() }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-red-600 hover:bg-red-50 transition-colors">
            <Trash2 size={14} /> Eliminar línea
          </button>
        </div>
      )}
    </div>
  )
}

export default function VendedoresPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [qrFor, setQrFor] = useState(null)
  const [editFor, setEditFor] = useState(null)
  const [showNuevo, setShowNuevo] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['vendedores'],
    queryFn: () => api.get('/vendedores/monitor'),
    refetchInterval: 20_000,
  })

  // Actualizar tarjetas en tiempo real sin esperar el poll
  useEffect(() => {
    const refresh = () => qc.invalidateQueries(['vendedores'])
    socket.on('whatsapp:connected',    refresh)
    socket.on('whatsapp:disconnected', refresh)
    socket.on('whatsapp:logout_alert', refresh)
    return () => {
      socket.off('whatsapp:connected',    refresh)
      socket.off('whatsapp:disconnected', refresh)
      socket.off('whatsapp:logout_alert', refresh)
    }
  }, [])

  const desconectar = useMutation({
    mutationFn: (id) => api.post('/whatsapp/disconnect', { vendedorId: id }),
    onSuccess: () => {
      qc.invalidateQueries(['vendedores'])
      qc.invalidateQueries(['vendedores-inbox'])
    },
    onError: (e) => alert(`Error al desconectar: ${e?.error || e?.message || 'Error desconocido'}`),
  })

  const togglePausa = useMutation({
    mutationFn: ({ id, pausado }) => api.patch(`/vendedores/${id}`, { pausado }),
    onSuccess: () => qc.invalidateQueries(['vendedores']),
  })

  const toggleInbox = useMutation({
    mutationFn: ({ id, inboxActivo }) => api.patch(`/vendedores/${id}`, { inboxActivo }),
    onSuccess: () => qc.invalidateQueries(['vendedores']),
  })

  const toggleRotarEstados = useMutation({
    mutationFn: ({ id, rotarSoloEstados }) => api.patch(`/vendedores/${id}`, { rotarSoloEstados }),
    onSuccess: () => qc.invalidateQueries(['vendedores']),
  })

  const eliminar = useMutation({
    mutationFn: (id) => api.delete(`/vendedores/${id}`),
    onSuccess: () => qc.invalidateQueries(['vendedores']),
  })

  const limpiarSesion = useMutation({
    mutationFn: (id) => api.post('/whatsapp/clear-session', { vendedorId: id }),
    onSuccess: () => {
      qc.invalidateQueries(['vendedores'])
      qc.invalidateQueries(['vendedores-inbox'])
    },
    onError: (e) => alert(`Error: ${e?.error || e?.message || 'Error desconocido'}`),
  })

  const limpiarInbox = useMutation({
    mutationFn: (id) => api.delete(`/vendedores/${id}/inbox`),
    onSuccess: (data, id) => {
      qc.invalidateQueries(['vendedores'])
      qc.invalidateQueries(['convs-inbox'])
      qc.invalidateQueries(['conversations'])
      alert(`✅ Inbox limpiado: ${data.conversaciones} conversaciones y ${data.mensajes} mensajes eliminados.`)
    },
    onError: (e) => alert(`Error: ${e?.error || e?.message || 'Error desconocido'}`),
  })

  const vendedores = data?.vendedores || []

  return (
    <div className="p-6 space-y-5">
      {qrFor    && <QRModal vendedor={qrFor} onClose={() => { setQrFor(null); qc.invalidateQueries(['vendedores']) }} />}
      {editFor  && <EditarVendedorModal vendedor={editFor} onClose={() => setEditFor(null)} />}
      {showNuevo && <NuevoVendedorModal onClose={() => setShowNuevo(false)} />}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Líneas</h2>
          <p className="text-sm text-gray-400">{vendedores.length} líneas WhatsApp</p>
        </div>
        <button onClick={() => setShowNuevo(true)} className="btn-primary flex items-center gap-2">
          <Plus size={15} /> Nueva línea
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="card h-44 animate-pulse bg-gray-50" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {vendedores.map(v => {
            // Una línea de rotación (`rotarSoloEstados`) se desconecta sola 20s después de
            // vincularse para ahorrar recursos — mostrar "Desconectado" ahí confunde, porque
            // parece que la sesión se perdió cuando en realidad quedó guardada y lista para
            // reconectar sola (sin QR) la próxima vez que haga falta.
            const esSesionGuardada = v.whatsapp?.status === 'disconnected' && v.rotarSoloEstados && v.whatsapp?.connectedAt
            const wa = esSesionGuardada
              ? { dot: 'bg-blue-400', label: 'Sesión guardada', text: 'text-blue-500' }
              : (WA[v.whatsapp?.status] || WA.disconnected)
            const connected = v.whatsapp?.status === 'connected'
            const metaActiva = v.metaApi?.enabled && v.metaApi?.accessToken
            return (
              <div key={v._id} className="card space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{v.nombre}</p>
                    <p className="text-xs text-gray-400">{v.zona || 'Sin zona asignada'}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {metaActiva ? (
                      <div className="flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full bg-blue-50 text-blue-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                        Conectado (Meta API)
                      </div>
                    ) : (
                      <div className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${connected ? 'bg-green-50 text-green-600' : esSesionGuardada ? 'bg-blue-50 text-blue-500' : 'bg-gray-50 text-gray-400'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${wa.dot}`} />
                        {wa.label}
                      </div>
                    )}
                    <VendedorMenu
                      vendedor={v}
                      onLimpiar={() => {
                        if (window.confirm(`¿Limpiar TODO el inbox de "${v.nombre}"?\n\nSe eliminarán todas las conversaciones y mensajes. Esta acción no se puede deshacer.`)) {
                          limpiarInbox.mutate(v._id?.toString() || v._id)
                        }
                      }}
                      onEliminar={() => {
                        if (window.confirm(`¿Eliminar la línea "${v.nombre}"?\n\nSe eliminará el vendedor permanentemente.`)) {
                          eliminar.mutate(v._id?.toString() || v._id)
                        }
                      }}
                    />
                  </div>
                </div>

                {v.whatsapp?.phone && (
                  <p className="text-xs text-gray-500">📱 +{v.whatsapp.phone}</p>
                )}

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-gray-50 rounded-lg py-2">
                    <p className="text-base font-bold">{v.stats?.inbound ?? 0}</p>
                    <p className="text-xs text-gray-400">Recibidos</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg py-2">
                    <p className="text-base font-bold">{v.stats?.openConvs ?? 0}</p>
                    <p className="text-xs text-gray-400">Abiertas</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg py-2">
                    <p className="text-base font-bold">{v.stats?.totalClientes ?? 0}</p>
                    <p className="text-xs text-gray-400">Clientes</p>
                  </div>
                </div>

                {/* Toggle Inbox Activo — ¿esta línea atiende mensajes de clientes? */}
                {!v.esPrincipal && (
                  <div className={`flex items-center justify-between px-3 py-2 rounded-xl border transition-colors ${
                    v.inboxActivo ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-100'
                  }`}>
                    <div>
                      <p className={`text-xs font-bold ${v.inboxActivo ? 'text-green-700' : 'text-gray-400'}`}>
                        {v.inboxActivo ? '💬 Atiende mensajes de clientes' : '🚫 Ignora mensajes de clientes'}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {v.inboxActivo ? 'Registra conversaciones y responde en el inbox' : 'No registra nada — esta línea es solo para publicar Estados'}
                      </p>
                    </div>
                    <button
                      onClick={() => toggleInbox.mutate({ id: v._id, inboxActivo: !v.inboxActivo })}
                      className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${v.inboxActivo ? 'bg-green-500' : 'bg-gray-200'}`}>
                      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${v.inboxActivo ? 'left-5' : 'left-0.5'}`} />
                    </button>
                  </div>
                )}

                {/* Toggle Rotar solo Estados — ¿cómo se conecta esta línea? (no aplica a
                    líneas Meta API: no usan Puppeteer, siempre están "conectadas") */}
                {!v.esPrincipal && !v.metaApi?.enabled && (
                  <div className={`flex items-center justify-between px-3 py-2 rounded-xl border transition-colors ${
                    v.rotarSoloEstados ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-100'
                  }`}>
                    <div>
                      <p className={`text-xs font-bold ${v.rotarSoloEstados ? 'text-blue-700' : 'text-gray-400'}`}>
                        {v.rotarSoloEstados ? '🔄 Conexión por turnos' : '🔌 Conexión permanente'}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {v.rotarSoloEstados ? 'Se conecta solo para publicar el Estado y se desconecta (ahorra recursos)' : 'Se mantiene conectada todo el tiempo'}
                      </p>
                    </div>
                    <button
                      onClick={() => toggleRotarEstados.mutate({ id: v._id, rotarSoloEstados: !v.rotarSoloEstados })}
                      className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${v.rotarSoloEstados ? 'bg-blue-500' : 'bg-gray-200'}`}>
                      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${v.rotarSoloEstados ? 'left-5' : 'left-0.5'}`} />
                    </button>
                  </div>
                )}

                {/* Badges de modo */}
                {(v.soloMonitoreo || v.monitorearGrupos || v.pausado || v.tts?.enabled) && (
                  <div className="flex gap-1.5 flex-wrap">
                    {v.pausado          && <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium animate-pulse">⏸ Pausado</span>}
                    {v.soloMonitoreo    && <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">👁 Solo monitoreo</span>}
                    {v.monitorearGrupos && <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">👥 Ve grupos</span>}
                    {v.tts?.enabled     && <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">🎤 Voz IA</span>}
                  </div>
                )}

                {/* Acciones */}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => navigate(`/vendedores/${v._id}`)}
                    className="btn-secondary flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5">
                    <Eye size={13} /> Ver inbox
                  </button>
                  <button onClick={() => setEditFor(v)}
                    className="btn-secondary flex items-center gap-1 text-xs py-1.5 px-2.5 text-gray-500 hover:text-brand"
                    title="Editar nombre y zona">
                    <Pencil size={13} />
                  </button>
                  {connected && (
                    <button
                      onClick={() => togglePausa.mutate({ id: v._id, pausado: !v.pausado })}
                      className={`flex items-center gap-1 text-xs py-1.5 px-2.5 rounded-lg border font-medium transition-colors ${
                        v.pausado
                          ? 'bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100'
                          : 'btn-secondary text-gray-500 hover:text-orange-600'
                      }`}
                      title={v.pausado ? 'Reanudar' : 'Pausar mensajes sin desconectar'}>
                      {v.pausado ? <PlayCircle size={13} /> : <PauseCircle size={13} />}
                    </button>
                  )}
                  {connected ? (
                    <button onClick={() => desconectar.mutate(v._id?.toString() || v._id)}
                      className="btn-secondary flex items-center gap-1.5 text-xs py-1.5 px-3 text-red-500 hover:bg-red-50">
                      <WifiOff size={13} /> Desconectar
                    </button>
                  ) : (
                    <>
                      <button onClick={() => setQrFor(v)}
                        className="btn-primary flex items-center gap-1.5 text-xs py-1.5 px-3">
                        <Smartphone size={13} /> Conectar
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(`¿Borrar sesión guardada de "${v.nombre}"?\n\nEsto elimina los datos de WhatsApp del disco. Para usar esta línea tendrás que escanear el QR de nuevo.`)) {
                            limpiarSesion.mutate(v._id?.toString() || v._id)
                          }
                        }}
                        disabled={limpiarSesion.isPending}
                        className="btn-secondary flex items-center gap-1 text-xs py-1.5 px-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50"
                        title="Limpiar sesión del disco — libera espacio de sesiones abandonadas">
                        <Eraser size={13} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
