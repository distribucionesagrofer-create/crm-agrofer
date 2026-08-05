import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Image, Video, Upload, Trash2, Send, Calendar, BarChart2,
  ChevronLeft, ChevronRight, X, Plus, CheckCircle2, XCircle,
  Clock, Megaphone, Loader2, Play, AlertTriangle, Pencil,
  FolderOpen, Wifi, WifiOff, Radio, RefreshCw, Layers, Eye,
  Zap, Signal, CalendarDays, ChevronDown, ChevronUp,
} from 'lucide-react'
import api from '../services/api'

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtHora      = d => d ? new Date(d).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : ''
const fmtFechaCorta = d => d ? new Date(d).toLocaleDateString('es', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : ''
const mesLabel     = (a, m) => new Date(a, m - 1, 1).toLocaleDateString('es', { month: 'long', year: 'numeric' })
const diasEnMes    = (a, m) => new Date(a, m, 0).getDate()
const primerDia    = (a, m) => new Date(a, m - 1, 1).getDay()

function tiempoRelativo(date) {
  if (!date) return ''
  const diff = Date.now() - new Date(date)
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  if (h >= 24) return `hace ${Math.floor(h / 24)}d`
  if (h > 0)   return `hace ${h}h ${m}m`
  return `hace ${m}m`
}
function tiempoRestante(date) {
  if (!date) return ''
  const diff = new Date(date) - Date.now()
  if (diff <= 0) return 'Expirado'
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  return `${h}h ${m}m`
}
function vidaPct(expiraEn) {
  if (!expiraEn) return 0
  const diff = new Date(expiraEn) - Date.now()
  return Math.max(0, Math.min(100, (diff / (24 * 3_600_000)) * 100))
}

function agruparContenidos(contenidos) {
  const bloques = {}
  for (const c of contenidos) {
    const loteTag = c.tags?.[0] || ''
    const key   = loteTag ? `tag::${loteTag}` : `marca::${c.marca || 'Sin marca'}`
    const label = loteTag || c.marca || 'Sin marca'
    const tipo  = loteTag ? 'tag' : 'marca'
    if (!bloques[key]) bloques[key] = { key, label, tipo, valor: loteTag || c.marca || 'Sin marca', marca: c.marca || '', items: [] }
    bloques[key].items.push(c)
  }
  return Object.values(bloques).sort((a, b) => b.items.length - a.items.length)
}

function Collage({ items }) {
  const fotos = items.slice(0, 4)
  const Thumb = ({ c, cls = '' }) => c.tipo === 'video'
    ? <div className={`bg-gray-800 flex items-center justify-center ${cls}`}><Play size={16} className="text-white/60" /></div>
    : <img src={c.mediaUrl} alt="" className={`object-cover ${cls}`} onError={e => e.target.style.opacity = 0} />
  if (fotos.length === 1) return <Thumb c={fotos[0]} cls="w-full h-full" />
  return <div className="w-full h-full grid grid-cols-2 gap-0.5">{fotos.map((c, i) => <Thumb key={i} c={c} cls="w-full h-full" />)}</div>
}

// ── Modal picker de LOTES ──────────────────────────────────────────────────────
function ModalPickerLotes({ contenidos, titulo = 'Seleccionar lotes', onClose, onPublicar, btnLabel = 'Publicar' }) {
  const bloques = agruparContenidos(contenidos)
  const [seleccionados, setSeleccionados] = useState([])
  const [expandido,     setExpandido]     = useState(null)
  const [caption,       setCaption]       = useState('')

  const toggleLote = (b) => setSeleccionados(prev => prev.includes(b.key) ? prev.filter(k => k !== b.key) : [...prev, b.key])
  const idsSeleccionados = bloques.filter(b => seleccionados.includes(b.key)).flatMap(b => b.items.map(i => i._id))
  const totalArchivos    = bloques.filter(b => seleccionados.includes(b.key)).reduce((s, b) => s + b.items.length, 0)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="font-semibold text-gray-800 flex items-center gap-2"><Layers size={16} className="text-brand" />{titulo}</h3>
            <p className="text-xs text-gray-400 mt-0.5">Selecciona uno o más lotes completos</p>
          </div>
          <button onClick={onClose}><X size={18} className="text-gray-400 hover:text-gray-600" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {bloques.length === 0
            ? <div className="flex flex-col items-center py-12 text-gray-400"><FolderOpen size={36} className="opacity-20 mb-2" /><p className="text-sm">Sin lotes disponibles</p></div>
            : bloques.map(b => {
              const sel = seleccionados.includes(b.key)
              const exp = expandido === b.key
              return (
                <div key={b.key} className={`rounded-2xl border transition-all overflow-hidden ${sel ? 'border-brand/40 bg-brand/5 ring-1 ring-brand/20' : 'border-gray-100 bg-white hover:border-gray-200'}`}>
                  <div className="flex items-center gap-3 p-3 cursor-pointer" onClick={() => toggleLote(b)}>
                    <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-gray-100 grid grid-cols-2 gap-0.5">
                      {b.items.slice(0, 4).map((c, i) => (
                        <div key={i} className="overflow-hidden">
                          {c.tipo === 'video' ? <div className="w-full h-full bg-gray-700" /> : <img src={c.mediaUrl} alt="" className="w-full h-full object-cover" />}
                        </div>
                      ))}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-800 truncate">{b.label}</p>
                      {b.marca && b.tipo === 'tag' && <p className="text-xs text-brand">{b.marca}</p>}
                      <p className="text-xs text-gray-400 mt-0.5">{b.items.length} archivo{b.items.length !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={e => { e.stopPropagation(); setExpandido(exp ? null : b.key) }}
                        className="p-1.5 text-gray-300 hover:text-brand hover:bg-brand/10 rounded-lg transition-colors">
                        <Eye size={14} />
                      </button>
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${sel ? 'bg-brand border-brand' : 'border-gray-300'}`}>
                        {sel && <CheckCircle2 size={12} className="text-white" />}
                      </div>
                    </div>
                  </div>
                  {exp && (
                    <div className="px-3 pb-3 grid grid-cols-5 gap-1.5">
                      {b.items.map(c => (
                        <div key={c._id} className="aspect-square rounded-lg overflow-hidden bg-gray-100">
                          {c.tipo === 'video' ? <div className="w-full h-full flex items-center justify-center bg-gray-800"><Play size={10} className="text-white" /></div>
                            : <img src={c.mediaUrl} alt="" className="w-full h-full object-cover" />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
        </div>

        <div className="px-5 pb-5 pt-3 border-t border-gray-100 space-y-2.5 shrink-0">
          <textarea rows={2} value={caption} onChange={e => setCaption(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-brand resize-none"
            placeholder="Caption opcional…" />
          {seleccionados.length > 0 && (
            <p className="text-xs text-gray-500">
              <span className="font-bold text-brand">{seleccionados.length}</span> lote{seleccionados.length !== 1 ? 's' : ''} · <span className="font-bold text-gray-700">{totalArchivos}</span> archivos
            </p>
          )}
          <button disabled={!idsSeleccionados.length} onClick={() => onPublicar(idsSeleccionados, caption)}
            className="w-full flex items-center justify-center gap-2 bg-brand text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-brand/80 disabled:opacity-40 transition-colors">
            <Radio size={14} />
            {idsSeleccionados.length > 0 ? `${btnLabel} ${totalArchivos} archivo${totalArchivos !== 1 ? 's' : ''}` : 'Selecciona al menos un lote'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB TRANSMISIÓN — Panel de control principal
// ══════════════════════════════════════════════════════════════════════════════
function TabTransmision() {
  const qc = useQueryClient()
  const [publicando,      setPublicando]      = useState({})
  const [publicandoTodos, setPublicandoTodos] = useState(false)
  const [eliminandoTodos, setEliminandoTodos] = useState(false)
  const [eliminando,      setEliminando]      = useState({})
  const [modalPicker,     setModalPicker]     = useState(null)
  // procesando: { [tenantId]: true } — líneas cuyo estado está siendo subido en background
  const [procesando,      setProcesando]      = useState({})
  const pollRef = useRef(null)

  const hayProcesando = Object.values(procesando).some(Boolean)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['pub-lineas'],
    queryFn:  () => api.get('/publicidad/estados/lineas'),
    // Polling rápido mientras haya publicaciones en proceso, normal en reposo
    refetchInterval: hayProcesando ? 6_000 : 30_000,
  })
  const { data: contenidosData } = useQuery({
    queryKey: ['pub-contenidos'],
    queryFn:  () => api.get('/publicidad/contenidos'),
  })
  const { data: progData } = useQuery({
    queryKey: ['pub-prog-hoy'],
    queryFn:  () => api.get(`/publicidad/programaciones?mes=${new Date().toISOString().slice(0, 7)}`),
  })

  const lineas     = data?.lineas || []
  const contenidos = contenidosData?.contenidos || []
  const conectadas = lineas.filter(l => l.conectada)
  // "Publicables" = ya conectadas, o de rotación CON sesión real guardada (aunque salgan
  // "desconectadas" ahora mismo — se despiertan solas al publicar). Una de rotación que
  // nunca se ha vinculado por QR no cuenta — nadie va a escanear ese QR en el momento.
  const publicables = lineas.filter(l => l.conectada || (l.rotarSoloEstados && l.vinculada))
  const conEstado  = lineas.filter(l => l.ultimoEstado?.activo)
  const sinEstado  = conectadas.filter(l => !l.ultimoEstado?.activo)

  const hoyStr  = new Date().toISOString().slice(0, 10)
  const progHoy = progData?.programaciones?.find(p => {
    const d = new Date(p.fecha)
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}` === hoyStr
  })

  // Próxima programación (días futuros)
  const proximas = (progData?.programaciones || [])
    .filter(p => {
      const d = new Date(p.fecha)
      const dStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`
      return dStr > hoyStr
    })
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
    .slice(0, 3)

  // Activa polling rápido durante N ms y luego vuelve a normal
  const activarPollRapido = (tenantIds, duracionMs = 180_000) => {
    const ids = Array.isArray(tenantIds) ? tenantIds : [tenantIds]
    setProcesando(prev => { const n = { ...prev }; ids.forEach(id => { n[id] = true }); return n })
    if (pollRef.current) clearTimeout(pollRef.current)
    pollRef.current = setTimeout(() => {
      setProcesando(prev => { const n = { ...prev }; ids.forEach(id => { delete n[id] }); return n })
    }, duracionMs)
  }

  // Limpiar timer al desmontar
  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current) }, [])

  // Cuando llegan datos nuevos, verificar si los estados ya aparecieron y limpiar procesando
  useEffect(() => {
    if (!data?.lineas?.length) return
    setProcesando(prev => {
      const pendientes = Object.keys(prev).filter(id => prev[id])
      if (!pendientes.length) return prev
      const lineasConEstado = new Set(data.lineas.filter(l => l.ultimoEstado?.activo).map(l => l.tenantId?.toString()))
      const sigueEsperando = pendientes.filter(id => !lineasConEstado.has(id))
      if (sigueEsperando.length === pendientes.length) return prev
      const n = { ...prev }
      pendientes.forEach(id => { if (lineasConEstado.has(id)) delete n[id] })
      return n
    })
  }, [data])

  const publicarEnLinea = async (tenantId, ids, cap) => {
    if (publicando[tenantId] || procesando[tenantId]) return // evitar doble click
    setPublicando(prev => ({ ...prev, [tenantId]: true }))
    try {
      await api.post(`/publicidad/estados/publicar/${tenantId}`, { contenidoIds: ids, caption: cap, programacionId: progHoy?._id || null })
      activarPollRapido(tenantId) // polling cada 6s hasta que aparezca
    } catch (e) { alert(e?.error || 'Error al publicar') }
    finally { setPublicando(prev => ({ ...prev, [tenantId]: false })) }
  }

  const publicarTodos = async (ids, cap) => {
    if (publicandoTodos) return
    setPublicandoTodos(true)
    try {
      await api.post('/publicidad/estados/publicar-todos', { contenidoIds: ids, caption: cap, programacionId: progHoy?._id || null })
      // Las de rotación tardan más (se reconectan una a una) — el polling rápido las cubre
      // igual mientras van completando en background.
      const idsLineas = publicables.map(l => l.tenantId?.toString())
      activarPollRapido(idsLineas, 300_000)
    } catch (e) { alert(e?.error || 'Error al publicar') }
    finally { setPublicandoTodos(false) }
  }

  const eliminarEstado = async (tenantId) => {
    if (!confirm('¿Eliminar el estado activo de esta línea?')) return
    setEliminando(prev => ({ ...prev, [tenantId]: true }))
    try { await api.delete(`/publicidad/estados/linea/${tenantId}`); refetch() }
    catch (e) { alert(e?.error || 'Error') }
    finally { setEliminando(prev => ({ ...prev, [tenantId]: false })) }
  }

  const eliminarTodos = async () => {
    if (!confirm(`¿Eliminar el estado activo de las ${conEstado.length} línea${conEstado.length !== 1 ? 's' : ''}?`)) return
    setEliminandoTodos(true)
    try {
      await api.delete('/publicidad/estados/todas')
      setTimeout(() => refetch(), 3000)
    } catch (e) { alert(e?.error || 'Error al eliminar') }
    finally { setEliminandoTodos(false) }
  }

  const handlePublicar = (tenantId) => {
    if (progHoy?.contenidos?.length) publicarEnLinea(tenantId, progHoy.contenidos.map(c => c._id || c), progHoy.caption || '')
    else setModalPicker(tenantId)
  }

  const handlePublicarTodos = () => {
    if (progHoy?.contenidos?.length) publicarTodos(progHoy.contenidos.map(c => c._id || c), progHoy.caption || '')
    else setModalPicker('todos')
  }

  return (
    <div className="space-y-5">

      {/* ── Barra de estado global ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <p className="text-3xl font-black text-gray-900">{conectadas.length}</p>
          <p className="text-xs text-gray-400 mt-1 flex items-center gap-1"><Wifi size={11} /> Líneas conectadas</p>
        </div>
        <div className={`rounded-2xl p-4 border ${conEstado.length > 0 ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-100'}`}>
          <p className={`text-3xl font-black ${conEstado.length > 0 ? 'text-green-600' : 'text-gray-300'}`}>{conEstado.length}</p>
          <p className="text-xs text-gray-400 mt-1 flex items-center gap-1"><Signal size={11} /> Con estado activo</p>
        </div>
        <div className={`rounded-2xl p-4 border ${sinEstado.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-100'}`}>
          <p className={`text-3xl font-black ${sinEstado.length > 0 ? 'text-amber-600' : 'text-gray-300'}`}>{sinEstado.length}</p>
          <p className="text-xs text-gray-400 mt-1 flex items-center gap-1"><Radio size={11} /> Sin estado</p>
        </div>
        <div className={`rounded-2xl p-4 border ${progHoy ? 'bg-brand/5 border-brand/20' : 'bg-gray-50 border-gray-100'}`}>
          <p className={`text-3xl font-black ${progHoy ? 'text-brand' : 'text-gray-300'}`}>{progHoy?.contenidos?.length || 0}</p>
          <p className="text-xs text-gray-400 mt-1 flex items-center gap-1"><CalendarDays size={11} /> Archivos prog. hoy</p>
        </div>
      </div>

      {/* ── Contenido programado hoy + acción global ── */}
      <div className={`rounded-2xl border p-4 ${progHoy ? 'bg-brand/5 border-brand/20' : 'bg-gray-50 border-gray-100'}`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            {progHoy ? (
              <>
                <p className="text-sm font-bold text-gray-800 flex items-center gap-2">
                  <CalendarDays size={15} className="text-brand" />
                  Contenido de hoy listo
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {progHoy.contenidos?.length} archivo{progHoy.contenidos?.length !== 1 ? 's' : ''} programados
                  {progHoy.caption && <span className="text-gray-400"> · "{progHoy.caption}"</span>}
                </p>
                {/* Miniaturas del lote de hoy */}
                <div className="flex gap-1.5 mt-2">
                  {(progHoy.contenidos || []).slice(0, 6).map((c, i) => (
                    <div key={i} className="w-10 h-10 rounded-lg overflow-hidden bg-gray-200 shrink-0">
                      {c.tipo === 'video'
                        ? <div className="w-full h-full bg-gray-700 flex items-center justify-center"><Play size={10} className="text-white" /></div>
                        : <img src={c.mediaUrl} alt="" className="w-full h-full object-cover" onError={e => e.target.style.opacity = 0} />}
                    </div>
                  ))}
                  {(progHoy.contenidos?.length || 0) > 6 && (
                    <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-500">
                      +{progHoy.contenidos.length - 6}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-gray-500">Sin contenido programado para hoy</p>
                <p className="text-xs text-gray-400 mt-0.5">Ve a la tab Programar para añadir contenido</p>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => refetch()} className="p-2.5 rounded-xl border border-gray-200 text-gray-400 hover:text-brand hover:border-brand/30 transition-colors">
              <RefreshCw size={14} />
            </button>
            {conEstado.length > 0 && (
              <button onClick={eliminarTodos} disabled={eliminandoTodos}
                className="flex items-center gap-2 text-red-600 border border-red-200 font-semibold text-sm px-4 py-2.5 rounded-xl hover:bg-red-50 disabled:opacity-40 transition-colors">
                {eliminandoTodos ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {eliminandoTodos ? 'Eliminando…' : `Eliminar en ${conEstado.length} línea${conEstado.length !== 1 ? 's' : ''}`}
              </button>
            )}
            {publicables.length > 0 && (
              <button onClick={handlePublicarTodos} disabled={publicandoTodos}
                className="flex items-center gap-2 bg-brand text-white font-semibold text-sm px-5 py-2.5 rounded-xl hover:bg-brand/80 disabled:opacity-40 transition-colors shadow-sm">
                {publicandoTodos ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                {publicandoTodos ? 'Publicando…' : `Publicar en ${publicables.length} línea${publicables.length !== 1 ? 's' : ''}`}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Próximas programaciones ── */}
      {proximas.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <p className="text-xs font-semibold text-gray-400 shrink-0">Próximos:</p>
          {proximas.map(p => {
            const d = new Date(p.fecha)
            return (
              <div key={p._id} className="flex items-center gap-2 bg-white border border-gray-100 rounded-xl px-3 py-1.5 shrink-0 shadow-sm">
                <div className="flex gap-0.5">
                  {(p.contenidos || []).slice(0, 3).map((c, i) => (
                    <div key={i} className="w-5 h-5 rounded overflow-hidden bg-gray-100">
                      {c.mediaUrl && <img src={c.mediaUrl} alt="" className="w-full h-full object-cover" />}
                    </div>
                  ))}
                </div>
                <span className="text-xs font-semibold text-gray-700 capitalize">{fmtFechaCorta(p.fecha)}</span>
                <span className="text-xs text-gray-400">{p.contenidos?.length} arch.</span>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Grid de líneas ── */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-gray-300" /></div>
      ) : !lineas.length ? (
        <div className="flex flex-col items-center py-16 text-gray-300"><AlertTriangle size={28} className="mb-2" /><p className="text-sm">Sin líneas</p></div>
      ) : (
        <div>
          <p className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wide">Estado de cada línea</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {lineas.map(l => {
              const vigente     = l.ultimoEstado?.activo
              const thumb       = l.ultimoEstado?.contenidos?.[0]
              const isPublic    = !!publicando[l.tenantId]
              const isProcesando = !!procesando[l.tenantId?.toString()] && !vigente
              const pct         = vidaPct(l.ultimoEstado?.expiraEn)
              const pctColor    = pct > 50 ? 'bg-green-400' : pct > 25 ? 'bg-amber-400' : 'bg-red-400'

              // Una línea de rotación desconectada-pero-lista (sesión guardada) no está "mal"
              // — es su estado normal en reposo, no debería verse apagada como si algo fallara.
              const dormidaOk = !l.conectada && l.rotarSoloEstados && l.vinculada
              return (
                <div key={l.tenantId} className={`rounded-2xl border overflow-hidden shadow-sm transition-all ${
                  !l.conectada && !dormidaOk ? 'border-gray-100 opacity-50' : vigente ? 'border-green-200' : 'border-amber-100'
                }`}>
                  {/* Thumbnail */}
                  <div className="h-28 bg-gray-100 relative overflow-hidden">
                    {thumb ? (
                      thumb.tipo === 'video'
                        ? <div className="w-full h-full bg-gray-800 flex items-center justify-center"><Play size={20} className="text-white/50" /></div>
                        : <img src={thumb.mediaUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><Radio size={28} className="text-gray-200" /></div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />

                    {/* Badges overlay */}
                    <div className="absolute bottom-0 left-0 right-0 px-2.5 pb-2 flex items-end justify-between">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 ${
                        vigente ? 'bg-green-500 text-white' : isProcesando ? 'bg-amber-500 text-white' : l.ultimoEstado ? 'bg-gray-500 text-white' : 'bg-transparent text-transparent'
                      }`}>
                        {vigente ? '● EN VIVO' : isProcesando ? <><Loader2 size={7} className="animate-spin" /> SUBIENDO…</> : l.ultimoEstado ? 'EXPIRADO' : ''}
                      </span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 ${
                        l.conectada ? 'bg-green-400/90 text-white' : 'bg-gray-500/80 text-white'
                      }`}>
                        {l.conectada ? <Wifi size={8} /> : <WifiOff size={8} />}
                        {l.conectada ? 'ON' : 'OFF'}
                      </span>
                    </div>
                  </div>

                  {/* Barra de vida */}
                  {vigente && (
                    <div className="h-1 bg-gray-100">
                      <div className={`h-full transition-all duration-500 ${pctColor}`} style={{ width: `${pct}%` }} />
                    </div>
                  )}

                  {/* Info */}
                  <div className="p-3 bg-white">
                    <p className="text-sm font-bold text-gray-800 truncate">{l.nombre}</p>
                    <p className="text-[11px] text-gray-400 truncate mb-2">{l.zona || '—'}</p>

                    {l.ultimoEstado ? (
                      <div className="text-[11px] mb-3">
                        <div className="flex justify-between text-gray-400">
                          <span>{tiempoRelativo(l.ultimoEstado.publicadoEn)}</span>
                          <span className={vigente ? 'text-green-600 font-semibold' : 'text-gray-300'}>
                            {vigente ? tiempoRestante(l.ultimoEstado.expiraEn) : 'Expirado'}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-gray-300 mb-3">Sin estado publicado</p>
                    )}

                    {l.conectada ? (
                      <div className="flex gap-1.5">
                        <button disabled={isPublic || isProcesando || !!eliminando[l.tenantId]} onClick={() => handlePublicar(l.tenantId)}
                          className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-bold py-2 rounded-xl bg-brand text-white hover:bg-brand/80 disabled:opacity-40 transition-colors">
                          {isPublic || isProcesando ? <Loader2 size={11} className="animate-spin" /> : <Radio size={11} />}
                          {isPublic ? 'Publicando…' : isProcesando ? 'Procesando…' : vigente ? 'Republicar' : 'Publicar'}
                        </button>
                        {vigente && (
                          <button title="Eliminar estado" disabled={!!eliminando[l.tenantId] || isPublic}
                            onClick={() => eliminarEstado(l.tenantId)}
                            className="px-2.5 py-2 rounded-xl bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 border border-red-100 disabled:opacity-40 transition-colors">
                            {eliminando[l.tenantId] ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                          </button>
                        )}
                      </div>
                    ) : l.rotarSoloEstados && l.vinculada ? (
                      <div className="flex gap-1.5">
                        <button disabled={isPublic || isProcesando} onClick={() => handlePublicar(l.tenantId)}
                          title="Se reconecta con la sesión guardada, publica, y se desconecta sola"
                          className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-bold py-2 rounded-xl bg-blue-500 text-white hover:bg-blue-400 disabled:opacity-40 transition-colors">
                          {isPublic || isProcesando ? <Loader2 size={11} className="animate-spin" /> : <Radio size={11} />}
                          {isPublic ? 'Publicando…' : isProcesando ? 'Procesando…' : vigente ? 'Republicar' : '💾 Publicar (reconecta sola)'}
                        </button>
                      </div>
                    ) : l.rotarSoloEstados ? (
                      <div className="text-center text-[11px] text-amber-500 py-1.5 border border-amber-100 bg-amber-50/50 rounded-xl">
                        Sin vincular — necesita QR
                      </div>
                    ) : (
                      <div className="text-center text-[11px] text-gray-200 py-1.5 border border-gray-100 rounded-xl">Desconectada</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {modalPicker && (
        <ModalPickerLotes contenidos={contenidos} titulo="¿Qué publicamos?" onClose={() => setModalPicker(null)}
          onPublicar={(ids, cap) => {
            if (modalPicker === 'todos') publicarTodos(ids, cap)
            else publicarEnLinea(modalPicker, ids, cap)
            setModalPicker(null)
          }} />
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB PROGRAMAR — Calendario + programación futura
// ══════════════════════════════════════════════════════════════════════════════
// Calcula el lunes de la semana a la que pertenece una fecha
function getLunes(date) {
  const d = new Date(date)
  d.setUTCHours(0, 0, 0, 0)
  const day = d.getUTCDay()
  d.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1))
  return d
}

// Devuelve las próximas N semanas (lunes de cada una)
function getSemanas(n = 8) {
  const lunes = getLunes(new Date())
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(lunes)
    d.setUTCDate(lunes.getUTCDate() + i * 7)
    return d
  })
}

function fmtRangoSemana(lunes) {
  const domingo = new Date(lunes)
  domingo.setUTCDate(lunes.getUTCDate() + 6)
  const opts = { day: 'numeric', month: 'short', timeZone: 'UTC' }
  return `${lunes.toLocaleDateString('es', opts)} – ${domingo.toLocaleDateString('es', opts)}`
}

function VistaSemanasGrid({ contenidos, onRefresh }) {
  const qc = useQueryClient()
  const [modalSemana, setModalSemana] = useState(null) // lunes Date

  // Traer programaciones de los próximos 2 meses para cubrir 8 semanas
  const hoy = new Date()
  const mes1 = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
  const d2   = new Date(hoy); d2.setMonth(d2.getMonth() + 1)
  const mes2 = `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, '0')}`
  const d3   = new Date(hoy); d3.setMonth(d3.getMonth() + 2)
  const mes3 = `${d3.getFullYear()}-${String(d3.getMonth() + 1).padStart(2, '0')}`

  const { data: d1r } = useQuery({ queryKey: ['pub-programaciones', mes1], queryFn: () => api.get(`/publicidad/programaciones?mes=${mes1}`) })
  const { data: d2r } = useQuery({ queryKey: ['pub-programaciones', mes2], queryFn: () => api.get(`/publicidad/programaciones?mes=${mes2}`) })
  const { data: d3r } = useQuery({ queryKey: ['pub-programaciones', mes3], queryFn: () => api.get(`/publicidad/programaciones?mes=${mes3}`) })

  const todasProgs = [
    ...(d1r?.programaciones || []),
    ...(d2r?.programaciones || []),
    ...(d3r?.programaciones || []),
  ]

  // Indexar por fecha ISO (YYYY-MM-DD)
  const progMap = {}
  for (const p of todasProgs) {
    const d = new Date(p.fecha)
    const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`
    progMap[k] = p
  }

  // Agrupar programaciones por semana
  const semanas = getSemanas(8).map(lunes => {
    const dias = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(lunes)
      d.setUTCDate(lunes.getUTCDate() + i)
      const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`
      dias.push({ fecha: d, key: k, prog: progMap[k] || null })
    }
    const programados = dias.filter(d => d.prog).length
    const enviados    = dias.filter(d => d.prog?.enviado).length
    // El primer lote programado en la semana como representante
    const loteRef = dias.find(d => d.prog?.contenidos?.length)?.prog
    return { lunes, dias, programados, enviados, loteRef }
  })

  const programarSemana = async (lunes, ids, caption) => {
    await api.post('/publicidad/programaciones/semana', {
      lunesISO: lunes.toISOString(),
      contenidos: ids,
      caption,
    })
    qc.invalidateQueries(['pub-programaciones'])
    setModalSemana(null)
    onRefresh?.()
  }

  return (
    <>
      <div className="space-y-2.5">
        {semanas.map(({ lunes, dias, programados, enviados, loteRef }, si) => {
          const esActual = si === 0
          const pct      = Math.round((programados / 7) * 100)
          const allEnv   = enviados === 7
          const someEnv  = enviados > 0

          return (
            <div key={lunes.toISOString()}
              className={`bg-white rounded-2xl border p-4 transition-all ${esActual ? 'border-brand/30 ring-1 ring-brand/10 shadow-sm' : 'border-gray-100'}`}>
              <div className="flex items-start gap-4">

                {/* Collage lote asignado */}
                <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 bg-gray-100 grid grid-cols-2 gap-0.5">
                  {loteRef?.contenidos?.slice(0, 4).map((c, i) => (
                    <div key={i} className="overflow-hidden bg-gray-200">
                      {c.tipo === 'video'
                        ? <div className="w-full h-full bg-gray-700 flex items-center justify-center"><Play size={8} className="text-white" /></div>
                        : <img src={c.mediaUrl} alt="" className="w-full h-full object-cover" onError={e => e.target.style.opacity=0} />}
                    </div>
                  ))}
                  {!loteRef && (
                    <div className="col-span-2 row-span-2 flex items-center justify-center">
                      <CalendarDays size={22} className="text-gray-300" />
                    </div>
                  )}
                </div>

                {/* Info semana */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-xs font-bold text-gray-700">{fmtRangoSemana(lunes)}</span>
                    {esActual && <span className="text-[10px] bg-brand text-white px-2 py-0.5 rounded-full font-bold">Esta semana</span>}
                    {allEnv && <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">✓ Todo enviado</span>}
                  </div>

                  {/* Barra de cobertura diaria */}
                  <div className="flex gap-1 mb-2">
                    {['L','M','X','J','V','S','D'].map((letra, i) => {
                      const dia = dias[i]
                      return (
                        <div key={i} title={`${letra}: ${dia.prog ? (dia.prog.enviado ? 'Enviado' : 'Programado') : 'Sin contenido'}`}
                          className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold transition-colors ${
                            dia.prog?.enviado ? 'bg-green-500 text-white' :
                            dia.prog          ? 'bg-amber-400 text-white' :
                            'bg-gray-100 text-gray-300'
                          }`}>
                          {letra}
                        </div>
                      )
                    })}
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full transition-all ${someEnv ? 'bg-green-400' : 'bg-amber-400'}`}
                        style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[11px] text-gray-400 shrink-0">{programados}/7 días</span>
                  </div>
                </div>

                {/* Botón programar */}
                <button onClick={() => setModalSemana(lunes)}
                  className={`shrink-0 flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl transition-colors ${
                    programados === 7
                      ? 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                      : 'bg-brand text-white hover:bg-brand/90 shadow-sm shadow-brand/20'
                  }`}>
                  <CalendarDays size={13} />
                  {programados === 7 ? 'Reemplazar' : programados > 0 ? 'Completar' : 'Programar'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {modalSemana && (
        <ModalPickerLotes
          contenidos={contenidos}
          titulo={`Programar semana — ${fmtRangoSemana(modalSemana)}`}
          btnLabel="Programar semana completa"
          onClose={() => setModalSemana(null)}
          onPublicar={(ids, cap) => programarSemana(modalSemana, ids, cap)}
        />
      )}
    </>
  )
}

function TabProgramar() {
  const qc  = useQueryClient()
  const hoy = new Date()
  const [anio, setAnio]      = useState(hoy.getFullYear())
  const [mes,  setMes]       = useState(hoy.getMonth() + 1)
  const [diaModal, setDia]   = useState(null)
  const [modalLotes, setModalLotes] = useState(null)
  const [vista, setVista]    = useState('semanas') // 'semanas' | 'calendario'

  const mesKey = `${anio}-${String(mes).padStart(2, '0')}`

  const { data } = useQuery({ queryKey: ['pub-programaciones', mesKey], queryFn: () => api.get(`/publicidad/programaciones?mes=${mesKey}`) })
  const { data: contenidosData } = useQuery({ queryKey: ['pub-contenidos'], queryFn: () => api.get('/publicidad/contenidos') })

  const programaciones = data?.programaciones || []
  const contenidos     = contenidosData?.contenidos || []

  const progMap = {}
  for (const p of programaciones) {
    const d = new Date(p.fecha)
    progMap[`${d.getUTCFullYear()}-${d.getUTCMonth()+1}-${d.getUTCDate()}`] = p
  }

  const navMes = (delta) => {
    let nm = mes + delta, na = anio
    if (nm < 1)  { nm = 12; na-- }
    if (nm > 12) { nm = 1;  na++ }
    setMes(nm); setAnio(na)
  }

  const total  = diasEnMes(anio, mes)
  const offset = primerDia(anio, mes)
  const progCount  = programaciones.length
  const envCount   = programaciones.filter(p => p.enviado).length

  return (
    <div className="space-y-5">

      {/* Toggle de vista */}
      <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-xl w-fit">
        {[
          { v: 'semanas',    label: 'Vista semanal' },
          { v: 'calendario', label: 'Calendario' },
        ].map(({ v, label }) => (
          <button key={v} onClick={() => setVista(v)}
            className={`text-xs font-semibold px-4 py-1.5 rounded-lg transition-all ${
              vista === v ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* Vista semanal */}
      {vista === 'semanas' && (
        <VistaSemanasGrid contenidos={contenidos} onRefresh={() => qc.invalidateQueries(['pub-programaciones'])} />
      )}

      {/* Vista calendario */}
      {vista === 'calendario' && <>
      {/* Stats mes */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { v: progCount,           l: 'Días programados', c: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
          { v: envCount,            l: 'Lotes enviados',   c: 'text-green-600', bg: 'bg-green-50 border-green-200' },
          { v: progCount - envCount, l: 'Pendientes',      c: 'text-blue-600',  bg: 'bg-blue-50 border-blue-200'   },
        ].map(s => (
          <div key={s.l} className={`${s.bg} border rounded-2xl px-4 py-3`}>
            <p className={`text-2xl font-black ${s.c}`}>{s.v}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.l}</p>
          </div>
        ))}
      </div>

      {/* Calendario */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <button onClick={() => navMes(-1)} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 transition-colors"><ChevronLeft size={16} /></button>
          <h3 className="text-sm font-bold text-gray-800 capitalize">{mesLabel(anio, mes)}</h3>
          <button onClick={() => navMes(1)}  className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 transition-colors"><ChevronRight size={16} /></button>
        </div>

        <div className="grid grid-cols-7 border-b border-gray-50">
          {['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'].map(d => (
            <div key={d} className="text-center text-[11px] font-bold text-gray-300 py-2">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {Array.from({ length: offset }).map((_, i) => <div key={`e${i}`} className="min-h-[80px] border-r border-b border-gray-50" />)}
          {Array.from({ length: total }, (_, i) => i + 1).map(dia => {
            const k    = `${anio}-${mes}-${dia}`
            const prog = progMap[k]
            const esHoy = anio === hoy.getFullYear() && mes === hoy.getMonth()+1 && dia === hoy.getDate()
            const esPasado = new Date(Date.UTC(anio, mes-1, dia)) < new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()))
            const colIdx = (offset + dia - 1) % 7

            return (
              <button key={dia} onClick={() => setDia(dia)}
                className={`relative min-h-[80px] border-r border-b border-gray-50 text-left p-2 flex flex-col transition-colors
                  ${colIdx === 6 ? 'border-r-0' : ''}
                  ${esHoy ? 'bg-brand/5' : esPasado ? 'bg-gray-50/50' : 'hover:bg-gray-50'}
                  ${prog?.enviado ? 'bg-green-50/50' : ''}`}>

                {/* Thumbnail fondo */}
                {prog?.contenidos?.[0] && !prog.contenidos[0].tipo?.includes('video') && (
                  <div className="absolute inset-0 opacity-15">
                    <img src={prog.contenidos[0].mediaUrl} alt="" className="w-full h-full object-cover" />
                  </div>
                )}

                <span className={`relative z-10 text-xs font-black leading-none
                  ${esHoy ? 'w-5 h-5 bg-brand text-white rounded-full flex items-center justify-center text-[10px]' : esPasado ? 'text-gray-300' : 'text-gray-600'}`}>
                  {dia}
                </span>

                {prog && (
                  <div className="relative z-10 mt-auto">
                    <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-md leading-none
                      ${prog.enviado ? 'bg-green-500 text-white' : esPasado ? 'bg-gray-400 text-white' : 'bg-amber-400 text-white'}`}>
                      {prog.enviado ? '✓' : prog.contenidos?.length || 0}
                    </span>
                  </div>
                )}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-4 px-5 py-3 border-t border-gray-50 text-[11px] text-gray-300">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-amber-400 inline-block" /> Programado</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-green-500 inline-block" /> Enviado</span>
          <span className="ml-auto">Clic en un día para programar</span>
        </div>
      </div>

      {diaModal && (
        <PanelDia dia={diaModal} mes={mes} anio={anio}
          prog={progMap[`${anio}-${mes}-${diaModal}`]}
          contenidos={contenidos}
          onSaved={() => { qc.invalidateQueries(['pub-programaciones', mesKey]); setDia(null) }}
          onClose={() => setDia(null)} />
      )}
      </>}
    </div>
  )
}

function PanelDia({ dia, mes, anio, prog, contenidos, onSaved, onClose }) {
  const qc = useQueryClient()
  const [seleccionados, setSeleccionados] = useState(prog?.contenidos?.map(c => c._id || c) || [])
  const [caption, setCaption]             = useState(prog?.caption || '')
  const [saving,  setSaving]              = useState(false)
  const [enviando, setEnviando]           = useState(false)
  const [resultado, setResultado]         = useState(null)
  const [busqueda, setBusqueda]           = useState('')
  const [expandido, setExpandido]         = useState(null)

  const fecha = new Date(Date.UTC(anio, mes - 1, dia))
  const label = fecha.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

  const bloques = agruparContenidos(contenidos)
  const bloquesFiltrados = busqueda
    ? bloques.filter(b => b.label.toLowerCase().includes(busqueda.toLowerCase()) || (b.marca || '').toLowerCase().includes(busqueda.toLowerCase()))
    : bloques

  const toggleLote = (b) => {
    const ids = b.items.map(c => c._id)
    const todosSel = ids.every(id => seleccionados.includes(id))
    setSeleccionados(prev => todosSel
      ? prev.filter(id => !ids.includes(id))
      : [...new Set([...prev, ...ids])])
  }

  const guardar = async () => {
    setSaving(true)
    try { await api.post('/publicidad/programaciones', { fecha: fecha.toISOString(), contenidos: seleccionados, caption }); onSaved() }
    catch (e) { alert(e?.error || 'Error') } finally { setSaving(false) }
  }

  const eliminar = async () => {
    if (!prog?._id || !confirm('¿Eliminar programación?')) return
    await api.delete(`/publicidad/programaciones/${prog._id}`)
    onSaved()
  }

  const enviarAhora = async () => {
    if (!prog?._id) { alert('Guarda primero'); return }
    if (!confirm('¿Enviar ahora a todos los vendedores conectados?')) return
    setEnviando(true)
    try { const r = await api.post(`/publicidad/programaciones/${prog._id}/enviar`); setResultado(r); qc.invalidateQueries(['pub-programaciones']) }
    catch (e) { alert(e?.error || 'Error') } finally { setEnviando(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <p className="font-bold text-gray-800 capitalize">{label}</p>
            {prog?.enviado ? <p className="text-xs text-green-600 font-medium">✓ Enviado a las {fmtHora(prog.enviadoAt)}</p>
              : prog?._id  ? <p className="text-xs text-amber-500">{seleccionados.length} archivos programados</p>
              : <p className="text-xs text-gray-400">Sin programación</p>}
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500"><X size={18} /></button>
        </div>

        {resultado && (
          <div className="mx-5 mt-3 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 shrink-0">
            <p className="text-xs font-semibold text-blue-700">✅ Enviado a {resultado.enviados}/{resultado.total} vendedores</p>
          </div>
        )}

        <div className="px-5 pt-3 shrink-0">
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-brand"
            placeholder="Buscar contenido…" />
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {bloquesFiltrados.length === 0
            ? <div className="flex flex-col items-center py-12 text-gray-400"><FolderOpen size={32} className="opacity-20 mb-2" /><p className="text-sm">Sin lotes disponibles</p></div>
            : bloquesFiltrados.map(b => {
              const ids = b.items.map(c => c._id)
              const sel = ids.length > 0 && ids.every(id => seleccionados.includes(id))
              const exp = expandido === b.key
              return (
                <div key={b.key} className={`rounded-2xl border transition-all overflow-hidden ${sel ? 'border-brand/40 bg-brand/5 ring-1 ring-brand/20' : 'border-gray-100 bg-white hover:border-gray-200'}`}>
                  <div className="flex items-center gap-3 p-3 cursor-pointer" onClick={() => toggleLote(b)}>
                    <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-gray-100">
                      <Collage items={b.items} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-800 truncate">{b.label}</p>
                      {b.marca && b.tipo === 'tag' && <p className="text-xs text-brand">{b.marca}</p>}
                      <p className="text-xs text-gray-400 mt-0.5">{b.items.length} archivo{b.items.length !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={e => { e.stopPropagation(); setExpandido(exp ? null : b.key) }}
                        className="p-1.5 text-gray-300 hover:text-brand hover:bg-brand/10 rounded-lg transition-colors">
                        <Eye size={14} />
                      </button>
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${sel ? 'bg-brand border-brand' : 'border-gray-300'}`}>
                        {sel && <CheckCircle2 size={12} className="text-white" />}
                      </div>
                    </div>
                  </div>
                  {exp && (
                    <div className="px-3 pb-3 grid grid-cols-5 gap-1.5">
                      {b.items.map(c => (
                        <div key={c._id} className="aspect-square rounded-lg overflow-hidden bg-gray-100">
                          {c.tipo === 'video' ? <div className="w-full h-full flex items-center justify-center bg-gray-800"><Play size={10} className="text-white" /></div>
                            : <img src={c.mediaUrl} alt="" className="w-full h-full object-cover" />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
        </div>

        <div className="px-5 pb-5 pt-3 border-t border-gray-100 space-y-3 shrink-0">
          <textarea rows={2} value={caption} onChange={e => setCaption(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-brand resize-none"
            placeholder="Caption opcional…" />
          <div className="flex gap-2">
            <button onClick={guardar} disabled={saving || !seleccionados.length}
              className="flex-1 flex items-center justify-center gap-1.5 bg-brand text-white text-xs font-semibold py-2.5 rounded-xl hover:bg-brand/80 disabled:opacity-40">
              {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
              {saving ? 'Guardando…' : `Programar ${seleccionados.length || ''}`}
            </button>
            {prog?._id && !prog.enviado && (
              <button onClick={enviarAhora} disabled={enviando}
                className="flex-1 flex items-center justify-center gap-1.5 bg-green-600 text-white text-xs font-semibold py-2.5 rounded-xl hover:bg-green-700 disabled:opacity-40">
                {enviando ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                {enviando ? 'Enviando…' : 'Enviar ahora'}
              </button>
            )}
            {prog?._id && <button onClick={eliminar} className="p-2.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl"><Trash2 size={14} /></button>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB BIBLIOTECA — Gestión de contenido
// ══════════════════════════════════════════════════════════════════════════════
function TabBiblioteca() {
  const qc = useQueryClient()
  const [modalOpen,    setModalOpen]   = useState(false)
  const [detalleBloque, setDetalle]    = useState(null)
  const [renombrar,    setRenombrar]   = useState(null)
  const [preload,      setPreload]     = useState(null)

  const { data, isLoading } = useQuery({ queryKey: ['pub-contenidos'], queryFn: () => api.get('/publicidad/contenidos') })
  const contenidos = data?.contenidos || []
  const bloques    = agruparContenidos(contenidos)

  const refrescar = () => { qc.invalidateQueries(['pub-contenidos']); qc.invalidateQueries(['pub-marcas']) }

  const eliminar = useMutation({
    mutationFn: (id) => api.delete(`/publicidad/contenidos/${id}`),
    onSuccess: (_, id) => {
      refrescar()
      setDetalle(prev => {
        if (!prev) return null
        const actualizados = prev.items.filter(i => i._id !== id)
        return actualizados.length ? { ...prev, items: actualizados } : null
      })
    },
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-gray-500">
          <span className="font-bold text-gray-800">{bloques.length}</span> lotes · <span className="font-bold text-gray-800">{contenidos.length}</span> archivos
        </p>
        <button onClick={() => { setPreload(null); setModalOpen(true) }}
          className="flex items-center gap-2 bg-brand text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-brand/80">
          <Upload size={14} /> Subir contenido
        </button>
      </div>

      {isLoading ? <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-gray-300" /></div>
        : !bloques.length ? (
          <div className="flex flex-col items-center py-20 text-gray-300">
            <FolderOpen size={44} className="mb-3" /><p className="text-sm">Sin contenido. Sube el primer lote.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {bloques.map(b => (
              <div key={b.key} className="group bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer"
                onClick={() => setDetalle(b)}>
                <div className="aspect-square bg-gray-100 overflow-hidden"><Collage items={b.items} /></div>
                <div className="px-3 py-2.5">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-xs font-bold text-gray-800 truncate flex-1">{b.label}</p>
                    <button onClick={e => { e.stopPropagation(); setRenombrar(b) }}
                      className="p-1 text-gray-300 hover:text-brand opacity-0 group-hover:opacity-100 rounded-lg hover:bg-brand/10 shrink-0">
                      <Pencil size={11} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    {b.marca && <span className="text-[10px] bg-brand/10 text-brand px-1.5 py-0.5 rounded-full truncate max-w-[70%]">{b.marca}</span>}
                    <span className="text-[10px] text-gray-400 ml-auto">{b.items.length} arch.</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      {detalleBloque && (
        <DetalleBloque bloque={detalleBloque} onClose={() => setDetalle(null)}
          onDelete={id => eliminar.mutate(id)}
          onAgregarMas={() => { setDetalle(null); setPreload({ marca: detalleBloque.marca, lote: detalleBloque.tipo === 'tag' ? detalleBloque.valor : '' }); setModalOpen(true) }} />
      )}
      {renombrar && <ModalRenombrar bloque={renombrar} onClose={() => setRenombrar(null)} onDone={refrescar} />}
      {modalOpen && <ModalSubirContenido preload={preload} onClose={() => { setModalOpen(false); refrescar() }} />}
    </div>
  )
}

// ── Sub-componentes de Biblioteca ─────────────────────────────────────────────
function DetalleBloque({ bloque, onClose, onDelete, onAgregarMas }) {
  const [lightbox, setLightbox] = useState(null)
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <p className="font-bold text-gray-800">{bloque.label}</p>
            {bloque.marca && bloque.tipo === 'tag' && <p className="text-xs text-gray-400">Marca: {bloque.marca}</p>}
            <p className="text-xs text-gray-400">{bloque.items.length} archivo{bloque.items.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onAgregarMas} className="flex items-center gap-1.5 text-xs font-medium text-brand border border-brand/30 px-3 py-1.5 rounded-xl hover:bg-brand/5">
              <Plus size={13} /> Agregar más
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
        </div>
        <div className="overflow-y-auto p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {bloque.items.map(c => (
              <div key={c._id} className="group relative bg-gray-50 rounded-xl overflow-hidden border border-gray-100 cursor-pointer" onClick={() => setLightbox(c)}>
                <div className="aspect-square">
                  {c.tipo === 'video' ? <div className="w-full h-full flex items-center justify-center bg-gray-800"><Play size={24} className="text-white/70" /></div>
                    : <img src={c.mediaUrl} alt={c.titulo} className="w-full h-full object-cover" />}
                </div>
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <button onClick={e => { e.stopPropagation(); onDelete(c._id) }} className="p-2 bg-red-500/80 hover:bg-red-600 rounded-lg text-white"><Trash2 size={13} /></button>
                </div>
                <p className="text-[10px] text-gray-600 px-2 py-1.5 truncate font-medium">{c.titulo}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      {lightbox && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4" onClick={() => setLightbox(null)}>
          {lightbox.tipo === 'video' ? <video src={lightbox.mediaUrl} controls autoPlay className="max-w-full max-h-[85vh] rounded-xl" onClick={e => e.stopPropagation()} />
            : <img src={lightbox.mediaUrl} alt="" className="max-w-full max-h-[85vh] rounded-xl object-contain" onClick={e => e.stopPropagation()} />}
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 text-white/70 hover:text-white"><X size={22} /></button>
        </div>
      )}
    </div>
  )
}

function ModalRenombrar({ bloque, onClose, onDone }) {
  const [nombre, setNombre] = useState(bloque.label)
  const [saving, setSaving] = useState(false)
  const guardar = async () => {
    if (!nombre.trim() || nombre === bloque.label) { onClose(); return }
    setSaving(true)
    try { await api.put('/publicidad/lotes/renombrar', { tipo: bloque.tipo, valorActual: bloque.valor, nuevoValor: nombre.trim() }); onDone(); onClose() }
    finally { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl p-5">
        <h3 className="font-semibold text-gray-800 mb-3">Renombrar lote</h3>
        <input autoFocus className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand mb-3"
          value={nombre} onChange={e => setNombre(e.target.value)} onKeyDown={e => e.key === 'Enter' && guardar()} />
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500">Cancelar</button>
          <button onClick={guardar} disabled={saving} className="bg-brand text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-brand/80 disabled:opacity-40">
            {saving ? 'Guardando…' : 'Renombrar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ModalSubirContenido({ onClose, preload }) {
  const fileRef = useRef()
  const [marca, setMarca]       = useState(preload?.marca || '')
  const [lote,  setLote]        = useState(preload?.lote  || '')
  const [archivos, setArchivos] = useState([])
  const [progreso, setProgreso] = useState(null)
  const [error, setError]       = useState('')

  const leerArchivos = (files) => Array.from(files).forEach(f => {
    const r = new FileReader()
    r.onload = ev => setArchivos(prev => [...prev, { base64: ev.target.result.split(',')[1], mimetype: f.type, filename: f.name, url: ev.target.result, titulo: f.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ') }])
    r.readAsDataURL(f)
  })

  const handleFile    = e => { leerArchivos(e.target.files); e.target.value = '' }
  const quitarFile    = idx => setArchivos(prev => prev.filter((_, i) => i !== idx))
  const setTitulo     = (idx, v) => setArchivos(prev => prev.map((a, i) => i === idx ? { ...a, titulo: v } : a))
  const handleDrop    = e => { e.preventDefault(); leerArchivos(e.dataTransfer.files) }

  const guardar = async () => {
    if (!archivos.length) { setError('Selecciona al menos un archivo'); return }
    const sinTitulo = archivos.findIndex(a => !a.titulo.trim())
    if (sinTitulo !== -1) { setError(`El archivo #${sinTitulo + 1} necesita un título`); return }
    setError(''); setProgreso({ actual: 0, total: archivos.length })
    let errores = 0
    for (let i = 0; i < archivos.length; i++) {
      const a = archivos[i]
      try { await api.post('/publicidad/contenidos', { titulo: a.titulo.trim(), marca: marca.trim(), descripcion: lote.trim() ? `Lote: ${lote.trim()}` : '', base64: a.base64, mimetype: a.mimetype, filename: a.filename, ...(lote.trim() ? { tags: [lote.trim()] } : {}) }) }
      catch (_) { errores++ }
      setProgreso({ actual: i + 1, total: archivos.length })
    }
    if (errores > 0) setError(`${errores} archivo(s) fallaron`)
    else onClose()
  }

  const guardando = progreso !== null && progreso.actual < progreso.total
  const pct = progreso ? Math.round((progreso.actual / progreso.total) * 100) : 0

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div><h3 className="font-semibold text-gray-800">Subir contenido</h3><p className="text-xs text-gray-400 mt-0.5">Imágenes o videos — múltiples a la vez</p></div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Marca <span className="text-gray-400 font-normal">(aplica a todos)</span></label>
              <input className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand" placeholder="Yale, Algreco…" value={marca} onChange={e => setMarca(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Nombre del lote <span className="text-gray-400 font-normal">(opcional)</span></label>
              <input className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand" placeholder="Campaña verano…" value={lote} onChange={e => setLote(e.target.value)} />
            </div>
          </div>
          <div onDrop={handleDrop} onDragOver={e => e.preventDefault()} onClick={() => !archivos.length && fileRef.current.click()}
            className={`border-2 border-dashed rounded-2xl transition-colors ${archivos.length ? 'border-brand/30 bg-brand/5 p-3' : 'border-gray-200 hover:border-brand/40 p-8 cursor-pointer text-center'}`}>
            <input ref={fileRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleFile} />
            {archivos.length === 0 ? (
              <div className="flex flex-col items-center gap-2 text-gray-400"><Upload size={32} className="opacity-40" /><p className="text-sm font-medium">Arrastra aquí o haz clic</p></div>
            ) : (
              <>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {archivos.map((a, i) => (
                    <div key={i} className="flex flex-col gap-1.5">
                      <div className="relative group aspect-square bg-gray-100 rounded-xl overflow-hidden">
                        {a.mimetype.startsWith('image/') ? <img src={a.url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center bg-gray-800"><Video size={24} className="text-white/60" /></div>}
                        {progreso && i < progreso.actual && <div className="absolute inset-0 bg-green-500/70 flex items-center justify-center"><CheckCircle2 size={20} className="text-white" /></div>}
                        {progreso && i === progreso.actual && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><Loader2 size={20} className="text-white animate-spin" /></div>}
                        {!progreso && <button onClick={e => { e.stopPropagation(); quitarFile(i) }} className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100"><X size={10} /></button>}
                      </div>
                      <input value={a.titulo} onChange={e => setTitulo(i, e.target.value)} disabled={!!progreso} placeholder={`Título ${i+1}`} className="w-full text-[11px] border border-gray-200 rounded-lg px-2 py-1 outline-none focus:border-brand disabled:opacity-50" />
                    </div>
                  ))}
                  {!progreso && <button onClick={e => { e.stopPropagation(); fileRef.current.click() }} className="aspect-square border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center text-gray-300 hover:border-brand/50 self-start"><Plus size={20} /></button>}
                </div>
                {progreso && (
                  <div className="mt-4">
                    <div className="flex justify-between text-xs text-gray-500 mb-1"><span>Subiendo {progreso.actual}/{progreso.total}</span><span>{pct}%</span></div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-brand rounded-full transition-all" style={{ width: `${pct}%` }} /></div>
                  </div>
                )}
              </>
            )}
          </div>
          {error && <p className="text-xs text-red-500 text-center">{error}</p>}
        </div>
        <div className="px-6 pb-5 pt-3 border-t border-gray-100 flex gap-2 justify-end shrink-0">
          <button onClick={onClose} disabled={guardando} className="px-4 py-2 text-sm text-gray-500 disabled:opacity-40">Cancelar</button>
          <button onClick={guardar} disabled={guardando || !archivos.length} className="flex items-center gap-2 bg-brand text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-brand/80 disabled:opacity-40">
            {guardando ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {guardando ? `${progreso.actual}/${progreso.total}…` : `Subir ${archivos.length || ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB MONITOR — Cumplimiento de vendedores
// ══════════════════════════════════════════════════════════════════════════════
function TabMonitor() {
  const hoy = new Date().toISOString().slice(0, 10)
  const [fecha, setFecha] = useState(hoy)
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['pub-estados', fecha],
    queryFn:  () => api.get(`/publicidad/estados?fecha=${fecha}`),
    refetchInterval: 60_000,
  })
  const vendedores = data?.vendedores || []
  const subieron   = vendedores.filter(v => v.subioEstado).length
  const total      = vendedores.length
  const pct        = total ? Math.round((subieron / total) * 100) : 0

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-brand" />
          <button onClick={() => refetch()} className="p-2.5 rounded-xl border border-gray-200 text-gray-400 hover:text-brand hover:border-brand/30"><RefreshCw size={14} /></button>
        </div>
        {total > 0 && (
          <div className="flex gap-2">
            <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-xl px-3 py-1.5"><CheckCircle2 size={13} className="text-green-600" /><span className="text-xs font-bold text-green-700">{subieron} subieron</span></div>
            <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-xl px-3 py-1.5"><XCircle size={13} className="text-red-500" /><span className="text-xs font-bold text-red-600">{total - subieron} faltaron</span></div>
          </div>
        )}
      </div>

      {total > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <div className="flex items-end justify-between mb-2">
            <div><p className="text-3xl font-black text-gray-800">{pct}%</p><p className="text-xs text-gray-400">Cumplimiento del día</p></div>
            <p className="text-sm text-gray-500">{subieron} / {total}</p>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-500' : pct >= 70 ? 'bg-brand' : pct >= 40 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {isLoading ? <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-gray-300" /></div>
        : !vendedores.length ? <div className="flex flex-col items-center py-16 text-gray-300"><AlertTriangle size={28} className="mb-2" /><p className="text-sm">Sin vendedores</p></div>
        : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {vendedores.map(v => (
              <div key={v.tenantId} className={`flex items-center gap-3 p-4 rounded-2xl border ${v.subioEstado ? 'bg-green-50 border-green-200' : v.conectado ? 'bg-white border-gray-100' : 'bg-gray-50 border-gray-100 opacity-50'}`}>
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-white font-black text-base shrink-0 ${v.subioEstado ? 'bg-green-500' : v.conectado ? 'bg-gray-300' : 'bg-gray-200'}`}>
                  {v.nombre?.[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-800 truncate">{v.nombre}</p>
                  <p className="text-xs text-gray-400">{v.zona || '—'}</p>
                  {v.subioEstado && v.horaEstado && <p className="text-[11px] text-green-600 font-medium mt-0.5">✓ {fmtHora(v.horaEstado)}</p>}
                  {!v.subioEstado && v.conectado && <p className="text-[11px] text-amber-500 mt-0.5">Pendiente</p>}
                </div>
                {v.subioEstado ? <CheckCircle2 size={20} className="text-green-500 shrink-0" /> : <XCircle size={20} className={`shrink-0 ${v.conectado ? 'text-amber-300' : 'text-gray-200'}`} />}
              </div>
            ))}
          </div>
        )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════
const TABS = [
  { key: 'transmision', label: 'Transmisión', icon: Signal },
  { key: 'programar',   label: 'Programar',   icon: CalendarDays },
  { key: 'biblioteca',  label: 'Banco de contenido',  icon: Image },
  { key: 'monitor',     label: 'Monitor',     icon: BarChart2 },
]

export default function PublicidadPage() {
  const [tab, setTab] = useState('transmision')

  const { data: stats } = useQuery({
    queryKey: ['pub-stats'],
    queryFn:  () => api.get('/publicidad/stats'),
    refetchInterval: 60_000,
  })

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-gray-100 px-6 py-4 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center">
              <Megaphone size={20} className="text-brand" />
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900">Publicidad</h1>
              <p className="text-xs text-gray-400">Estados de WhatsApp · Control total desde el CRM</p>
            </div>
          </div>
          {stats && (
            <div className="hidden sm:flex items-center gap-2 text-xs">
              <div className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-center">
                <p className="font-black text-gray-800 text-lg leading-none">{stats.totalContenido}</p>
                <p className="text-gray-400 mt-0.5">contenidos</p>
              </div>
              <div className={`rounded-xl px-3 py-2 text-center border ${stats.enviadoHoy ? 'bg-green-50 border-green-200' : stats.tieneProgHoy ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-100'}`}>
                <p className={`font-black text-lg leading-none ${stats.enviadoHoy ? 'text-green-600' : stats.tieneProgHoy ? 'text-amber-600' : 'text-gray-300'}`}>
                  {stats.enviadoHoy ? '✓' : stats.tieneProgHoy ? '●' : '—'}
                </p>
                <p className="text-gray-400 mt-0.5">{stats.enviadoHoy ? 'Enviado' : stats.tieneProgHoy ? 'Prog. hoy' : 'Sin prog.'}</p>
              </div>
              <div className="bg-brand/5 border border-brand/20 rounded-xl px-3 py-2 text-center">
                <p className="font-black text-brand text-lg leading-none">{stats.estadosHoy}/{stats.totalVendedores}</p>
                <p className="text-gray-400 mt-0.5">estados hoy</p>
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-1">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                tab === key ? 'bg-brand/10 text-brand' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'transmision' && <TabTransmision />}
        {tab === 'programar'   && <TabProgramar />}
        {tab === 'biblioteca'  && <TabBiblioteca />}
        {tab === 'monitor'     && <TabMonitor />}
      </div>
    </div>
  )
}
