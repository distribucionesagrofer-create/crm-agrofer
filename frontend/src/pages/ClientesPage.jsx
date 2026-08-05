import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, Search, AlertTriangle, CheckCircle, X, MapPin, Phone, Trash2, Square, CheckSquare, UserPlus, Link2, ChevronDown, ChevronUp, Pencil, MessageSquare, CheckSquare as TaskIcon, User, ExternalLink, Clock, RefreshCw, Loader2 } from 'lucide-react'
import * as XLSX from 'xlsx'
import api from '../services/api'

// Formatea número colombiano: 573181156002 → +57 318 115 6002
function formatPhone(phone) {
  if (!phone) return '—'
  const p = String(phone).replace(/\D/g, '')  // solo dígitos
  if (!p) return '—'
  if (p.startsWith('57') && p.length === 12) {
    const local = p.slice(2)
    return `+57 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`
  }
  if (p.length === 10 && p.startsWith('3')) {
    return `${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}`
  }
  if (p.length > 0) return p  // devolver dígitos limpios, nunca el string corrupto original
  return '—'
}

function ImportModal({ onClose }) {
  const [rows, setRows]       = useState([])
  const [preview, setPreview] = useState(false)
  const [result, setResult]   = useState(null)
  const [error, setError]     = useState('')
  const fileRef = useRef()
  const qc = useQueryClient()

  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target.result, { type: 'binary' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(ws, { defval: '' })
      setRows(data)
      setPreview(true)
      setError('')
    }
    reader.readAsBinaryString(file)
  }

  const importar = useMutation({
    mutationFn: () => api.post('/clientes/importar', {
      clientes: rows.map(r => ({
        name:         String(r.nombre || r.name || r.Nombre || r.NOMBRE || '').trim(),
        phone:        String(r.telefono || r.phone || r.Telefono || r.TELEFONO || r.celular || r.Celular || ''),
        zona:         String(r.zona || r.Zona || r.ZONA || '').trim(),
        vendedor:     String(r.vendedor || r.Vendedor || r.VENDEDOR || '').trim(),
      }))
    }),
    onSuccess: (res) => { setResult(res); qc.invalidateQueries(['clientes']) },
    onError: (e) => setError(e?.error || 'Error al importar'),
  })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg">Importar clientes desde Excel</h3>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>

        {!preview && !result && (
          <>
            <div onClick={() => fileRef.current.click()}
              className="border-2 border-dashed border-gray-200 rounded-xl p-10 text-center cursor-pointer hover:border-brand hover:bg-brand/5 transition-colors">
              <Upload size={28} className="text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-600">Haz clic para seleccionar el archivo Excel</p>
              <p className="text-xs text-gray-400 mt-1">.xlsx, .xls, .csv</p>
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />

            <div className="mt-4 p-3 bg-blue-50 rounded-lg text-xs text-blue-700 space-y-1">
              <p className="font-semibold">Columnas del Excel (los nombres exactos):</p>
              <div className="grid grid-cols-2 gap-1 mt-1">
                {[['nombre','Nombre completo'],['telefono','Número colombiano'],['zona','Zona del cliente'],['vendedor','Nombre del vendedor']].map(([col, desc]) => (
                  <div key={col} className="flex items-center gap-1">
                    <code className="bg-blue-100 px-1 rounded text-blue-800">{col}</code>
                    <span className="text-blue-600">→ {desc}</span>
                  </div>
                ))}
              </div>
              <p className="text-blue-500 mt-1">Teléfono: acepta <code className="bg-blue-100 px-1 rounded">3181156002</code> o <code className="bg-blue-100 px-1 rounded">573181156002</code></p>
            </div>
          </>
        )}

        {preview && !result && (
          <>
            <p className="text-sm text-gray-600 mb-3"><strong>{rows.length}</strong> filas encontradas. Primeras 5:</p>
            <div className="overflow-x-auto mb-4 max-h-48 overflow-y-auto border rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>{Object.keys(rows[0] || {}).map(k => <th key={k} className="px-3 py-2 text-left text-gray-500 font-medium">{k}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((r, i) => (
                    <tr key={i} className="border-t border-gray-50">
                      {Object.values(r).map((v, j) => <td key={j} className="px-3 py-2 text-gray-700 truncate max-w-32">{String(v)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {error && <p className="text-xs text-red-600 mb-3 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => { setPreview(false); setRows([]) }} className="btn-secondary flex-1">Atrás</button>
              <button onClick={() => importar.mutate()} disabled={importar.isPending} className="btn-primary flex-1 disabled:opacity-40">
                {importar.isPending ? 'Importando…' : `Importar ${rows.length} clientes`}
              </button>
            </div>
          </>
        )}

        {result && (
          <div className="text-center py-4 space-y-4">
            <CheckCircle size={44} className="text-green-500 mx-auto" />
            <p className="font-semibold text-lg">Importación completada</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-green-50 rounded-lg p-3">
                <p className="text-2xl font-bold text-green-600">{result.importados}</p>
                <p className="text-xs text-gray-500">Nuevos</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-2xl font-bold text-blue-600">{result.duplicados}</p>
                <p className="text-xs text-gray-500">Actualizados</p>
              </div>
              <div className="bg-red-50 rounded-lg p-3">
                <p className="text-2xl font-bold text-red-500">{result.errores}</p>
                <p className="text-xs text-gray-500">Errores</p>
              </div>
            </div>
            {result.errores > 0 && (
              <p className="text-xs text-gray-400">Los errores suelen ser números inválidos o no colombianos</p>
            )}
            <button onClick={onClose} className="btn-primary w-full">Cerrar</button>
          </div>
        )}
      </div>
    </div>
  )
}

function VinculacionPanel({ onFiltrar }) {
  const [abierto, setAbierto] = useState(true)
  const { data, isLoading } = useQuery({
    queryKey: ['vinculacion-stats'],
    queryFn: () => api.get('/clientes/stats-vinculacion'),
    refetchInterval: 30_000,
  })

  const stats          = data?.stats || []
  const totalGlobal    = data?.totalGlobal || 0
  const vinculadosG    = data?.vinculadosGlobal || 0
  const pendientesG    = totalGlobal - vinculadosG
  const porcentajeG    = totalGlobal > 0 ? Math.round((vinculadosG / totalGlobal) * 100) : 0

  if (!totalGlobal && !isLoading) return null

  return (
    <div className="card p-0 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setAbierto(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-3">
          <Link2 size={16} className="text-brand" />
          <span className="font-semibold text-sm">Progreso de vinculación de contactos</span>
          <span className="text-xs text-gray-400">{vinculadosG}/{totalGlobal} clientes con teléfono</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Barra global */}
          <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-brand rounded-full transition-all" style={{ width: `${porcentajeG}%` }} />
          </div>
          <span className="text-xs font-bold text-brand w-8 text-right">{porcentajeG}%</span>
          {abierto ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
        </div>
      </button>

      {abierto && (
        <div className="px-5 pb-4 border-t border-gray-50">
          {isLoading ? (
            <p className="text-sm text-gray-400 py-3">Cargando estadísticas…</p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-3">
                {stats.map(s => (
                  <button
                    key={s.vendedor._id}
                    onClick={() => onFiltrar(s.vendedor._id, s.pendientes > 0)}
                    className="text-left bg-gray-50 hover:bg-brand/5 border border-gray-100 hover:border-brand/20 rounded-xl p-3 transition-colors group">
                    <div className="flex items-center justify-between mb-2">
                      <p className={`text-xs font-semibold truncate max-w-[80%] ${s.vendedor.slug === 'linea-principal' ? 'text-brand' : 'text-gray-700'}`}>
                        {s.vendedor.nombre}
                      </p>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                        s.porcentaje === 100 ? 'bg-green-100 text-green-700' :
                        s.porcentaje >= 50  ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-600'
                      }`}>{s.porcentaje}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden mb-2">
                      <div className={`h-full rounded-full transition-all ${
                        s.porcentaje === 100 ? 'bg-green-500' :
                        s.porcentaje >= 50  ? 'bg-amber-500' : 'bg-red-500'
                      }`} style={{ width: `${s.porcentaje}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] text-gray-500">
                      <span className="text-green-600 font-medium">✓ {s.vinculados} vinculados</span>
                      {s.pendientes > 0 && (
                        <span className="text-red-500 font-medium">{s.pendientes} pendientes</span>
                      )}
                    </div>
                    {s.vendedor.zona && <p className="text-[10px] text-gray-400 mt-1">{s.vendedor.zona}</p>}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-3">
                Haz clic en un vendedor para filtrar sus clientes sin teléfono — esos son los que faltan vincular
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}

const TEMP_OPTS = [
  { value: 'frio',     label: '🔵 Frío' },
  { value: 'tibio',    label: '🟡 Tibio' },
  { value: 'caliente', label: '🔴 Caliente' },
]
const POT_OPTS = [
  { value: 'bajo',  label: 'Bajo' },
  { value: 'medio', label: 'Medio' },
  { value: 'alto',  label: 'Alto' },
]

function NuevoClienteModal({ vendedores, onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: '', empresa: '', phone: '', email: '',
    zona: '', ciudad: '', barrio: '', direccion: '',
    sector: '', temperatura: 'tibio', potencial: 'medio',
    vendedorId: '', notes: '',
  })
  const [error, setError] = useState('')

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const guardar = useMutation({
    mutationFn: () => api.post('/clientes', form),
    onSuccess: () => { qc.invalidateQueries(['clientes']); onClose() },
    onError: (e) => setError(e?.error || 'Error al guardar'),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    if (!form.name.trim())     return setError('El nombre es requerido')
    if (!form.vendedorId)      return setError('Selecciona un vendedor')
    guardar.mutate()
  }

  const inp = 'input text-sm w-full'
  const lbl = 'block text-xs font-medium text-gray-500 mb-1'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <UserPlus size={18} className="text-brand" />
            <h3 className="font-bold text-lg">Nuevo cliente</h3>
          </div>
          <button onClick={onClose}><X size={18} className="text-gray-400 hover:text-gray-600" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Datos principales */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className={lbl}>Nombre del cliente <span className="text-red-500">*</span></label>
              <input className={inp} placeholder="Ej: Esteban Cariño" value={form.name}
                onChange={e => set('name', e.target.value)} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={lbl}>Establecimiento / Empresa</label>
              <input className={inp} placeholder="Ej: Ferretería El Mayor" value={form.empresa}
                onChange={e => set('empresa', e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Teléfono</label>
              <input className={inp} placeholder="573001234567 (opcional)" value={form.phone}
                onChange={e => set('phone', e.target.value)} />
              <p className="text-[10px] text-gray-400 mt-0.5">Sin número = se vinculará automáticamente por nombre de contacto</p>
            </div>
            <div>
              <label className={lbl}>Email</label>
              <input className={inp} type="email" placeholder="correo@ejemplo.com" value={form.email}
                onChange={e => set('email', e.target.value)} />
            </div>
          </div>

          {/* Ubicación */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Ubicación</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Zona</label>
                <input className={inp} placeholder="Ej: Zona Norte" value={form.zona}
                  onChange={e => set('zona', e.target.value)} />
              </div>
              <div>
                <label className={lbl}>Ciudad</label>
                <input className={inp} placeholder="Ej: Bogotá" value={form.ciudad}
                  onChange={e => set('ciudad', e.target.value)} />
              </div>
              <div>
                <label className={lbl}>Barrio</label>
                <input className={inp} placeholder="Ej: Chapinero" value={form.barrio}
                  onChange={e => set('barrio', e.target.value)} />
              </div>
              <div>
                <label className={lbl}>Dirección</label>
                <input className={inp} placeholder="Ej: Cra 7 #45-12" value={form.direccion}
                  onChange={e => set('direccion', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Comercial */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Info comercial</p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={lbl}>Sector</label>
                <input className={inp} placeholder="Ej: Ferretería" value={form.sector}
                  onChange={e => set('sector', e.target.value)} />
              </div>
              <div>
                <label className={lbl}>Temperatura</label>
                <select className={inp} value={form.temperatura} onChange={e => set('temperatura', e.target.value)}>
                  {TEMP_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Potencial</label>
                <select className={inp} value={form.potencial} onChange={e => set('potencial', e.target.value)}>
                  {POT_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Vendedor */}
          <div>
            <label className={lbl}>Vendedor / Línea asignada <span className="text-red-500">*</span></label>
            <select className={inp} value={form.vendedorId} onChange={e => set('vendedorId', e.target.value)}>
              <option value="">Seleccionar vendedor…</option>
              {vendedores.map(v => <option key={v._id} value={v._id}>{v.nombre}{v.zona ? ` · ${v.zona}` : ''}</option>)}
            </select>
          </div>

          {/* Notas */}
          <div>
            <label className={lbl}>Notas internas</label>
            <textarea className="input text-sm w-full resize-none" rows={3}
              placeholder="Observaciones, referencias, etc."
              value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={guardar.isPending} className="btn-primary flex-1 disabled:opacity-40">
              {guardar.isPending ? 'Guardando…' : 'Guardar cliente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EditarClienteModal({ cliente, vendedores, onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name:        cliente.name        || '',
    empresa:     cliente.empresa     || '',
    phone:       cliente.phone       || '',
    email:       cliente.email       || '',
    zona:        cliente.zona        || '',
    ciudad:      cliente.ciudad      || '',
    barrio:      cliente.barrio      || '',
    direccion:   cliente.direccion   || '',
    sector:      cliente.sector      || '',
    temperatura: cliente.temperatura || 'tibio',
    potencial:   cliente.potencial   || 'medio',
    vendedorId:  cliente.vendedorId?._id || cliente.vendedorId || '',
    notes:       cliente.notes       || '',
  })
  const [error, setError] = useState('')
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const guardar = useMutation({
    mutationFn: () => api.patch(`/clientes/${cliente._id}`, form),
    onSuccess: () => { qc.invalidateQueries(['clientes']); onClose() },
    onError: (e) => setError(e?.error || 'Error al guardar'),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    if (!form.name.trim()) return setError('El nombre es requerido')
    guardar.mutate()
  }

  const inp = 'input text-sm w-full'
  const lbl = 'block text-xs font-medium text-gray-500 mb-1'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <Pencil size={18} className="text-brand" />
            <h3 className="font-bold text-lg">Editar cliente</h3>
          </div>
          <button onClick={onClose}><X size={18} className="text-gray-400 hover:text-gray-600" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className={lbl}>Nombre del cliente <span className="text-red-500">*</span></label>
              <input className={inp} value={form.name} onChange={e => set('name', e.target.value)} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={lbl}>Establecimiento / Empresa</label>
              <input className={inp} value={form.empresa} onChange={e => set('empresa', e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Teléfono</label>
              <input className={inp} value={form.phone} onChange={e => set('phone', e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Email</label>
              <input className={inp} type="email" value={form.email} onChange={e => set('email', e.target.value)} />
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Ubicación</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Zona</label>
                <input className={inp} value={form.zona} onChange={e => set('zona', e.target.value)} />
              </div>
              <div>
                <label className={lbl}>Ciudad</label>
                <input className={inp} value={form.ciudad} onChange={e => set('ciudad', e.target.value)} />
              </div>
              <div>
                <label className={lbl}>Barrio</label>
                <input className={inp} value={form.barrio} onChange={e => set('barrio', e.target.value)} />
              </div>
              <div>
                <label className={lbl}>Dirección</label>
                <input className={inp} value={form.direccion} onChange={e => set('direccion', e.target.value)} />
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Info comercial</p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={lbl}>Sector</label>
                <input className={inp} value={form.sector} onChange={e => set('sector', e.target.value)} />
              </div>
              <div>
                <label className={lbl}>Temperatura</label>
                <select className={inp} value={form.temperatura} onChange={e => set('temperatura', e.target.value)}>
                  {TEMP_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Potencial</label>
                <select className={inp} value={form.potencial} onChange={e => set('potencial', e.target.value)}>
                  {POT_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className={lbl}>Vendedor / Línea asignada</label>
            <select className={inp} value={form.vendedorId} onChange={e => set('vendedorId', e.target.value)}>
              <option value="">Seleccionar vendedor…</option>
              {vendedores.map(v => <option key={v._id} value={v._id}>{v.nombre}{v.zona ? ` · ${v.zona}` : ''}</option>)}
            </select>
          </div>

          <div>
            <label className={lbl}>Notas internas</label>
            <textarea className="input text-sm w-full resize-none" rows={3}
              value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={guardar.isPending} className="btn-primary flex-1 disabled:opacity-40">
              {guardar.isPending ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function fmtTimeAgo(date) {
  if (!date) return null
  const d = new Date(date), now = new Date()
  const diff = Math.floor((now - d) / 86400000)
  if (diff === 0) return 'Hoy'
  if (diff === 1) return 'Ayer'
  if (diff < 7)  return `${diff}d`
  return d.toLocaleDateString('es', { day: '2-digit', month: 'short' })
}

function ClientePerfilModal({ cliente, onClose, onEditar }) {
  const { data, isLoading } = useQuery({
    queryKey: ['cliente-historial', cliente._id],
    queryFn: () => api.get(`/clientes/${cliente._id}/historial`),
    staleTime: 30000,
  })

  const hist = data
  const TEMP_COLORS = { frio: 'bg-blue-100 text-blue-700', tibio: 'bg-yellow-100 text-yellow-700', caliente: 'bg-red-100 text-red-600' }
  const POT_COLORS  = { bajo: 'bg-gray-100 text-gray-500', medio: 'bg-brand/10 text-brand', alto: 'bg-green-100 text-green-700' }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-5 border-b border-gray-100">
          <div className="w-12 h-12 rounded-full bg-brand/10 flex items-center justify-center font-bold text-brand text-lg shrink-0">
            {cliente.name?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-lg leading-tight">{cliente.name}</h3>
            {cliente.empresa && <p className="text-sm text-gray-400">{cliente.empresa}</p>}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {cliente.phone && (
                <span className="text-xs text-gray-500 font-mono flex items-center gap-1"><Phone size={10}/> {formatPhone(cliente.phone)}</span>
              )}
              {cliente.zona && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{cliente.zona}</span>}
              {cliente.temperatura && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TEMP_COLORS[cliente.temperatura] || ''}`}>
                  {cliente.temperatura === 'frio' ? '🔵' : cliente.temperatura === 'tibio' ? '🟡' : '🔴'} {cliente.temperatura}
                </span>
              )}
              {cliente.potencial && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${POT_COLORS[cliente.potencial] || ''}`}>
                  Potencial {cliente.potencial}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => onEditar(cliente)} className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5">
              <Pencil size={12} /> Editar
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={18} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {isLoading && (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-gray-50 rounded-xl animate-pulse" />)}
            </div>
          )}

          {hist && (
            <>
              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { icon: MessageSquare, label: 'Conversaciones', value: hist.stats.totalConvs, color: 'text-blue-600' },
                  { icon: Clock, label: 'Mensajes totales', value: hist.stats.totalMsgs, color: 'text-violet-600' },
                  { icon: TaskIcon, label: 'Tareas pendientes', value: hist.stats.tareasAbiertas, color: 'text-amber-600' },
                ].map(({ icon: Icon, label, value, color }) => (
                  <div key={label} className="bg-gray-50 rounded-xl px-3 py-3 text-center">
                    <Icon size={16} className={`mx-auto mb-1 ${color}`} />
                    <p className={`text-xl font-bold ${color}`}>{value}</p>
                    <p className="text-xs text-gray-400">{label}</p>
                  </div>
                ))}
              </div>

              {/* Conversaciones */}
              {hist.conversaciones.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <MessageSquare size={12} /> Conversaciones recientes
                  </h4>
                  <div className="space-y-2">
                    {hist.conversaciones.map(c => {
                      const isOpen = c.status === 'open'
                      const msg = c.lastMessage
                      return (
                        <div key={c._id} className="flex items-start gap-3 bg-gray-50 rounded-xl px-3 py-2.5">
                          <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${isOpen ? 'bg-green-500' : 'bg-gray-300'}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-medium text-gray-700">
                                {isOpen ? 'Abierta' : 'Cerrada'}
                                {c.tenantId && <span className="ml-1 text-gray-400">· {fmtTimeAgo(c.lastMessageAt)}</span>}
                              </p>
                              {c.etiquetas?.length > 0 && (
                                <div className="flex gap-1">
                                  {c.etiquetas.slice(0,2).map(t => (
                                    <span key={t} className="text-[9px] bg-brand/10 text-brand px-1.5 py-0.5 rounded-full">{t}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                            {msg && (
                              <p className="text-xs text-gray-500 truncate mt-0.5">
                                {msg.direction === 'outbound' ? 'Tú: ' : ''}{msg.content || '[media]'}
                              </p>
                            )}
                          </div>
                          <a href={`/inbox?c=${c._id}`} target="_blank" rel="noreferrer"
                            className="text-gray-300 hover:text-brand transition-colors shrink-0">
                            <ExternalLink size={13} />
                          </a>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Tareas */}
              {hist.tareas.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <TaskIcon size={12} /> Tareas
                  </h4>
                  <div className="space-y-1.5">
                    {hist.tareas.map(t => (
                      <div key={t._id} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg ${
                        t.estado === 'completada' ? 'opacity-50' : 'bg-gray-50'
                      }`}>
                        <div className={`w-2 h-2 rounded-full shrink-0 ${
                          t.prioridad === 'alta' ? 'bg-red-500' : t.prioridad === 'media' ? 'bg-yellow-400' : 'bg-gray-300'
                        }`} />
                        <p className={`text-xs flex-1 ${t.estado === 'completada' ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                          {t.descripcion}
                        </p>
                        <span className="text-[10px] text-gray-400 shrink-0">{fmtTimeAgo(t.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Datos del sistema principal */}
              {cliente.idSistemaPrincipal && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <ExternalLink size={12} /> Datos sistema principal
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'NIT',                 valor: cliente.nit },
                      { label: 'ID Sistema',           valor: cliente.idSistemaPrincipal },
                      { label: 'Ciudad',               valor: cliente.ciudad },
                      { label: 'Departamento',         valor: cliente.departamento },
                      { label: 'Barrio',               valor: cliente.barrio },
                      { label: 'Dirección',            valor: cliente.direccion },
                      { label: 'Representante Legal',  valor: cliente.representanteLegal },
                      { label: 'Email',                valor: cliente.email },
                      { label: 'Cupo de Crédito',      valor: cliente.cupoCredito ? `$${Number(cliente.cupoCredito).toLocaleString('es-CO')}` : null },
                      { label: 'Plazo',                valor: cliente.plazo ? `${cliente.plazo} días` : null },
                    ].filter(f => f.valor).map(f => (
                      <div key={f.label} className="bg-gray-50 rounded-xl px-3 py-2">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase">{f.label}</p>
                        <p className="text-xs text-gray-700 mt-0.5 truncate">{f.valor}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notas del cliente */}
              {cliente.notes && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Notas</h4>
                  <p className="text-sm text-gray-600 bg-gray-50 rounded-xl px-3 py-2.5 whitespace-pre-wrap">{cliente.notes}</p>
                </div>
              )}

              {hist.conversaciones.length === 0 && hist.tareas.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  <User size={28} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Sin actividad registrada</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ClientesPage() {
  const [search, setSearch]           = useState('')
  const [filtroZona, setFiltroZona]   = useState('')
  const [filtroVendedor, setFiltroVendedor] = useState('')
  const [filtroPais, setFiltroPais]       = useState('')
  const [sinContactar, setSinContactar]   = useState(false)
  const [showImport, setShowImport]   = useState(false)
  const [showNuevo, setShowNuevo]     = useState(false)
  const [page, setPage] = useState(1)
  const [seleccionados, setSeleccionados] = useState(new Set())
  const [confirmLimpiar, setConfirmLimpiar] = useState(false)
  const [clienteEditando, setClienteEditando] = useState(null)
  const [clientePerfil, setClientePerfil]   = useState(null)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['clientes', search, filtroZona, filtroVendedor, filtroPais, sinContactar, page],
    queryFn: () => {
      const params = new URLSearchParams({
        search, zona: filtroZona, vendedorId: filtroVendedor, pais: filtroPais,
        sinContactar: sinContactar ? 'true' : 'false',
        page, limit: 50
      })
      return api.get(`/clientes?${params}`)
    },
    keepPreviousData: true,
  })

  const { data: vData } = useQuery({
    queryKey: ['vendedores-lista'],
    queryFn: () => api.get('/vendedores'),
  })

  const clientes   = data?.customers || []
  const total      = data?.total ?? 0
  const vendedores = vData?.vendedores || []
  const zonas = [...new Set(vendedores.map(v => v.zona).filter(Boolean))].sort()

  const eliminarMasivo = useMutation({
    mutationFn: (ids) => api.post('/clientes/eliminar-masivo', { ids: [...ids] }),
    onSuccess: () => { setSeleccionados(new Set()); qc.invalidateQueries(['clientes']) },
  })

  const limpiarSinTelefono = useMutation({
    mutationFn: () => api.delete('/clientes/limpiar/sin-telefono'),
    onSuccess: (r) => { alert(`Eliminados ${r.eliminados} clientes sin teléfono`); setConfirmLimpiar(false); qc.invalidateQueries(['clientes']) },
  })

  const [syncResult, setSyncResult] = useState(null)
  const sincronizar = useMutation({
    mutationFn: () => api.post('/clientes/sync-sistema-principal', {}),
    onSuccess: (r) => { setSyncResult(r); qc.invalidateQueries(['clientes']) },
    onError: (e) => alert('Error al sincronizar: ' + (e?.error || e?.message || 'Error')),
  })

  const toggleSeleccion = (id) => {
    setSeleccionados(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleTodos = () => {
    if (seleccionados.size === clientes.length) setSeleccionados(new Set())
    else setSeleccionados(new Set(clientes.map(c => c._id)))
  }

  return (
    <div className="p-6 space-y-5">
      {showImport && <ImportModal onClose={() => { setShowImport(false); qc.invalidateQueries(['clientes']) }} />}
      {showNuevo && <NuevoClienteModal vendedores={vendedores} onClose={() => setShowNuevo(false)} />}
      {clienteEditando && <EditarClienteModal cliente={clienteEditando} vendedores={vendedores} onClose={() => setClienteEditando(null)} />}
      {clientePerfil && (
        <ClientePerfilModal
          cliente={clientePerfil}
          onClose={() => setClientePerfil(null)}
          onEditar={(c) => { setClientePerfil(null); setClienteEditando(c) }}
        />
      )}


      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold">Clientes</h2>
          <p className="text-sm text-gray-400">{total.toLocaleString('es')} en base de datos</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {seleccionados.size > 0 && (
            <button
              onClick={() => { if (confirm(`¿Eliminar ${seleccionados.size} clientes seleccionados?`)) eliminarMasivo.mutate(seleccionados) }}
              className="flex items-center gap-2 text-sm px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium">
              <Trash2 size={14} /> Eliminar {seleccionados.size} seleccionados
            </button>
          )}
          <button
            onClick={() => setConfirmLimpiar(v => !v)}
            className="flex items-center gap-2 text-sm px-3 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50">
            <Trash2 size={14} /> Limpiar BD
          </button>
          <button
            onClick={() => { if (confirm('¿Sincronizar clientes desde el sistema principal? Esto puede tardar 1-2 minutos.')) sincronizar.mutate() }}
            disabled={sincronizar.isPending}
            className="flex items-center gap-2 text-sm px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium">
            {sincronizar.isPending
              ? <><Loader2 size={14} className="animate-spin" /> Sincronizando…</>
              : <><RefreshCw size={14} /> Sincronizar sistema principal</>}
          </button>
          <button onClick={() => setShowNuevo(true)} className="btn-secondary flex items-center gap-2">
            <UserPlus size={15} /> Nuevo cliente
          </button>
          <button onClick={() => setShowImport(true)} className="btn-primary flex items-center gap-2">
            <Upload size={15} /> Importar Excel
          </button>
        </div>
      </div>

      {/* Resultado sincronización */}
      {syncResult && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center justify-between">
          <div className="text-sm text-green-800">
            <span className="font-bold">✅ Sincronización completada</span>
            {' — '}Total: <strong>{syncResult.total}</strong> ·
            Creados: <strong>{syncResult.creados}</strong> ·
            Actualizados: <strong>{syncResult.actualizados}</strong>
          </div>
          <button onClick={() => setSyncResult(null)} className="text-green-500 hover:text-green-700 ml-4">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Panel de limpieza */}
      {confirmLimpiar && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-red-700">Opciones de limpieza de base de datos</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => { if (confirm('¿Eliminar todos los clientes sin teléfono? (contactos de grupos/pruebas)')) limpiarSinTelefono.mutate() }}
              className="text-xs bg-red-100 text-red-700 px-3 py-2 rounded-lg hover:bg-red-200 font-medium">
              Eliminar clientes sin teléfono (grupos/pruebas)
            </button>
            <button onClick={() => setConfirmLimpiar(false)} className="text-xs text-gray-500 px-3 py-2 rounded-lg hover:bg-gray-100">
              Cancelar
            </button>
          </div>
          <p className="text-xs text-red-500">⚠ Esta acción no se puede deshacer</p>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
          <input className="input pl-9 text-sm" placeholder="Buscar nombre o teléfono…"
            value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>

        <select className="input text-sm w-44" value={filtroZona}
          onChange={e => { setFiltroZona(e.target.value); setPage(1) }}>
          <option value="">Todas las zonas</option>
          {zonas.map(z => <option key={z} value={z}>{z}</option>)}
        </select>

        <select className="input text-sm w-48" value={filtroVendedor}
          onChange={e => { setFiltroVendedor(e.target.value); setPage(1) }}>
          <option value="">Todos los vendedores</option>
          <option value="sin-asignar">Sin vendedor asignado (cliente final)</option>
          {vendedores.map(v => <option key={v._id} value={v._id}>{v.nombre}</option>)}
        </select>

        <select className="input text-sm w-40" value={filtroPais}
          onChange={e => { setFiltroPais(e.target.value); setPage(1) }}>
          <option value="">Todos los países</option>
          <option value="CO">🇨🇴 Colombia</option>
          <option value="VE">🇻🇪 Venezuela</option>
          <option value="otro">Otro</option>
        </select>

        <button onClick={() => { setSinContactar(v => !v); setPage(1) }}
          className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg border font-medium transition-colors ${
            sinContactar ? 'bg-amber-500 text-white border-amber-500' : 'border-gray-200 text-gray-500 hover:border-amber-300'
          }`}>
          <AlertTriangle size={14} /> Sin contactar (+30d)
        </button>
      </div>

      {/* Tabla */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-4 py-3 w-8">
                <button onClick={toggleTodos} className="text-gray-400 hover:text-brand">
                  {seleccionados.size === clientes.length && clientes.length > 0
                    ? <CheckSquare size={16} className="text-brand" />
                    : <Square size={16} />}
                </button>
              </th>
              <th className="text-left px-5 py-3 font-medium text-gray-500">Nombre del cliente</th>
              <th className="text-left px-5 py-3 font-medium text-gray-500">Establecimiento</th>
              <th className="text-left px-5 py-3 font-medium text-gray-500">
                <span className="flex items-center gap-1"><Phone size={13} /> Teléfono</span>
              </th>
              <th className="text-left px-5 py-3 font-medium text-gray-500">
                <span className="flex items-center gap-1"><MapPin size={13} /> Zona</span>
              </th>
              <th className="text-left px-5 py-3 font-medium text-gray-500">Vendedor</th>
              <th className="text-left px-5 py-3 font-medium text-gray-500">Último contacto</th>
              <th className="px-3 py-3 w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading && (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400">Cargando…</td></tr>
            )}
            {!isLoading && !clientes.length && (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-gray-400">
                {sinContactar ? 'Todos los clientes han sido contactados ✅' : 'Sin clientes aún — importa un Excel para comenzar'}
              </td></tr>
            )}
            {clientes.map(c => {
              const dias = c.lastContactAt
                ? Math.floor((Date.now() - new Date(c.lastContactAt)) / 86400000)
                : null
              const sel = seleccionados.has(c._id)
              return (
                <tr key={c._id} className={`hover:bg-gray-50/50 ${sel ? 'bg-brand/5' : ''}`}>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleSeleccion(c._id)} className="text-gray-400 hover:text-brand">
                      {sel ? <CheckSquare size={15} className="text-brand" /> : <Square size={15} />}
                    </button>
                  </td>
                  <td className="px-5 py-3">
                    <button onClick={() => setClientePerfil(c)}
                      className="font-medium text-sm text-left hover:text-brand transition-colors">
                      {c.pais === 'VE' && <span title="Venezuela" className="mr-1">🇻🇪</span>}
                      {c.name}
                    </button>
                    {c.ciudad && <p className="text-xs text-gray-400">{c.ciudad}{c.barrio ? ` · ${c.barrio}` : ''}</p>}
                  </td>
                  <td className="px-5 py-3">
                    {c.empresa ? (
                      <span className="text-xs font-medium text-gray-700">
                        {c.empresa}
                        {c.empresa.toUpperCase() === c.name?.toUpperCase() && (
                          <span className="ml-1.5 text-[9px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full font-normal">mismo</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-gray-600 font-mono text-xs">{formatPhone(c.phone)}</td>
                  <td className="px-5 py-3">
                    {c.zona
                      ? <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{c.zona}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-5 py-3 text-xs">
                    {c.vendedorId?.nombre
                      ? <span className="text-gray-500">{c.vendedorId.nombre}</span>
                      : <span className="text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium">Cliente final</span>}
                  </td>
                  <td className="px-5 py-3">
                    {dias === null
                      ? <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Sin contactar</span>
                      : dias > 30
                        ? <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{dias}d atrás</span>
                        : <span className="text-xs text-gray-400">{dias === 0 ? 'Hoy' : `${dias}d atrás`}</span>
                    }
                  </td>
                  <td className="px-3 py-3">
                    <button onClick={() => setClienteEditando(c)}
                      className="text-gray-300 hover:text-brand transition-colors">
                      <Pencil size={14} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>Página {page} · {total.toLocaleString('es')} clientes</span>
        <div className="flex gap-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="btn-secondary py-1 px-3 disabled:opacity-40">Anterior</button>
          <button onClick={() => setPage(p => p + 1)} disabled={clientes.length < 50}
            className="btn-secondary py-1 px-3 disabled:opacity-40">Siguiente</button>
        </div>
      </div>
    </div>
  )
}
