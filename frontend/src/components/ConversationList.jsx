import { useState } from 'react'
import { Search, X, Trash2, MessageSquare, Users, Bot, Eye, UserX, User } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'

const STAGE_CONFIG = {
  nuevo:           { label: 'Nuevo',      cls: 'bg-gray-100 text-gray-500' },
  saludado:        { label: 'Saludado',   cls: 'bg-blue-50 text-blue-500' },
  en_dialogo:      { label: 'En dialogo', cls: 'bg-cyan-50 text-cyan-600' },
  esperando_dato:  { label: 'Esperando',  cls: 'bg-yellow-50 text-yellow-600' },
  lead_calificado: { label: 'Lead',       cls: 'bg-green-100 text-green-700' },
  escalado:        { label: 'Escalado',   cls: 'bg-orange-100 text-orange-600' },
  cerrado:         { label: 'Cerrado',    cls: 'bg-gray-100 text-gray-400' },
}

const STAGE_FILTERS = [
  { key: 'todos',           label: 'Todos' },
  { key: 'escalado',        label: 'Escalados' },
  { key: 'lead_calificado', label: 'Leads' },
  { key: 'en_dialogo',      label: 'En dialogo' },
  { key: 'nuevo',           label: 'Nuevos' },
]

function fmtTime(date) {
  if (!date) return ''
  const d = new Date(date), now = new Date()
  const diff = Math.floor((now - d) / 86400000)
  if (diff === 0) return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
  if (diff === 1) return 'Ayer'
  if (diff < 7)  return d.toLocaleDateString('es', { weekday: 'short' })
  return d.toLocaleDateString('es', { day: '2-digit', month: '2-digit' })
}

function previewMsg(msg) {
  if (!msg) return ''
  const pre = msg.direction === 'outbound' ? 'Tú: ' : ''
  if (msg.type === 'image')    return pre + '📷 Foto'
  if (msg.type === 'video')    return pre + '🎥 Video'
  if (msg.type === 'audio')    return pre + '🎵 Audio'
  if (msg.type === 'document') return pre + '📄 Archivo'
  if (msg.type === 'sticker')  return pre + '🎭 Sticker'
  return pre + (msg.content?.slice(0, 50) || '')
}

function fmtPhone(phone) {
  if (!phone) return ''
  const p = String(phone).replace(/\D/g, '')
  if (p.startsWith('57') && p.length === 12) {
    const l = p.slice(2)
    return `+57 ${l.slice(0,3)} ${l.slice(3,6)} ${l.slice(6)}`
  }
  return p || phone
}

