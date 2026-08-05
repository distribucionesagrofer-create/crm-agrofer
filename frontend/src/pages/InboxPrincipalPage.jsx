import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import { ChevronDown, Wifi, WifiOff, Users } from 'lucide-react'
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

  const [vendedorId, setVendedorId]     = useState(initV || null)
  const [pendingConvId]                 = useState(initC || null)
  const [selectedConv, setSelectedConv] = useState(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [tab, setTab]                   = useState('inbox')
  const qc = useQueryClient()

  // Cargar vendedores
  const { data: vData } = useQuery({
    queryKey: ['vendedores-inbox'],
    queryFn:  () => api.get('/vendedores'),
  })
  const vendedores = [...(vData?.vendedores || [])].sort((a, b) => {
    if (a.slug === 'linea-principal') return -1
    if (b.slug === 'linea-principal') return  1
    const aConn = a.whatsapp?.status === 'connected' ? 0 : 1
    const bConn = b.whatsapp?.status === 'connected' ? 0 : 1
    return aConn - bConn
  })

  // Seleccionar línea al cargar (param URL o línea principal por defecto)
  useEffect(() => {
    if (vendedores.length > 0 && !vendedorId) {
      const linea = vendedores.find(v => v.slug === 'linea-principal')
      if (linea) setVendedorId(linea._id)
    }
  }, [vendedores])

  const vendedorActual   = vendedores.find(v => v._id === vendedorId)
  const connected        = vendedorActual?.whatsapp?.status === 'connected'
  const esLineaPrincipal = vendedorActual?.slug === 'linea-principal'

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

  const cambiarVendedor = (id) => {
    setVendedorId(id)
    setSelectedConv(null)
    setDropdownOpen(false)
    setTab('inbox')
  }

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

          {/* Selector de línea */}
          <div className="relative">
            <button onClick={() => setDropdownOpen(v => !v)}
              className="w-full flex items-center gap-2 bg-[#2a3942] hover:bg-[#374248] px-3 py-2 rounded-lg transition-colors text-left">
              <div className={`w-2 h-2 rounded-full shrink-0 ${connected ? 'bg-green-500' : 'bg-gray-500'}`} />
              <span className="flex-1 text-sm text-gray-200 truncate">{vendedorActual?.nombre || 'Seleccionar…'}</span>
              {vendedorActual?.zona && <span className="text-xs text-gray-500 shrink-0">{vendedorActual.zona}</span>}
              <ChevronDown size={14} className={`text-gray-400 shrink-0 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {dropdownOpen && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-[#233138] border border-gray-700 rounded-xl shadow-2xl z-30 max-h-72 overflow-y-auto">
                {vendedores.map(v => {
                  const conn    = v.whatsapp?.status === 'connected'
                  const isLinea = v.slug === 'linea-principal'
                  return (
                    <button key={v._id} onClick={() => cambiarVendedor(v._id)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[#2a3942] transition-colors ${v._id === vendedorId ? 'bg-[#2a3942]' : ''} ${isLinea ? 'border-b border-gray-700' : ''}`}>
                      <div className={`w-2 h-2 rounded-full shrink-0 ${conn ? 'bg-green-500' : 'bg-gray-600'}`} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${isLinea ? 'text-brand' : 'text-gray-200'}`}>{v.nombre}</p>
                        {v.zona && <p className="text-xs text-gray-500">{v.zona}</p>}
                      </div>
                      {v._id === vendedorId && <div className="w-1.5 h-1.5 rounded-full bg-brand shrink-0" />}
                    </button>
                  )
                })}
              </div>
            )}
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
              {vendedorActual ? `Viendo: ${vendedorActual.nombre}` : 'Elige una línea WhatsApp arriba'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
