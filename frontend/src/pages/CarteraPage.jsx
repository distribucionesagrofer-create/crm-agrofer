import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Wallet, RefreshCw, Eye, Send, MessageSquare, Clock, AlertTriangle } from 'lucide-react'
import api from '../services/api'

const ESTADO_BADGE = {
  enviado:   { label: 'Enviado',   cls: 'bg-blue-100 text-blue-700' },
  entregado: { label: 'Entregado', cls: 'bg-indigo-100 text-indigo-700' },
  leido:     { label: 'Leído',     cls: 'bg-green-100 text-green-700' },
  fallido:   { label: 'Fallido',   cls: 'bg-red-100 text-red-600' },
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

export default function CarteraPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [busqueda, setBusqueda] = useState('')
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

  const filtrados = clientes.filter(c => {
    if (!busqueda) return true
    const s = busqueda.toLowerCase()
    return (c.name || '').toLowerCase().includes(s) || (c.phone || '').includes(s)
  })

  const totalPendiente = clientes.reduce((s, c) => s + (c.carteraTotal || 0), 0)
  const vencidas = clientes.filter(c => c.proximoVencimiento?.diasVcto > 0).length

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
          <p className="text-xs text-gray-400 flex items-center gap-1"><AlertTriangle size={11} className="text-red-500" /> Con facturas vencidas</p>
          <p className="text-2xl font-black text-red-600">{vencidas}</p>
        </div>
      </div>

      <input className="input text-sm max-w-sm" placeholder="Buscar cliente o teléfono..."
        value={busqueda} onChange={e => setBusqueda(e.target.value)} />

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
              {!isLoading && !filtrados.length && (
                <tr><td colSpan={6} className="text-center text-gray-400 py-8 text-xs">
                  {clientes.length ? 'Sin resultados' : 'Sin cartera pendiente en caché — usa "Sincronizar" para traerla de Sistema Principal'}
                </td></tr>
              )}
              {filtrados.map(c => {
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
      </div>
    </div>
  )
}