export default function ConversationList({
  conversations = [],
  selected,
  onSelect,
  isLoading,
  emptyText = 'Sin conversaciones',
  queryKeys = [],
}) {
  const [search, setSearch]           = useState('')
  const [stageFilter, setStageFilter] = useState('todos')
  const [tagFilter, setTagFilter]     = useState('')
  const [hoverId, setHoverId]         = useState(null)
  const [confirmId, setConfirmId]     = useState(null)
  const qc = useQueryClient()

  // Gather all unique tags from conversations
  const allTags = [...new Set(conversations.flatMap(c => c.etiquetas || []))].sort()

  const eliminar = useMutation({
    mutationFn: (id) => api.delete(`/conversations/${id}`),
    onSuccess: () => {
      queryKeys.forEach(k => qc.invalidateQueries([k]))
      setConfirmId(null)
    },
  })

  const filtered = conversations.filter(c => {
    if (stageFilter !== 'todos' && c.botState?.stage !== stageFilter) return false
    if (tagFilter && !(c.etiquetas || []).includes(tagFilter)) return false
    if (!search) return true
    const contact = c.customer || c.lead
    const name  = (contact?.name || '').toLowerCase()
    const phone = fmtPhone(contact?.phone || c.phone).toLowerCase()
    const s = search.toLowerCase()
    return name.includes(s) || phone.includes(s)
  })

  const stageCounts = STAGE_FILTERS.reduce((acc, f) => {
    acc[f.key] = f.key === 'todos'
      ? conversations.length
      : conversations.filter(c => c.botState?.stage === f.key).length
    return acc
  }, {})

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      {/* Buscador */}
      <div className="px-3 py-2.5 border-b border-gray-100 bg-gray-50 space-y-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
          <input
            className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand/20"
            placeholder="Buscar conversacion..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>
        {/* Filtros por etapa del bot */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
          {STAGE_FILTERS.map(f => {
            const count = stageCounts[f.key] || 0
            const isActive = stageFilter === f.key
            if (f.key !== 'todos' && count === 0) return null
            return (
              <button key={f.key} onClick={() => setStageFilter(f.key)}
                className={`shrink-0 flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full transition-colors ${
                  isActive
                    ? 'bg-brand text-white'
                    : 'bg-white border border-gray-200 text-gray-500 hover:border-brand/40 hover:text-brand'
                }`}>
                {f.label}
                {count > 0 && <span className={`text-[10px] font-bold ${isActive ? 'opacity-80' : 'text-gray-400'}`}>{count}</span>}
              </button>
            )
          })}
        </div>
        {/* Filtros por etiqueta */}
        {allTags.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
            {tagFilter && (
              <button onClick={() => setTagFilter('')}
                className="shrink-0 flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full bg-brand text-white">
                <X size={10} /> {tagFilter}
              </button>
            )}
            {allTags.filter(t => t !== tagFilter).map(t => (
              <button key={t} onClick={() => setTagFilter(t)}
                className="shrink-0 flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full bg-white border border-gray-200 text-gray-500 hover:border-brand/40 hover:text-brand transition-colors">
                🏷 {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="space-y-0">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 animate-pulse">
                <div className="w-11 h-11 rounded-full bg-gray-100 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-gray-100 rounded w-3/4" />
                  <div className="h-3 bg-gray-50 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && !filtered.length && (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
            <MessageSquare size={28} className="opacity-30" />
            <p className="text-sm">{search ? 'Sin resultados' : emptyText}</p>
          </div>
        )}

        {filtered.map(c => {
          const contact    = c.customer || c.lead
          const isSelected = selected?._id === c._id
          const isLead     = !!c.lead
          const isGroup    = !!c.isGroup
          const isClosed   = c.status === 'closed'
          const unread     = c.unreadCount || 0
          const nombre     = isGroup ? (c.groupName || 'Grupo') : (contact?.name || c.contactName || c.phone || '—')
          const telefono   = isGroup ? '' : fmtPhone(contact?.phone || c.phone)

          return (
            <div
              key={c._id}
              className={`relative flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-gray-50 transition-colors select-none ${
                isSelected
                  ? 'bg-brand/8 border-l-2 border-l-brand'
                  : 'hover:bg-gray-50'
              } ${isClosed ? 'opacity-60' : ''}`}
              onMouseEnter={() => setHoverId(c._id)}
              onMouseLeave={() => { setHoverId(null); setConfirmId(null) }}
              onClick={() => !confirmId && onSelect(c)}
            >
              {/* Avatar */}
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-base text-white shrink-0 overflow-hidden"
                style={{ background: isGroup ? '#3b82f6' : isLead ? '#92400e' : '#1f6b45' }}
              >
                {isGroup
                  ? <Users size={18} className="text-white" />
                  : c.profileImage
                    ? <img src={c.profileImage} alt="" className="w-full h-full object-cover"
                        onError={e => { e.target.style.display = 'none' }} />
                    : contact?.name?.[0]
                      ? contact.name[0].toUpperCase()
                      : <User size={18} className="text-white/80" />
                }
              </div>

              {/* Contenido */}
              <div className="flex-1 min-w-0">
                {/* Fila 1: Nombre + hora */}
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className={`text-sm font-semibold truncate ${isSelected ? 'text-brand' : 'text-gray-900'}`}>
                      {nombre}
                    </p>
                    {isLead && (
                      <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold shrink-0">LEAD</span>
                    )}
                    {isGroup && (
                      <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold shrink-0">GRUPO</span>
                    )}
                    {c.isMonitoreo && (
                      <span className="text-[9px] bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-full font-bold shrink-0 flex items-center gap-0.5">
                        <Eye size={8} />MON
                      </span>
                    )}
                    {c.contactoDesconocido && (
                      <span className="text-[9px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-bold shrink-0 flex items-center gap-0.5">
                        <UserX size={8} />NUEVO
                      </span>
                    )}
                    {isClosed && (
                      <span className="text-[9px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full font-bold shrink-0">CERRADA</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    {c.aiEnabled && (
                      <Bot size={11} className="text-brand opacity-70" title="Bot activo" />
                    )}
                    <span className="text-xs text-gray-400">{fmtTime(c.lastMessageAt)}</span>
                  </div>
                </div>

                {/* Fila 2: Teléfono (si no es grupo) */}
                {telefono && (
                  <p className="text-xs text-gray-400 truncate font-mono mb-0.5">{telefono}</p>
                )}

                {/* Fila 3: Preview del último mensaje + badge estado bot + unread */}
                <div className="flex items-center justify-between gap-1">
                  <p className="text-xs text-gray-500 truncate flex-1">
                    {previewMsg(c.lastMessage)}
                  </p>
                  <div className="flex items-center gap-1 shrink-0">
                    {c.botState?.stage && c.botState.stage !== 'nuevo' && (() => {
                      const cfg = STAGE_CONFIG[c.botState.stage]
                      return cfg ? (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${cfg.cls}`}>
                          {cfg.label.toUpperCase()}
                        </span>
                      ) : null
                    })()}
                    {unread > 0 && (
                      <span className="bg-brand text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                        {unread > 99 ? '99+' : unread}
                      </span>
                    )}
                  </div>
                </div>
                {/* Fila 4: Etiquetas */}
                {c.etiquetas?.length > 0 && (
                  <div className="flex gap-1 flex-wrap mt-0.5">
                    {c.etiquetas.slice(0, 3).map(t => (
                      <span key={t} className="text-[9px] bg-brand/10 text-brand px-1.5 py-0.5 rounded-full font-medium">
                        {t}
                      </span>
                    ))}
                    {c.etiquetas.length > 3 && (
                      <span className="text-[9px] text-gray-400">+{c.etiquetas.length - 3}</span>
                    )}
                  </div>
                )}
              </div>

              {/* Botón eliminar — hover */}
              {hoverId === c._id && confirmId !== c._id && !isSelected && (
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmId(c._id) }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                  title="Eliminar conversación"
                >
                  <Trash2 size={13} />
                </button>
              )}

              {/* Confirmación eliminar */}
              {confirmId === c._id && (
                <div
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 bg-white border border-red-200 rounded-xl px-2.5 py-1.5 shadow-lg z-10"
                  onClick={e => e.stopPropagation()}
                >
                  <p className="text-xs text-red-600 font-medium whitespace-nowrap">¿Eliminar?</p>
                  <button
                    onClick={() => eliminar.mutate(c._id)}
                    disabled={eliminar.isPending}
                    className="text-xs bg-red-500 hover:bg-red-600 text-white px-2 py-0.5 rounded-lg font-medium transition-colors disabled:opacity-40"
                  >
                    Sí
                  </button>
                  <button
                    onClick={() => setConfirmId(null)}
                    className="text-xs text-gray-400 hover:text-gray-600 px-1"
                  >
                    No
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
