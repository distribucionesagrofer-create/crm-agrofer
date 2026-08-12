import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Wallet, RefreshCw, Eye, Send, MessageSquare, Clock, ChevronLeft, ChevronRight } from 'lucide-react'
import api from '../services/api'

const ESTADO_BADGE = {
  enviado:   { label: 'Enviado',   cls: 'bg-blue-100 text-blue-700' },
  entregado: { label: 'Entregado', cls: 'bg-indigo-100 text-indigo-700' },
  leido:     { label: 'Leído',     cls: 'bg-green-100 text-green-700' },
  fallido:   { label: 'Fallido',   cls: 'bg-red-100 text-red-600' },
}

// Buckets pensados para los umbrales del futuro recordatorio automático (15/10/5/1 día)
const BUCKETS = [
  { key: 'todos',   label: 'Todos' },
  { key: 'vencida', label: 'Vencidas' },
  { key: 'dia_1',   label: 'Vence en ≤1 día' },
  { key: 'dia_5',   label: 'Vence en ≤5 días' },
  { key: 'dia_10',  label: 'Vence en 6-10 días' },
  { key: 'dia_15',  label: 'Vence en 11-15 días' },
  { key: 'mas_15',  label: 'Vence en +15 días' },
]

function bucketDe(diasVcto) {
  if (diasVcto == null) return null
  if (diasVcto > 0) return 'vencida'
  const restan = Math.abs(diasVcto)
  if (restan <= 1) return 'dia_1'
  if (restan <= 5) return 'dia_5'
  if (restan <= 10) return 'dia_10'
  if (restan <= 15) return 'dia_15'
  return 'mas_15'
}

function fmtMoney(n) {
  return '$' + Math.round(n || 0).toLocaleString('es-CO')
}
function fmtFecha(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es', { day: '2-digit', month: 'short' })
}

function EstadoEnvio({ envio }) {
  if (!envio) return <span className="text-[10px] text-gray-400">Sin enviar</span>
  const badge = ESTADO_BADGE[envio.estado] || ESTADO_BADGE.enviado
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
      {envio.respondio && (
        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 flex items-center gap-0.5">
          <MessageSquare size={9} /> Respondió
        </span>
      )}
    </div>
  )
}

const POR_PAGINA = 25

