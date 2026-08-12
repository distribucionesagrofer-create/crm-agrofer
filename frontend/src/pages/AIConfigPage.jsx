import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bot, Save, CheckCircle, Key, Eye, EyeOff, Zap, AlertCircle, Mic, Play, Square, Plus, X, ShieldAlert, Globe, Lock } from 'lucide-react'
import api from '../services/api'

const INTENTS_LIST = [
  { key: 'saludo',               label: 'Saludo',                desc: 'hola, buenas, buenos dias...' },
  { key: 'precio',               label: 'Precio / Cotizacion',   desc: 'cuanto vale, precio, cotizacion, presupuesto...' },
  { key: 'catalogo',             label: 'Catalogo',              desc: 'que tienen, que venden, portafolio...' },
  { key: 'compra',               label: 'Intencion de compra',   desc: 'quiero comprar, quiero pedir, quiero llevar...' },
  { key: 'disponibilidad',       label: 'Disponibilidad',        desc: 'hay stock, esta disponible, queda...' },
  { key: 'ubicacion',            label: 'Ubicacion',             desc: 'donde estan, direccion, como llegar...' },
  { key: 'horario',              label: 'Horario',               desc: 'horario, abren, cierran, que hora...' },
  { key: 'reclamo',              label: 'Reclamo / Queja',       desc: 'reclamo, molesto, queja, problema con...' },
  { key: 'asesor',               label: 'Pedir asesor',          desc: 'hablar con alguien, vendedor, humano...' },
  { key: 'credito',              label: 'Credito / Plazo',       desc: 'credito, fiado, cuotas, financiamiento...' },
  { key: 'envio',                label: 'Envio / Despacho',      desc: 'envio, domicilio, delivery, entregan...' },
  { key: 'mayorista',            label: 'Mayorista',             desc: 'por mayor, volumen, distribuidor...' },
  { key: 'seguimiento_pedido',   label: 'Seguimiento de pedido', desc: 'mi pedido, cuando llega, estado del pedido...' },
  { key: 'garantia',             label: 'Garantia / Devolucion', desc: 'garantia, devolucion, reembolso, llego mal...' },
  { key: 'proveedor',            label: 'Proveedor / Marca',     desc: 'soy proveedor, ofrecer productos, contacto compras...' },
  { key: 'empleo',               label: 'Empleo / Hoja de vida', desc: 'empleo, trabajo, vacante, quiero trabajar...' },
  { key: 'visita',               label: 'Solicitud de visita',   desc: 'visita, visita comercial, que vengan...' },
  { key: 'campana',              label: 'Campana / Promocion',   desc: 'promocion, oferta, descuento, precio especial...' },
  { key: 'cliente_existente',    label: 'Cliente existente',     desc: 'ya soy cliente, tengo cuenta, compre antes...' },
  { key: 'producto_desconocido', label: 'Producto no identificado', desc: 'no se el nombre, busco algo para, que recomiendan...' },
]

const ACCIONES = [
  { value: 'ia',               label: 'IA decide (recomendado)' },
  { value: 'ninguna',          label: 'Responder normalmente sin accion' },
  { value: 'escalar_vendedor', label: 'Escalar al vendedor' },
  { value: 'crear_lead',       label: 'Crear lead automaticamente' },
  { value: 'crear_tarea',      label: 'Crear tarea de seguimiento' },
  { value: 'pausar_ia',        label: 'Pausar IA (solo humano)' },
]

const ACCION_BADGE = {
  ia:               { label: 'IA decide',  cls: 'bg-gray-100 text-gray-500' },
  ninguna:          { label: 'Normal',     cls: 'bg-blue-50 text-blue-600' },
  escalar_vendedor: { label: 'Escala',     cls: 'bg-orange-100 text-orange-600' },
  crear_lead:       { label: 'Lead',       cls: 'bg-green-100 text-green-700' },
  crear_tarea:      { label: 'Tarea',      cls: 'bg-purple-100 text-purple-700' },
  pausar_ia:        { label: 'Pausa IA',   cls: 'bg-red-100 text-red-600' },
}

const MODELS = [
  { value: 'gpt-4o-mini',  label: 'GPT-4o Mini (recomendado, mas economico)' },
  { value: 'gpt-4o',       label: 'GPT-4o (mas inteligente, mas caro)' },
  { value: 'gpt-4-turbo',  label: 'GPT-4 Turbo' },
  { value: 'gpt-3.5-turbo',label: 'GPT-3.5 Turbo (basico)' },
]

