import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Send, FileText, Users, Sparkles, CheckCircle, History, X,
  ChevronRight, Eye, CalendarClock, AlertTriangle, Loader2,
} from 'lucide-react'
import api from '../services/api'

const PASOS = ['Plantilla', 'Audiencia', 'Personalizar', 'Enviar']

const CAMPO_LABELS = { name: 'Nombre del cliente', empresa: 'Empresa', zona: 'Zona', ciudad: 'Ciudad' }

const ESTADO_CONFIG = {
  pendiente:  { label: 'Pendiente',  color: 'bg-gray-100 text-gray-600' },
  programada: { label: 'Programada', color: 'bg-violet-100 text-violet-700' },
  enviando:   { label: 'Enviando…',  color: 'bg-blue-100 text-blue-700 animate-pulse' },
  completada: { label: 'Completada', color: 'bg-green-100 text-green-700' },
  error:      { label: 'Error',      color: 'bg-red-100 text-red-600' },
}

function StepHeader({ step }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {PASOS.map((p, i) => (
        <div key={p} className="flex items-center gap-2 flex-1">
          <div className={`flex items-center gap-2 ${i + 1 <= step ? 'text-brand' : 'text-gray-300'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
              i + 1 === step ? 'border-brand bg-brand text-white' : i + 1 < step ? 'border-brand text-brand' : 'border-gray-200'
            }`}>{i + 1}</span>
            <span className="text-sm font-medium hidden sm:inline">{p}</span>
          </div>
          {i < PASOS.length - 1 && <div className={`h-px flex-1 ${i + 1 < step ? 'bg-brand' : 'bg-gray-200'}`} />}
        </div>
      ))}
    </div>
  )
}

function MiniBar({ label, value, total, color }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className="flex items-center gap-1.5 min-w-[110px]">
      <span className="text-[10px] text-gray-400 w-14 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-gray-500 w-8 text-right shrink-0">{pct}%</span>
    </div>
  )
}