export default function CarteraPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [busqueda, setBusqueda] = useState('')
  const [bucketActivo, setBucketActivo] = useState('todos')
  const [pagina, setPagina] = useState(1)
  const [enviandoId, setEnviandoId] = useState(null)
  const [previewId, setPreviewId] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['cartera'],
    queryFn: () => api.get('/cartera'),
    refetchInterval: 20_000,
  })

  const clientes = data?.clientes || []
  const sync = data?.sync

  const sincronizar = useMutation({
    mutationFn: () => api.post('/cartera/sincronizar'),
    onSuccess: () => qc.invalidateQueries(['cartera']),
  })

  const conteoPorBucket = useMemo(() => {
    const c = { todos: clientes.length }
    for (const b of BUCKETS) if (b.key !== 'todos') c[b.key] = 0
    for (const cli of clientes) {
      const b = bucketDe(cli.proximoVencimiento?.diasVcto)
      if (b) c[b] = (c[b] || 0) + 1
    }
    return c
  }, [clientes])

  const filtrados = useMemo(() => {
    let lista = clientes
    if (bucketActivo !== 'todos') {
      lista = lista.filter(c => bucketDe(c.proximoVencimiento?.diasVcto) === bucketActivo)
    }
    if (busqueda) {
      const s = busqueda.toLowerCase()
      lista = lista.filter(c => (c.name || '').toLowerCase().includes(s) || (c.phone || '').includes(s))
    }
    return lista
  }, [clientes, bucketActivo, busqueda])

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))
  const paginaSegura = Math.min(pagina, totalPaginas)
  const pagados = filtrados.slice((paginaSegura - 1) * POR_PAGINA, paginaSegura * POR_PAGINA)

  const cambiarBucket = (key) => { setBucketActivo(key); setPagina(1) }

  const totalPendiente = clientes.reduce((s, c) => s + (c.carteraTotal || 0), 0)
  const totalPendienteFiltrado = filtrados.reduce((s, c) => s + (c.carteraTotal || 0), 0)

  const verPreview = async (customerId) => {
    setPreviewId(customerId)
    try {
      const blob = await api.get(`/cartera/${customerId}/preview`, { responseType: 'blob' })
      window.open(URL.createObjectURL(blob), '_blank')
    } catch {
      alert('No se pudo generar la vista previa')
    } finally {
      setPreviewId(null)
    }
  }

  const enviar = async (customerId) => {
    if (!confirm('¿Enviar el recordatorio de cartera a este cliente por WhatsApp?')) return
    setEnviandoId(customerId)
    try {
      await api.post(`/cartera/${customerId}/enviar`)
      qc.invalidateQueries(['cartera'])
    } catch (e) {
      alert(e?.error || 'Error enviando el recordatorio')
    } finally {
      setEnviandoId(null)
    }
  }

  const irAConversacion = async (customerId) => {
    const { conversationId } = await api.get(`/cartera/${customerId}/conversacion`)
    if (conversationId) navigate(`/inbox-principal?c=${conversationId}`)
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-brand/10 rounded-xl"><Wallet size={20} className="text-brand" /></div>
          <div>
            <h2 className="text-xl font-bold">Cartera</h2>
            <p className="text-sm text-gray-400">Clientes con saldo pendiente y seguimiento de recordatorios</p>
          </div>
        </div>
        <button onClick={() => sincronizar.mutate()} disabled={sincronizar.isPending || sync?.sincronizando}
          className="btn-secondary flex items-center gap-2 text-sm">
          <RefreshCw size={14} className={(sincronizar.isPending || sync?.sincronizando) ? 'animate-spin' : ''} />
          {sync?.sincronizando ? 'Sincronizando...' : 'Sincronizar con Sistema Principal'}
        </button>
      </div>

      {sync?.ultimaSync && (
        <p className="text-xs text-gray-400 flex items-center gap-1">
          <Clock size={11} /> Última sincronización: {new Date(sync.ultimaSync).toLocaleString('es')}
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="card p-4">
          <p className="text-xs text-gray-400">Clientes con saldo</p>
          <p className="text-2xl font-black text-gray-900">{clientes.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-400">Total pendiente</p>
          <p className="text-2xl font-black text-gray-900">{fmtMoney(totalPendiente)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-400">Vencidas</p>
          <p className="text-2xl font-black text-red-600">{conteoPorBucket.vencida || 0}</p>
        </div>
      </div>

      {/* Filtro por cercanía al vencimiento — mismos umbrales del recordatorio automático */}
      <div className="flex gap-1.5 flex-wrap">
        {BUCKETS.map(b => (
          <button key={b.key} onClick={() => cambiarBucket(b.key)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
              bucketActivo === b.key ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {b.label}
            <span className={`text-[10px] font-bold ${bucketActivo === b.key ? 'opacity-80' : 'text-gray-400'}`}>
              {conteoPorBucket[b.key] || 0}
            </span>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <input className="input text-sm max-w-sm" placeholder="Buscar cliente o teléfono..."
          value={busqueda} onChange={e => { setBusqueda(e.target.value); setPagina(1) }} />
        {bucketActivo !== 'todos' && (
          <p className="text-xs text-gray-400">
            {filtrados.length} clientes · {fmtMoney(totalPendienteFiltrado)} en este filtro
          </p>
        )}
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-50">
                <th className="px-4 py-2.5 font-medium">Cliente</th>
                <th className="px-4 py-2.5 font-medium">Asesor</th>
                <th className="px-4 py-2.5 font-medium">Total pendiente</th>
                <th className="px-4 py-2.5 font-medium">Próx. vencimiento</th>
                <th className="px-4 py-2.5 font-medium">Último recordatorio</th>
                <th className="px-4 py-2.5 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={6} className="text-center text-gray-400 py-8 text-xs">Cargando...</td></tr>}
              {!isLoading && !pagados.length && (
                <tr><td colSpan={6} className="text-center text-gray-400 py-8 text-xs">
                  {clientes.length ? 'Sin resultados con este filtro' : 'Sin cartera pendiente en caché — usa "Sincronizar" para traerla de Sistema Principal'}
                </td></tr>
              )}
              {pagados.map(c => {
                const dias = c.proximoVencimiento?.diasVcto
                const vencida = dias > 0
                return (
                  <tr key={c._id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer"
                    onClick={() => irAConversacion(c._id)}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{c.name || '—'}</p>
                      <p className="text-xs text-gray-400">{c.phone}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{c.vendedorId?.nombre || '—'}</td>
                    <td className="px-4 py-3 font-semibold text-gray-800">{fmtMoney(c.carteraTotal)}</td>
                    <td className="px-4 py-3">
                      {c.proximoVencimiento ? (
                        <span className={`text-xs font-medium ${vencida ? 'text-red-600' : 'text-gray-600'}`}>
                          {fmtFecha(c.proximoVencimiento.vence)} {vencida ? `(${dias}d vencida)` : `(${Math.abs(dias)}d)`}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <EstadoEnvio envio={c.ultimoEnvio} />
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => verPreview(c._id)} disabled={previewId === c._id}
                          className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 disabled:opacity-40" title="Vista previa">
                          <Eye size={13} />
                        </button>
                        <button onClick={() => enviar(c._id)} disabled={enviandoId === c._id}
                          className="p-1.5 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-600 disabled:opacity-40" title="Enviar">
                          <Send size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {filtrados.length > POR_PAGINA && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-50">
            <p className="text-xs text-gray-400">
              Página {paginaSegura} de {totalPaginas} · {filtrados.length} clientes
            </p>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={paginaSegura === 1}
                className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 disabled:opacity-30">
                <ChevronLeft size={14} />
              </button>
              <button onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={paginaSegura === totalPaginas}
                className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 disabled:opacity-30">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
