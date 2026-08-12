import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import { Wifi, WifiOff, Users } from 'lucide-react'
import api from '../services/api'
import { socket, joinVendedor } from '../services/socket'
import ConversationList from '../components/ConversationList'
import WhatsAppChat from '../components/WhatsAppChat'

function requestNotifPerm() {
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission()
}
function getNotifConfig() {
  try { return JSON.parse(localStorage.getItem('agrofer_notif_config') || '{}') }
  catch { return {} }
}
function showNotif(title, body, vendedorId) {
  const cfg = getNotifConfig()
  const notifOn = cfg[vendedorId]?.notif ?? true
  const sonidoOn = cfg[vendedorId]?.sonido ?? false
  if (notifOn && 'Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.ico' })
  }
  if (sonidoOn) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const osc = ctx.createOscillator(), gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.setValueAtTime(880, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15)
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3)
    } catch(_) {}
  }
}

export default function InboxPrincipalPage() {
  const location   = useLocation()
  const urlParams  = new URLSearchParams(location.search)
  const initV      = urlParams.get('v')
  const initC      = urlParams.get('c')
  const openedRef  = useRef(false)   // para no re-abrir la conv en cada re-render

  const [pendingConvId]                 = useState(initC || null)
  const [selectedConv, setSelectedConv] = useState(null)
  const [tab, setTab]                   = useState('inbox')
  const qc = useQueryClient()

  // El Inbox es solo para la línea principal (Meta API) — las demás líneas (whatsapp-web.js)
  // no manejan chat en vivo desde el CRM, el vendedor responde desde su propio celular.
  const { data: vData } = useQuery({
    queryKey: ['vendedores-inbox'],
    queryFn:  () => api.get('/vendedores'),
  })
  const vendedorActual = (vData?.vendedores || []).find(v => v.slug === 'linea-principal')
  const vendedorId     = vendedorActual?._id || initV || null
  // La línea principal opera por Meta API, no por whatsapp-web.js — su estado real
  // depende de tener la API activa, no de whatsapp.status (eso es de la sesión QR vieja).
  const connected       = !!(vendedorActual?.metaApi?.enabled && vendedorActual?.metaApi?.accessToken)
  const esLineaPrincipal = true

  // Socket — notificaciones y refresco
  useEffect(() => {
    if (!vendedorId) return
    requestNotifPerm()
    joinVendedor(vendedorId)
    const h = ({ conversation: cId, message }) => {
      qc.invalidateQueries(['convs-inbox', vendedorId])
      if (message?.direction === 'inbound') {
        showNotif(`Mensaje de ${vendedorActual?.nombre || 'WhatsApp'}`, message.content || '[media]')
      }
    }
    const hEsc = ({ contactoNombre, razon, urgencia }) => {
      qc.invalidateQueries(['convs-inbox', vendedorId])
      const titulo = urgencia === 'alta' ? 'Atencion requerida' : 'Conversacion escalada'
      const cuerpo = `${contactoNombre} — ${razon.replace(/_/g, ' ')}`
      showNotif(titulo, cuerpo, vendedorId)
    }
    socket.on('message:new', h)
    socket.on('bot:escalacion', hEsc)
    return () => { socket.off('message:new', h); socket.off('bot:escalacion', hEsc) }
  }, [vendedorId])

  // Conversaciones
  const { data: convData, isLoading: loadingConvs } = useQuery({
    queryKey: ['convs-inbox', vendedorId],
    queryFn:  () => api.get(`/conversations?vendedorId=${vendedorId}&limit=100`),
    enabled:  !!vendedorId,
    refetchInterval: 20_000,
  })

  // Leads (solo línea principal)
  const { data: leadsData } = useQuery({
    queryKey: ['leads-inbox', vendedorId],
    queryFn:  () => api.get('/leads?status=nuevo&limit=50'),
    enabled:  !!vendedorId && esLineaPrincipal,
    refetchInterval: 20_000,
  })

  const convs        = convData?.conversations || []
  const leads        = leadsData?.leads        || []
  const nuevosLeads  = leads.filter(l => l.status === 'nuevo').length

  // Auto-abrir conversación si viene de URL (?c=convId) — solo una vez
  useEffect(() => {
    if (pendingConvId && convs.length > 0 && !openedRef.current) {
      const conv = convs.find(c => c._id === pendingConvId)
      if (conv) { openedRef.current = true; setSelectedConv(conv) }
    }
  }, [convs, pendingConvId])

  return (
    <div className="flex flex-1 min-h-0 min-w-0 bg-[#111b21]">

      {/* â"€â"€ Sidebar â"€â"€ */}
      <div className="w-80 shrink-0 flex flex-col border-r border-gray-800">

        {/* Header sidebar */}
        <div className="bg-[#202c33] px-4 py-3 shrink-0 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-semibold text-sm">Inbox</h2>
            <div className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${connected ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
              {connected ? <Wifi size={10} /> : <WifiOff size={10} />}
              {connected ? 'Activo' : 'Inactivo'}
            </div>
          </div>

          {/* Línea principal — única línea que maneja chat en vivo */}
          <div className="w-full flex items-center gap-2 bg-[#2a3942] px-3 py-2 rounded-lg">
            <div className={`w-2 h-2 rounded-full shrink-0 ${connected ? 'bg-green-500' : 'bg-gray-500'}`} />
            <span className="flex-1 text-sm text-gray-200 truncate">{vendedorActual?.nombre || 'Línea Principal AGROFER'}</span>
          </div>

          {/* Tabs solo para línea principal */}
          {esLineaPrincipal && (
            <div className="flex gap-1">
              {[
                ['inbox', '💬 Chats', convs.length],
                ['leads', '👤 Leads', nuevosLeads],
              ].map(([key, lbl, count]) => (
                <button key={key} onClick={() => setTab(key)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    tab === key ? 'bg-brand/20 text-brand' : 'text-gray-400 hover:bg-white/5'
                  }`}>
                  {lbl}
                  {count > 0 && (
                    <span className={`text-[10px] rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 font-bold ${
                      key === 'leads' ? 'bg-amber-500 text-white' : 'bg-brand/30 text-brand'
                    }`}>{count}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Lista de conversaciones */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {tab === 'inbox' && (
            <ConversationList
              conversations={convs}
              selected={selectedConv}
              onSelect={setSelectedConv}
              isLoading={loadingConvs}
              queryKeys={['convs-inbox', vendedorId]}
              emptyText="Sin conversaciones aún"
            />
          )}

          {tab === 'leads' && esLineaPrincipal && (
            <div className="bg-[#111b21] h-full overflow-y-auto">
              {!leads.length && (
                <div className="text-center py-12 text-gray-500 text-sm">Sin leads nuevos</div>
              )}
              {leads.map(l => (
                <div key={l._id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-800/50 hover:bg-[#202c33] transition-colors">
                  <div className="w-10 h-10 rounded-full bg-amber-900/50 flex items-center justify-center text-amber-300 font-bold text-sm shrink-0">
                    {l.name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-200 font-medium truncate">{l.name || l.phone}</p>
                    <p className="text-xs text-gray-500">{l.phone}</p>
                  </div>
                  <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full font-medium">Nuevo</span>
                </div>
              ))}
              {leads.length > 0 && (
                <a href="/leads" className="block text-center text-xs text-brand py-3 hover:underline">
                  Gestionar y delegar â†'
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {/* â"€â"€ Chat panel â"€â"€ */}
      {selectedConv ? (
        <WhatsAppChat
          key={selectedConv._id}
          conversation={selectedConv}
          vendedorId={vendedorId}
          onConvUpdated={() => qc.invalidateQueries(['convs-inbox', vendedorId])}
        />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center bg-[#222e35] gap-4">
          <div className="w-16 h-16 rounded-full bg-[#2a3942] flex items-center justify-center">
            <Users size={28} className="text-gray-500" />
          </div>
          <div className="text-center">
            <p className="text-gray-300 font-medium">Selecciona una conversación</p>
            <p className="text-gray-500 text-sm mt-1">
              {vendedorActual ? `Viendo: ${vendedorActual.nombre}` : 'Cargando línea principal…'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
