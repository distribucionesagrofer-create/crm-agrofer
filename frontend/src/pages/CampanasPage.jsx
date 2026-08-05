import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Megaphone, Send, Users, Eye, CheckCircle, Clock, AlertTriangle,
  History, X, Image, CalendarClock, BarChart2, MessageSquare,
  BookOpen, Trash2, ChevronRight,
} from 'lucide-react'
import api from '../services/api'
import { socket } from '../services/socket'

const ESTADO_CONFIG = {
  pendiente:  { label: 'Pendiente',   color: 'bg-gray-100 text-gray-600' },
  programada: { label: 'Programada',  color: 'bg-violet-100 text-violet-700' },
  enviando:   { label: 'Enviando…',   color: 'bg-blue-100 text-blue-700 animate-pulse' },
  completada: { label: 'Completada',  color: 'bg-green-100 text-green-700' },
  error:      { label: 'Error',       color: 'bg-red-100 text-red-600' },
}

function StatBadge({ label, value, color = 'text-gray-700' }) {
  return (
    <div className="flex flex-col items-center">
      <span className={`text-base font-bold ${color}`}>{value}</span>
      <span className="text-[10px] text-gray-400 mt-0.5">{label}</span>
    </div>
  )
}

function AnalyticsModal({ campana, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['campana-dests', campana._id],
    queryFn: () => api.get(`/campanas/${campana._id}/destinatarios?limit=100`),
    refetchInterval: campana.estado === 'enviando' ? 5000 : false,
  })

  const destinatarios = data?.destinatarios || []
  const stats = data?.stats || []
  const total = campana.destinatarios || 0

  const count = (key) => stats.find(s => s._id === key)?.count || 0
  const pct   = (n) => total > 0 ? `${Math.round((n / total) * 100)}%` : '0%'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-base">{campana.nombre}</h3>
            <p className="text-xs text-gray-400">{total} destinatarios</p>
          </div>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>

        {/* Analytics summary */}
        <div className="px-6 py-4 grid grid-cols-5 gap-2 border-b border-gray-50">
          <StatBadge label="Enviados"     value={campana.enviados}     color="text-blue-600" />
          <StatBadge label="Leyeron"      value={campana.leyeron}      color="text-indigo-600" />
          <StatBadge label="Respondieron" value={campana.respondieron} color="text-green-600" />
          <StatBadge label="Fallidos"     value={campana.fallidos}     color="text-red-500" />
          <StatBadge label="Pendientes"   value={count('pendiente')}   color="text-gray-500" />
        </div>

        {/* Progress bars */}
        {total > 0 && (
          <div className="px-6 py-3 space-y-2 border-b border-gray-50">
            {[
              { label: 'Recibieron', value: campana.enviados, color: 'bg-blue-400' },
              { label: 'Leyeron',    value: campana.leyeron,  color: 'bg-indigo-400' },
              { label: 'Respondieron', value: campana.respondieron, color: 'bg-green-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-24 shrink-0">{label}</span>
                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full ${color} rounded-full`} style={{ width: pct(value) }} />
                </div>
                <span className="text-xs font-medium text-gray-600 w-8 text-right">{pct(value)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Destinatarios list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && <p className="text-center text-gray-400 py-6 text-sm">Cargando…</p>}
          {!isLoading && destinatarios.map(d => (
            <div key={d._id} className="px-6 py-2.5 border-b border-gray-50 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{d.nombre || d.phone}</p>
                <p className="text-xs text-gray-400">{d.phone}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 text-xs">
                {d.estado === 'fallido' && (
                  <span className="text-red-500 flex items-center gap-1">
                    <AlertTriangle size={11} /> Fallido
                  </span>
                )}
                {d.estado === 'enviado' && !d.leyo && (
                  <span className="text-blue-500">Enviado</span>
                )}
                {d.leyo && !d.respondio && (
                  <span className="text-indigo-600 font-medium">Leyó</span>
                )}
                {d.respondio && (
                  <span className="text-green-600 font-medium flex items-center gap-1">
                    <MessageSquare size={11} /> Respondió
                  </span>
                )}
                {d.estado === 'pendiente' && (
                  <span className="text-gray-400">Pendiente</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function HistorialModal({ onClose }) {
  const [selected, setSelected] = useState(null)
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['campanas-historial'],
    queryFn: () => api.get('/campanas'),
    refetchInterval: 8_000,
  })
  const campanas = data?.campanas || []

  const eliminar = useMutation({
    mutationFn: (id) => api.delete(`/campanas/${id}`),
    onSuccess: () => qc.invalidateQueries(['campanas-historial']),
    onError: (e) => alert(e?.error || 'No se puede eliminar'),
  })

  return (
    <>
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h3 className="font-bold text-lg">Historial de campañas</h3>
            <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading && <p className="text-center text-gray-400 py-8 text-sm">Cargando…</p>}
            {!isLoading && !campanas.length && (
              <p className="text-center text-gray-400 py-8 text-sm">Sin campañas aún</p>
            )}
            {campanas.map(c => {
              const st  = ESTADO_CONFIG[c.estado] || ESTADO_CONFIG.pendiente
              const pct = c.destinatarios > 0 ? Math.round((c.enviados / c.destinatarios) * 100) : 0
              return (
                <div key={c._id} className="px-6 py-4 border-b border-gray-50 hover:bg-gray-50/50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="font-medium text-sm">{c.nombre}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>{st.label}</span>
                        {c.imageUrl && <span className="text-xs text-violet-500 flex items-center gap-0.5"><Image size={10} /> Con imagen</span>}
                        {c.scheduledAt && c.estado === 'programada' && (
                          <span className="text-xs text-violet-600 flex items-center gap-0.5">
                            <CalendarClock size={10} /> {new Date(c.scheduledAt).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">{c.vendedorId?.nombre} {c.zona ? `· Zona: ${c.zona}` : ''}</p>

                      {/* Analytics mini row */}
                      {c.estado === 'completada' && (
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="text-xs text-blue-600">{c.enviados} enviados</span>
                          <span className="text-xs text-indigo-600">{c.leyeron} leyeron</span>
                          <span className="text-xs text-green-600">{c.respondieron} respondieron</span>
                          {c.fallidos > 0 && <span className="text-xs text-red-500">{c.fallidos} fallidos</span>}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => setSelected(c)}
                        className="text-xs text-brand hover:underline flex items-center gap-0.5">
                        <BarChart2 size={12} /> Ver
                      </button>
                      {c.estado !== 'enviando' && (
                        <button onClick={() => {
                          if (confirm('¿Eliminar esta campaña?')) eliminar.mutate(c._id)
                        }} className="text-gray-300 hover:text-red-400">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>

                  {c.estado === 'enviando' && (
                    <div className="mt-2">
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-xs text-blue-600 mt-0.5">{pct}% completado · {c.enviados}/{c.destinatarios}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
      {selected && <AnalyticsModal campana={selected} onClose={() => setSelected(null)} />}
    </>
  )
}

export default function CampanasPage() {
  const [vendedorId, setVendedorId]   = useState('')
  const [zona, setZona]               = useState('')
  const [mensaje, setMensaje]         = useState('')
  const [imageUrl, setImageUrl]       = useState('')
  const [nombre, setNombre]           = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [batchSize, setBatchSize]     = useState(50)
  const [delayMsg, setDelayMsg]       = useState(60)
  const [delayBatch, setDelayBatch]   = useState(1800)
  const [preview, setPreview]         = useState(null)
  const [resultado, setResultado]     = useState(null)
  const [showHistorial, setShowHistorial] = useState(false)
  const [showAvanzado, setShowAvanzado]   = useState(false)
  const qc = useQueryClient()

  const { data: vData } = useQuery({
    queryKey: ['vendedores-lista'],
    queryFn: () => api.get('/vendedores'),
  })

  const vendedores   = vData?.vendedores || []
  const zonas        = [...new Set(vendedores.map(v => v.zona).filter(Boolean))].sort()
  const vSeleccionado = vendedores.find(v => v._id === vendedorId)
  const waConectado   = vSeleccionado?.whatsapp?.status === 'connected'

  // Escuchar progreso en tiempo real
  useEffect(() => {
    const onProgress = ({ estado }) => {
      if (estado === 'completada') qc.invalidateQueries(['campanas-historial'])
    }
    socket.on('campana:progress', onProgress)
    return () => socket.off('campana:progress', onProgress)
  }, [qc])

  const verPreview = useMutation({
    mutationFn: () => api.get(`/campanas/preview?vendedorId=${vendedorId}&zona=${zona}`),
    onSuccess: (d) => setPreview(d),
  })

  const enviar = useMutation({
    mutationFn: () => api.post('/campanas/enviar', {
      vendedorId,
      zona:               zona || undefined,
      mensaje:            mensaje || undefined,
      imageUrl:           imageUrl || undefined,
      nombre:             nombre || undefined,
      scheduledAt:        scheduledAt || undefined,
      batchSize:          parseInt(batchSize),
      delayBetweenMessages: parseInt(delayMsg),
      delayBetweenBatches:  parseInt(delayBatch),
    }),
    onSuccess: (res) => {
      setResultado(res)
      setMensaje('')
      setNombre('')
      setImageUrl('')
      setScheduledAt('')
      setPreview(null)
      qc.invalidateQueries(['campanas-historial'])
    },
    onError: (e) => alert(e?.error || 'Error al enviar campaña'),
  })

  const canSend = vendedorId && (mensaje.trim() || imageUrl.trim()) && waConectado && !enviar.isPending

  // Tiempo estimado de envío
  const estimarTiempo = () => {
    if (!preview) return null
    const total = preview.total
    if (total <= 0) return null
    const totalSegundos = Math.ceil(total / batchSize - 1) * delayBatch + (total - 1) * delayMsg
    if (totalSegundos < 3600) return `~${Math.ceil(totalSegundos / 60)} minutos`
    return `~${(totalSegundos / 3600).toFixed(1)} horas`
  }

  if (resultado) return (
    <div className="p-6 flex flex-col items-center justify-center gap-5 text-center" style={{ minHeight: '60vh' }}>
      <CheckCircle size={56} className={resultado.programada ? 'text-violet-500' : 'text-green-500'} />
      <div>
        <h2 className="text-xl font-bold">
          {resultado.programada ? 'Campaña programada' : 'Campaña iniciada'}
        </h2>
        <p className="text-gray-500 text-sm mt-1 max-w-sm">
          {resultado.programada
            ? `Se enviará a ${resultado.total} contactos el ${new Date(resultado.scheduledAt).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })}.`
            : `Enviando a ${resultado.total} contactos en segundo plano con delay anti-ban.`
          }
        </p>
      </div>
      <div className="flex gap-3">
        <button onClick={() => setShowHistorial(true)} className="btn-secondary flex items-center gap-2">
          <History size={14} /> Ver historial
        </button>
        <button onClick={() => setResultado(null)} className="btn-primary">Nueva campaña</button>
      </div>
      {showHistorial && <HistorialModal onClose={() => setShowHistorial(false)} />}
    </div>
  )

  return (
    <div className="p-6 max-w-2xl space-y-5">
      {showHistorial && <HistorialModal onClose={() => setShowHistorial(false)} />}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-brand/10 rounded-xl"><Megaphone size={20} className="text-brand" /></div>
          <div>
            <h2 className="text-xl font-bold">Campañas masivas</h2>
            <p className="text-sm text-gray-400">Mensajes con imagen, programación y analíticas</p>
          </div>
        </div>
        <button onClick={() => setShowHistorial(true)}
          className="btn-secondary flex items-center gap-2 text-sm">
          <History size={14} /> Historial
        </button>
      </div>

      <div className="card space-y-4">
        {/* Nombre */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de la campaña</label>
          <input className="input text-sm" placeholder="Ej: Promo mayo, Nueva línea Agrofer…"
            value={nombre} onChange={e => setNombre(e.target.value)} />
        </div>

        {/* Línea */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Enviar desde</label>
          <select className="input" value={vendedorId}
            onChange={e => { setVendedorId(e.target.value); setPreview(null) }}>
            <option value="">Selecciona una línea WhatsApp…</option>
            {vendedores.map(v => (
              <option key={v._id} value={v._id} disabled={v.whatsapp?.status !== 'connected'}>
                {v.nombre} {v.zona ? `· ${v.zona}` : ''} {v.whatsapp?.status !== 'connected' ? '(desconectado)' : '🟢'}
              </option>
            ))}
          </select>
          {vendedorId && !waConectado && (
            <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
              <AlertTriangle size={11} /> Esta línea no está conectada
            </p>
          )}
        </div>

        {/* Destinatarios */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Destinatarios</label>
          <select className="input" value={zona}
            onChange={e => { setZona(e.target.value); setPreview(null) }}>
            <option value="">Todos los clientes de esta línea</option>
            {zonas.map(z => <option key={z} value={z}>Solo zona: {z}</option>)}
          </select>
        </div>

        {/* Imagen */}
        <div>
          <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1">
            <Image size={14} className="text-gray-400" /> Imagen (opcional)
          </label>
          <input className="input text-sm font-mono" placeholder="https://… (URL pública de la imagen)"
            value={imageUrl} onChange={e => setImageUrl(e.target.value)} />
          {imageUrl && (
            <div className="mt-2 rounded-lg overflow-hidden border border-gray-100 max-w-[200px]">
              <img src={imageUrl} alt="preview" className="w-full object-cover"
                onError={e => { e.target.style.display = 'none' }} />
            </div>
          )}
        </div>

        {/* Mensaje */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {imageUrl ? 'Texto del mensaje (caption)' : 'Mensaje'}
            {!imageUrl && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          <textarea rows={4} className="input resize-none"
            placeholder="Escribe el mensaje aquí. Puedes usar emojis 👋"
            value={mensaje} onChange={e => setMensaje(e.target.value)} maxLength={1000} />
          <p className="text-xs text-gray-400 text-right mt-0.5">{mensaje.length}/1000</p>
        </div>

        {/* Programación */}
        <div>
          <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1">
            <CalendarClock size={14} className="text-gray-400" /> Programar envío (opcional)
          </label>
          <input type="datetime-local" className="input text-sm"
            min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
            value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
          {!scheduledAt && (
            <p className="text-xs text-gray-400 mt-1">Vacío = enviar inmediatamente</p>
          )}
          {scheduledAt && (
            <p className="text-xs text-violet-600 mt-1 flex items-center gap-1">
              <CalendarClock size={11} /> Se enviará el {new Date(scheduledAt).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
          )}
        </div>

        {/* Configuración avanzada */}
        <div>
          <button onClick={() => setShowAvanzado(v => !v)}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
            <ChevronRight size={14} className={`transition-transform ${showAvanzado ? 'rotate-90' : ''}`} />
            Configuración de envío (rate limiting)
          </button>
          {showAvanzado && (
            <div className="mt-3 grid grid-cols-3 gap-3 bg-gray-50 rounded-xl p-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Mensajes por lote</label>
                <input type="number" className="input text-sm" min={1} max={200}
                  value={batchSize} onChange={e => setBatchSize(parseInt(e.target.value) || 50)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Espera entre mensajes (s)</label>
                <input type="number" className="input text-sm" min={5} max={300}
                  value={delayMsg} onChange={e => setDelayMsg(parseInt(e.target.value) || 60)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Espera entre lotes (s)</label>
                <input type="number" className="input text-sm" min={60} max={7200}
                  value={delayBatch} onChange={e => setDelayBatch(parseInt(e.target.value) || 1800)} />
              </div>
              <div className="col-span-3 text-xs text-amber-600 flex items-start gap-1.5">
                <Clock size={12} className="mt-0.5 shrink-0" />
                <span>
                  Configuración anti-ban: {batchSize} mensajes por lote · {delayMsg}s entre mensajes · {Math.round(delayBatch/60)}min entre lotes.
                  {estimarTiempo() && ` Tiempo estimado para ${preview?.total || '…'} contactos: ${estimarTiempo()}.`}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Preview */}
        {preview && (
          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Users size={14} className="text-brand" />
              <span className="text-sm font-bold text-brand">{preview.total}</span>
              <span className="text-sm text-gray-500">destinatarios</span>
              {estimarTiempo() && (
                <span className="text-xs text-amber-600 ml-auto flex items-center gap-1">
                  <Clock size={10} /> {estimarTiempo()}
                </span>
              )}
            </div>
            <div className="space-y-1">
              {preview.muestra.map(c => (
                <div key={c._id} className="flex items-center gap-2 text-xs text-gray-600">
                  <span className="w-5 h-5 rounded-full bg-brand/10 text-brand font-bold flex items-center justify-center text-[10px]">
                    {c.name?.[0]}
                  </span>
                  {c.name} · {c.phone} {c.zona ? `· ${c.zona}` : ''}
                </div>
              ))}
              {preview.total > 5 && <p className="text-xs text-gray-400">…y {preview.total - 5} más</p>}
            </div>
          </div>
        )}

        {/* Acciones */}
        <div className="flex gap-3 pt-1">
          {vendedorId && (
            <button onClick={() => verPreview.mutate()} disabled={verPreview.isPending}
              className="btn-secondary flex items-center gap-2 disabled:opacity-40">
              <Eye size={14} /> {verPreview.isPending ? 'Cargando…' : 'Ver destinatarios'}
            </button>
          )}
          <button onClick={() => enviar.mutate()} disabled={!canSend}
            className="btn-primary flex items-center gap-2 flex-1 justify-center disabled:opacity-40">
            {scheduledAt ? <CalendarClock size={14} /> : <Send size={14} />}
            {enviar.isPending
              ? 'Procesando…'
              : scheduledAt
                ? `Programar${preview ? ` · ${preview.total} contactos` : ''}`
                : `Enviar${preview ? ` a ${preview.total}` : ''}`
            }
          </button>
        </div>

        {!waConectado && vendedorId && (
          <p className="text-xs text-center text-red-500">
            Conecta el WhatsApp de esta línea en la sección Vendedores
          </p>
        )}
      </div>
    </div>
  )
}
