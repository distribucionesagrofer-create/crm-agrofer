import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckSquare, Plus, Check, Trash2, Phone, RefreshCw, ChevronDown, Bot, User } from 'lucide-react'
import api from '../services/api'

const TIPO_CONFIG = {
  llamar:      { label: 'Llamar',       cls: 'bg-blue-100 text-blue-700' },
  seguimiento: { label: 'Seguimiento',  cls: 'bg-purple-100 text-purple-700' },
  cotizacion:  { label: 'Cotizacion',   cls: 'bg-green-100 text-green-700' },
  otro:        { label: 'Otro',         cls: 'bg-gray-100 text-gray-600' },
}

const PRIORIDAD_CONFIG = {
  alta:  { label: 'Alta',   cls: 'bg-red-100 text-red-600',    dot: 'bg-red-500' },
  media: { label: 'Media',  cls: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-400' },
  baja:  { label: 'Baja',   cls: 'bg-gray-100 text-gray-500',  dot: 'bg-gray-300' },
}

function fmtDate(date) {
  if (!date) return ''
  const d = new Date(date), now = new Date()
  const diff = Math.floor((now - d) / 86400000)
  if (diff === 0) return 'Hoy ' + d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
  if (diff === 1) return 'Ayer'
  if (diff < 7)  return d.toLocaleDateString('es', { weekday: 'short', day: '2-digit', month: 'short' })
  return d.toLocaleDateString('es', { day: '2-digit', month: 'short' })
}

function NuevaTareaModal({ vendedores, onClose, onCreated }) {
  const [form, setForm] = useState({
    tenantId:    vendedores[0]?._id || '',
    contactName: '',
    phone:       '',
    descripcion: '',
    tipo:        'llamar',
    prioridad:   'media',
  })

  const crear = useMutation({
    mutationFn: () => api.post('/tareas', { ...form, creadaPor: 'manual' }),
    onSuccess: () => { onCreated(); onClose() },
  })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <h3 className="font-bold text-lg">Nueva tarea</h3>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Linea / Vendedor</label>
          <select className="input text-sm" value={form.tenantId} onChange={e => setForm({ ...form, tenantId: e.target.value })}>
            {vendedores.map(v => <option key={v._id} value={v._id}>{v.nombre}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Nombre del contacto</label>
            <input className="input text-sm" value={form.contactName}
              onChange={e => setForm({ ...form, contactName: e.target.value })}
              placeholder="Ej: Carlos Gomez" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Telefono</label>
            <input className="input text-sm" value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
              placeholder="573001234567" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Descripcion</label>
          <input className="input text-sm" value={form.descripcion}
            onChange={e => setForm({ ...form, descripcion: e.target.value })}
            placeholder="Ej: Llamar para cotizar arroz 50kg" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tipo</label>
            <select className="input text-sm" value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
              <option value="llamar">Llamar</option>
              <option value="seguimiento">Seguimiento</option>
              <option value="cotizacion">Cotizacion</option>
              <option value="otro">Otro</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Prioridad</label>
            <select className="input text-sm" value={form.prioridad} onChange={e => setForm({ ...form, prioridad: e.target.value })}>
              <option value="alta">Alta</option>
              <option value="media">Media</option>
              <option value="baja">Baja</option>
            </select>
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={() => crear.mutate()} disabled={crear.isPending || !form.tenantId}
            className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm">
            <Plus size={14} /> {crear.isPending ? 'Creando...' : 'Crear tarea'}
          </button>
          <button onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
        </div>
      </div>
    </div>
  )
}

function TareaRow({ tarea, onUpdated }) {
  const [expandNotas, setExpandNotas] = useState(false)
  const [notas, setNotas] = useState(tarea.notas || '')
  const qc = useQueryClient()

  const actualizar = useMutation({
    mutationFn: (data) => api.patch(`/tareas/${tarea._id}`, data),
    onSuccess: () => { qc.invalidateQueries(['tareas']); onUpdated?.() },
  })

  const eliminar = useMutation({
    mutationFn: () => api.delete(`/tareas/${tarea._id}`),
    onSuccess: () => qc.invalidateQueries(['tareas']),
  })

  const tipo     = TIPO_CONFIG[tarea.tipo]     || TIPO_CONFIG.otro
  const prior    = PRIORIDAD_CONFIG[tarea.prioridad] || PRIORIDAD_CONFIG.media
  const hecho    = tarea.estado === 'completada'
  const cancelada = tarea.estado === 'cancelada'

  return (
    <div className={`card p-4 transition-opacity ${hecho || cancelada ? 'opacity-50' : ''}`}>
      <div className="flex items-start gap-3">
        {/* Check button */}
        <button
          onClick={() => actualizar.mutate({ estado: hecho ? 'pendiente' : 'completada' })}
          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
            hecho ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-green-400'
          }`}>
          {hecho && <Check size={12} />}
        </button>

        {/* Contenido */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <p className={`text-sm font-semibold ${hecho ? 'line-through text-gray-400' : 'text-gray-800'}`}>
              {tarea.descripcion || 'Sin descripcion'}
            </p>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tipo.cls}`}>{tipo.label}</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1 ${prior.cls}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${prior.dot}`} />
              {prior.label}
            </span>
            {tarea.creadaPor === 'bot'
              ? <Bot size={11} className="text-brand opacity-60" title="Creada por el bot" />
              : <User size={11} className="text-gray-400" title="Creada manualmente" />
            }
          </div>

          <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
            {tarea.contactName && (
              <span className="font-medium text-gray-600">{tarea.contactName}</span>
            )}
            {tarea.phone && (
              <span className="flex items-center gap-1">
                <Phone size={10} /> {tarea.phone}
              </span>
            )}
            <span>{fmtDate(tarea.createdAt)}</span>
          </div>

          {/* Notas expandibles */}
          <div className="mt-2">
            <button onClick={() => setExpandNotas(v => !v)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-brand transition-colors">
              <ChevronDown size={12} className={`transition-transform ${expandNotas ? 'rotate-180' : ''}`} />
              {expandNotas ? 'Ocultar notas' : 'Notas'}
            </button>
            {expandNotas && (
              <div className="mt-2 space-y-2">
                <textarea
                  rows={2}
                  className="input text-xs resize-none"
                  placeholder="Agregar notas..."
                  value={notas}
                  onChange={e => setNotas(e.target.value)}
                />
                <button onClick={() => actualizar.mutate({ notas })}
                  disabled={actualizar.isPending}
                  className="btn-secondary text-xs py-1 px-3">
                  Guardar notas
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-1 shrink-0">
          {!hecho && !cancelada && (
            <button onClick={() => actualizar.mutate({ estado: 'cancelada' })}
              className="text-xs text-gray-300 hover:text-yellow-500 p-1.5 rounded-lg hover:bg-yellow-50 transition-colors"
              title="Cancelar tarea">
              <RefreshCw size={13} />
            </button>
          )}
          <button onClick={() => eliminar.mutate()}
            disabled={eliminar.isPending}
            className="text-xs text-gray-300 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
            title="Eliminar">
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function TareasPage() {
  const [vendedorId, setVendedorId] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState('pendiente')
  const [showModal, setShowModal] = useState(false)
  const qc = useQueryClient()

  const { data: vData } = useQuery({
    queryKey: ['vendedores-tareas'],
    queryFn:  () => api.get('/vendedores'),
  })
  const vendedores = vData?.vendedores || []

  const { data, isLoading } = useQuery({
    queryKey: ['tareas', vendedorId, estadoFiltro],
    queryFn:  () => {
      const params = new URLSearchParams({ limit: 100 })
      if (vendedorId)   params.set('vendedorId', vendedorId)
      if (estadoFiltro) params.set('estado', estadoFiltro)
      return api.get(`/tareas?${params}`)
    },
  })

  const tareas    = data?.tareas || []
  const pendientes = tareas.filter(t => t.estado === 'pendiente').length
  const completadas = tareas.filter(t => t.estado === 'completada').length

  return (
    <div className="p-6 max-w-3xl space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-brand/10 rounded-xl">
            <CheckSquare size={20} className="text-brand" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Agenda / Tareas</h2>
            <p className="text-sm text-gray-400">Seguimientos pendientes del bot y manuales</p>
          </div>
        </div>
        <button onClick={() => setShowModal(true)}
          className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={14} /> Nueva tarea
        </button>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <select className="input text-sm w-52" value={vendedorId} onChange={e => setVendedorId(e.target.value)}>
          <option value="">Todas las lineas</option>
          {vendedores.map(v => <option key={v._id} value={v._id}>{v.nombre}</option>)}
        </select>

        <div className="flex gap-1.5">
          {[
            { key: 'pendiente',   label: 'Pendientes' },
            { key: 'completada',  label: 'Completadas' },
            { key: 'cancelada',   label: 'Canceladas' },
            { key: '',            label: 'Todas' },
          ].map(f => (
            <button key={f.key} onClick={() => setEstadoFiltro(f.key)}
              className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                estadoFiltro === f.key
                  ? 'bg-brand text-white'
                  : 'bg-white border border-gray-200 text-gray-500 hover:border-brand/40'
              }`}>
              {f.label}
            </button>
          ))}
        </div>

        <button onClick={() => qc.invalidateQueries(['tareas'])}
          className="ml-auto text-gray-400 hover:text-brand p-1.5 rounded-lg hover:bg-brand/5 transition-colors">
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Stats rapidas */}
      {estadoFiltro === 'pendiente' && tareas.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="card p-3 text-center">
            <p className="text-2xl font-bold text-brand">{tareas.filter(t => t.prioridad === 'alta').length}</p>
            <p className="text-xs text-gray-400">Prioridad alta</p>
          </div>
          <div className="card p-3 text-center">
            <p className="text-2xl font-bold text-blue-600">{tareas.filter(t => t.tipo === 'llamar').length}</p>
            <p className="text-xs text-gray-400">Para llamar</p>
          </div>
          <div className="card p-3 text-center">
            <p className="text-2xl font-bold text-green-600">{tareas.filter(t => t.creadaPor === 'bot').length}</p>
            <p className="text-xs text-gray-400">Creadas por bot</p>
          </div>
        </div>
      )}

      {/* Lista */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="card h-20 animate-pulse bg-gray-50" />)}
        </div>
      ) : tareas.length === 0 ? (
        <div className="card p-10 text-center text-gray-400 space-y-2">
          <CheckSquare size={32} className="mx-auto opacity-20" />
          <p className="text-sm">No hay tareas {estadoFiltro === 'pendiente' ? 'pendientes' : ''}</p>
          {estadoFiltro === 'pendiente' && (
            <p className="text-xs">Las tareas se crean automaticamente cuando el bot detecta un seguimiento necesario</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {tareas.map(t => (
            <TareaRow key={t._id} tarea={t} onUpdated={() => qc.invalidateQueries(['tareas'])} />
          ))}
        </div>
      )}

      {showModal && (
        <NuevaTareaModal
          vendedores={vendedores}
          onClose={() => setShowModal(false)}
          onCreated={() => qc.invalidateQueries(['tareas'])}
        />
      )}
    </div>
  )
}