function HistorialModal({ onClose }) {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['broadcasts-historial'],
    queryFn: () => api.get('/broadcasts'),
    refetchInterval: 8000,
  })
  const broadcasts = data?.broadcasts || []

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-bold text-lg">Historial de broadcasts</h3>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading && <p className="text-center text-gray-400 py-8 text-sm">Cargando…</p>}
          {!isLoading && !broadcasts.length && (
            <p className="text-center text-gray-400 py-8 text-sm">Sin broadcasts aún</p>
          )}
          {broadcasts.map(b => {
            const st = ESTADO_CONFIG[b.estado] || ESTADO_CONFIG.pendiente
            const pct = b.destinatarios > 0 ? Math.round((b.enviados / b.destinatarios) * 100) : 0
            return (
              <button key={b._id} onClick={() => { onClose(); navigate(`/broadcast/${b._id}`) }}
                className="w-full text-left px-6 py-4 border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <p className="font-medium text-sm">{b.nombre}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>{st.label}</span>
                </div>
                <p className="text-xs text-gray-500 mb-2">Plantilla: {b.plantillaNombre} · {b.destinatarios} destinatarios</p>
                <div className="flex items-center gap-4 flex-wrap">
                  <MiniBar label="Entrega" value={b.entregados || 0} total={b.destinatarios} color="bg-indigo-400" />
                  <MiniBar label="Leído"   value={b.leidos || 0}     total={b.destinatarios} color="bg-green-400" />
                  {b.fallidos > 0 && <span className="text-[10px] text-red-500">{b.fallidos} fallidos</span>}
                </div>
                {b.estado === 'enviando' && (
                  <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function BroadcastPage() {
  const [step, setStep] = useState(1)
  const [plantilla, setPlantilla] = useState(null)
  const [segmento, setSegmento] = useState({ zona: '', temperatura: '', potencial: '', sector: '', pais: '', vendedorId: '' })
  const [personalizacion, setPersonalizacion] = useState({}) // { [n]: { tipo, valor } }
  const [nombre, setNombre] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [showHistorial, setShowHistorial] = useState(false)
  const [resultado, setResultado] = useState(null)
  const qc = useQueryClient()

  const { data: plantillasData, isLoading: loadingPlantillas } = useQuery({
    queryKey: ['broadcast-plantillas'],
    queryFn: () => api.get('/broadcasts/plantillas-disponibles'),
  })
  const plantillas = plantillasData?.plantillas || []

  const { data: vendedoresData } = useQuery({
    queryKey: ['vendedores-lista'],
    queryFn: () => api.get('/vendedores'),
  })
  const vendedores = vendedoresData?.vendedores || []
  const zonas = [...new Set(vendedores.map(v => v.zona).filter(Boolean))].sort()

  const { data: variablesData } = useQuery({
    queryKey: ['broadcast-variables', plantilla?._id],
    queryFn: () => api.get(`/broadcasts/plantillas/${plantilla._id}/variables`),
    enabled: !!plantilla?._id && step >= 3,
  })
  const variables = variablesData?.variables || []

  const { data: audienciaData, isFetching: cargandoAudiencia } = useQuery({
    queryKey: ['broadcast-audiencia', segmento],
    queryFn: () => api.get('/broadcasts/audiencia/preview?' + new URLSearchParams(
      Object.fromEntries(Object.entries(segmento).filter(([, v]) => v))
    )),
    enabled: step >= 2,
  })
  const audiencia = audienciaData || { total: 0, muestra: [] }

  const enviar = useMutation({
    mutationFn: () => api.post('/broadcasts', {
      nombre: nombre || undefined,
      plantillaId: plantilla._id,
      segmento,
      personalizacion: variables.map(n => ({
        variable: n,
        tipo: personalizacion[n]?.tipo || 'fijo',
        valor: personalizacion[n]?.valor || '',
      })),
      scheduledAt: scheduledAt || undefined,
    }),
    onSuccess: (res) => {
      setResultado(res)
      qc.invalidateQueries(['broadcasts-historial'])
    },
    onError: (e) => alert(e?.error || 'Error al enviar el broadcast'),
  })

  const previewTexto = useMemo(() => {
    if (!plantilla) return ''
    const ejemplo = audiencia.muestra[0] || {}
    let texto = plantilla.cuerpo
    for (const n of variables) {
      const cfg = personalizacion[n]
      const valor = cfg?.tipo === 'campo' ? (ejemplo[cfg.valor] || `{${CAMPO_LABELS[cfg.valor] || cfg.valor}}`) : (cfg?.valor || '···')
      texto = texto.replace(`{{${n}}}`, valor)
    }
    return texto
  }, [plantilla, variables, personalizacion, audiencia])

  const resetear = () => {
    setStep(1); setPlantilla(null)
    setSegmento({ zona: '', temperatura: '', potencial: '', sector: '', pais: '', vendedorId: '' })
    setPersonalizacion({}); setNombre(''); setScheduledAt(''); setResultado(null)
  }

  if (resultado) return (
    <div className="p-6 flex flex-col items-center justify-center gap-5 text-center" style={{ minHeight: '60vh' }}>
      <CheckCircle size={56} className={resultado.programada ? 'text-violet-500' : 'text-green-500'} />
      <div>
        <h2 className="text-xl font-bold">{resultado.programada ? 'Broadcast programado' : 'Broadcast iniciado'}</h2>
        <p className="text-gray-500 text-sm mt-1 max-w-sm">
          {resultado.programada
            ? `Se enviará a ${resultado.total} contactos el ${new Date(resultado.scheduledAt).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })}.`
            : `Enviando a ${resultado.total} contactos por plantilla de WhatsApp.`}
        </p>
      </div>
      <div className="flex gap-3">
        <button onClick={() => setShowHistorial(true)} className="btn-secondary flex items-center gap-2">
          <History size={14} /> Ver historial
        </button>
        <button onClick={resetear} className="btn-primary">Nuevo broadcast</button>
      </div>
      {showHistorial && <HistorialModal onClose={() => setShowHistorial(false)} />}
    </div>
  )

  return (
    <div className="p-6 max-w-3xl space-y-5">
      {showHistorial && <HistorialModal onClose={() => setShowHistorial(false)} />}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-brand/10 rounded-xl"><Send size={20} className="text-brand" /></div>
          <div>
            <h2 className="text-xl font-bold">Broadcast</h2>
            <p className="text-sm text-gray-400">Envío masivo con plantillas aprobadas de WhatsApp</p>
          </div>
        </div>
        <button onClick={() => setShowHistorial(true)} className="btn-secondary flex items-center gap-2 text-sm">
          <History size={14} /> Historial
        </button>
      </div>

      <div className="card">
        <StepHeader step={step} />

        {/* PASO 1 — Plantilla */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h3 className="font-bold text-sm mb-1">Elige una plantilla</h3>
              <p className="text-xs text-gray-400">Selecciona una plantilla aprobada por Meta para tu broadcast.</p>
            </div>
            {loadingPlantillas && <p className="text-sm text-gray-400 py-8 text-center">Cargando…</p>}
            {!loadingPlantillas && !plantillas.length && (
              <div className="border border-dashed border-gray-200 rounded-xl py-10 flex flex-col items-center gap-2">
                <FileText size={28} className="text-gray-300" />
                <p className="text-sm font-medium text-gray-500">No hay plantillas disponibles</p>
                <p className="text-xs text-gray-400">Crea y aprueba una plantilla en Plantillas WhatsApp primero.</p>
                <a href="/plantillas" className="text-xs text-brand hover:underline mt-1">Ir a Plantillas WhatsApp →</a>
              </div>
            )}
            <div className="grid sm:grid-cols-2 gap-3">
              {plantillas.map(p => (
                <button key={p._id} onClick={() => setPlantilla(p)}
                  className={`text-left border rounded-xl p-4 transition ${plantilla?._id === p._id ? 'border-brand bg-brand/5' : 'border-gray-100 hover:border-gray-200'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm">{p.nombre}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{p.categoria}</span>
                  </div>
                  <p className="text-xs text-gray-500 line-clamp-2 mb-1.5">{p.cuerpo}</p>
                  <span className="text-[10px] text-gray-400 uppercase">{p.idioma || 'es'}</span>
                </button>
              ))}
            </div>
            <div className="flex justify-end pt-2">
              <button disabled={!plantilla} onClick={() => setStep(2)} className="btn-primary flex items-center gap-2 disabled:opacity-40">
                Siguiente <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* PASO 2 — Audiencia */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h3 className="font-bold text-sm mb-1">Elige tu público objetivo</h3>
              <p className="text-xs text-gray-400">Combina filtros para segmentar — deja en blanco lo que no quieras filtrar.</p>
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Zona</label>
                <select className="input text-sm" value={segmento.zona} onChange={e => setSegmento(s => ({ ...s, zona: e.target.value }))}>
                  <option value="">Todas</option>
                  {zonas.map(z => <option key={z} value={z}>{z}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Línea / vendedor</label>
                <select className="input text-sm" value={segmento.vendedorId} onChange={e => setSegmento(s => ({ ...s, vendedorId: e.target.value }))}>
                  <option value="">Todas</option>
                  {vendedores.map(v => <option key={v._id} value={v._id}>{v.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">País</label>
                <select className="input text-sm" value={segmento.pais} onChange={e => setSegmento(s => ({ ...s, pais: e.target.value }))}>
                  <option value="">Todos</option>
                  <option value="CO">🇨🇴 Colombia</option>
                  <option value="VE">🇻🇪 Venezuela</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Temperatura</label>
                <select className="input text-sm" value={segmento.temperatura} onChange={e => setSegmento(s => ({ ...s, temperatura: e.target.value }))}>
                  <option value="">Todas</option>
                  <option value="frio">Frío</option>
                  <option value="tibio">Tibio</option>
                  <option value="caliente">Caliente</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Potencial</label>
                <select className="input text-sm" value={segmento.potencial} onChange={e => setSegmento(s => ({ ...s, potencial: e.target.value }))}>
                  <option value="">Todos</option>
                  <option value="bajo">Bajo</option>
                  <option value="medio">Medio</option>
                  <option value="alto">Alto</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Sector (texto)</label>
                <input className="input text-sm" placeholder="Ej: ferretería" value={segmento.sector}
                  onChange={e => setSegmento(s => ({ ...s, sector: e.target.value }))} />
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center gap-2">
                <Users size={14} className="text-brand" />
                <span className="text-sm font-bold text-brand">{cargandoAudiencia ? '…' : audiencia.total}</span>
                <span className="text-sm text-gray-500">destinatarios con este filtro</span>
              </div>
              {audiencia.muestra.length > 0 && (
                <div className="mt-2 space-y-1">
                  {audiencia.muestra.map(c => (
                    <div key={c._id} className="text-xs text-gray-600">{c.name} · {c.phone} {c.zona ? `· ${c.zona}` : ''}</div>
                  ))}
                  {audiencia.total > 5 && <p className="text-xs text-gray-400">…y {audiencia.total - 5} más</p>}
                </div>
              )}
            </div>

            <div className="flex justify-between pt-2">
              <button onClick={() => setStep(1)} className="btn-secondary">Atrás</button>
              <button disabled={!audiencia.total} onClick={() => setStep(3)} className="btn-primary flex items-center gap-2 disabled:opacity-40">
                Siguiente <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* PASO 3 — Personalizar */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h3 className="font-bold text-sm mb-1 flex items-center gap-1.5"><Sparkles size={14} className="text-brand" /> Personaliza el mensaje</h3>
              <p className="text-xs text-gray-400">Para cada variable, elige un texto fijo o un campo del cliente.</p>
            </div>

            {!variables.length && (
              <p className="text-sm text-gray-400 py-4">Esta plantilla no tiene variables — se enviará igual para todos.</p>
            )}

            {variables.map(n => (
              <div key={n} className="border border-gray-100 rounded-xl p-3 flex items-center gap-3">
                <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded shrink-0">{`{{${n}}}`}</span>
                <select className="input text-sm w-40 shrink-0"
                  value={personalizacion[n]?.tipo || 'fijo'}
                  onChange={e => setPersonalizacion(p => ({ ...p, [n]: { tipo: e.target.value, valor: '' } }))}>
                  <option value="fijo">Texto fijo</option>
                  <option value="campo">Campo del cliente</option>
                </select>
                {personalizacion[n]?.tipo === 'campo' ? (
                  <select className="input text-sm flex-1"
                    value={personalizacion[n]?.valor || ''}
                    onChange={e => setPersonalizacion(p => ({ ...p, [n]: { ...p[n], valor: e.target.value } }))}>
                    <option value="">Elige un campo…</option>
                    {Object.entries(CAMPO_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                ) : (
                  <input className="input text-sm flex-1" placeholder="Texto fijo…"
                    value={personalizacion[n]?.valor || ''}
                    onChange={e => setPersonalizacion(p => ({ ...p, [n]: { tipo: 'fijo', valor: e.target.value } }))} />
                )}
              </div>
            ))}

            {plantilla && (
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1"><Eye size={12} /> Vista previa</p>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{previewTexto}</p>
              </div>
            )}

            <div className="flex justify-between pt-2">
              <button onClick={() => setStep(2)} className="btn-secondary">Atrás</button>
              <button onClick={() => setStep(4)} className="btn-primary flex items-center gap-2">
                Siguiente <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* PASO 4 — Enviar */}
        {step === 4 && (
          <div className="space-y-4">
            <div>
              <h3 className="font-bold text-sm mb-1">Revisa y envía</h3>
              <p className="text-xs text-gray-400">Confirma los datos antes de enviar.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del broadcast</label>
              <input className="input text-sm" placeholder="Ej: Lanzamiento nueva línea" value={nombre} onChange={e => setNombre(e.target.value)} />
            </div>

            <div className="bg-gray-50 rounded-xl p-4 space-y-1.5 text-sm">
              <p><span className="text-gray-500">Plantilla:</span> <span className="font-medium">{plantilla?.nombre}</span></p>
              <p><span className="text-gray-500">Destinatarios:</span> <span className="font-medium">{audiencia.total}</span></p>
              <p className="text-gray-700 whitespace-pre-wrap border-t border-gray-200 mt-2 pt-2">{previewTexto}</p>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1">
                <CalendarClock size={14} className="text-gray-400" /> Programar envío (opcional)
              </label>
              <input type="datetime-local" className="input text-sm"
                min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
                value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
              <p className="text-xs text-gray-400 mt-1">Vacío = enviar inmediatamente</p>
            </div>

            <div className="flex justify-between pt-2">
              <button onClick={() => setStep(3)} className="btn-secondary">Atrás</button>
              <button onClick={() => enviar.mutate()} disabled={enviar.isPending}
                className="btn-primary flex items-center gap-2 disabled:opacity-40">
                {enviar.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {enviar.isPending ? 'Procesando…' : scheduledAt ? 'Programar broadcast' : 'Enviar broadcast'}
              </button>
            </div>
            {!plantilla?.categoria && (
              <p className="text-xs text-center text-amber-600 flex items-center justify-center gap-1">
                <AlertTriangle size={11} /> Recuerda: esto se envía por WhatsApp de verdad.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
