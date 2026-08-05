import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, FileText, Trash2, Send, RefreshCw, X, Loader2, AlertCircle } from 'lucide-react'
import api from '../services/api'

const ESTADO_BADGE = {
  borrador:  { label: 'Borrador',  cls: 'bg-gray-100 text-gray-500' },
  enviada:   { label: 'Enviada — esperando aprobación', cls: 'bg-blue-50 text-blue-600' },
  aprobada:  { label: 'Aprobada',  cls: 'bg-green-100 text-green-700' },
  rechazada: { label: 'Rechazada', cls: 'bg-red-100 text-red-600' },
  pausada:   { label: 'Pausada',   cls: 'bg-amber-100 text-amber-700' },
}

const CATEGORIAS = [
  { value: 'UTILITY',        label: 'Utilidad (confirmaciones, seguimiento de pedido)' },
  { value: 'MARKETING',      label: 'Marketing (campañas, promociones)' },
  { value: 'AUTHENTICATION', label: 'Autenticación (códigos OTP)' },
]

function ModalNuevaPlantilla({ tenants, tenantIdDefault, onClose, onDone }) {
  const [form, setForm] = useState({
    tenantId: tenantIdDefault || '',
    nombre: '', categoria: 'UTILITY', idioma: 'es',
    headerTipo: 'ninguno', headerContenido: '',
    cuerpo: '', footer: '',
    botones: [],
  })
  const [error, setError] = useState('')

  const crear = useMutation({
    mutationFn: () => api.post('/plantillas-whatsapp', {
      tenantId: form.tenantId,
      nombre: form.nombre,
      categoria: form.categoria,
      idioma: form.idioma,
      header: { tipo: form.headerTipo, contenido: form.headerContenido },
      cuerpo: form.cuerpo,
      footer: form.footer,
      botones: form.botones,
    }),
    onSuccess: () => onDone(),
    onError: (e) => setError(e?.error || 'Error al crear la plantilla'),
  })

  const agregarBoton = () => {
    if (form.botones.length >= 3) return
    setForm({ ...form, botones: [...form.botones, { tipo: 'QUICK_REPLY', texto: '', valor: '' }] })
  }
  const actualizarBoton = (i, campo, valor) => {
    const botones = [...form.botones]
    botones[i] = { ...botones[i], [campo]: valor }
    setForm({ ...form, botones })
  }
  const quitarBoton = (i) => setForm({ ...form, botones: form.botones.filter((_, idx) => idx !== i) })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[88vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2"><FileText size={16} className="text-brand" /> Nueva plantilla</h3>
          <button onClick={onClose}><X size={18} className="text-gray-400 hover:text-gray-600" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg px-3 py-2 flex items-center gap-2">
              <AlertCircle size={14} /> {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Línea</label>
            <select className="input text-sm w-full" value={form.tenantId} onChange={e => setForm({ ...form, tenantId: e.target.value })}>
              <option value="">Selecciona una línea…</option>
              {tenants.map(t => <option key={t._id} value={t._id}>{t.nombre}{t.esPrincipal ? ' (principal)' : ''}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Nombre (snake_case)</label>
              <input className="input text-xs font-mono w-full" value={form.nombre}
                onChange={e => setForm({ ...form, nombre: e.target.value })}
                placeholder="confirmacion_pedido" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Idioma</label>
              <input className="input text-xs w-full" value={form.idioma}
                onChange={e => setForm({ ...form, idioma: e.target.value })} placeholder="es" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Categoría</label>
            <select className="input text-sm w-full" value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })}>
              {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Cuerpo del mensaje</label>
            <textarea className="input text-sm w-full" rows={4} value={form.cuerpo}
              onChange={e => setForm({ ...form, cuerpo: e.target.value })}
              placeholder="Hola {{1}}, tu pedido #{{2}} ya fue confirmado…" />
            <p className="text-[10px] text-gray-400 mt-1">Usa {'{{1}}'}, {'{{2}}'}… para variables que se llenan al enviar</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Pie de página (opcional)</label>
            <input className="input text-xs w-full" value={form.footer}
              onChange={e => setForm({ ...form, footer: e.target.value })} placeholder="AGROFER — gracias por tu compra" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-gray-500">Botones (opcional, máx. 3)</label>
              {form.botones.length < 3 && (
                <button onClick={agregarBoton} className="text-xs text-brand hover:underline">+ Agregar</button>
              )}
            </div>
            {form.botones.map((b, i) => (
              <div key={i} className="flex items-center gap-1.5 mb-1.5">
                <select className="input text-xs w-32 shrink-0" value={b.tipo} onChange={e => actualizarBoton(i, 'tipo', e.target.value)}>
                  <option value="QUICK_REPLY">Respuesta rápida</option>
                  <option value="URL">Enlace</option>
                  <option value="PHONE_NUMBER">Llamar</option>
                </select>
                <input className="input text-xs flex-1" placeholder="Texto del botón" value={b.texto}
                  onChange={e => actualizarBoton(i, 'texto', e.target.value)} />
                {b.tipo !== 'QUICK_REPLY' && (
                  <input className="input text-xs flex-1" placeholder={b.tipo === 'URL' ? 'https://...' : '+57...'}
                    value={b.valor} onChange={e => actualizarBoton(i, 'valor', e.target.value)} />
                )}
                <button onClick={() => quitarBoton(i)} className="text-gray-300 hover:text-red-500 shrink-0"><X size={14} /></button>
              </div>
            ))}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 shrink-0">
          <button onClick={() => { setError(''); crear.mutate() }} disabled={crear.isPending || !form.tenantId || !form.nombre || !form.cuerpo}
            className="btn-primary w-full flex items-center justify-center gap-2 text-sm disabled:opacity-40">
            {crear.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Guardar borrador
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PlantillasWhatsAppPage() {
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [enviandoId, setEnviandoId] = useState(null)

  const { data: tData } = useQuery({ queryKey: ['vendedores-lista'], queryFn: () => api.get('/vendedores') })
  const tenants = tData?.vendedores || []
  const principal = tenants.find(t => t.esPrincipal)

  const { data, isLoading } = useQuery({ queryKey: ['plantillas-whatsapp'], queryFn: () => api.get('/plantillas-whatsapp') })
  const plantillas = data?.plantillas || []

  const refrescar = () => qc.invalidateQueries(['plantillas-whatsapp'])

  const enviar = useMutation({
    mutationFn: (id) => api.post(`/plantillas-whatsapp/${id}/enviar`),
    onMutate: (id) => setEnviandoId(id),
    onSettled: () => setEnviandoId(null),
    onSuccess: refrescar,
    onError: (e) => alert(e?.error || 'Error al enviar la plantilla a Meta'),
  })

  const consultarEstado = useMutation({
    mutationFn: (id) => api.get(`/plantillas-whatsapp/${id}/estado`),
    onSuccess: refrescar,
    onError: (e) => alert(e?.error || 'Error al consultar estado'),
  })

  const eliminar = useMutation({
    mutationFn: (id) => api.delete(`/plantillas-whatsapp/${id}`),
    onSuccess: refrescar,
  })

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Plantillas de WhatsApp</h2>
          <p className="text-sm text-gray-400">{plantillas.length} plantillas — se crean como borrador y se envían a Meta para aprobación</p>
        </div>
        <button onClick={() => setModalOpen(true)} className="btn-primary flex items-center gap-2">
          <Plus size={15} /> Nueva plantilla
        </button>
      </div>

      <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700 space-y-1">
        <p className="font-semibold flex items-center gap-1.5"><FileText size={13} /> ¿Para qué sirven?</p>
        <p>Meta exige plantillas aprobadas para que el negocio pueda iniciar una conversación (campañas, confirmación de pedido, seguimiento) — no aplica cuando el cliente ya te escribió primero.</p>
        <p>La aprobación de Meta toma entre 24 y 72 horas.</p>
      </div>

      {isLoading && (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="card h-20 animate-pulse bg-gray-50" />)}</div>
      )}

      {!isLoading && !plantillas.length && (
        <div className="card p-10 text-center space-y-3">
          <FileText size={36} className="text-gray-200 mx-auto" />
          <p className="text-gray-500 font-medium">Sin plantillas aún</p>
          <p className="text-sm text-gray-400">Crea la primera para campañas o confirmaciones de pedido</p>
          <button onClick={() => setModalOpen(true)} className="btn-primary mx-auto flex items-center gap-2">
            <Plus size={14} /> Crear primera plantilla
          </button>
        </div>
      )}

      <div className="space-y-3">
        {plantillas.map(p => {
          const badge = ESTADO_BADGE[p.estado] || ESTADO_BADGE.borrador
          return (
            <div key={p._id} className="card p-0 overflow-hidden">
              <div className="flex items-center gap-4 px-5 py-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="font-semibold text-sm font-mono">{p.nombre}</p>
                    <span className="text-xs bg-gray-50 text-gray-500 px-2 py-0.5 rounded-full">{p.categoria}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.cls}`}>{badge.label}</span>
                  </div>
                  <p className="text-xs text-gray-500 line-clamp-2">{p.cuerpo}</p>
                  {p.estado === 'rechazada' && p.motivoRechazo && (
                    <p className="text-xs text-red-500 mt-1">Motivo: {p.motivoRechazo}</p>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {p.estado === 'borrador' && (
                    <button onClick={() => enviar.mutate(p._id)} disabled={enviandoId === p._id}
                      className="flex items-center gap-1.5 text-xs font-medium text-brand border border-brand/30 px-3 py-1.5 rounded-xl hover:bg-brand/5 disabled:opacity-40">
                      {enviandoId === p._id ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                      Enviar a Meta
                    </button>
                  )}
                  {p.metaTemplateId && (
                    <button onClick={() => consultarEstado.mutate(p._id)}
                      className="p-2 rounded-lg text-gray-400 hover:text-brand hover:bg-brand/10 transition-colors" title="Consultar estado">
                      <RefreshCw size={15} />
                    </button>
                  )}
                  <button onClick={() => { if (confirm('¿Eliminar esta plantilla?')) eliminar.mutate(p._id) }}
                    className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Eliminar">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {modalOpen && (
        <ModalNuevaPlantilla tenants={tenants} tenantIdDefault={principal?._id}
          onClose={() => setModalOpen(false)}
          onDone={() => { setModalOpen(false); refrescar() }} />
      )}
    </div>
  )
}
