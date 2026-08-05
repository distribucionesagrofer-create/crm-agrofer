import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Send, Paperclip, X, RefreshCw, Check, CheckCheck,
  ChevronLeft, User, StickyNote, Bot,
  Download, UserCheck, Phone, Sparkles, Lock, Unlock, PowerOff, AlertTriangle, UserX, UserPlus, Zap, Search, Tag, Plus, Trash2, Smile, Play, Pause,
} from 'lucide-react'
import api from '../services/api'
import { socket } from '../services/socket'

// ── Panel lateral de info del contacto ───────────────────────────────────────
function ContactPanel({ conversation, onClose, onConvUpdated }) {
  const contact  = conversation.customer || conversation.lead
  const isLead   = !!conversation.lead
  const qc       = useQueryClient()
  const [nota, setNota]         = useState('')
  const [saving, setSaving]     = useState(false)
  const [etiquetas, setEtiquetas] = useState(conversation.etiquetas || [])
  const [newTag, setNewTag]     = useState('')

  const SUGERENCIAS = ['cotizacion', 'pedido', 'queja', 'urgente', 'finca', 'seguimiento', 'prospecto']

  const guardarEtiquetas = async (tags) => {
    setEtiquetas(tags)
    await api.patch(`/conversations/${conversation._id}`, { etiquetas: tags }).catch(() => {})
    qc.invalidateQueries(['convs-inbox'])
    onConvUpdated?.()
  }

  const addTag = (tag) => {
    const t = tag.trim().toLowerCase()
    if (!t || etiquetas.includes(t)) { setNewTag(''); return }
    guardarEtiquetas([...etiquetas, t])
    setNewTag('')
  }

  const removeTag = (tag) => guardarEtiquetas(etiquetas.filter(t => t !== tag))

  const leadId = conversation.lead?._id || conversation.lead || null

  const cambiarEstado = useMutation({
    mutationFn: (estado) => leadId ? api.patch(`/leads/${leadId}`, { status: estado }) : Promise.reject('No lead'),
    onSuccess: () => qc.invalidateQueries(['chat-msgs', conversation._id]),
  })

  const agregarNota = useMutation({
    mutationFn: () => api.post(`/conversations/${conversation._id}/notes`, { content: nota }),
    onSuccess: () => { setNota(''); qc.invalidateQueries(['chat-msgs', conversation._id]) },
  })

  const convertir = useMutation({
    mutationFn: () => leadId ? api.post(`/leads/${leadId}/convertir`) : Promise.reject('No lead'),
    onSuccess: (r) => { alert(r.message); qc.invalidateQueries(['convs-inbox']) },
    onError: (e) => alert(e?.error || 'Error'),
  })

  const ESTADOS_LEAD = [
    { value: 'nuevo',       label: 'Nuevo',       color: 'bg-blue-100 text-blue-700' },
    { value: 'contactado',  label: 'Contactado',  color: 'bg-yellow-100 text-yellow-700' },
    { value: 'interesado',  label: 'Interesado',  color: 'bg-purple-100 text-purple-700' },
    { value: 'convertido',  label: 'Convertido',  color: 'bg-green-100 text-green-700' },
    { value: 'descartado',  label: 'Descartado',  color: 'bg-gray-100 text-gray-500' },
  ]

  return (
    <div className="w-72 shrink-0 flex flex-col bg-[#111b21] border-l border-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#202c33] shrink-0">
        <p className="text-white text-sm font-semibold">Info del contacto</p>
        <button onClick={onClose} className="text-gray-400 hover:text-white p-1"><X size={16} /></button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Avatar y nombre */}
        <div className="flex flex-col items-center py-6 px-4 border-b border-gray-800">
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white mb-3"
            style={{ background: isLead ? '#92400e' : '#065f46' }}>
            {contact?.name?.[0]?.toUpperCase() || '?'}
          </div>
          <p className="text-white font-semibold text-base">{contact?.name || 'Sin nombre'}</p>
          <p className="text-gray-400 text-xs mt-1 flex items-center gap-1">
            <Phone size={11} /> {contact?.phone || conversation.phone}
          </p>
          <div className="flex gap-2 mt-2">
            {isLead && <span className="text-xs bg-amber-600/30 text-amber-300 px-2 py-0.5 rounded-full font-medium">Lead</span>}
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${conversation.status === 'open' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
              {conversation.status === 'open' ? 'Abierta' : 'Cerrada'}
            </span>
          </div>
        </div>

        {/* Estado del lead */}
        {isLead && (
          <div className="px-4 py-4 border-b border-gray-800">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Estado del lead</p>
            <div className="space-y-1.5">
              {ESTADOS_LEAD.map(e => (
                <button key={e.value}
                  onClick={() => cambiarEstado.mutate(e.value)}
                  className={`w-full text-left text-xs px-3 py-2 rounded-lg font-medium transition-colors ${
                    conversation.lead?.status === e.value
                      ? e.color + ' ring-1 ring-current'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}>
                  {e.label}
                </button>
              ))}
            </div>
            {conversation.lead?.status !== 'convertido' && (
              <button onClick={() => convertir.mutate()}
                disabled={convertir.isPending}
                className="w-full mt-3 bg-green-600 hover:bg-green-700 text-white text-xs py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40">
                <UserCheck size={13} /> Convertir a cliente
              </button>
            )}
          </div>
        )}

        {/* Estado del Bot */}
        {conversation.botState?.stage && (
          <div className="px-4 py-3 border-b border-gray-800">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
              <Bot size={11} /> Estado del Bot
            </p>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Etapa</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  conversation.botState.stage === 'escalado'        ? 'bg-orange-500/20 text-orange-300' :
                  conversation.botState.stage === 'lead_calificado' ? 'bg-green-500/20 text-green-300'  :
                  conversation.botState.stage === 'en_dialogo'      ? 'bg-cyan-500/20 text-cyan-300'    :
                  'bg-gray-500/20 text-gray-400'
                }`}>
                  {conversation.botState.stage.replace('_', ' ').toUpperCase()}
                </span>
              </div>
              {conversation.botState.intentos > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">Respuestas IA</span>
                  <span className="text-xs text-gray-300">{conversation.botState.intentos}</span>
                </div>
              )}
              {conversation.botState.lastIntent && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">Ultima intencion</span>
                  <span className="text-xs text-gray-300">{conversation.botState.lastIntent}</span>
                </div>
              )}
              {conversation.escalacionRazon && (
                <div className="mt-1 bg-orange-900/30 rounded-lg px-2 py-1.5">
                  <p className="text-[10px] text-orange-300">Escalado: {conversation.escalacionRazon.replace(/_/g, ' ')}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Info adicional */}
        {contact?.zona && (
          <div className="px-4 py-3 border-b border-gray-800">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Zona</p>
            <p className="text-xs text-gray-300">{contact.zona}</p>
          </div>
        )}

        {/* Etiquetas — editables */}
        <div className="px-4 py-3 border-b border-gray-800">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
            <Tag size={11} /> Etiquetas
          </p>
          <div className="flex flex-wrap gap-1 mb-2">
            {etiquetas.map(t => (
              <span key={t} className="flex items-center gap-1 text-[10px] bg-brand/20 text-brand px-2 py-0.5 rounded-full">
                {t}
                <button onClick={() => removeTag(t)} className="hover:text-red-400 transition-colors"><X size={9} /></button>
              </span>
            ))}
            {etiquetas.length === 0 && <span className="text-[10px] text-gray-500">Sin etiquetas</span>}
          </div>
          {/* Sugerencias rápidas */}
          <div className="flex flex-wrap gap-1 mb-2">
            {SUGERENCIAS.filter(s => !etiquetas.includes(s)).map(s => (
              <button key={s} onClick={() => addTag(s)}
                className="text-[10px] bg-gray-700 text-gray-400 hover:bg-brand/20 hover:text-brand px-2 py-0.5 rounded-full transition-colors">
                + {s}
              </button>
            ))}
          </div>
          {/* Input libre */}
          <div className="flex gap-1.5">
            <input
              className="flex-1 bg-[#2a3942] text-gray-300 text-xs rounded-lg px-2.5 py-1.5 outline-none border-0 placeholder-gray-500"
              placeholder="Nueva etiqueta..."
              value={newTag}
              onChange={e => setNewTag(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTag(newTag)}
            />
            <button onClick={() => addTag(newTag)}
              className="bg-brand/20 text-brand hover:bg-brand/30 p-1.5 rounded-lg transition-colors">
              <Plus size={13} />
            </button>
          </div>
        </div>

        {/* Notas */}
        <div className="px-4 py-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
            <StickyNote size={11} /> Notas internas
          </p>
          {conversation.notes?.map((n, i) => (
            <div key={i} className="bg-[#2a3942] rounded-lg px-3 py-2 mb-2">
              <p className="text-xs text-gray-300">{n.content}</p>
              <p className="text-[10px] text-gray-500 mt-1">{new Date(n.createdAt).toLocaleDateString('es')}</p>
            </div>
          ))}
          <textarea rows={2} className="w-full bg-[#2a3942] text-gray-300 text-xs rounded-lg px-3 py-2 outline-none border-0 resize-none placeholder-gray-500 mt-1"
            placeholder="Agregar nota interna..." value={nota} onChange={e => setNota(e.target.value)} />
          {nota.trim() && (
            <button onClick={() => agregarNota.mutate()} disabled={agregarNota.isPending}
              className="w-full mt-1.5 bg-brand text-white text-xs py-1.5 rounded-lg font-medium hover:bg-brand/80 transition-colors disabled:opacity-40">
              Guardar nota
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtTime(date) {
  return new Date(date).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
}

function fmtDateSep(date) {
  const d   = new Date(date)
  const now = new Date()
  const diff = Math.floor((now - d) / 86400000)
  if (diff === 0) return 'Hoy'
  if (diff === 1) return 'Ayer'
  if (diff < 7)  return d.toLocaleDateString('es', { weekday: 'long' })
  return d.toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' })
}

function isSameDay(a, b) {
  const da = new Date(a), db = new Date(b)
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate()
}

function previewContent(msg) {
  if (!msg) return ''
  if (msg.type === 'image')    return '📷 Foto'
  if (msg.type === 'video')    return '🎥 Video'
  if (msg.type === 'audio')    return '🎵 Audio'
  if (msg.type === 'document') return '📄 Archivo'
  return msg.content || ''
}

// ── Ticks de estado ───────────────────────────────────────────────────────────
function MsgTick({ status, aiGenerated }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-white/60 text-[10px] ml-1">
      {aiGenerated && <Bot size={9} className="opacity-70" />}
      {status === 'read'      ? <CheckCheck size={12} className="text-sky-300" />
       : status === 'delivered'? <CheckCheck size={12} />
       : status === 'sent'    ? <Check size={12} />
       : null}
    </span>
  )
}

function fmtFileSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes/1024).toFixed(1)} KB`
  return `${(bytes/1048576).toFixed(1)} MB`
}

// ── Audio player custom ───────────────────────────────────────────────────────
function AudioPlayer({ src, isOut }) {
  const audioRef = useRef()
  const [playing, setPlaying]   = useState(false)
  const [current, setCurrent]   = useState(0)
  const [duration, setDuration] = useState(0)

  const toggle = () => {
    if (!audioRef.current) return
    if (playing) { audioRef.current.pause(); setPlaying(false) }
    else         { audioRef.current.play();  setPlaying(true)  }
  }

  const fmt = (s) => {
    if (!s || isNaN(s)) return '0:00'
    const m = Math.floor(s / 60), sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const seek = (e) => {
    if (!duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    audioRef.current.currentTime = ((e.clientX - rect.left) / rect.width) * duration
  }

  const pct = duration ? (current / duration) * 100 : 0

  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 min-w-[230px]">
      <audio ref={audioRef} src={src} preload="metadata"
        onTimeUpdate={e => setCurrent(e.target.currentTime)}
        onLoadedMetadata={e => setDuration(e.target.duration)}
        onEnded={() => { setPlaying(false); setCurrent(0) }}
      />
      <button onClick={toggle}
        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-opacity hover:opacity-80"
        style={{ background: isOut ? 'rgba(255,255,255,0.25)' : '#25d366' }}>
        {playing
          ? <Pause size={14} className="text-white" />
          : <Play  size={14} className="text-white ml-0.5" />}
      </button>
      <div className="flex-1 space-y-1">
        <div className="relative h-1.5 rounded-full cursor-pointer overflow-hidden"
          style={{ background: isOut ? 'rgba(255,255,255,0.25)' : '#e5e7eb' }}
          onClick={seek}>
          <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-100"
            style={{
              width: `${pct}%`,
              background: isOut ? 'rgba(255,255,255,0.85)' : '#25d366',
            }} />
        </div>
        <div className="flex justify-between">
          <span className={`text-[10px] ${isOut ? 'text-white/60' : 'text-gray-400'}`}>{fmt(current)}</span>
          <span className={`text-[10px] ${isOut ? 'text-white/60' : 'text-gray-400'}`}>{fmt(duration)}</span>
        </div>
      </div>
    </div>
  )
}

// ── Emoji picker ──────────────────────────────────────────────────────────────
const EMOJIS = [
  '😀','😂','🤣','😊','😍','🥰','😎','🤩','😅','😭','😤','😢','🥺','🤔','😴','🤗','🥳','😏','😝','🤑',
  '👍','👎','👏','🙌','🤝','🙏','💪','👀','🫶','🫂','❤️','🧡','💛','💚','💙','💜','🖤','🩷','🔥','✨',
  '💯','🎉','🎊','🎁','🌟','⭐','🚀','🎯','🏆','🥇','🍕','🍔','🍺','☕','🌹','🌺','🌻','🌴','🐶','🐱',
  '😷','🤧','🤒','😈','👻','💀','🤖','👾','🎭','🃏','🎲','🏋️','💃','🕺','🇨🇴','🌎','💼','📱','💻','🔑',
]

function EmojiPicker({ onSelect, onClose }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
        <span className="text-xs font-semibold text-gray-500">Emojis</span>
        <button onClick={onClose} className="text-gray-300 hover:text-gray-500 transition-colors"><X size={13} /></button>
      </div>
      <div className="grid grid-cols-10 gap-0 p-1.5 max-h-44 overflow-y-auto">
        {EMOJIS.map(e => (
          <button key={e} onClick={() => onSelect(e)}
            className="text-lg hover:bg-brand/10 rounded-lg p-1 transition-colors leading-none">
            {e}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Burbuja de mensaje ────────────────────────────────────────────────────────
function MessageBubble({ msg, isOut, isGroup, showSender }) {
  // Sticker — sin burbuja, imagen transparente
  if (msg.type === 'sticker') {
    return (
      <div className={`flex flex-col ${isOut ? 'items-end' : 'items-start'}`}>
        {isGroup && !isOut && showSender && msg.senderName && (
          <p className="text-[11px] font-semibold text-brand px-1 mb-0.5">{msg.senderName}</p>
        )}
        {msg.mediaUrl
          ? <img src={msg.mediaUrl} alt="sticker" className="w-36 h-36 object-contain drop-shadow-sm"
              onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block' }}
            />
          : null}
        <span style={{ display: 'none' }} className="text-4xl">🎭</span>
        <span className="text-[10px] text-gray-400 px-1 mt-0.5">{fmtTime(msg.timestamp || msg.createdAt)}</span>
      </div>
    )
  }

  const base = `max-w-[72%] rounded-2xl overflow-hidden text-sm shadow-sm`
  const cls  = isOut
    ? `${base} bg-[#005c4b] text-white rounded-br-none ml-auto`
    : `${base} bg-white text-gray-800 rounded-bl-none`

  const ext = msg.fileName?.split('.').pop()?.toUpperCase() || ''

  return (
    <div className={`flex flex-col ${isOut ? 'items-end' : 'items-start'}`}>
      {/* Nombre del remitente en grupos */}
      {isGroup && !isOut && showSender && msg.senderName && (
        <p className="text-[11px] font-semibold text-brand px-1 mb-0.5">{msg.senderName}</p>
      )}
      <div className={cls}>
        {/* Imagen */}
        {msg.type === 'image' && msg.mediaUrl && (
          <a href={msg.mediaUrl} target="_blank" rel="noreferrer" className="block">
            <img
              src={msg.mediaUrl}
              alt="foto"
              className="max-w-xs max-h-64 object-cover w-full cursor-zoom-in rounded-t-2xl"
              onError={(e) => {
                e.target.style.display = 'none'
                e.target.nextSibling.style.display = 'flex'
              }}
            />
            <div style={{ display: 'none' }} className="px-3 py-3 items-center gap-2 text-xs opacity-60">
              📷 Imagen no disponible
            </div>
          </a>
        )}
        {/* Video */}
        {msg.type === 'video' && msg.mediaUrl && (
          <video
            controls
            className="max-w-xs max-h-64 w-full rounded-t-2xl"
            preload="metadata"
            onError={(e) => { e.target.style.display = 'none' }}
          >
            <source src={msg.mediaUrl} type={msg.mediaType || 'video/mp4'} />
            <source src={msg.mediaUrl} type="video/webm" />
          </video>
        )}
        {/* Audio — player custom */}
        {msg.type === 'audio' && msg.mediaUrl && (
          <AudioPlayer src={msg.mediaUrl} isOut={isOut} />
        )}
        {/* Documento */}
        {msg.type === 'document' && msg.mediaUrl && (
          <a
            href={msg.mediaUrl}
            download={msg.fileName || 'archivo'}
            target="_blank"
            rel="noreferrer"
            className={`flex items-center gap-3 px-3 py-3 ${isOut ? 'hover:bg-white/10' : 'hover:bg-gray-50'} transition-colors`}
          >
            <div className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center shrink-0 text-[9px] font-bold ${isOut ? 'bg-white/20 text-white' : 'bg-brand/10 text-brand'}`}>
              <Download size={14} className="mb-0.5" />
              {ext && <span>{ext}</span>}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium truncate max-w-40">{msg.fileName || 'Archivo adjunto'}</p>
              {msg.fileSize && <p className={`text-[10px] ${isOut ? 'text-white/50' : 'text-gray-400'}`}>{fmtFileSize(msg.fileSize)}</p>}
            </div>
          </a>
        )}
        {/* Texto / caption — nunca mostrar base64 crudo */}
        {msg.content && !/^(\/9j\/|iVBOR|R0lGOD|UklGR|PHN2Zy)/.test(msg.content) && (
          <p className={`px-3 whitespace-pre-wrap break-words leading-relaxed ${msg.type !== 'text' ? 'pt-1 pb-1 text-xs' : 'pt-2 pb-1'}`}>{msg.content}</p>
        )}
        {/* Footer: hora + tick */}
        <div className={`flex items-center justify-end gap-1 px-2.5 pb-1.5 pt-0.5`}>
          <span className={`text-[10px] ${isOut ? 'text-white/60' : 'text-gray-400'}`}>
            {fmtTime(msg.timestamp || msg.createdAt)}
          </span>
          {isOut && <MsgTick status={msg.status} aiGenerated={msg.aiGenerated} />}
        </div>
      </div>
    </div>
  )
}

// ── Separador de fecha ────────────────────────────────────────────────────────
function DateSeparator({ date }) {
  return (
    <div className="flex items-center justify-center my-3">
      <span className="bg-white/80 backdrop-blur text-gray-500 text-xs px-3 py-1 rounded-full shadow-sm border border-gray-100">
        {fmtDateSep(date)}
      </span>
    </div>
  )
}

// ── Barra de acciones rápidas debajo del header ───────────────────────────────
function ChatActionBar({ conversation, vendedorId, onConvUpdated }) {
  const qc = useQueryClient()
  const [aiSummary, setAiSummary]   = useState(null)
  const [loadingAI, setLoadingAI]   = useState(false)
  const [botOn, setBotOn]           = useState(conversation.aiEnabled ?? true)

  // Sincronizar botOn si cambia la conversación
  useEffect(() => { setBotOn(conversation.aiEnabled ?? true) }, [conversation._id])

  const toggleBot = useMutation({
    mutationFn: (enabled) => api.patch(`/conversations/${conversation._id}`, { aiEnabled: enabled }),
    onSuccess: (_, enabled) => {
      setBotOn(enabled)
      qc.invalidateQueries(['convs-inbox'])
      onConvUpdated?.()
    },
  })

  const summarize = async () => {
    setLoadingAI(true)
    setAiSummary(null)
    try {
      const res = await api.post(`/conversations/${conversation._id}/summarize`, {})
      setAiSummary(res.summary)
    } catch {
      setAiSummary('No se pudo generar el resumen.')
    } finally {
      setLoadingAI(false)
    }
  }

  return (
    <div className="bg-[#f0f7ff] border-b border-blue-100 px-4 py-2 shrink-0">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Toggle bot */}
        <button
          onClick={() => toggleBot.mutate(!botOn)}
          disabled={toggleBot.isPending}
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
            botOn
              ? 'bg-brand/10 text-brand border-brand/20 hover:bg-brand/20'
              : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
          }`}
          title={botOn ? 'Bot activo — clic para desactivar' : 'Bot inactivo — clic para activar'}
        >
          {botOn ? <Bot size={12} /> : <PowerOff size={12} />}
          {botOn ? 'Bot activo' : 'Bot apagado'}
        </button>

        {/* Resumen IA */}
        <button
          onClick={summarize}
          disabled={loadingAI}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border bg-purple-50 text-purple-600 border-purple-200 hover:bg-purple-100 transition-colors"
        >
          <Sparkles size={12} className={loadingAI ? 'animate-spin' : ''} />
          {loadingAI ? 'Resumiendo…' : 'Resumen IA'}
        </button>

        {/* Cerrar / reabrir conversación */}
        <button
          onClick={() => api.patch(`/conversations/${conversation._id}`, {
            status: conversation.status === 'open' ? 'closed' : 'open'
          }).then(() => { qc.invalidateQueries(['convs-inbox']); onConvUpdated?.() })}
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
            conversation.status === 'open'
              ? 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-red-50 hover:text-red-500 hover:border-red-200'
              : 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100'
          }`}
        >
          {conversation.status === 'open' ? <Lock size={12} /> : <Unlock size={12} />}
          {conversation.status === 'open' ? 'Cerrar chat' : 'Reabrir chat'}
        </button>

        {/* Resumen expandido */}
        {aiSummary && (
          <div className="w-full mt-1 bg-white border border-purple-100 rounded-xl px-3 py-2 flex items-start gap-2">
            <Sparkles size={13} className="text-purple-400 mt-0.5 shrink-0" />
            <p className="text-xs text-gray-700 flex-1">{aiSummary}</p>
            <button onClick={() => setAiSummary(null)} className="text-gray-300 hover:text-gray-500 shrink-0">
              <X size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function WhatsAppChat({ conversation, vendedorId, onClose, onConvUpdated, showBackButton = false }) {
  const [text, setText]       = useState('')
  const [media, setMedia]     = useState(null)
  const [sending, setSending] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [page, setPage]     = useState(1)
  const [allLoaded, setAllLoaded] = useState(false)
  const [needsAttention, setNeedsAttention]           = useState(conversation.needsAttention ?? false)
  const [contactoDesconocido, setContactoDesconocido] = useState(conversation.contactoDesconocido ?? false)
  const [showCrearCliente, setShowCrearCliente]       = useState(false)
  const [nuevoNombre, setNuevoNombre]                 = useState('')
  const [nuevoZona, setNuevoZona]                     = useState('')
  const [creandoCliente, setCreandoCliente]           = useState(false)
  const [showQR, setShowQR]                           = useState(false)
  const [qrSearch, setQrSearch]                       = useState('')
  const [showEmoji, setShowEmoji]                     = useState(false)
  const fileRef   = useRef()
  const bottomRef = useRef()
  const scrollRef = useRef()
  const qc = useQueryClient()

  // Acumular mensajes de todas las páginas
  const [allMessages, setAllMessages] = useState([])

  const { data: qrData } = useQuery({
    queryKey: ['quick-replies'],
    queryFn:  () => api.get('/quick-replies'),
    staleTime: 60000,
  })
  const quickReplies = (qrData?.replies || []).filter(r =>
    !qrSearch || r.title.toLowerCase().includes(qrSearch.toLowerCase()) || r.content.toLowerCase().includes(qrSearch.toLowerCase())
  )

  const { data, isLoading } = useQuery({
    queryKey: ['chat-msgs', conversation._id, page],
    queryFn:  async () => {
      const res = await api.get(`/conversations/${conversation._id}/messages?page=${page}&limit=50`)
      if (res.messages.length < 50) setAllLoaded(true)
      return res
    },
  })

  useEffect(() => {
    if (!data?.messages) return
    if (page === 1) {
      setAllMessages(data.messages)
    } else {
      // Página anterior va AL INICIO (mensajes más viejos)
      setAllMessages(prev => [...data.messages, ...prev.filter(m => !data.messages.find(n => n._id === m._id))])
    }
  }, [data, page])

  const messages = allMessages

  // Reset al cambiar conversación
  useEffect(() => {
    setAllMessages([])
    setPage(1)
    setAllLoaded(false)
  }, [conversation._id])

  // Scroll al fondo en primera carga y mensajes nuevos
  useEffect(() => {
    if (page === 1) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [allMessages.length])

  // Socket tiempo real
  useEffect(() => {
    const h = ({ conversation: cId, message }) => {
      if (cId?.toString() === conversation._id?.toString()) {
        // Si el socket trae el mensaje completo, agregarlo directamente sin re-fetch
        if (message?._id) {
          setAllMessages(prev => {
            if (prev.find(m => m._id === message._id)) return prev
            return [...prev, message]
          })
        } else {
          qc.invalidateQueries({ queryKey: ['chat-msgs', conversation._id], exact: false })
        }
        qc.invalidateQueries(['convs-inbox'])
        qc.invalidateQueries(['conversations'])
      }
    }
    socket.on('message:new', h)
    return () => socket.off('message:new', h)
  }, [conversation._id])

  // Sincronizar needsAttention y contactoDesconocido al cambiar de conversación
  useEffect(() => {
    setNeedsAttention(conversation.needsAttention ?? false)
    setContactoDesconocido(conversation.contactoDesconocido ?? false)
    setShowCrearCliente(false)
  }, [conversation._id, conversation.needsAttention, conversation.contactoDesconocido])

  // Escuchar alertas del bot en tiempo real
  useEffect(() => {
    const hAttention = ({ conversationId }) => {
      if (conversationId?.toString() === conversation._id?.toString()) setNeedsAttention(true)
    }
    const hUnknown = ({ conversationId }) => {
      if (conversationId?.toString() === conversation._id?.toString()) setContactoDesconocido(true)
    }
    socket.on('conversation:needs-attention', hAttention)
    socket.on('conversation:unknown-contact', hUnknown)
    return () => {
      socket.off('conversation:needs-attention', hAttention)
      socket.off('conversation:unknown-contact', hUnknown)
    }
  }, [conversation._id])

  const sendText = useMutation({
    mutationFn: () => { setSending(true); return api.post(`/conversations/${conversation._id}/messages`, { content: text }) },
    onSuccess: () => {
      setText('')
      setSending(false)
      qc.invalidateQueries(['chat-msgs', conversation._id])
      // El agente tomó control — limpiar alerta si estaba activa
      if (needsAttention) {
        api.patch(`/conversations/${conversation._id}`, { needsAttention: false }).catch(() => {})
        setNeedsAttention(false)
      }
    },
    onError: () => setSending(false),
  })

  const sendMedia = useMutation({
    mutationFn: () => { setSending(true); return api.post(`/conversations/${conversation._id}/media`, {
      base64: media.base64, mimetype: media.mimetype, filename: media.filename, caption: text || '',
    })},
    onSuccess: () => { setMedia(null); setText(''); setSending(false); qc.invalidateQueries(['chat-msgs', conversation._id]) },
    onError:   () => setSending(false),
  })

  const toggleConv = useMutation({
    mutationFn: () => api.patch(`/conversations/${conversation._id}`, {
      status: conversation.status === 'open' ? 'closed' : 'open'
    }),
    onSuccess: () => { qc.invalidateQueries(['convs-inbox']); qc.invalidateQueries(['conversations']); onConvUpdated?.() },
  })

  const [confirmDelete, setConfirmDelete] = useState(false)
  const eliminarConv = useMutation({
    mutationFn: () => api.delete(`/conversations/${conversation._id}`),
    onSuccess: () => {
      qc.invalidateQueries(['convs-inbox'])
      qc.invalidateQueries(['conversations'])
      onClose?.()
      onConvUpdated?.()
    },
  })

  const handleFile = (e) => {
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const url = ev.target.result
      setMedia({ base64: url.split(',')[1], mimetype: file.type, filename: file.name, url })
    }
    reader.readAsDataURL(file); e.target.value = ''
  }

  const handleSend = () => {
    if (media) { sendMedia.mutate() }
    else if (text.trim()) { sendText.mutate() }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const contact = conversation.customer || conversation.lead
  const isLead  = !!conversation.lead
  const isOpen  = conversation.status === 'open'

  const fmtPhone = (p) => {
    if (!p) return ''
    const d = String(p).replace(/\D/g, '')
    if (d.startsWith('57') && d.length === 12) {
      const l = d.slice(2)
      return `+57 ${l.slice(0,3)} ${l.slice(3,6)} ${l.slice(6)}`
    }
    return d || p
  }

  return (
    <div className="flex flex-1 min-h-0 min-w-0">
    <div className="flex flex-col flex-1 min-h-0 min-w-0" style={{ background: '#efeae2' }}>
      {/* ── Header limpio y con info visible ── */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shrink-0 shadow-sm">
        {onClose && (
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors mr-1 shrink-0">
            <ChevronLeft size={20} />
          </button>
        )}
        {/* Avatar */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-base shrink-0"
          style={{ background: isLead ? '#92400e' : conversation.isGroup ? '#3b82f6' : '#1f6b45' }}
        >
          {contact?.name?.[0]?.toUpperCase() || '?'}
        </div>
        {/* Info del contacto — SIEMPRE visible */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-gray-900 font-semibold text-sm truncate">
              {contact?.name || conversation.phone || 'Sin nombre'}
            </p>
            {isLead && (
              <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold shrink-0">LEAD</span>
            )}
            {conversation.isGroup && (
              <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold shrink-0">GRUPO</span>
            )}
          </div>
          <p className="text-xs text-gray-500 font-mono truncate">
            {fmtPhone(contact?.phone || conversation.phone)}
            {contact?.empresa && <span className="ml-2 text-gray-400 font-sans">· {contact.empresa}</span>}
          </p>
        </div>
        {/* Acciones */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => toggleConv.mutate()}
            title={isOpen ? 'Cerrar conversación' : 'Reabrir conversación'}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 ${
              isOpen
                ? 'text-gray-500 hover:text-red-600 hover:bg-red-50 border border-gray-200'
                : 'text-green-600 bg-green-50 hover:bg-green-100 border border-green-200'
            }`}
          >
            {isOpen ? '🔒 Cerrar' : '🔓 Reabrir'}
          </button>
          {/* Eliminar conversación */}
          {confirmDelete ? (
            <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
              <span className="text-xs text-red-600 font-medium">¿Eliminar?</span>
              <button
                onClick={() => eliminarConv.mutate()}
                disabled={eliminarConv.isPending}
                className="text-xs bg-red-500 text-white px-2 py-0.5 rounded font-medium hover:bg-red-600 disabled:opacity-40"
              >Sí</button>
              <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-400 hover:text-gray-600 px-1">No</button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              title="Eliminar conversación y mensajes"
              className="p-2 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors border border-gray-200"
            >
              <Trash2 size={15} />
            </button>
          )}
          <button
            onClick={() => setShowInfo(v => !v)}
            title="Ver/ocultar info del contacto"
            className={`p-2 rounded-lg transition-colors border ${
              showInfo
                ? 'bg-brand/10 text-brand border-brand/20'
                : 'text-gray-400 hover:text-brand hover:bg-brand/5 border-gray-200'
            }`}
          >
            <User size={16} />
          </button>
        </div>
      </div>

      {/* ── Barra de acciones rápidas ── */}
      <ChatActionBar
        conversation={conversation}
        vendedorId={vendedorId}
        onConvUpdated={onConvUpdated}
      />

      {/* ── Banner: bot no pudo responder ── */}
      {needsAttention && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-50 border-b-2 border-amber-300 shrink-0">
          <AlertTriangle size={16} className="text-amber-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-amber-800">El bot no pudo responder</p>
            <p className="text-[11px] text-amber-600">Esta conversación necesita atención humana</p>
          </div>
          <button
            onClick={async () => {
              await api.patch(`/conversations/${conversation._id}`, { needsAttention: false, aiEnabled: false })
              setNeedsAttention(false)
              onConvUpdated?.()
            }}
            className="shrink-0 flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            <UserCheck size={12} />
            Tomar conversación
          </button>
        </div>
      )}

      {/* ── Banner: número desconocido (monitoreo) ── */}
      {contactoDesconocido && !showCrearCliente && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-orange-50 border-b-2 border-orange-300 shrink-0">
          <UserX size={16} className="text-orange-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-orange-800">Número no registrado</p>
            <p className="text-[11px] text-orange-600">Este contacto no está en la base de datos de clientes</p>
          </div>
          <button
            onClick={() => setShowCrearCliente(true)}
            className="shrink-0 flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            <UserPlus size={12} />
            Registrar
          </button>
        </div>
      )}

      {/* ── Formulario rápido: crear cliente desde monitoreo ── */}
      {showCrearCliente && (
        <div className="px-4 py-3 bg-orange-50 border-b-2 border-orange-300 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-orange-800 flex items-center gap-1.5">
              <UserPlus size={13} /> Registrar cliente
            </p>
            <button onClick={() => setShowCrearCliente(false)} className="text-orange-400 hover:text-orange-600">
              <X size={14} />
            </button>
          </div>
          <div className="flex gap-2">
            <input
              className="flex-1 text-xs border border-orange-200 bg-white rounded-lg px-3 py-1.5 outline-none focus:border-orange-400"
              placeholder="Nombre del cliente"
              value={nuevoNombre}
              onChange={e => setNuevoNombre(e.target.value)}
            />
            <input
              className="w-28 text-xs border border-orange-200 bg-white rounded-lg px-3 py-1.5 outline-none focus:border-orange-400"
              placeholder="Zona"
              value={nuevoZona}
              onChange={e => setNuevoZona(e.target.value)}
            />
            <button
              disabled={!nuevoNombre.trim() || creandoCliente}
              onClick={async () => {
                setCreandoCliente(true)
                try {
                  await api.post('/clientes', {
                    name:       nuevoNombre.trim(),
                    phone:      conversation.phone,
                    zona:       nuevoZona.trim() || undefined,
                    vendedorId,
                  })
                  await api.patch(`/conversations/${conversation._id}`, { contactoDesconocido: false })
                  setContactoDesconocido(false)
                  setShowCrearCliente(false)
                  setNuevoNombre('')
                  setNuevoZona('')
                  onConvUpdated?.()
                } catch (e) {
                  alert(e?.error || 'Error al crear cliente')
                } finally {
                  setCreandoCliente(false)
                }
              }}
              className="text-xs bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg font-semibold transition-colors"
            >
              {creandoCliente ? '…' : 'Guardar'}
            </button>
          </div>
          <p className="text-[10px] text-orange-500 mt-1.5">Teléfono: {conversation.phone}</p>
        </div>
      )}

      {/* ── Mensajes ── */}
      <div ref={scrollRef} className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden px-4 py-3 space-y-1"
        style={{
          backgroundImage: 'radial-gradient(circle, #cac5bc 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}>

        {/* Cargar más */}
        {!allLoaded && messages.length >= 50 && (
          <div className="flex justify-center py-2">
            <button onClick={() => setPage(p => p + 1)}
              className="bg-white text-gray-500 text-xs px-4 py-1.5 rounded-full shadow hover:bg-gray-50 transition-colors">
              Cargar mensajes anteriores
            </button>
          </div>
        )}

        {isLoading && page === 1 && (
          <div className="flex justify-center py-8">
            <RefreshCw size={20} className="animate-spin text-gray-400" />
          </div>
        )}

        {!isLoading && !messages.length && (
          <div className="flex justify-center items-center h-full">
            <div className="bg-white/80 text-gray-500 text-xs px-4 py-2 rounded-full shadow">
              Sin mensajes aún
            </div>
          </div>
        )}

        {messages.map((msg, idx) => {
          const prev     = messages[idx - 1]
          const isOut    = msg.direction === 'outbound'
          const isGroup  = !!conversation.isGroup
          const showSep  = !prev || !isSameDay(prev.timestamp || prev.createdAt, msg.timestamp || msg.createdAt)
          // Mostrar nombre del remitente si cambió respecto al anterior mensaje
          const showSender = isGroup && !isOut && (!prev || prev.direction === 'outbound' || prev.senderPhone !== msg.senderPhone)
          return (
            <div key={msg._id}>
              {showSep && <DateSeparator date={msg.timestamp || msg.createdAt} />}
              <MessageBubble msg={msg} isOut={isOut} isGroup={isGroup} showSender={showSender} />
            </div>
          )
        })}

        <div ref={bottomRef} />
      </div>

      {/* ── Si está cerrada: aviso ── */}
      {!isOpen && (
        <div className="bg-amber-50 border-t border-amber-200 px-4 py-2 flex items-center justify-between shrink-0">
          <p className="text-xs text-amber-700 font-medium">Conversación cerrada</p>
          <button onClick={() => toggleConv.mutate()} className="text-xs text-brand font-medium hover:underline">
            Reabrir para responder
          </button>
        </div>
      )}

      {/* ── Input ── */}
      {isOpen && (
        <div className="bg-white border-t border-gray-200 px-3 py-2.5 space-y-2 shrink-0">
          {/* Preview media */}
          {media && (
            <div className="relative inline-block ml-1">
              {media.mimetype.startsWith('image/')
                ? <img src={media.url} alt="" className="h-20 rounded-lg border border-gray-200" />
                : <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs flex items-center gap-2 text-gray-700">📄 {media.filename}</div>}
              <button onClick={() => setMedia(null)}
                className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600">
                <X size={10} />
              </button>
            </div>
          )}

          {/* Emoji picker */}
          {showEmoji && (
            <EmojiPicker
              onSelect={(e) => { setText(prev => prev + e); setShowEmoji(false) }}
              onClose={() => setShowEmoji(false)}
            />
          )}

          {/* Quick replies popover */}
          {showQR && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-xl mb-2 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
                <Search size={13} className="text-gray-400 shrink-0" />
                <input
                  autoFocus
                  className="flex-1 text-sm outline-none placeholder-gray-400"
                  placeholder="Buscar plantilla…"
                  value={qrSearch}
                  onChange={e => setQrSearch(e.target.value)}
                />
                <button onClick={() => { setShowQR(false); setQrSearch('') }} className="text-gray-300 hover:text-gray-500">
                  <X size={14} />
                </button>
              </div>
              <div className="max-h-52 overflow-y-auto">
                {quickReplies.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">Sin resultados</p>
                ) : quickReplies.map(r => (
                  <button
                    key={r._id}
                    onClick={() => { setText(prev => prev ? prev + '\n' + r.content : r.content); setShowQR(false); setQrSearch('') }}
                    className="w-full text-left px-3 py-2.5 hover:bg-brand/5 transition-colors border-b border-gray-50 last:border-0"
                  >
                    <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                      <Zap size={10} className="text-brand shrink-0" /> {r.title}
                    </p>
                    <p className="text-xs text-gray-400 truncate mt-0.5">{r.content}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-end gap-2">
            <input ref={fileRef} type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx" className="hidden" onChange={handleFile} />
            <button onClick={() => fileRef.current.click()}
              className="p-2 text-gray-400 hover:text-brand transition-colors shrink-0 rounded-full hover:bg-brand/10">
              <Paperclip size={20} />
            </button>
            <button
              onClick={() => { setShowEmoji(v => !v); setShowQR(false) }}
              title="Emojis"
              className={`p-2 transition-colors shrink-0 rounded-full ${showEmoji ? 'text-brand bg-brand/10' : 'text-gray-400 hover:text-brand hover:bg-brand/10'}`}>
              <Smile size={20} />
            </button>
            <button
              onClick={() => { setShowQR(v => !v); setQrSearch(''); setShowEmoji(false) }}
              title="Respuestas rápidas"
              className={`p-2 transition-colors shrink-0 rounded-full ${showQR ? 'text-brand bg-brand/10' : 'text-gray-400 hover:text-brand hover:bg-brand/10'}`}
            >
              <Zap size={20} />
            </button>

            <div className="flex-1 relative">
              <textarea
                rows={1}
                className="w-full bg-gray-50 border border-gray-200 text-gray-800 placeholder-gray-400 rounded-xl px-4 py-2.5 text-sm outline-none resize-none max-h-28 focus:border-brand focus:ring-1 focus:ring-brand/20"
                placeholder={media ? 'Escribe un caption…' : 'Escribe un mensaje'}
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={handleKey}
                style={{ overflowY: text.split('\n').length > 3 ? 'auto' : 'hidden' }}
              />
            </div>

            <button
              onClick={handleSend}
              disabled={(!text.trim() && !media) || sending}
              className="w-10 h-10 bg-brand rounded-full flex items-center justify-center text-white disabled:opacity-40 hover:bg-brand/80 transition-colors shrink-0">
              {sending ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      )}
    </div>
    {showInfo && <ContactPanel conversation={conversation} onClose={() => setShowInfo(false)} onConvUpdated={onConvUpdated} />}
    </div>
  )
}
