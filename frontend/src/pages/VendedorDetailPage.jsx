import { useState, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { ArrowLeft, Users, AlertTriangle, Loader2, Radio, Square } from 'lucide-react'
import api from '../services/api'
import { socket } from '../services/socket'
import { useScreencast } from '../contexts/ScreencastContext'
import ConversationList from '../components/ConversationList'
import WhatsAppChat from '../components/WhatsAppChat'

function VistaEnVivo({ vendedorId, vendedorNombre }) {
  const { vendedorId: idActivo, activo, frame, iniciar: iniciarGlobal, finalizar } = useScreencast()
  const [cargando, setCargando] = useState(false)
  const imgRef = useRef(null)
  // El estado en sí vive en el contexto global (sobrevive navegar a otro módulo) — esta
  // vista solo es "la activa" si coincide con el vendedor que se está viendo ahora mismo.
  const esEstaLinea = activo && idActivo === vendedorId

  const iniciar = async () => {
    setCargando(true)
    try {
      const r = await iniciarGlobal(vendedorId, vendedorNombre)
      if (!r.ok) alert(r.error || 'Error al iniciar la vista en vivo')
    } catch (e) {
      alert(e?.error || 'Error al iniciar la vista en vivo')
    } finally {
      setCargando(false)
    }
  }

  const coordsDesdeEvento = (e) => {
    const img = imgRef.current
    const rect = img.getBoundingClientRect()
    // Con object-contain la imagen no llena la caja completa cuando la proporción no calza
    // exacto (deja franjas vacías arriba/abajo o a los lados) — sin descontar esas franjas,
    // el clic se calculaba como % de la CAJA entera y no del área real donde se ve la imagen,
    // corriendo el punto real hacia un lado.
    const imgRatio  = img.naturalWidth / img.naturalHeight
    const boxRatio  = rect.width / rect.height
    let renderW, renderH, offsetX, offsetY
    if (imgRatio > boxRatio) {
      renderW = rect.width
      renderH = rect.width / imgRatio
      offsetX = 0
      offsetY = (rect.height - renderH) / 2
    } else {
      renderH = rect.height
      renderW = rect.height * imgRatio
      offsetY = 0
      offsetX = (rect.width - renderW) / 2
    }
    const pctX = (e.clientX - rect.left - offsetX) / renderW
    const pctY = (e.clientY - rect.top - offsetY) / renderH
    return {
      pctX: Math.min(1, Math.max(0, pctX)),
      pctY: Math.min(1, Math.max(0, pctY)),
    }
  }

  const onClickImagen = (e) => {
    e.currentTarget.focus() // habilita el teclado sobre la imagen (ver onKeyDownImagen)
    const { pctX, pctY } = coordsDesdeEvento(e)
    socket.emit('screencast:click', { tenantId: vendedorId, pctX, pctY })
  }

  const onWheelImagen = (e) => {
    e.preventDefault()
    const { pctX, pctY } = coordsDesdeEvento(e)
    socket.emit('screencast:scroll', { tenantId: vendedorId, pctX, pctY, deltaY: e.deltaY })
  }

  // El teclado se reenvía tal cual — el backend decide si lo deja pasar según qué esté
  // enfocado en la página real (solo el buscador de chats, nunca el cuadro de mensaje).
  const onKeyDownImagen = (e) => {
    e.preventDefault()
    socket.emit('screencast:key', { tenantId: vendedorId, key: e.key })
  }

  if (!esEstaLinea) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-2xl border border-gray-100 p-6 space-y-4 text-center">
          <Radio size={36} className="text-brand mx-auto" />
          <div>
            <h3 className="font-bold text-gray-800">Ver WhatsApp en vivo</h3>
            <p className="text-sm text-gray-400 mt-1">
              Conecta esta línea y muestra el WhatsApp Web real — puedes hacer clic para abrir
              chats, hacer scroll para ver mensajes anteriores, y buscar conversaciones, tal cual
              como en WhatsApp. No se puede escribir ni enviar mensajes dentro de un chat desde
              aquí. Al finalizar, la sesión se guarda.
            </p>
            {activo && idActivo !== vendedorId && (
              <p className="text-xs text-amber-600 mt-2">
                Ya hay una vista en vivo activa en otra línea — al iniciar esta se cerrará esa.
              </p>
            )}
          </div>
          <button onClick={iniciar} disabled={cargando}
            className="btn-primary w-full flex items-center justify-center gap-2 text-sm disabled:opacity-40">
            {cargando ? <Loader2 size={14} className="animate-spin" /> : <Radio size={14} />}
            {cargando ? 'Conectando…' : 'Iniciar vista en vivo'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-900 min-h-0">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 shrink-0">
        <span className="text-xs text-gray-300 flex items-center gap-1.5 shrink-0">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> En vivo
        </span>
        <button onClick={finalizar}
          className="flex items-center gap-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-lg transition-colors">
          <Square size={11} /> Finalizar
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center overflow-hidden p-2">
        {frame ? (
          <img ref={imgRef} src={frame} alt="WhatsApp en vivo" tabIndex={0}
            onClick={onClickImagen} onWheel={onWheelImagen} onKeyDown={onKeyDownImagen}
            className="w-full h-full object-contain rounded-lg shadow-2xl cursor-pointer outline-none" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-gray-400">
            <Loader2 size={24} className="animate-spin" />
            <p className="text-xs">Cargando pantalla…</p>
          </div>
        )}
      </div>
    </div>
  )
}

function ClientesTab({ vendedorId }) {
  const [filtro, setFiltro] = useState('todos')
  const { data, isLoading } = useQuery({
    queryKey: ['vendedor-clientes', vendedorId, filtro],
    queryFn: () => api.get(`/vendedores/${vendedorId}/clientes?sinContactar=${filtro === 'sin'}&limit=100`),
    refetchInterval: 30_000,
  })
  const clientes = data?.clientes || []
  const total    = data?.total ?? 0
  const sinContactar = clientes.filter(c => !c.lastContactAt || Math.floor((Date.now() - new Date(c.lastContactAt)) / 86400000) > 30).length

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 shrink-0">
        {[['todos', 'Todos'], ['sin', 'Sin contactar (30d)']].map(([val, lbl]) => (
          <button key={val} onClick={() => setFiltro(val)}
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${filtro === val ? 'bg-brand text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
            {lbl}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-400">{total} clientes</span>
        {sinContactar > 0 && (
          <span className="flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
            <AlertTriangle size={11} /> {sinContactar} sin contactar
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
        {isLoading && <p className="text-sm text-gray-400 text-center py-8">Cargando…</p>}
        {!isLoading && !clientes.length && (
          <p className="text-sm text-gray-400 text-center py-8">
            {filtro === 'sin' ? 'Todos contactados ✅' : 'Sin clientes asignados'}
          </p>
        )}
        {clientes.map(c => {
          const dias = c.lastContactAt ? Math.floor((Date.now() - new Date(c.lastContactAt)) / 86400000) : null
          return (
            <div key={c._id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/60">
              <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 font-bold text-sm shrink-0">
                {c.name?.[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{c.name}</p>
                <p className="text-xs text-gray-400">{c.phone}{c.zona ? ` · ${c.zona}` : ''}</p>
              </div>
              <div className="shrink-0">
                {dias === null ? <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Sin contactar</span>
                  : dias > 30  ? <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{dias}d</span>
                  : <span className="text-xs text-gray-400">{dias === 0 ? 'Hoy' : `${dias}d`}</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function VendedorDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  // El widget flotante de "Ver en vivo" navega aquí pidiendo abrir directo esa pestaña.
  const [tab, setTab]                   = useState(location.state?.tab || 'inbox')
  const [selectedConv, setSelectedConv] = useState(null)
  const qc = useQueryClient()

  const { data: vData } = useQuery({
    queryKey: ['vendedor', id],
    queryFn:  () => api.get(`/vendedores/${id}`),
  })

  const { data: convData, isLoading } = useQuery({
    queryKey: ['convs-vendedor', id],
    queryFn:  () => api.get(`/conversations?vendedorId=${id}&limit=100`),
    refetchInterval: 20_000,
  })

  const v         = vData?.vendedor
  const convs     = convData?.conversations || []
  const connected = v?.whatsapp?.status === 'connected'
  // Ver comentario equivalente en VendedoresPage.jsx — una línea de rotación desconectada
  // con sesión guardada no es lo mismo que una línea que nunca se vinculó.
  const esSesionGuardada = v?.whatsapp?.status === 'disconnected' && v?.rotarSoloEstados && v?.whatsapp?.connectedAt

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="px-5 py-3 border-b border-gray-100 bg-white flex items-center gap-3 shrink-0">
        <button onClick={() => navigate('/vendedores')} className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <h2 className="text-base font-bold">{v?.nombre || '…'}</h2>
          <p className="text-xs text-gray-400">{v?.zona || 'Sin zona'}</p>
        </div>
        <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${connected ? 'bg-green-50 text-green-600' : esSesionGuardada ? 'bg-blue-50 text-blue-500' : 'bg-gray-50 text-gray-400'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-500' : esSesionGuardada ? 'bg-blue-400' : 'bg-gray-300'}`} />
          {connected ? 'Conectado' : esSesionGuardada ? 'Sesión guardada' : 'Desconectado'}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 bg-white px-5 shrink-0">
        {[
          ['inbox', '💬', 'Inbox'],
          ['clientes', '👥', 'Clientes'],
          // La línea principal / Meta API no usa Puppeteer — no hay WhatsApp Web que transmitir
          ...(v?.esPrincipal || v?.metaApi?.enabled ? [] : [['vivo', '📡', 'Ver en vivo']]),
        ].map(([key, icon, lbl]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === key ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {icon} {lbl}
            {key === 'inbox' && convs.length > 0 && (
              <span className="bg-brand/10 text-brand text-xs rounded-full px-1.5 font-bold">{convs.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'clientes' && (
        <div className="flex-1 min-h-0">
          <ClientesTab vendedorId={id} />
        </div>
      )}

      {/* Se mantiene montada al cambiar de pestaña (solo oculta) para no cortar la
          transmisión en vivo — solo se cierra si el usuario le da "Finalizar". */}
      <div className={`flex-1 min-h-0 ${tab === 'vivo' ? 'flex flex-col' : 'hidden'}`}>
        <VistaEnVivo vendedorId={id} vendedorNombre={v?.nombre} />
      </div>

      {tab === 'inbox' && (
        <div className="flex flex-1 min-h-0">
          {/* Lista conversaciones */}
          <div className="w-72 shrink-0 border-r border-gray-800">
            <ConversationList
              conversations={convs}
              selected={selectedConv}
              onSelect={setSelectedConv}
              isLoading={isLoading}
              queryKeys={['convs-vendedor', id]}
              emptyText="Sin conversaciones aún"
            />
          </div>

          {/* Chat */}
          {selectedConv ? (
            <WhatsAppChat
              key={selectedConv._id}
              conversation={selectedConv}
              vendedorId={id}
              onClose={() => setSelectedConv(null)}
              onConvUpdated={() => qc.invalidateQueries(['convs-vendedor', id])}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center bg-[#222e35] gap-3">
              <Users size={36} className="text-gray-600" />
              <p className="text-gray-400 text-sm">Selecciona una conversación</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
