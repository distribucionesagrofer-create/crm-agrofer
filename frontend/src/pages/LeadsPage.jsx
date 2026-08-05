import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, UserPlus, Trash2, CheckCircle, Clock, Star, XCircle, Phone, SendHorizonal, X, Wifi, WifiOff, Square, CheckSquare } from 'lucide-react'
import api from '../services/api'

function DelegarModal({ lead, onClose }) {
  const [vendedorId, setVendedorId] = useState('')
  const [mensaje, setMensaje]       = useState('')
  const [resultado, setResultado]   = useState(null)
  const qc = useQueryClient()

  const { data: vData } = useQuery({
    queryKey: ['vendedores-lista'],
    queryFn: () => api.get('/vendedores'),
  })

  const vendedores = (vData?.vendedores || []).filter(v => v.slug !== 'linea-principal')
  const vSeleccionado = vendedores.find(v => v._id === vendedorId)
  const waConectado   = vSeleccionado?.whatsapp?.status === 'connected'

  const delegar = useMutation({
    mutationFn: () => api.post(`/leads/${lead._id}/delegar`, { vendedorId, mensaje: mensaje || undefined }),
    onSuccess: (res) => {
      setResultado(res.mensaje)
      qc.invalidateQueries(['leads'])
    },
    onError: (e) => alert(e?.error || 'Error al delegar'),
  })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-lg">Delegar lead</h3>
            <p className="text-sm text-gray-400">{lead.name || lead.phone}</p>
          </div>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>

        {resultado ? (
          <div className="text-center py-4 space-y-4">
            <CheckCircle size={44} className="text-green-500 mx-auto" />
            <p className="font-semibold text-green-700">{resultado}</p>
            <p className="text-xs text-gray-400">La conversación ya aparece en el inbox del vendedor</p>
            <button onClick={onClose} className="btn-primary w-full">Cerrar</button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Selector de vendedor */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Asignar a vendedor</label>
              <select className="input" value={vendedorId} onChange={e => setVendedorId(e.target.value)}>
                <option value="">Selecciona un vendedor…</option>
                {vendedores.map(v => (
                  <option key={v._id} value={v._id}>
                    {v.nombre} · {v.zona || 'Sin zona'} {v.whatsapp?.status === 'connected' ? '🟢' : '⚪'}
                  </option>
                ))}
              </select>
              {vSeleccionado && (
                <div className={`flex items-center gap-1.5 mt-1.5 text-xs font-medium ${waConectado ? 'text-green-600' : 'text-red-500'}`}>
                  {waConectado ? <Wifi size={11} /> : <WifiOff size={11} />}
                  {waConectado ? 'WhatsApp conectado — puede enviar mensajes' : 'WhatsApp desconectado — no puede enviar'}
                </div>
              )}
            </div>

            {/* Mensaje inicial */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mensaje inicial <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <textarea rows={4} className="input resize-none text-sm"
                placeholder={vSeleccionado
                  ? `Hola! 👋 Soy ${vSeleccionado.nombre} de AGROFER. ¿En qué te puedo ayudar?`
                  : 'Selecciona un vendedor para ver el mensaje por defecto…'}
                value={mensaje}
                onChange={e => setMensaje(e.target.value)}
                maxLength={500} />
              <p className="text-xs text-gray-400 mt-1">
                Si lo dejas vacío se envía un saludo automático desde el nombre del vendedor
              </p>
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
              <button
                onClick={() => delegar.mutate()}
                disabled={!vendedorId || !waConectado || delegar.isPending}
                className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-40">
                <SendHorizonal size={14} />
                {delegar.isPending ? 'Enviando…' : 'Delegar y enviar'}
              </button>
            </div>

            {vendedorId && !waConectado && (
              <p className="text-xs text-center text-red-500">
                Conecta el WhatsApp de este vendedor primero en la sección Vendedores
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function formatPhone(phone) {
  if (!phone) return '—'
  const p = String(phone).replace(/\D/g, '')
  if (p.startsWith('57') && p.length === 12) {
    const local = p.slice(2)
    return `+57 ${local.slice(0,3)} ${local.slice(3,6)} ${local.slice(6)}`
  }
  return phone
}

const STATUS_CONFIG = {
  nuevo:       { label: 'Nuevo',       color: 'bg-blue-100 text-blue-700',   icon: Clock },
  contactado:  { label: 'Contactado',  color: 'bg-yellow-100 text-yellow-700', icon: Phone },
  interesado:  { label: 'Interesado',  color: 'bg-purple-100 text-purple-700', icon: Star },
  convertido:  { label: 'Convertido',  color: 'bg-green-100 text-green-700',  icon: CheckCircle },
  descartado:  { label: 'Descartado',  color: 'bg-gray-100 text-gray-500',    icon: XCircle },
}

export default function LeadsPage() {
  const [search, setSearch]   = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [page, setPage] = useState(1)
  const [delegarLead, setDelegarLead] = useState(null)
  const [seleccionados, setSeleccionados] = useState(new Set())
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['leads', search, filtroStatus, page],
    queryFn: () => api.get(`/leads?search=${search}&status=${filtroStatus}&page=${page}&limit=50`),
    keepPreviousData: true,
  })

  const cambiarStatus = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/leads/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries(['leads']),
  })

  const convertir = useMutation({
    mutationFn: (id) => api.post(`/leads/${id}/convertir`),
    onSuccess: (res) => {
      qc.invalidateQueries(['leads'])
      alert(res.message || 'Lead convertido a cliente')
    },
    onError: (e) => alert(e?.error || 'Error al convertir'),
  })

  const eliminar = useMutation({
    mutationFn: (id) => api.delete(`/leads/${id}`),
    onSuccess: (data, id) => {
      qc.invalidateQueries(['leads'])
      setSeleccionados(prev => { const n = new Set(prev); n.delete(id); return n })
    },
  })

  const eliminarMasivo = useMutation({
    mutationFn: () => api.post('/leads/eliminar-masivo', { ids: [...seleccionados] }),
    onSuccess: (r) => { alert(`${r.eliminados} leads eliminados`); setSeleccionados(new Set()); qc.invalidateQueries(['leads']) },
    onError: (e) => alert(e?.error || 'Error'),
  })

  const toggleSeleccion = (id) => setSeleccionados(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const toggleTodos = () => setSeleccionados(prev =>
    prev.size === leads.length ? new Set() : new Set(leads.map(l => l._id))
  )

  const leads = data?.leads || []
  const total = data?.total ?? 0

  const counts = leads.reduce((acc, l) => {
    acc[l.status] = (acc[l.status] || 0) + 1
    return acc
  }, {})

  return (
    <div className="p-6 space-y-5">
      {delegarLead && <DelegarModal lead={delegarLead} onClose={() => setDelegarLead(null)} />}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold">Leads</h2>
          <p className="text-sm text-gray-400">Números nuevos que contactaron por WhatsApp — aún no son clientes</p>
        </div>
        {seleccionados.size > 0 && (
          <button
            onClick={() => { if (confirm(`¿Eliminar ${seleccionados.size} leads permanentemente?`)) eliminarMasivo.mutate() }}
            disabled={eliminarMasivo.isPending}
            className="flex items-center gap-2 text-sm px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition-colors disabled:opacity-40">
            <Trash2 size={14} /> Eliminar {seleccionados.size} seleccionados
          </button>
        )}
      </div>

      {/* Chips de estado */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => { setFiltroStatus(''); setPage(1) }}
          className={`text-xs px-3 py-1.5 rounded-full font-medium border transition-colors ${
            !filtroStatus ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-500 hover:border-gray-400'
          }`}>
          Todos · {total}
        </button>
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
          const Icon = cfg.icon
          return (
            <button key={key} onClick={() => { setFiltroStatus(key); setPage(1) }}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium border transition-colors ${
                filtroStatus === key ? cfg.color + ' border-transparent' : 'border-gray-200 text-gray-500 hover:border-gray-400'
              }`}>
              <Icon size={11} /> {cfg.label}
            </button>
          )
        })}
      </div>

      {/* Buscador */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
        <input className="input pl-9 text-sm" placeholder="Buscar nombre o teléfono…"
          value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
      </div>

      {/* Tabla */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-4 py-3 w-8">
                <button onClick={toggleTodos} className="text-gray-400 hover:text-brand">
                  {seleccionados.size > 0 && seleccionados.size === leads.length
                    ? <CheckSquare size={15} className="text-brand" />
                    : <Square size={15} />}
                </button>
              </th>
              <th className="text-left px-5 py-3 font-medium text-gray-500">Nombre</th>
              <th className="text-left px-5 py-3 font-medium text-gray-500">Teléfono</th>
              <th className="text-left px-5 py-3 font-medium text-gray-500">Línea</th>
              <th className="text-left px-5 py-3 font-medium text-gray-500">Estado</th>
              <th className="text-left px-5 py-3 font-medium text-gray-500">Último mensaje</th>
              <th className="text-left px-5 py-3 font-medium text-gray-500">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading && <tr><td colSpan={7} className="px-5 py-8 text-center text-gray-400">Cargando…</td></tr>}
            {!isLoading && !leads.length && (
              <tr><td colSpan={7} className="px-5 py-10 text-center text-gray-400">
                {filtroStatus ? `Sin leads en estado "${STATUS_CONFIG[filtroStatus]?.label}"` : 'Sin leads aún — aparecerán cuando lleguen mensajes nuevos a las líneas WhatsApp'}
              </td></tr>
            )}
            {leads.map(l => {
              const st  = STATUS_CONFIG[l.status] || STATUS_CONFIG.nuevo
              const Icon = st.icon
              const dias = Math.floor((Date.now() - new Date(l.lastMessageAt)) / 86400000)
              const sel = seleccionados.has(l._id)
              return (
                <tr key={l._id} className={`hover:bg-gray-50/50 ${sel ? 'bg-brand/5' : ''}`}>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleSeleccion(l._id)} className="text-gray-400 hover:text-brand">
                      {sel ? <CheckSquare size={14} className="text-brand" /> : <Square size={14} />}
                    </button>
                  </td>
                  <td className="px-5 py-3 font-medium">{l.name || '(sin nombre)'}</td>
                  <td className="px-5 py-3 font-mono text-xs text-gray-600">{formatPhone(l.phone)}</td>
                  <td className="px-5 py-3 text-xs text-gray-500">{l.tenantId?.nombre || '—'}</td>
                  <td className="px-5 py-3">
                    <select
                      value={l.status}
                      onChange={e => cambiarStatus.mutate({ id: l._id, status: e.target.value })}
                      className={`text-xs px-2 py-1 rounded-full font-medium border-0 cursor-pointer outline-none ${st.color}`}>
                      {Object.entries(STATUS_CONFIG).map(([k, c]) => (
                        <option key={k} value={k}>{c.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-400">
                    {dias === 0 ? 'Hoy' : `Hace ${dias}d`}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      {l.status !== 'convertido' && l.status !== 'descartado' && (
                        <>
                          <button
                            onClick={() => setDelegarLead(l)}
                            title="Delegar a vendedor"
                            className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors font-medium">
                            <SendHorizonal size={12} /> Delegar
                          </button>
                          <button
                            onClick={() => convertir.mutate(l._id)}
                            disabled={convertir.isPending}
                            title="Convertir a cliente"
                            className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors font-medium disabled:opacity-40">
                            <UserPlus size={12} /> Convertir
                          </button>
                        </>
                      )}
                      {l.status === 'convertido' && (
                        <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                          <CheckCircle size={12} /> Cliente
                        </span>
                      )}
                      <button
                        onClick={() => { if (confirm('¿Eliminar este lead permanentemente?')) eliminar.mutate(l._id) }}
                        title="Eliminar lead"
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>Página {page} · {total} leads</span>
        <div className="flex gap-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="btn-secondary py-1 px-3 disabled:opacity-40">Anterior</button>
          <button onClick={() => setPage(p => p + 1)} disabled={leads.length < 50}
            className="btn-secondary py-1 px-3 disabled:opacity-40">Siguiente</button>
        </div>
      </div>
    </div>
  )
}