const TTS_VOICES = [
  { id: 'nova',    label: 'Nova',    desc: 'Femenina, suave y natural',        emoji: '' },
  { id: 'shimmer', label: 'Shimmer', desc: 'Femenina, animada y expresiva',    emoji: '' },
  { id: 'alloy',   label: 'Alloy',   desc: 'Neutra, versatil',                 emoji: '' },
  { id: 'echo',    label: 'Echo',    desc: 'Masculina, clara y directa',       emoji: '' },
  { id: 'fable',   label: 'Fable',   desc: 'Calida y expresiva',               emoji: '' },
  { id: 'onyx',    label: 'Onyx',    desc: 'Masculina, profunda y seria',      emoji: '' },
]

function OpenAIConfigPanel() {
  const qc = useQueryClient()
  const [editMode, setEditMode]     = useState(false)
  const [newKey, setNewKey]         = useState('')
  const [showKey, setShowKey]       = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [testing, setTesting]       = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['system-config'],
    queryFn:  () => api.get('/config'),
  })

  const [model, setModel] = useState(data?.openaiModel || 'gpt-4o-mini')

  const guardar = useMutation({
    mutationFn: () => api.patch('/config', {
      ...(newKey.trim() ? { openaiKey: newKey.trim() } : {}),
      openaiModel: model,
    }),
    onSuccess: () => {
      setEditMode(false)
      setNewKey('')
      qc.invalidateQueries(['system-config'])
    },
  })

  const testear = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await api.post('/config/test-openai', {})
      setTestResult({ ok: true, msg: `Conexion exitosa - modelo: ${res.model}` })
    } catch (err) {
      setTestResult({ ok: false, msg: `Error: ${err.response?.data?.error || err.message}` })
    } finally {
      setTesting(false)
    }
  }

  const currentModel = data?.openaiModel || 'gpt-4o-mini'

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-green-100 rounded-lg"><Key size={16} className="text-green-600" /></div>
        <div>
          <p className="font-semibold text-sm">Token de OpenAI (ChatGPT)</p>
          <p className="text-xs text-gray-400">Clave API para activar la inteligencia artificial</p>
        </div>
        <div className={`ml-auto text-xs font-medium px-2 py-1 rounded-full ${
          data?.openaiKeySet ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'
        }`}>
          {isLoading ? '...' : data?.openaiKeySet ? 'Configurado' : 'Sin configurar'}
        </div>
      </div>

      {data?.fromEnv && !editMode && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5 flex items-start gap-2">
          <AlertCircle size={14} className="text-blue-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs text-blue-700 font-medium">Token cargado desde configuracion del servidor (.env)</p>
            <p className="text-xs text-blue-600 mt-0.5">Funciona correctamente. Para cambiarlo desde el panel, ingresa el nuevo token abajo y guarda.</p>
          </div>
        </div>
      )}

      {data?.openaiKeySet && !editMode && (
        <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
          <Key size={13} className="text-gray-400 shrink-0" />
          <span className="flex-1 text-sm font-mono text-gray-600 tracking-widest">{data.openaiKeyMasked}</span>
          <button onClick={() => setEditMode(true)} className="text-xs text-brand hover:underline font-medium shrink-0">Cambiar</button>
        </div>
      )}

      {(editMode || !data?.openaiKeySet) && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              {data?.openaiKeySet ? 'Nuevo token (reemplaza el anterior)' : 'Token de OpenAI'}
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={newKey}
                onChange={e => setNewKey(e.target.value)}
                placeholder="sk-proj-..."
                className="input pr-10 text-sm font-mono"
                autoComplete="off"
              />
              <button onClick={() => setShowKey(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Modelo</label>
        <select value={model || currentModel} onChange={e => setModel(e.target.value)} className="input text-sm">
          {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => guardar.mutate()}
          disabled={guardar.isPending || (editMode && !newKey.trim() && model === currentModel)}
          className="btn-primary flex items-center gap-2 text-sm">
          <Save size={13} /> {guardar.isPending ? 'Guardando...' : 'Guardar'}
        </button>
        {editMode && (
          <button onClick={() => { setEditMode(false); setNewKey('') }} className="btn-secondary text-sm">Cancelar</button>
        )}
        <button onClick={testear} disabled={testing || !data?.openaiKeySet}
          className="btn-secondary flex items-center gap-2 text-sm ml-auto">
          <Zap size={13} className={testing ? 'animate-spin' : ''} />
          {testing ? 'Probando...' : 'Probar conexion'}
        </button>
      </div>

      {testResult && (
        <div className={`text-sm px-3 py-2 rounded-lg font-medium ${testResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
          {testResult.msg}
        </div>
      )}
    </div>
  )
}

function TTSVoicePanel() {
  const qc = useQueryClient()
  const audioRef = useRef(null)
  const [playingVoice, setPlayingVoice] = useState(null)
  const [loadingVoice, setLoadingVoice] = useState(null)

  const { data } = useQuery({
    queryKey: ['system-config'],
    queryFn:  () => api.get('/config'),
  })

  const [selectedVoice, setSelectedVoice] = useState(null)
  const currentVoice = selectedVoice ?? data?.ttsVoice ?? 'nova'

  const guardar = useMutation({
    mutationFn: () => api.patch('/config', { ttsVoice: currentVoice }),
    onSuccess: () => qc.invalidateQueries(['system-config']),
  })

  const previewVoice = async (e, voice) => {
    e.stopPropagation()
    if (playingVoice === voice) {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
      setPlayingVoice(null)
      return
    }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    setPlayingVoice(null)
    setLoadingVoice(voice)
    try {
      const res = await api.post('/config/tts-preview', { voice })
      const audio = new Audio(`data:${res.mimetype};base64,${res.audio}`)
      audioRef.current = audio
      setLoadingVoice(null)
      setPlayingVoice(voice)
      audio.onended = () => { setPlayingVoice(null); audioRef.current = null }
      audio.onerror = () => { setPlayingVoice(null); audioRef.current = null }
      audio.play()
    } catch {
      setLoadingVoice(null)
    }
  }

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-purple-100 rounded-lg"><Mic size={16} className="text-purple-600" /></div>
        <div>
          <p className="font-semibold text-sm">Voz del Asistente (TTS)</p>
          <p className="text-xs text-gray-400">Elige con que voz responde la IA en notas de voz. Haz clic en play para escuchar antes de elegir.</p>
        </div>
        <span className="ml-auto text-xs font-medium bg-purple-100 text-purple-700 px-2 py-1 rounded-full capitalize shrink-0">
          {currentVoice}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {TTS_VOICES.map(v => {
          const isSelected = currentVoice === v.id
          const isPlaying  = playingVoice  === v.id
          const isLoading  = loadingVoice  === v.id
          return (
            <div key={v.id} onClick={() => setSelectedVoice(v.id)}
              className={`rounded-xl border-2 p-3 cursor-pointer transition-all select-none ${
                isSelected ? 'border-purple-400 bg-purple-50' : 'border-gray-200 hover:border-purple-200 bg-white'
              }`}>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-base">{v.emoji}</span>
                <p className={`text-sm font-bold ${isSelected ? 'text-purple-800' : 'text-gray-800'}`}>{v.label}</p>
                {isSelected && <span className="ml-auto text-purple-500"><CheckCircle size={13} /></span>}
              </div>
              <p className="text-[11px] text-gray-400 mb-2 leading-tight">{v.desc}</p>
              <button
                onClick={e => previewVoice(e, v.id)}
                disabled={isLoading}
                className={`w-full text-xs py-1.5 rounded-lg flex items-center justify-center gap-1.5 font-medium transition-colors ${
                  isPlaying
                    ? 'bg-purple-200 text-purple-800 hover:bg-purple-300'
                    : isLoading
                    ? 'bg-gray-100 text-gray-400 cursor-wait'
                    : 'bg-gray-100 hover:bg-purple-100 text-gray-600 hover:text-purple-700'
                }`}>
                {isLoading ? (
                  <span className="animate-spin inline-block">...</span>
                ) : isPlaying ? (
                  <><Square size={11} /> Detener</>
                ) : (
                  <><Play size={11} /> Escuchar</>
                )}
              </button>
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-3">
        <button onClick={() => guardar.mutate()} disabled={guardar.isPending}
          className="btn-primary flex items-center gap-2 text-sm">
          <Save size={13} /> {guardar.isPending ? 'Guardando...' : 'Guardar voz'}
        </button>
        {guardar.isSuccess && (
          <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle size={12} /> Guardado</span>
        )}
        <p className="ml-auto text-[11px] text-gray-400">El TTS se activa por linea en la config de cada vendedor</p>
      </div>
    </div>
  )
}

function Toggle({ value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
        background: value ? '#6366f1' : '#d1d5db',
        position: 'relative', transition: 'background 0.2s', flexShrink: 0, outline: 'none',
        boxShadow: value ? '0 0 0 3px rgba(99,102,241,0.15)' : 'none',
      }}>
      <span style={{
        position: 'absolute', top: 3, width: 20, height: 20, borderRadius: '50%',
        background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
        transition: 'left 0.2s',
        left: value ? 25 : 3,
      }} />
    </button>
  )
}

function ToggleRow({ label, desc, value, onChange, highlight }) {
  return (
    <div className={`flex items-center justify-between p-3 rounded-xl transition-colors ${
      value ? (highlight || 'bg-brand/5 border border-brand/20') : 'bg-gray-50 border border-gray-100'
    }`}>
      <div className="flex-1 min-w-0 pr-4">
        <p className={`text-sm font-semibold ${value ? 'text-brand' : 'text-gray-700'}`}>{label}</p>
        {desc && <p className="text-xs text-gray-400 mt-0.5">{desc}</p>}
      </div>
      <Toggle value={value} onChange={onChange} />
    </div>
  )
}

function LineaConfig({ vendedor }) {
  const audioRef = useRef(null)
  const [playingVoice, setPlayingVoice] = useState(null)
  const [loadingVoice, setLoadingVoice] = useState(null)

  const [form, setForm] = useState({
    enabled:             vendedor.ai?.enabled           ?? false,
    autoReply:           vendedor.ai?.autoReply         ?? false,
    systemPrompt:        vendedor.ai?.systemPrompt      ?? '',
    ttsEnabled:          vendedor.tts?.enabled          ?? false,
    ttsVoice:            vendedor.tts?.voice            ?? 'nova',
    asistNombre:    vendedor.assistant?.nombre             ?? 'Asesor Virtual AGROFER',
    asistRol:       vendedor.assistant?.rol               ?? 'Ayudar a clientes, resolver dudas y conectar oportunidades con vendedores.',
    asistTono:      vendedor.assistant?.tono              ?? 'Cercano, claro y profesional.',
    asistObjetivo:  vendedor.assistant?.objetivo          ?? 'Calificar clientes y llevarlos a un asesor cuando hay intencion de compra.',
    asistReglas:    vendedor.assistant?.reglas            ?? ['No inventar precios ni disponibilidad.', 'Si el cliente quiere comprar, pedir ciudad y producto.', 'Si el cliente esta molesto, escalar a humano.', 'Hacer maximo una pregunta por mensaje.'],
    asistEscKeywords: vendedor.assistant?.escalationKeywords ?? ['reclamo', 'devolucion', 'defectuoso', 'urgente'],
    asistMaxIntentos: vendedor.assistant?.maxIntentos    ?? 5,
    intentActions: Object.fromEntries(
      INTENTS_LIST.map(i => {
        const stored = vendedor.intentActions?.[i.key]
        return [i.key, stored || 'ia']
      })
    ),
  })
  const [newRegla, setNewRegla]       = useState('')
  const [newKeyword, setNewKeyword]   = useState('')
  const [tabActivo, setTabActivo]     = useState('conexion')
  const [saved, setSaved] = useState(false)
  const qc = useQueryClient()

  const guardar = useMutation({
    mutationFn: () => api.patch(`/vendedores/${vendedor._id}`, {
      ai: {
        enabled:      form.enabled,
        autoReply:    form.autoReply,
        systemPrompt: form.systemPrompt,
      },
      tts: { enabled: form.ttsEnabled, voice: form.ttsVoice },
      assistant: {
        nombre:             form.asistNombre,
        rol:                form.asistRol,
        tono:               form.asistTono,
        objetivo:           form.asistObjetivo,
        reglas:             form.asistReglas,
        escalationKeywords: form.asistEscKeywords,
        maxIntentos:        form.asistMaxIntentos,
      },
      intentActions: form.intentActions,
    }),
    onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2000); qc.invalidateQueries(['vendedores-lista']) },
  })

  const previewVoice = async (e, voice) => {
    e.stopPropagation()
    if (playingVoice === voice) {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
      setPlayingVoice(null)
      return
    }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    setPlayingVoice(null)
    setLoadingVoice(voice)
    try {
      const res = await api.post('/config/tts-preview', { voice })
      const audio = new Audio(`data:${res.mimetype};base64,${res.audio}`)
      audioRef.current = audio
      setLoadingVoice(null)
      setPlayingVoice(voice)
      audio.onended = () => { setPlayingVoice(null); audioRef.current = null }
      audio.play()
    } catch {
      setLoadingVoice(null)
    }
  }

  const metaActiva = vendedor.metaApi?.enabled && vendedor.metaApi?.accessToken

  const TABS = [
    { key: 'conexion',      label: 'Conexión Meta API' },
    { key: 'comportamiento', label: 'Comportamiento' },
    { key: 'personalidad',  label: 'Personalidad y reglas' },
    { key: 'intenciones',   label: 'Intenciones' },
  ]

  return (
    <div className="card p-0 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-2 h-2 rounded-full shrink-0 ${metaActiva ? 'bg-blue-500' : 'bg-gray-300'}`} />
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{vendedor.nombre}</p>
            <p className="text-xs text-gray-400">{vendedor.zona || 'Sin zona'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {metaActiva      && <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-medium">Meta API</span>}
          {form.enabled    && <span className="text-xs bg-brand/10 text-brand px-2 py-0.5 rounded-full font-medium">IA activa</span>}
          {form.autoReply  && <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full font-medium">Auto</span>}
          {form.ttsEnabled && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">Voz</span>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key}
            onClick={() => setTabActivo(t.key)}
            className={`px-5 py-3 text-sm font-medium whitespace-nowrap transition-colors ${tabActivo === t.key ? 'border-b-2 border-brand text-brand' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Conexión Meta API */}
      {tabActivo === 'conexion' && <MetaAPIPanel vendedor={vendedor} />}

      {/* Tab: Comportamiento */}
      {tabActivo === 'comportamiento' && (
        <div className="px-5 py-4 space-y-4">
          <ToggleRow
            label="IA habilitada"
            desc="La IA puede leer y responder mensajes"
            value={form.enabled}
            onChange={v => setForm({ ...form, enabled: v })} />

          <ToggleRow
            label="Respuesta automática"
            desc="Responde sin intervención manual — el bot envía los mensajes solo"
            value={form.autoReply}
            onChange={v => setForm({ ...form, autoReply: v })} />

          <div className="border-t border-gray-100 pt-3 space-y-3">
            <ToggleRow
              label="🎤 Responder con nota de voz"
              desc="Si el cliente manda audio, la IA transcribe y responde con voz"
              value={form.ttsEnabled}
              onChange={v => setForm({ ...form, ttsEnabled: v })}
              highlight="bg-purple-50 border border-purple-200" />

            {form.ttsEnabled && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Voz para esta línea (si no eliges, usa la voz por defecto del sistema)</p>
                <div className="grid grid-cols-3 gap-2">
                  {TTS_VOICES.map(v => {
                    const isSel  = form.ttsVoice === v.id
                    const isPly  = playingVoice  === v.id
                    const isLoad = loadingVoice  === v.id
                    return (
                      <div key={v.id} onClick={() => setForm({ ...form, ttsVoice: v.id })}
                        className={`rounded-lg border-2 p-2 cursor-pointer transition-all ${
                          isSel ? 'border-purple-400 bg-purple-50' : 'border-gray-200 hover:border-purple-200'
                        }`}>
                        <div className="flex items-center gap-1 mb-1">
                          <span className="text-xs">{v.emoji}</span>
                          <p className={`text-xs font-semibold ${isSel ? 'text-purple-800' : 'text-gray-700'}`}>{v.label}</p>
                        </div>
                        <button onClick={e => previewVoice(e, v.id)} disabled={isLoad}
                          className={`w-full text-[10px] py-1 rounded flex items-center justify-center gap-1 transition-colors ${
                            isPly  ? 'bg-purple-200 text-purple-800'
                            : isLoad ? 'bg-gray-100 text-gray-400 cursor-wait'
                            : 'bg-gray-100 hover:bg-purple-100 text-gray-500'
                          }`}>
                          {isLoad ? '...' : isPly ? <><Square size={9} /> Stop</> : <><Play size={9} /> Oir</>}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button onClick={() => guardar.mutate()} disabled={guardar.isPending}
              className="btn-primary flex items-center gap-2 text-sm">
              <Save size={13} /> {guardar.isPending ? 'Guardando...' : 'Guardar'}
            </button>
            {saved && <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle size={12} /> Guardado</span>}
          </div>
        </div>
      )}

      {/* Tab: Intenciones */}
      {tabActivo === 'intenciones' && (
        <div className="px-5 py-4 space-y-3">
          <p className="text-xs text-gray-400">
            Define que hace el bot cuando detecta cada tipo de mensaje. <strong>Dejar a la IA decidir</strong> es la opcion por defecto.
          </p>
          <div className="space-y-1">
            {INTENTS_LIST.map(intent => {
              const accion = form.intentActions[intent.key] || 'ia'
              const badge = ACCION_BADGE[accion] || ACCION_BADGE.ia
              return (
                <div key={intent.key} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700">{intent.label}</p>
                    <p className="text-[11px] text-gray-400 truncate">{intent.desc}</p>
                  </div>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${badge.cls}`}>
                    {badge.label}
                  </span>
                  <select
                    value={accion}
                    onChange={e => setForm({ ...form, intentActions: { ...form.intentActions, [intent.key]: e.target.value } })}
                    className="input text-xs py-1 w-44 shrink-0">
                    {ACCIONES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                </div>
              )
            })}
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button onClick={() => guardar.mutate()} disabled={guardar.isPending}
              className="btn-primary flex items-center gap-2 text-sm">
              <Save size={13} /> {guardar.isPending ? 'Guardando...' : 'Guardar'}
            </button>
            {saved && <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle size={12} /> Guardado</span>}
          </div>
        </div>
      )}

      {/* Tab: Personalidad y reglas */}
      {tabActivo === 'personalidad' && (
        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Nombre del asistente</label>
              <input className="input text-sm" value={form.asistNombre}
                onChange={e => setForm({ ...form, asistNombre: e.target.value })}
                placeholder="Asesor Virtual AGROFER" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Max. intentos antes de escalar</label>
              <input type="number" min={1} max={20} className="input text-sm" value={form.asistMaxIntentos}
                onChange={e => setForm({ ...form, asistMaxIntentos: parseInt(e.target.value) || 5 })} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Rol del asistente</label>
            <input className="input text-sm" value={form.asistRol}
              onChange={e => setForm({ ...form, asistRol: e.target.value })}
              placeholder="Ayudar a clientes y resolver dudas." />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tono de comunicacion</label>
            <input className="input text-sm" value={form.asistTono}
              onChange={e => setForm({ ...form, asistTono: e.target.value })}
              placeholder="Cercano, claro y profesional." />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Objetivo principal</label>
            <textarea rows={2} className="input resize-none text-sm"
              value={form.asistObjetivo}
              onChange={e => setForm({ ...form, asistObjetivo: e.target.value })}
              placeholder="Calificar clientes y conectarlos con vendedores." />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">Reglas del bot</label>
            <div className="space-y-2 mb-2">
              {form.asistReglas.map((r, i) => (
                <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                  <span className="text-xs text-gray-400 shrink-0 w-4">{i + 1}.</span>
                  <span className="text-xs text-gray-700 flex-1">{r}</span>
                  <button onClick={() => setForm({ ...form, asistReglas: form.asistReglas.filter((_, j) => j !== i) })}
                    className="text-gray-300 hover:text-red-400 shrink-0">
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input className="input text-xs flex-1" value={newRegla}
                onChange={e => setNewRegla(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && newRegla.trim()) { setForm({ ...form, asistReglas: [...form.asistReglas, newRegla.trim()] }); setNewRegla('') } }}
                placeholder="Agregar regla y presionar Enter..." />
              <button onClick={() => { if (newRegla.trim()) { setForm({ ...form, asistReglas: [...form.asistReglas, newRegla.trim()] }); setNewRegla('') } }}
                className="btn-secondary px-3">
                <Plus size={14} />
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <ShieldAlert size={14} className="text-orange-400" />
              <label className="text-xs font-medium text-gray-500">Palabras clave para escalar al vendedor</label>
            </div>
            <div className="flex flex-wrap gap-2 mb-2">
              {form.asistEscKeywords.map((kw, i) => (
                <span key={i} className="flex items-center gap-1 bg-orange-50 text-orange-700 text-xs px-2 py-1 rounded-full border border-orange-200">
                  {kw}
                  <button onClick={() => setForm({ ...form, asistEscKeywords: form.asistEscKeywords.filter((_, j) => j !== i) })}
                    className="hover:text-red-500 ml-0.5">
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input className="input text-xs flex-1" value={newKeyword}
                onChange={e => setNewKeyword(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && newKeyword.trim()) { setForm({ ...form, asistEscKeywords: [...form.asistEscKeywords, newKeyword.trim()] }); setNewKeyword('') } }}
                placeholder="ej: reclamo, urgente..." />
              <button onClick={() => { if (newKeyword.trim()) { setForm({ ...form, asistEscKeywords: [...form.asistEscKeywords, newKeyword.trim()] }); setNewKeyword('') } }}
                className="btn-secondary px-3">
                <Plus size={14} />
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">Si el cliente escribe alguna de estas palabras, el bot escala inmediatamente al vendedor</p>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <label className="block text-xs font-medium text-gray-500 mb-1">Instrucciones adicionales (opcional)</label>
            <p className="text-xs text-gray-400 mb-2">Se suman a la personalidad de arriba — úsalo para casos puntuales que las reglas no cubren.</p>
            <textarea rows={4} className="input resize-none text-xs font-mono"
              placeholder="Ej: Si preguntan por envíos a Venezuela, aclarar que solo se hace contraentrega..."
              value={form.systemPrompt}
              onChange={e => setForm({ ...form, systemPrompt: e.target.value })}
              maxLength={3000} />
            <p className="text-xs text-gray-400 text-right mt-0.5">{form.systemPrompt.length}/3000</p>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button onClick={() => guardar.mutate()} disabled={guardar.isPending}
              className="btn-primary flex items-center gap-2 text-sm">
              <Save size={13} /> {guardar.isPending ? 'Guardando...' : 'Guardar'}
            </button>
            {saved && <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle size={12} /> Guardado</span>}
          </div>
        </div>
      )}
    </div>
  )
}

function MetaAPIPanel({ vendedor }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    metaEnabled:     vendedor.metaApi?.enabled          ?? false,
    phoneNumberId:   vendedor.metaApi?.phoneNumberId    ?? '',
    accessToken:     vendedor.metaApi?.accessToken      ?? '',
    verifyToken:     vendedor.metaApi?.webhookVerifyToken ?? '',
    businessAccId:   vendedor.metaApi?.businessAccountId ?? '',
    appId:           vendedor.metaApi?.appId            ?? '',
    appSecret:       vendedor.metaApi?.appSecret         ?? '',
  })
  const [showToken, setShowToken]   = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const [saved, setSaved]         = useState(false)

  const guardar = useMutation({
    mutationFn: () => api.patch(`/vendedores/${vendedor._id}`, {
      metaApi: {
        enabled:             form.metaEnabled,
        phoneNumberId:       form.phoneNumberId.trim(),
        accessToken:         form.accessToken.trim(),
        webhookVerifyToken:  form.verifyToken.trim(),
        businessAccountId:   form.businessAccId.trim(),
        appId:               form.appId.trim(),
        appSecret:           form.appSecret.trim(),
      },
    }),
    onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2500); qc.invalidateQueries(['vendedores-lista']) },
  })

  const webhookUrl = `${window.location.origin.replace(':5173', ':3000')}/webhook/meta`

  return (
    <div className="px-5 py-4 space-y-4">
      <ToggleRow
        label={<span className="flex items-center gap-2"><Globe size={13} className="text-blue-500" /> Meta WhatsApp Business API <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-bold">API Oficial</span></span>}
        desc="Activa cuando tengas credenciales de Meta Business Suite"
        value={form.metaEnabled}
        onChange={v => setForm({ ...form, metaEnabled: v })}
        highlight="bg-blue-50 border border-blue-200" />

      <div className="bg-blue-50 rounded-lg px-3 py-2.5 text-xs text-blue-700 space-y-1">
        <p className="font-medium">Cuando activar esto</p>
        <p>Activa esta seccion cuando tengas acceso a la API oficial de Meta (Meta Business Suite). Permite enviar botones, plantillas y mensajes ricos. Mientras tanto usa Baileys (conexion por QR).</p>
      </div>

      {form.metaEnabled && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">URL del Webhook (configura esto en Meta Developers)</label>
            <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
              <code className="text-xs text-gray-600 flex-1 truncate">{webhookUrl}</code>
              <button onClick={() => navigator.clipboard.writeText(webhookUrl)}
                className="text-xs text-brand hover:underline shrink-0">Copiar</button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Phone Number ID</label>
              <input className="input text-xs font-mono" value={form.phoneNumberId}
                onChange={e => setForm({ ...form, phoneNumberId: e.target.value })}
                placeholder="12345678901234" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">App ID</label>
              <input className="input text-xs font-mono" value={form.appId}
                onChange={e => setForm({ ...form, appId: e.target.value })}
                placeholder="123456789" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Business Account ID (WABA ID)</label>
            <input className="input text-xs font-mono" value={form.businessAccId}
              onChange={e => setForm({ ...form, businessAccId: e.target.value })}
              placeholder="98765432101234" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Webhook Verify Token (lo inventas tu, lo mismo que pondras en Meta)</label>
            <input className="input text-xs font-mono" value={form.verifyToken}
              onChange={e => setForm({ ...form, verifyToken: e.target.value })}
              placeholder="mi_token_secreto_agrofer_2024" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              <span className="flex items-center gap-1"><Lock size={11} /> Access Token permanente</span>
            </label>
            <div className="relative">
              <input type={showToken ? 'text' : 'password'} className="input text-xs font-mono pr-10"
                value={form.accessToken}
                onChange={e => setForm({ ...form, accessToken: e.target.value })}
                placeholder="EAAxxxxxxxxxxxxxxx..." />
              <button onClick={() => setShowToken(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showToken ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">Token de larga duracion generado en Meta Business Suite. Nunca compartas este token.</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              <span className="flex items-center gap-1"><Lock size={11} /> App Secret</span>
            </label>
            <div className="relative">
              <input type={showSecret ? 'text' : 'password'} className="input text-xs font-mono pr-10"
                value={form.appSecret}
                onChange={e => setForm({ ...form, appSecret: e.target.value })}
                placeholder="a1b2c3d4e5f6..." />
              <button onClick={() => setShowSecret(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showSecret ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">Se usa para verificar que los mensajes del webhook realmente vienen de Meta. Sin esto, el webhook acepta eventos sin validar su origen.</p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button onClick={() => guardar.mutate()} disabled={guardar.isPending}
          className="btn-primary flex items-center gap-2 text-sm">
          <Save size={13} /> {guardar.isPending ? 'Guardando...' : 'Guardar config Meta'}
        </button>
        {saved && <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle size={12} /> Guardado</span>}
      </div>
    </div>
  )
}

export default function AIConfigPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['vendedores-lista'],
    queryFn: () => api.get('/vendedores'),
  })

  // Solo la línea principal (Meta API) maneja chat en vivo — las demás no necesitan
  // configuración de IA propia.
  const vendedores = (data?.vendedores || []).filter(v => v.slug === 'linea-principal')

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2.5 bg-brand/10 rounded-xl">
          <Bot size={20} className="text-brand" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Configuracion IA</h2>
          <p className="text-sm text-gray-400">Token, voz y configuracion de IA de la linea principal</p>
        </div>
      </div>

      <OpenAIConfigPanel />
      <TTSVoicePanel />

      <div className="p-4 bg-blue-50 rounded-xl text-xs text-blue-700 space-y-1">
        <p className="font-semibold">Como funciona?</p>
        <p>IA + Auto activo: responde todos los mensajes automaticamente</p>
        <p>IA + Auto apagado: el vendedor escribe el comando a su numero para activarla</p>
        <p>Voz activo: si el cliente manda audio, la IA transcribe y responde con nota de voz</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="card h-16 animate-pulse bg-gray-50" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {vendedores.map(v => <LineaConfig key={v._id} vendedor={v} />)}
        </div>
      )}
    </div>
  )
}
