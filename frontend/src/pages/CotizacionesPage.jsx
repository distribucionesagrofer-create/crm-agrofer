import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileText, Plus, Trash2, Send, Check, X, ChevronDown, Search,
  ClipboardList, RefreshCw, Pencil, Eye, Copy,
} from 'lucide-react'
import api from '../services/api'

const ESTADO_CONFIG = {
  borrador:  { label: 'Borrador',   cls: 'bg-gray-100 text-gray-500' },
  enviada:   { label: 'Enviada',    cls: 'bg-blue-100 text-blue-700' },
  aprobada:  { label: 'Aprobada',   cls: 'bg-green-100 text-green-700' },
  rechazada: { label: 'Rechazada',  cls: 'bg-red-100 text-red-600' },
  vencida:   { label: 'Vencida',    cls: 'bg-amber-100 text-amber-700' },
}

function fmtCOP(n) {
  if (n == null || isNaN(n)) return '$0'
  return '$' + Math.round(n).toLocaleString('es-CO')
}
function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Modal de nueva/editar cotización ─────────────────────────────────────────
function CotizacionModal({ cot, vendedores, onClose }) {
  const qc = useQueryClient()
  const editando = !!cot

  const [form, setForm] = useState({
    tenantId:    cot?.tenantId?._id || cot?.tenantId || vendedores[0]?._id || '',
    contactName: cot?.contactName || '',
    phone:       cot?.phone || '',
    descuento:   cot?.descuento ?? 0,
    notas:       cot?.notas || '',
    validoHasta: cot?.validoHasta ? new Date(cot.validoHasta).toISOString().split('T')[0] : '',
    items: cot?.items?.length
      ? cot.items.map(it => ({ descripcion: it.descripcion, cantidad: it.cantidad, precioUnit: it.precioUnit }))
      : [{ descripcion: '', cantidad: 1, precioUnit: 0 }],
  })
  const [error, setError] = useState('')

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const setItem = (idx, k, v) => setForm(prev => {
    const items = [...prev.items]
    items[idx] = { ...items[idx], [k]: v }
    return { ...prev, items }
  })
  const addItem  = () => setForm(prev => ({ ...prev, items: [...prev.items, { descripcion: '', cantidad: 1, precioUnit: 0 }] }))
  const removeItem = (idx) => setForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }))

  const subtotal = form.items.reduce((s, it) => s + (parseFloat(it.cantidad) || 0) * (parseFloat(it.precioUnit) || 0), 0)
  const descVal  = Math.round(subtotal * (parseFloat(form.descuento) || 0) / 100 * 100) / 100
  const total    = Math.round((subtotal - descVal) * 100) / 100

  const guardar = useMutation({
    mutationFn: () => {
      const payload = { ...form, items: form.items }
      return editando
        ? api.patch(`/cotizaciones/${cot._id}`, payload)
        : api.post('/cotizaciones', payload)
    },
    onSuccess: () => { qc.invalidateQueries(['cotizaciones']); onClose() },
    onError: (e) => setError(e?.error || 'Error al guardar'),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    if (!form.tenantId)       return setError('Selecciona una línea')
    if (!form.contactName.trim()) return setError('Nombre del contacto requerido')
    if (form.items.every(it => !it.descripcion.trim())) return setError('Agrega al menos un producto')
    guardar.mutate()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-brand" />
            <h3 className="font-bold text-lg">{editando ? `Editar cotización #${cot.numero}` : 'Nueva cotización'}</h3>
          </div>
          <button onClick={onClose}><X size={18} className="text-gray-400 hover:text-gray-600" /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Línea + contacto */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Línea WhatsApp *</label>
              <select className="input text-sm" value={form.tenantId} onChange={e => set('tenantId', e.target.value)}>
                <option value="">Seleccionar…</option>
                {vendedores.map(v => <option key={v._id} value={v._id}>{v.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Cliente / Nombre *</label>
              <input className="input text-sm" placeholder="Ej: Finca El Paraíso"
                value={form.contactName} onChange={e => set('contactName', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Teléfono</label>
              <input className="input text-sm" placeholder="573001234567"
                value={form.phone} onChange={e => set('phone', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Válida hasta</label>
              <input type="date" className="input text-sm"
                value={form.validoHasta} onChange={e => set('validoHasta', e.target.value)} />
            </div>
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Productos / Servicios</label>
              <button type="button" onClick={addItem}
                className="flex items-center gap-1 text-xs text-brand hover:text-brand/80 font-medium">
                <Plus size={13} /> Agregar item
              </button>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-400 px-1">
                <span className="col-span-5">Descripción</span>
                <span className="col-span-2 text-right">Cant.</span>
                <span className="col-span-2 text-right">Precio unit.</span>
                <span className="col-span-2 text-right">Subtotal</span>
                <span className="col-span-1" />
              </div>
              {form.items.map((it, idx) => {
                const sub = Math.round((parseFloat(it.cantidad) || 0) * (parseFloat(it.precioUnit) || 0) * 100) / 100
                return (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <input
                      className="col-span-5 input text-sm py-1.5"
                      placeholder="Ej: Arroz 50kg"
                      value={it.descripcion}
                      onChange={e => setItem(idx, 'descripcion', e.target.value)}
                    />
                    <input
                      type="number" min="0" step="any"
                      className="col-span-2 input text-sm py-1.5 text-right"
                      value={it.cantidad}
                      onChange={e => setItem(idx, 'cantidad', e.target.value)}
                    />
                    <input
                      type="number" min="0" step="any"
                      className="col-span-2 input text-sm py-1.5 text-right"
                      placeholder="0"
                      value={it.precioUnit}
                      onChange={e => setItem(idx, 'precioUnit', e.target.value)}
                    />
                    <span className="col-span-2 text-xs text-right font-semibold text-gray-700">{fmtCOP(sub)}</span>
                    <button type="button" onClick={() => removeItem(idx)}
                      className="col-span-1 flex justify-center text-gray-300 hover:text-red-500 transition-colors">
                      <X size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Totales */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Subtotal</span>
              <span className="font-medium">{fmtCOP(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-gray-500">Descuento %</span>
              <div className="flex items-center gap-2">
                <input type="number" min="0" max="100"
                  className="input text-sm py-1 w-20 text-right"
                  value={form.descuento}
                  onChange={e => set('descuento', e.target.value)}
                />
                <span className="text-sm text-gray-500">= -{fmtCOP(descVal)}</span>
              </div>
            </div>
            <div className="flex justify-between text-base font-bold border-t border-gray-200 pt-2">
              <span>Total</span>
              <span className="text-brand">{fmtCOP(total)}</span>
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notas internas</label>
            <textarea rows={2} className="input text-sm resize-none"
              placeholder="Condiciones de pago, observaciones…"
              value={form.notas} onChange={e => set('notas', e.target.value)} />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        </form>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
          <button onClick={handleSubmit} disabled={guardar.isPending} className="btn-primary flex-1 disabled:opacity-40">
            {guardar.isPending ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear cotización'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal de vista detalle / enviar ───────────────────────────────────────────
function CotizacionDetalle({ cot, onClose, onEditar }) {
  const qc = useQueryClient()

  const cambiarEstado = useMutation({
    mutationFn: (estado) => api.patch(`/cotizaciones/${cot._id}`, { estado }),
    onSuccess: () => qc.invalidateQueries(['cotizaciones']),
  })

  const eliminar = useMutation({
    mutationFn: () => api.delete(`/cotizaciones/${cot._id}`),
    onSuccess: () => { qc.invalidateQueries(['cotizaciones']); onClose() },
  })

  // Genera texto formateado para WhatsApp
  const generarTextoWA = () => {
    const lineas = [
      `*COTIZACIÓN #${cot.numero}* — ${cot.tenantId?.nombre || 'AGROFER'}`,
      `Cliente: ${cot.contactName || '—'}`,
      `Fecha: ${fmtDate(cot.createdAt)}`,
      cot.validoHasta ? `Válida hasta: ${fmtDate(cot.validoHasta)}` : '',
      '',
      '*PRODUCTOS:*',
      ...cot.items.map(it => `• ${it.descripcion} x${it.cantidad} → ${fmtCOP(it.subtotal)}`),
      '',
      `Subtotal: ${fmtCOP(cot.subtotalBruto)}`,
      cot.descuento ? `Descuento ${cot.descuento}%: -${fmtCOP(cot.subtotalBruto * cot.descuento / 100)}` : '',
      `*TOTAL: ${fmtCOP(cot.total)}*`,
      cot.notas ? `\n_${cot.notas}_` : '',
    ].filter(l => l !== null && l !== undefined).join('\n').replace(/\n{3,}/g, '\n\n').trim()
    return lineas
  }

  const copiarTexto = () => {
    navigator.clipboard.writeText(generarTextoWA())
      .then(() => alert('Texto copiado al portapapeles'))
      .catch(() => {})
  }

  const enviarWA = () => {
    const phone = cot.phone?.replace(/\D/g, '')
    const text  = encodeURIComponent(generarTextoWA())
    if (phone) {
      window.open(`https://wa.me/${phone}?text=${text}`, '_blank')
    } else {
      window.open(`https://wa.me/?text=${text}`, '_blank')
    }
    if (cot.estado === 'borrador') cambiarEstado.mutate('enviada')
  }

  const estado = ESTADO_CONFIG[cot.estado] || ESTADO_CONFIG.borrador

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div>
              <h3 className="font-bold text-lg">Cotización #{cot.numero}</h3>
              <p className="text-xs text-gray-400">{cot.contactName} · {fmtDate(cot.createdAt)}</p>
            </div>
            <span className={`text-xs font-bold px-2 py-1 rounded-full ${estado.cls}`}>{estado.label}</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Items */}
          <div className="bg-gray-50 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="text-left px-3 py-2 font-medium text-gray-500 text-xs">Producto</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500 text-xs">Cant.</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500 text-xs">P. unit.</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500 text-xs">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cot.items.map((it, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2">{it.descripcion}</td>
                    <td className="px-3 py-2 text-right text-gray-500">{it.cantidad}</td>
                    <td className="px-3 py-2 text-right text-gray-500">{fmtCOP(it.precioUnit)}</td>
                    <td className="px-3 py-2 text-right font-medium">{fmtCOP(it.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-3 py-3 border-t border-gray-200 space-y-1">
              <div className="flex justify-between text-sm text-gray-500">
                <span>Subtotal</span><span>{fmtCOP(cot.subtotalBruto)}</span>
              </div>
              {cot.descuento > 0 && (
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Descuento {cot.descuento}%</span>
                  <span>-{fmtCOP(cot.subtotalBruto * cot.descuento / 100)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base border-t border-gray-200 pt-1.5">
                <span>TOTAL</span><span className="text-brand">{fmtCOP(cot.total)}</span>
              </div>
            </div>
          </div>

          {cot.notas && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5 text-sm text-amber-800">
              {cot.notas}
            </div>
          )}

          {cot.validoHasta && (
            <p className="text-xs text-gray-400">Válida hasta: <strong>{fmtDate(cot.validoHasta)}</strong></p>
          )}

          {/* Cambiar estado */}
          <div>
            <p className="text-xs font-medium text-gray-400 mb-2">Cambiar estado:</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(ESTADO_CONFIG).filter(([k]) => k !== cot.estado).map(([k, v]) => (
                <button key={k} onClick={() => cambiarEstado.mutate(k)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${v.cls} hover:opacity-80`}>
                  → {v.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 px-6 py-4 border-t border-gray-100 shrink-0 flex-wrap">
          <button onClick={() => onEditar(cot)}
            className="flex items-center gap-1.5 text-xs btn-secondary py-2 px-3">
            <Pencil size={13} /> Editar
          </button>
          <button onClick={copiarTexto}
            className="flex items-center gap-1.5 text-xs btn-secondary py-2 px-3">
            <Copy size={13} /> Copiar texto
          </button>
          <button onClick={enviarWA}
            className="flex-1 flex items-center justify-center gap-1.5 text-sm btn-primary py-2">
            <Send size={14} /> Enviar por WhatsApp
          </button>
          <button
            onClick={() => { if (confirm('¿Eliminar esta cotización?')) eliminar.mutate() }}
            disabled={eliminar.isPending}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 p-2 rounded-lg hover:bg-red-50 transition-colors">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function CotizacionesPage() {
  const [search, setSearch]           = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState('')
  const [showModal, setShowModal]     = useState(false)
  const [editando, setEditando]       = useState(null)
  const [viendo, setViendo]           = useState(null)
  const qc = useQueryClient()

  const { data: vData } = useQuery({
    queryKey: ['vendedores-lista'],
    queryFn:  () => api.get('/vendedores'),
  })
  const vendedores = vData?.vendedores || []

  const { data, isLoading } = useQuery({
    queryKey: ['cotizaciones', search, estadoFiltro],
    queryFn: () => {
      const p = new URLSearchParams({ limit: 100 })
      if (search)      p.set('search', search)
      if (estadoFiltro) p.set('estado', estadoFiltro)
      return api.get(`/cotizaciones?${p}`)
    },
  })

  const cotizaciones = data?.cotizaciones || []
  const total        = data?.total ?? 0

  // Stats rápidas
  const porEstado = cotizaciones.reduce((acc, c) => {
    acc[c.estado] = (acc[c.estado] || 0) + 1
    return acc
  }, {})
  const totalImporte = cotizaciones.reduce((s, c) => s + (c.total || 0), 0)
  const aprobadas    = cotizaciones.filter(c => c.estado === 'aprobada').reduce((s, c) => s + c.total, 0)

  return (
    <div className="p-6 max-w-5xl space-y-5">
      {showModal && (
        <CotizacionModal
          vendedores={vendedores}
          onClose={() => setShowModal(false)}
        />
      )}
      {editando && (
        <CotizacionModal
          cot={editando}
          vendedores={vendedores}
          onClose={() => setEditando(null)}
        />
      )}
      {viendo && (
        <CotizacionDetalle
          cot={viendo}
          onClose={() => setViendo(null)}
          onEditar={(c) => { setViendo(null); setEditando(c) }}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-brand/10 rounded-xl">
            <FileText size={20} className="text-brand" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Cotizaciones</h2>
            <p className="text-sm text-gray-400">{total} cotizaciones · {fmtCOP(totalImporte)} en pipeline</p>
          </div>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={14} /> Nueva cotización
        </button>
      </div>

      {/* Stats rápidas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Borradores',  value: porEstado.borrador  || 0, cls: 'text-gray-600' },
          { label: 'Enviadas',    value: porEstado.enviada   || 0, cls: 'text-blue-600' },
          { label: 'Aprobadas',   value: porEstado.aprobada  || 0, cls: 'text-green-600' },
          { label: 'Ganado',      value: fmtCOP(aprobadas),        cls: 'text-brand' },
        ].map(({ label, value, cls }) => (
          <div key={label} className="card p-3 text-center">
            <p className={`text-xl font-bold ${cls}`}>{value}</p>
            <p className="text-xs text-gray-400">{label}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
          <input className="input pl-9 text-sm" placeholder="Buscar cliente, teléfono…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1.5">
          {[
            { key: '', label: 'Todas' },
            ...Object.entries(ESTADO_CONFIG).map(([k, v]) => ({ key: k, label: v.label })),
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
        <button onClick={() => qc.invalidateQueries(['cotizaciones'])}
          className="text-gray-400 hover:text-brand p-1.5 rounded-lg hover:bg-brand/5">
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Tabla */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-500 w-16">#</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Cliente</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Línea</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500">Items</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500">Total</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Estado</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Fecha</th>
              <th className="px-3 py-3 w-16"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading && <tr><td colSpan={8} className="py-8 text-center text-gray-400">Cargando…</td></tr>}
            {!isLoading && !cotizaciones.length && (
              <tr><td colSpan={8} className="py-12 text-center text-gray-400">
                <ClipboardList size={32} className="mx-auto mb-2 opacity-20" />
                <p>Sin cotizaciones aún</p>
                <p className="text-xs mt-1">Crea una cotización para comenzar</p>
              </td></tr>
            )}
            {cotizaciones.map(c => {
              const est = ESTADO_CONFIG[c.estado] || ESTADO_CONFIG.borrador
              return (
                <tr key={c._id} className="hover:bg-gray-50/50 cursor-pointer" onClick={() => setViendo(c)}>
                  <td className="px-4 py-3 font-mono text-gray-400 text-xs">#{c.numero}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{c.contactName || '—'}</p>
                    {c.phone && <p className="text-xs text-gray-400 font-mono">{c.phone}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{c.tenantId?.nombre || '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{c.items?.length || 0}</td>
                  <td className="px-4 py-3 text-right font-semibold text-brand">{fmtCOP(c.total)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${est.cls}`}>{est.label}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{fmtDate(c.createdAt)}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <button onClick={() => setViendo(c)}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-brand hover:bg-brand/5 transition-colors">
                        <Eye size={13} />
                      </button>
                      <button onClick={() => setEditando(c)}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                        <Pencil size={13} />
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
  )
}
