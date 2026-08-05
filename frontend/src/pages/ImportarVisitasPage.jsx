import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import { Upload, CheckCircle, AlertTriangle, MapPin, Users, FileSpreadsheet, ArrowRight, RefreshCw } from 'lucide-react'
import api from '../services/api'

export default function ImportarVisitasPage() {
  const [step, setStep]           = useState('upload')  // upload | preview | confirm | done
  const [preview, setPreview]     = useState(null)
  const [rawFilas, setRawFilas]   = useState([])
  const [mapeo, setMapeo]         = useState({})  // repLimpio → vendedorId
  const [resultado, setResultado] = useState(null)
  const [loading, setLoading]     = useState(false)

  const { data: vData } = useQuery({
    queryKey: ['vendedores-lista'],
    queryFn: () => api.get('/vendedores'),
  })
  const vendedores = (vData?.vendedores || []).filter(v => v.slug !== 'linea-principal')

  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setLoading(true)
    const reader = new FileReader()
    reader.onload = async (ev) => {
      try {
        const wb   = XLSX.read(ev.target.result, { type: 'binary', cellDates: false })
        const ws   = wb.Sheets[wb.SheetNames[0]]
        const filas = XLSX.utils.sheet_to_json(ws, { defval: '' })

        if (!filas.length) { alert('El archivo está vacío'); setLoading(false); return }

        // Mostrar columnas detectadas para debug
        const cols = Object.keys(filas[0] || {})
        console.log('Columnas detectadas:', cols)
        console.log('Primera fila:', filas[0])

        setRawFilas(filas)
        const prev = await api.post('/importar-visitas/preview', { filas })

        console.log('Preview response:', prev)

        setPreview(prev)
        // Inicializar mapeo con lo que detectó automáticamente
        const m = {}
        for (const v of (prev.vendedoresDetectados || [])) {
          m[v.limpio] = v.vendedorId || ''
        }
        setMapeo(m)
        setStep('preview')
      } catch (err) {
        console.error('Error completo:', err)
        let msg = 'Error desconocido'
        if (typeof err === 'string')       msg = err
        else if (err?.error)               msg = err.error
        else if (err?.message)             msg = err.message
        else if (err?.status === 413)      msg = 'El archivo es demasiado grande. Intenta con un rango menor de fechas.'
        else                               msg = JSON.stringify(err) || msg
        alert('Error: ' + msg)
      }
      setLoading(false)
    }
    reader.readAsBinaryString(file)
    e.target.value = ''
  }

  const confirmar = async () => {
    setLoading(true)
    try {
      const res = await api.post('/importar-visitas/confirmar', {
        filas: rawFilas,
        mapeoVendedores: mapeo,
      })
      setResultado(res)
      setStep('done')
    } catch (err) {
      alert('Error importando: ' + (err?.error || err.message))
    }
    setLoading(false)
  }

  const reset = () => { setStep('upload'); setPreview(null); setRawFilas([]); setMapeo({}); setResultado(null) }

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-brand/10 rounded-xl"><FileSpreadsheet size={20} className="text-brand" /></div>
        <div>
          <h2 className="text-xl font-bold">Importar desde Reporte de Visitas</h2>
          <p className="text-sm text-gray-400">Carga el Excel del sistema externo para poblar la base de clientes con ubicaciones reales</p>
        </div>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center gap-2 text-xs">
        {[['upload','1. Subir Excel'],['preview','2. Revisar'],['done','3. Listo']].map(([s, l], i) => (
          <div key={s} className="flex items-center gap-2">
            <span className={`px-2.5 py-1 rounded-full font-semibold ${step === s ? 'bg-brand text-white' : (step === 'done' || (step === 'preview' && s === 'upload') || (step === 'confirm' && s !== 'done')) ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>{l}</span>
            {i < 2 && <ArrowRight size={12} className="text-gray-300" />}
          </div>
        ))}
      </div>

      {/* STEP 1: Upload */}
      {step === 'upload' && (
        <div className="space-y-4">
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-brand/30 rounded-2xl py-14 bg-brand/5 cursor-pointer hover:border-brand hover:bg-brand/10 transition-all">
            <Upload size={36} className="text-brand/50 mb-3" />
            <p className="text-base font-semibold text-brand">Selecciona el reporte de visitas (.xlsx)</p>
            <p className="text-xs text-gray-400 mt-1">Columnas esperadas: nombrecliente, establecimiento, representante, ciudad, barrio, ubicacion, fecha_visita</p>
            {loading && <p className="mt-4 text-brand font-medium flex items-center gap-2"><RefreshCw size={14} className="animate-spin" /> Analizando…</p>}
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} disabled={loading} />
          </label>

          <div className="p-4 bg-blue-50 rounded-xl text-xs text-blue-700 space-y-1">
            <p className="font-semibold">¿Qué hace esta importación?</p>
            <p>• Lee cada visita única (un cliente = un registro aunque tenga múltiples visitas)</p>
            <p>• Si el mismo cliente fue visitado por 2 vendedores, asigna el más reciente</p>
            <p>• Extrae las coordenadas de ubicación para mostrar en el mapa</p>
            <p>• Si el cliente ya existe en el sistema, actualiza sus datos sin duplicar</p>
          </div>
        </div>
      )}

      {/* STEP 2: Preview */}
      {step === 'preview' && preview && (
        <div className="space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Filas en Excel',     value: preview.totalFilas,       color: 'bg-gray-50 text-gray-700' },
              { label: 'Clientes únicos',    value: preview.clientesUnicos,   color: 'bg-blue-50 text-blue-700' },
              { label: 'Clientes nuevos',    value: preview.nuevos,           color: 'bg-green-50 text-green-700' },
              { label: 'Con coordenadas',    value: preview.conCoordenadas,   color: 'bg-violet-50 text-violet-700' },
            ].map(({ label, value, color }) => (
              <div key={label} className={`rounded-xl px-4 py-3 ${color}`}>
                <p className="text-2xl font-bold">{value?.toLocaleString('es')}</p>
                <p className="text-xs mt-0.5 opacity-70">{label}</p>
              </div>
            ))}
          </div>

          {/* Mapeo de vendedores */}
          <div className="card p-5 space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2"><Users size={15} className="text-brand" /> Vendedores detectados — verifica el mapeo</h3>
            <p className="text-xs text-gray-400">El sistema intentó identificar a qué vendedor corresponde cada nombre del reporte. Corrige si algo está mal.</p>
            <div className="space-y-2">
              {preview.vendedoresDetectados.map(v => (
                <div key={v.limpio} className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700 truncate">{v.original}</p>
                    <p className="text-[10px] text-gray-400">{v.count} clientes</p>
                  </div>
                  <ArrowRight size={14} className="text-gray-300 shrink-0" />
                  <select
                    className="input text-xs py-1.5 w-52 shrink-0"
                    value={mapeo[v.limpio] || ''}
                    onChange={e => setMapeo(m => ({ ...m, [v.limpio]: e.target.value }))}
                  >
                    <option value="">Sin asignar</option>
                    {vendedores.map(vend => (
                      <option key={vend._id} value={vend._id}>{vend.nombre} · {vend.zona}</option>
                    ))}
                  </select>
                  {mapeo[v.limpio]
                    ? <CheckCircle size={16} className="text-green-500 shrink-0" />
                    : <AlertTriangle size={16} className="text-amber-500 shrink-0" />}
                </div>
              ))}
            </div>
            {preview.vendedoresDetectados.filter(v => !mapeo[v.limpio]).length > 0 && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle size={12} /> Los vendedores sin asignar quedarán sin vendedor asignado en el sistema
              </p>
            )}
          </div>

          {/* Muestra de clientes */}
          <div className="card p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <p className="text-sm font-semibold">Muestra de clientes a importar (primeros 10)</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {['Nombre','Negocio','Ciudad','Vendedor asignado','Coordenadas'].map(h => (
                      <th key={h} className="text-left px-3 py-2 font-medium text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {preview.muestra.map((c, i) => (
                    <tr key={i} className="hover:bg-gray-50/50">
                      <td className="px-3 py-2 font-medium">{c.nombre}</td>
                      <td className="px-3 py-2 text-gray-500">{c.empresa || '—'}</td>
                      <td className="px-3 py-2 text-gray-500">{c.ciudad}{c.barrio ? ` · ${c.barrio}` : ''}</td>
                      <td className="px-3 py-2">
                        {mapeo[c.repLimp]
                          ? <span className="text-green-600 font-medium">{vendedores.find(v => v._id === mapeo[c.repLimp])?.nombre?.split(' ')[0]}</span>
                          : <span className="text-amber-500">{c.repLimp?.split(' ')[0] || '—'}</span>}
                      </td>
                      <td className="px-3 py-2">
                        {c.lat && c.lng
                          ? <span className="flex items-center gap-1 text-green-600"><MapPin size={11} /> {c.lat.toFixed(4)}, {c.lng.toFixed(4)}</span>
                          : <span className="text-gray-300">Sin coordenadas</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Botones */}
          <div className="flex gap-3">
            <button onClick={reset} className="btn-secondary">Cancelar</button>
            <button onClick={confirmar} disabled={loading}
              className="btn-primary flex items-center gap-2 disabled:opacity-40">
              {loading
                ? <><RefreshCw size={14} className="animate-spin" /> Importando…</>
                : <><CheckCircle size={14} /> Confirmar e importar {preview.clientesUnicos.toLocaleString('es')} clientes</>}
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Done */}
      {step === 'done' && resultado && (
        <div className="card p-8 text-center space-y-5">
          <CheckCircle size={56} className="text-green-500 mx-auto" />
          <div>
            <h3 className="text-xl font-bold text-green-700">¡Importación completada!</h3>
            <p className="text-gray-500 text-sm mt-1">Los clientes ya están en el sistema con sus ubicaciones</p>
          </div>
          <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto">
            <div className="bg-green-50 rounded-xl p-3">
              <p className="text-2xl font-bold text-green-600">{resultado.creados}</p>
              <p className="text-xs text-gray-500">Nuevos</p>
            </div>
            <div className="bg-blue-50 rounded-xl p-3">
              <p className="text-2xl font-bold text-blue-600">{resultado.actualizados}</p>
              <p className="text-xs text-gray-500">Actualizados</p>
            </div>
            <div className="bg-red-50 rounded-xl p-3">
              <p className="text-2xl font-bold text-red-500">{resultado.errores}</p>
              <p className="text-xs text-gray-500">Errores</p>
            </div>
          </div>
          <div className="flex gap-3 justify-center">
            <button onClick={reset} className="btn-secondary">Importar otro</button>
            <a href="/clientes" className="btn-primary">Ver clientes</a>
            <a href="/mapa" className="btn-secondary flex items-center gap-2"><MapPin size={14} /> Ver en mapa</a>
          </div>
        </div>
      )}
    </div>
  )
}
