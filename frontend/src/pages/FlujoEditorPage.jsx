import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ReactFlow, Background, Controls, MiniMap,
  addEdge, useNodesState, useEdgesState,
  Handle, Position, Panel, BaseEdge, EdgeLabelRenderer,
  getBezierPath, useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  ArrowLeft, Save, Plus, Trash2, MessageSquare,
  GitBranch, Bot, X, CheckCircle, AlertCircle,
  Play, Zap, Clock, Camera, Tag, Shuffle, Mic, Download,
} from 'lucide-react'
import api from '../services/api'

// ── Colores ───────────────────────────────────────────────────────────────────
const C = {
  trigger:   { bg: '#4f46e5', light: '#eef2ff', border: '#818cf8' },
  mensaje:   { bg: '#0e7490', light: '#ecfeff', border: '#22d3ee' },
  condicion: { bg: '#7c3aed', light: '#f5f3ff', border: '#a78bfa' },
  ia:        { bg: '#065f46', light: '#d1fae5', border: '#34d399' },
  fin:       { bg: '#374151', light: '#f9fafb', border: '#9ca3af' },
  delay:     { bg: '#92400e', light: '#fffbeb', border: '#f59e0b' },
  capturar:  { bg: '#1e40af', light: '#eff6ff', border: '#60a5fa' },
  media:     { bg: '#be185d', light: '#fdf2f8', border: '#f472b6' },
  etiqueta:  { bg: '#065f46', light: '#ecfdf5', border: '#34d399' },
  random:    { bg: '#6d28d9', light: '#f5f3ff', border: '#c4b5fd' },
  typing:    { bg: '#374151', light: '#f9fafb', border: '#9ca3af' },
}

// ── Edge con botón de eliminar ────────────────────────────────────────────────
function EdgeDelete({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected }) {
  const { setEdges } = useReactFlow()
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })

  return (
    <>
      <BaseEdge path={edgePath} style={{ stroke: selected ? '#6366f1' : '#94a3b8', strokeWidth: selected ? 2.5 : 1.5, strokeDasharray: '6 3' }} />
      <EdgeLabelRenderer>
        <div style={{ position: 'absolute', transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`, pointerEvents: 'all' }}
          className="nodrag nopan">
          <button
            onClick={(e) => { e.stopPropagation(); setEdges(eds => eds.filter(e => e.id !== id)) }}
            className="w-5 h-5 bg-white border-2 border-red-400 hover:bg-red-500 hover:border-red-500 text-red-500 hover:text-white rounded-full flex items-center justify-center shadow-md transition-all font-bold leading-none"
            style={{ fontSize: '11px', lineHeight: 1 }}
            title="Eliminar conexión">
            ×
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  )
}

// ── Helpers visuales ──────────────────────────────────────────────────────────
function NodeHeader({ color, icon: Icon, label, isValid }) {
  return (
    <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-t-xl" style={{ background: color.bg }}>
      <Icon size={13} className="text-white shrink-0" />
      <span className="text-white text-xs font-bold tracking-wide flex-1">{label}</span>
      {isValid === false && <AlertCircle size={12} className="text-yellow-300 shrink-0" />}
      {isValid === true  && <CheckCircle size={12} className="text-green-300 shrink-0" />}
    </div>
  )
}

// ── Nodos ─────────────────────────────────────────────────────────────────────
function TriggerNode({ data, selected }) {
  const c = C.trigger
  const LABELS = { primer_mensaje: '👋 Primer mensaje', keyword: '🔑 Palabra clave', exacto: '🎯 Respuesta exacta', cualquier_mensaje: '💬 Cualquier mensaje' }
  return (
    <div className="rounded-xl shadow-lg border-2 w-52 transition-shadow" style={{ borderColor: selected ? c.bg : c.border }}>
      <NodeHeader color={c} icon={Play} label="INICIO" isValid={true} />
      <div className="px-3.5 py-3 rounded-b-xl" style={{ background: c.light }}>
        <p className="text-xs font-semibold text-indigo-700">{LABELS[data.tipo] || 'Primer mensaje'}</p>
        {data.tipo === 'keyword' && data.keywords?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {data.keywords.slice(0, 4).map((k, i) => (
              <span key={i} className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-medium">{k}</span>
            ))}
            {data.keywords.length > 4 && <span className="text-[10px] text-indigo-400">+{data.keywords.length - 4}</span>}
          </div>
        )}
        {data.soloLeads && <span className="text-[10px] text-indigo-400 mt-1 block">Solo leads</span>}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: c.bg, width: 10, height: 10, border: '2px solid white' }} />
    </div>
  )
}

function MensajeNode({ data, selected }) {
  const c = C.mensaje
  const isValid = !!(data.contenido?.trim())
  return (
    <div className="rounded-xl shadow-lg border-2 w-60 transition-shadow" style={{ borderColor: selected ? c.bg : c.border }}>
      <Handle type="target" position={Position.Top} style={{ background: c.bg, width: 10, height: 10, border: '2px solid white' }} />
      <NodeHeader color={c} icon={MessageSquare} label="Mensaje" isValid={isValid} />
      <div className="px-3.5 py-3 rounded-b-xl" style={{ background: c.light }}>
        {data.contenido
          ? <p className="text-xs text-gray-700 line-clamp-3 leading-relaxed whitespace-pre-wrap">{data.contenido}</p>
          : <p className="text-xs text-cyan-400 italic">Escribe el mensaje en el panel derecho...</p>}
        {data.esperarRespuesta && (
          <div className="mt-1.5 flex items-center gap-1 text-[10px] text-amber-700 bg-amber-100 rounded-full px-2 py-0.5 w-fit font-semibold">
            ⏳ Espera respuesta
          </div>
        )}
      </div>
      {!data.esperarRespuesta && (
        <Handle type="source" position={Position.Bottom} style={{ background: c.bg, width: 10, height: 10, border: '2px solid white' }} />
      )}
    </div>
  )
}

function CondicionNode({ data, selected }) {
  const c = C.condicion
  const ramas = data.ramas || []
  const isValid = ramas.length > 0
  return (
    <div className="rounded-xl shadow-lg border-2 w-64 transition-shadow" style={{ borderColor: selected ? c.bg : c.border }}>
      <Handle type="target" position={Position.Top} style={{ background: c.bg, width: 10, height: 10, border: '2px solid white' }} />
      <NodeHeader color={c} icon={GitBranch} label="Condición" isValid={isValid} />
      <div className="px-3.5 py-3 rounded-b-xl space-y-1.5" style={{ background: c.light }}>
        {!ramas.length && <p className="text-xs text-purple-400 italic">Agrega condiciones en el panel...</p>}
        {ramas.map((r, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: r.esDefault ? '#9ca3af' : c.bg }} />
            <span className="text-gray-700 truncate flex-1">
              {r.esDefault ? 'En cualquier otro caso' : `Si ${r.condicion?.tipo || 'contiene'}: "${r.condicion?.valor || ''}"`}
            </span>
            <span className="text-gray-400 text-[10px] shrink-0">→ {r.accion?.tipo || '?'}</span>
          </div>
        ))}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: c.bg, width: 10, height: 10, border: '2px solid white' }} />
    </div>
  )
}

function IANode({ selected }) {
  const c = C.ia
  return (
    <div className="rounded-xl shadow-lg border-2 w-52 transition-shadow" style={{ borderColor: selected ? c.bg : c.border }}>
      <Handle type="target" position={Position.Top} style={{ background: c.bg, width: 10, height: 10, border: '2px solid white' }} />
      <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl" style={{ background: c.light }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: c.bg }}>
          <Bot size={18} className="text-white" />
        </div>
        <div>
          <p className="text-xs font-bold text-emerald-800">Pasar a IA</p>
          <p className="text-[10px] text-emerald-600">GPT-4o-mini responde</p>
        </div>
        <CheckCircle size={13} className="text-emerald-500 ml-auto shrink-0" />
      </div>
    </div>
  )
}

function FinNode({ selected }) {
  const c = C.fin
  return (
    <div className="rounded-xl shadow-lg border-2 w-44 transition-shadow" style={{ borderColor: selected ? c.bg : c.border }}>
      <Handle type="target" position={Position.Top} style={{ background: c.bg, width: 10, height: 10, border: '2px solid white' }} />
      <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl" style={{ background: c.light }}>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: c.bg }}>
          <X size={13} className="text-white" />
        </div>
        <div>
          <p className="text-xs font-bold text-gray-600">Terminar</p>
          <p className="text-[10px] text-gray-400">Sin más pasos</p>
        </div>
      </div>
    </div>
  )
}

function DelayNode({ data, selected }) {
  const c = C.delay
  return (
    <div className="rounded-xl shadow-lg border-2 w-48 transition-shadow" style={{ borderColor: selected ? c.bg : c.border }}>
      <Handle type="target" position={Position.Top} style={{ background: c.bg, width: 10, height: 10, border: '2px solid white' }} />
      <NodeHeader color={c} icon={Clock} label="Esperar" isValid={true} />
      <div className="px-3.5 py-3 rounded-b-xl flex items-center gap-2" style={{ background: c.light }}>
        <Clock size={14} className="text-amber-600 shrink-0" />
        <p className="text-xs font-semibold text-amber-800">{data.segundos || 3} segundos de pausa</p>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: c.bg, width: 10, height: 10, border: '2px solid white' }} />
    </div>
  )
}

function CapturarNode({ data, selected }) {
  const c = C.capturar
  const isValid = !!(data.pregunta?.trim() && data.variable?.trim())
  return (
    <div className="rounded-xl shadow-lg border-2 w-60 transition-shadow" style={{ borderColor: selected ? c.bg : c.border }}>
      <Handle type="target" position={Position.Top} style={{ background: c.bg, width: 10, height: 10, border: '2px solid white' }} />
      <NodeHeader color={c} icon={Download} label="Capturar dato" isValid={isValid} />
      <div className="px-3.5 py-3 rounded-b-xl space-y-1.5" style={{ background: c.light }}>
        {data.pregunta ? <p className="text-xs text-gray-700 line-clamp-2">{data.pregunta}</p> : <p className="text-xs text-blue-400 italic">Configura la pregunta...</p>}
        {data.variable && <span className="inline-block text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-mono font-semibold">{'{{' + data.variable + '}}'}</span>}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: c.bg, width: 10, height: 10, border: '2px solid white' }} />
    </div>
  )
}

function isImageUrl(url) {
  if (!url) return false
  return /\.(jpe?g|png|webp|gif|bmp|svg)(\?.*)?$/i.test(url) || url.includes('drive.google.com') || url.includes('imgur.com') || url.includes('cloudinary.com')
}

function MediaNode({ data, selected }) {
  const c = C.media
  const isValid = !!(data.mediaUrl?.trim())
  const showPreview = isValid && (data.mediaTipo === 'imagen' || !data.mediaTipo) && isImageUrl(data.mediaUrl)
  return (
    <div className="rounded-xl shadow-lg border-2 w-56 transition-shadow" style={{ borderColor: selected ? c.bg : c.border }}>
      <Handle type="target" position={Position.Top} style={{ background: c.bg, width: 10, height: 10, border: '2px solid white' }} />
      <NodeHeader color={c} icon={Camera} label={`Enviar ${data.mediaTipo || 'imagen'}`} isValid={isValid} />
      <div className="rounded-b-xl overflow-hidden" style={{ background: c.light }}>
        {showPreview && (
          <div className="px-3.5 pt-2.5">
            <img src={data.mediaUrl} alt="preview"
              className="w-full max-h-28 object-cover rounded-lg border border-pink-100"
              onError={e => { e.target.style.display = 'none' }} />
          </div>
        )}
        <div className="px-3.5 py-2.5">
          {!isValid && <p className="text-xs text-pink-400 italic">Agrega la URL del archivo...</p>}
          {isValid && !showPreview && <p className="text-xs text-pink-700 truncate font-mono text-[10px]">{data.mediaUrl}</p>}
          {data.mediaCaption && (
            <p className="text-xs text-gray-600 mt-1 line-clamp-2 leading-relaxed">{data.mediaCaption}</p>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: c.bg, width: 10, height: 10, border: '2px solid white' }} />
    </div>
  )
}

function EtiquetaNode({ data, selected }) {
  const c = C.etiqueta
  const isValid = !!(data.etiqueta?.trim())
  return (
    <div className="rounded-xl shadow-lg border-2 w-48 transition-shadow" style={{ borderColor: selected ? c.bg : c.border }}>
      <Handle type="target" position={Position.Top} style={{ background: c.bg, width: 10, height: 10, border: '2px solid white' }} />
      <NodeHeader color={c} icon={Tag} label="Agregar etiqueta" isValid={isValid} />
      <div className="px-3.5 py-3 rounded-b-xl" style={{ background: c.light }}>
        {data.etiqueta
          ? <span className="inline-block text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-semibold">🏷 {data.etiqueta}</span>
          : <p className="text-xs text-green-400 italic">Escribe la etiqueta...</p>}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: c.bg, width: 10, height: 10, border: '2px solid white' }} />
    </div>
  )
}

function RandomNode({ data, selected }) {
  const c = C.random
  const variantes = data.variantes || []
  const isValid = variantes.length >= 2
  return (
    <div className="rounded-xl shadow-lg border-2 w-60 transition-shadow" style={{ borderColor: selected ? c.bg : c.border }}>
      <Handle type="target" position={Position.Top} style={{ background: c.bg, width: 10, height: 10, border: '2px solid white' }} />
      <NodeHeader color={c} icon={Shuffle} label="Mensaje aleatorio (A/B)" isValid={isValid} />
      <div className="px-3.5 py-3 rounded-b-xl space-y-1" style={{ background: c.light }}>
        {!variantes.length && <p className="text-xs text-purple-400 italic">Agrega 2+ variantes...</p>}
        {variantes.slice(0, 3).map((v, i) => (
          <div key={i} className="flex items-start gap-1.5">
            <span className="text-[10px] font-bold text-purple-500 shrink-0 mt-0.5">{String.fromCharCode(65 + i)}</span>
            <p className="text-xs text-gray-700 truncate">{v}</p>
          </div>
        ))}
        {variantes.length > 3 && <p className="text-[10px] text-gray-400">+{variantes.length - 3} más</p>}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: c.bg, width: 10, height: 10, border: '2px solid white' }} />
    </div>
  )
}

function TypingNode({ data, selected }) {
  const c = C.typing
  return (
    <div className="rounded-xl shadow-lg border-2 w-52 transition-shadow" style={{ borderColor: selected ? c.bg : c.border }}>
      <Handle type="target" position={Position.Top} style={{ background: c.bg, width: 10, height: 10, border: '2px solid white' }} />
      <NodeHeader color={c} icon={Mic} label="Escribiendo..." isValid={true} />
      <div className="px-3.5 py-3 rounded-b-xl flex items-center gap-2" style={{ background: c.light }}>
        <div className="flex gap-1 items-center">
          {[0, 1, 2].map(i => <span key={i} className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
        </div>
        <p className="text-xs text-gray-500">Muestra "{data.duracion || 2}s" antes del msg</p>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: c.bg, width: 10, height: 10, border: '2px solid white' }} />
    </div>
  )
}

const NODE_TYPES = { trigger: TriggerNode, mensaje: MensajeNode, condicion: CondicionNode, ia: IANode, fin: FinNode, delay: DelayNode, capturar: CapturarNode, media: MediaNode, etiqueta: EtiquetaNode, random: RandomNode, typing: TypingNode }
const EDGE_TYPES = { deleteEdge: EdgeDelete }

// ── Panel de propiedades ──────────────────────────────────────────────────────
function PropsPanel({ node, onUpdate, onDelete, vendedores }) {
  if (!node) return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4">
      <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
        <Zap size={22} className="text-gray-300" />
      </div>
      <p className="text-sm font-medium text-gray-400">Selecciona un nodo</p>
      <p className="text-xs text-gray-300 mt-1">Haz clic en cualquier bloque para editarlo</p>
    </div>
  )

  const d = node.data

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ background: C[node.type]?.bg || '#6b7280' }} />
          <p className="text-sm font-bold capitalize text-gray-700">{
            { trigger: 'Disparador', mensaje: 'Mensaje', condicion: 'Condición', ia: 'IA', fin: 'Fin' }[node.type]
          }</p>
        </div>
        {node.type !== 'trigger' && (
          <button onClick={() => onDelete(node.id)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* TRIGGER */}
      {node.type === 'trigger' && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Tipo de activación</label>
            {[
              { value: 'primer_mensaje',    label: '👋 Primer mensaje',             desc: 'Primera vez que alguien escribe. Ideal para bienvenidas.' },
              { value: 'keyword',           label: '🔑 Contiene palabra clave',      desc: 'Si el mensaje incluye alguna de las palabras. Ej: "precio", "precios", "el precio".' },
              { value: 'exacto',            label: '🎯 Respuesta exacta (campaña)',  desc: 'Solo si el cliente escribe exactamente esa palabra. Perfecto para campañas: "Escribe PROMO".' },
              { value: 'cualquier_mensaje', label: '💬 Cualquier mensaje',           desc: 'Se activa con cada mensaje. Úsalo con precaución.' },
            ].map(opt => (
              <label key={opt.value} className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer mb-1.5 transition-colors ${d.tipo === opt.value ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:border-indigo-200'}`}>
                <input type="radio" name="tipo" checked={d.tipo === opt.value} onChange={() => onUpdate(node.id, { tipo: opt.value })} className="accent-indigo-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-gray-800">{opt.label}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5 leading-relaxed">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>
          {(d.tipo === 'keyword' || d.tipo === 'exacto') && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">
                {d.tipo === 'exacto' ? '🎯 Palabras/frases exactas que activan el flujo' : '🔑 Palabras clave (Enter para agregar)'}
              </label>
              {d.tipo === 'exacto' && (
                <p className="text-[10px] text-indigo-500 bg-indigo-50 rounded-lg px-2.5 py-1.5 mb-2">
                  El cliente debe escribir exactamente una de estas palabras (sin nada más). Ej: si pones "SI", solo activa cuando escriba "SI" o "si", no "sí claro" ni "si quiero".
                </p>
              )}
              <KeywordInput keywords={d.keywords || []} onChange={kws => onUpdate(node.id, { keywords: kws })} />
            </div>
          )}
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer bg-gray-50 p-2.5 rounded-lg">
            <input type="checkbox" checked={d.soloLeads || false} onChange={e => onUpdate(node.id, { soloLeads: e.target.checked })} className="accent-indigo-500" />
            Solo activar para <strong>Leads</strong> (no para clientes)
          </label>
        </div>
      )}

      {/* MENSAJE */}
      {node.type === 'mensaje' && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Mensaje a enviar</label>
            <p className="text-[10px] text-gray-400 mb-1.5">Puedes usar variables: <code className="bg-gray-100 px-1 rounded">{'{{nombre}}'}</code> <code className="bg-gray-100 px-1 rounded">{'{{zona}}'}</code></p>
            <textarea rows={6} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 resize-none transition-colors"
              placeholder={'Hola {{nombre}}! 👋 Bienvenido a AGROFER...'}
              value={d.contenido || ''}
              onChange={e => onUpdate(node.id, { contenido: e.target.value })} />
            <p className="text-xs text-gray-400 text-right mt-0.5">{(d.contenido || '').length} caracteres</p>
          </div>
          <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${d.esperarRespuesta ? 'border-amber-300 bg-amber-50' : 'border-gray-200 hover:border-amber-200'}`}>
            <input type="checkbox" className="accent-amber-500 mt-0.5 shrink-0"
              checked={d.esperarRespuesta || false}
              onChange={e => onUpdate(node.id, { esperarRespuesta: e.target.checked })} />
            <div>
              <p className="text-xs font-semibold text-gray-800">⏳ Esperar respuesta del cliente</p>
              <p className="text-[10px] text-gray-400 mt-0.5 leading-relaxed">El flujo se pausa aquí hasta que el cliente responda. Útil para preguntas directas donde no usas "Capturar dato".</p>
            </div>
          </label>
        </div>
      )}

      {/* CONDICION */}
      {node.type === 'condicion' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 bg-purple-50 border border-purple-100 rounded-lg px-3 py-2">
            Define ramas según lo que escriba el cliente. Las ramas se evalúan en orden.
          </p>
          {(d.ramas || []).map((rama, i) => (
            <RamaEditor key={rama.id || i} rama={rama} index={i} vendedores={vendedores}
              onChange={r => onUpdate(node.id, { ramas: (d.ramas || []).map((x, xi) => xi === i ? r : x) })}
              onDelete={() => onUpdate(node.id, { ramas: (d.ramas || []).filter((_, xi) => xi !== i) })} />
          ))}
          <div className="flex gap-2 flex-wrap pt-1">
            <button onClick={() => onUpdate(node.id, { ramas: [...(d.ramas || []),
              { id: `r_${Date.now()}`, esDefault: false, condicion: { tipo: 'contiene', valor: '' }, accion: { tipo: 'mensaje', contenido: '' } }]
            })} className="text-xs text-purple-600 font-medium bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors">
              <Plus size={11} /> Agregar condición
            </button>
            {!(d.ramas || []).find(r => r.esDefault) && (
              <button onClick={() => onUpdate(node.id, { ramas: [...(d.ramas || []),
                { id: `r_${Date.now()}`, esDefault: true, accion: { tipo: 'ia' } }]
              })} className="text-xs text-gray-500 font-medium bg-gray-50 hover:bg-gray-100 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors">
                <Plus size={11} /> Caso default (sino)
              </button>
            )}
          </div>
        </div>
      )}

      {node.type === 'ia' && (
        <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2.5">
          El bot usará GPT-4o-mini con el contexto de AGROFER para responder automáticamente. No requiere configuración adicional.
        </p>
      )}
      {node.type === 'fin' && (
        <p className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5">
          Termina el flujo sin enviar respuesta. Úsalo cuando otro sistema o persona tomará el control.
        </p>
      )}

      {/* DELAY */}
      {node.type === 'delay' && (
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">Segundos de pausa</label>
          <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mb-2">Útil para parecer más humano. Combínalo antes de mensajes largos.</p>
          <div className="flex items-center gap-2">
            <input type="range" min={1} max={30} value={d.segundos || 3} onChange={e => onUpdate(node.id, { segundos: parseInt(e.target.value) })} className="flex-1 accent-amber-500" />
            <span className="text-sm font-bold text-amber-700 w-10 text-center">{d.segundos || 3}s</span>
          </div>
        </div>
      )}

      {/* CAPTURAR */}
      {node.type === 'capturar' && (
        <div className="space-y-3">
          <p className="text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-2">Envía una pregunta y guarda la respuesta del cliente como variable. Usa {`{{nombre}}`} en mensajes posteriores.</p>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Pregunta a enviar</label>
            <textarea rows={3} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400 resize-none"
              placeholder="Ej: Cual es tu nombre?" value={d.pregunta || ''} onChange={e => onUpdate(node.id, { pregunta: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Guardar como variable</label>
            <select className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400"
              value={d.variable || ''} onChange={e => onUpdate(node.id, { variable: e.target.value })}>
              <option value="">Selecciona la variable...</option>
              {['nombre', 'zona', 'telefono', 'producto', 'ciudad', 'empresa', 'otro'].map(v => <option key={v} value={v}>{`{{${v}}}`} — {v}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* MEDIA */}
      {node.type === 'media' && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Tipo de archivo</label>
            <div className="flex gap-2">
              {[['imagen','🖼 Imagen'],['documento','📄 Documento'],['video','🎥 Video']].map(([v,l]) => (
                <button key={v} onClick={() => onUpdate(node.id, { mediaTipo: v })}
                  className={`flex-1 text-xs py-2 rounded-lg border font-medium transition-colors ${d.mediaTipo === v ? 'bg-pink-500 text-white border-pink-500' : 'border-gray-200 text-gray-500 hover:border-pink-300'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">URL del archivo</label>
            <input className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-pink-400 font-mono"
              placeholder="https://ejemplo.com/catalogo.pdf" value={d.mediaUrl || ''} onChange={e => onUpdate(node.id, { mediaUrl: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Caption (opcional)</label>
            <p className="text-[10px] text-gray-400 mb-1">Soporta variables: <code className="bg-gray-100 px-1 rounded">{'{{nombre}}'}</code></p>
            <input className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-pink-400"
              placeholder="Ej: Hola {{nombre}}, aquí te comparto nuestro catálogo" value={d.mediaCaption || ''} onChange={e => onUpdate(node.id, { mediaCaption: e.target.value })} />
          </div>
        </div>
      )}

      {/* ETIQUETA */}
      {node.type === 'etiqueta' && (
        <div className="space-y-3">
          <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">Agrega una etiqueta a la conversación para filtrar y organizar leads.</p>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Nombre de la etiqueta</label>
            <input className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-green-400"
              placeholder="Ej: interesado-catalogo, precio-consultado" value={d.etiqueta || ''} onChange={e => onUpdate(node.id, { etiqueta: e.target.value })} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {['interesado', 'precio-consultado', 'zona-norte', 'zona-sur', 'pendiente-llamada', 'cliente-vip'].map(tag => (
              <button key={tag} onClick={() => onUpdate(node.id, { etiqueta: tag })}
                className="text-[10px] bg-green-100 hover:bg-green-200 text-green-700 px-2 py-1 rounded-full font-medium transition-colors">
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* RANDOM */}
      {node.type === 'random' && (
        <div className="space-y-3">
          <p className="text-xs text-purple-700 bg-purple-50 rounded-lg px-3 py-2">Envía una variante aleatoria. Perfecto para A/B testing o dar variedad a las respuestas.</p>
          <div className="space-y-2">
            {(d.variantes || []).map((v, i) => (
              <div key={i} className="flex gap-2">
                <span className="w-6 h-6 bg-purple-100 text-purple-700 rounded-lg text-xs font-bold flex items-center justify-center shrink-0 mt-1">{String.fromCharCode(65+i)}</span>
                <textarea rows={2} className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-2 py-1.5 text-xs outline-none focus:border-purple-400 resize-none"
                  placeholder={`Variante ${String.fromCharCode(65+i)}...`} value={v}
                  onChange={e => onUpdate(node.id, { variantes: (d.variantes || []).map((x, xi) => xi === i ? e.target.value : x) })} />
                <button onClick={() => onUpdate(node.id, { variantes: (d.variantes || []).filter((_, xi) => xi !== i) })} className="text-gray-400 hover:text-red-500 shrink-0 mt-1"><X size={13} /></button>
              </div>
            ))}
            <button onClick={() => onUpdate(node.id, { variantes: [...(d.variantes || []), ''] })}
              className="text-xs text-purple-600 font-medium bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg flex items-center gap-1 w-full justify-center transition-colors">
              <Plus size={11} /> Agregar variante
            </button>
          </div>
        </div>
      )}

      {/* TYPING */}
      {node.type === 'typing' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">Muestra el indicador "escribiendo..." antes de enviar el siguiente mensaje. Hace la conversación más natural.</p>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Duración en segundos</label>
            <div className="flex items-center gap-2">
              <input type="range" min={1} max={10} value={d.duracion || 2} onChange={e => onUpdate(node.id, { duracion: parseInt(e.target.value) })} className="flex-1 accent-gray-500" />
              <span className="text-sm font-bold text-gray-600 w-10 text-center">{d.duracion || 2}s</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function KeywordInput({ keywords, onChange }) {
  const [val, setVal] = useState('')
  const add = () => {
    if (!val.trim()) return
    onChange([...keywords, val.trim().toLowerCase()])
    setVal('')
  }
  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        <input className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-indigo-400"
          placeholder='ej: precio, catálogo...' value={val} onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
        <button onClick={add} className="bg-indigo-100 text-indigo-600 hover:bg-indigo-200 px-2.5 rounded-lg text-xs font-medium transition-colors">+</button>
      </div>
      <div className="flex flex-wrap gap-1">
        {keywords.map((k, i) => (
          <span key={i} className="flex items-center gap-1 bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-xs font-medium">
            {k}
            <button onClick={() => onChange(keywords.filter((_, xi) => xi !== i))} className="hover:text-red-500 leading-none">×</button>
          </span>
        ))}
      </div>
    </div>
  )
}

function RamaEditor({ rama, index, onChange, onDelete, vendedores }) {
  const ACCION_OPTS = [
    { value: 'mensaje',        label: '💬 Enviar mensaje' },
    { value: 'ia',             label: '🤖 Pasar a IA' },
    { value: 'delegar',        label: '👤 Delegar a vendedor' },
    { value: 'cambiar_estado', label: '🏷 Cambiar estado lead' },
    { value: 'fin',            label: '🔚 Terminar flujo' },
  ]
  return (
    <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-purple-700">{rama.esDefault ? 'Caso default' : `Condición ${index + 1}`}</span>
        <button onClick={onDelete} className="text-gray-400 hover:text-red-500 transition-colors"><X size={13} /></button>
      </div>
      {!rama.esDefault && (
        <div className="flex gap-1.5">
          <select className="flex-shrink-0 bg-white border border-purple-200 rounded-lg text-xs px-2 py-1.5 outline-none w-28"
            value={rama.condicion?.tipo || 'contiene'}
            onChange={e => onChange({ ...rama, condicion: { ...rama.condicion, tipo: e.target.value } })}>
            <option value="contiene">Contiene</option>
            <option value="igual">Es igual</option>
            <option value="empieza">Empieza con</option>
          </select>
          <input className="flex-1 bg-white border border-purple-200 rounded-lg text-xs px-2 py-1.5 outline-none focus:border-purple-400 min-w-0"
            placeholder="texto a detectar..." value={rama.condicion?.valor || ''}
            onChange={e => onChange({ ...rama, condicion: { ...rama.condicion, valor: e.target.value } })} />
        </div>
      )}
      <div>
        <label className="block text-[10px] font-semibold text-purple-500 mb-1">→ Entonces hacer:</label>
        <select className="w-full bg-white border border-purple-200 rounded-lg text-xs px-2 py-1.5 outline-none"
          value={rama.accion?.tipo || 'mensaje'}
          onChange={e => onChange({ ...rama, accion: { ...rama.accion, tipo: e.target.value } })}>
          {ACCION_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {rama.accion?.tipo === 'mensaje' && (
          <textarea rows={3} className="w-full mt-1.5 bg-white border border-purple-200 rounded-lg text-xs px-2 py-1.5 resize-none outline-none focus:border-purple-400"
            placeholder="Respuesta a enviar..." value={rama.accion?.contenido || ''}
            onChange={e => onChange({ ...rama, accion: { ...rama.accion, contenido: e.target.value } })} />
        )}
        {rama.accion?.tipo === 'delegar' && (
          <select className="w-full mt-1.5 bg-white border border-purple-200 rounded-lg text-xs px-2 py-1.5 outline-none"
            value={rama.accion?.vendedorId || ''}
            onChange={e => onChange({ ...rama, accion: { ...rama.accion, vendedorId: e.target.value } })}>
            <option value="">Selecciona vendedor...</option>
            {vendedores.filter(v => v.slug !== 'linea-principal').map(v => (
              <option key={v._id} value={v._id}>{v.nombre} · {v.zona}</option>
            ))}
          </select>
        )}
        {rama.accion?.tipo === 'cambiar_estado' && (
          <select className="w-full mt-1.5 bg-white border border-purple-200 rounded-lg text-xs px-2 py-1.5 outline-none"
            value={rama.accion?.estado || ''} onChange={e => onChange({ ...rama, accion: { ...rama.accion, estado: e.target.value } })}>
            <option value="">Selecciona estado...</option>
            {['nuevo', 'contactado', 'interesado', 'convertido', 'descartado'].map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        )}
      </div>
    </div>
  )
}

// ── Página editor ─────────────────────────────────────────────────────────────
const DISP_LABELS = { primer_mensaje: 'Primer mensaje', keyword: 'Palabra clave', exacto: 'Respuesta exacta', cualquier_mensaje: 'Cualquier mensaje' }

export default function FlujoEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const esNuevo = id === 'nuevo'

  const [nombre, setNombre]         = useState('Nuevo flujo')
  const [lineas, setLineas]         = useState([])
  const [selectedNode, setSelectedNode] = useState(null)
  const [saved, setSaved]           = useState(false)

  const [nodes, setNodes, onNodesChange] = useNodesState([
    { id: 'trigger', type: 'trigger', position: { x: 260, y: 60 },
      data: { tipo: 'primer_mensaje', label: 'Primer mensaje', keywords: [], soloLeads: false } }
  ])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  const { data: vData } = useQuery({ queryKey: ['vendedores-lista'], queryFn: () => api.get('/vendedores') })
  const vendedores = vData?.vendedores || []

  const { data: flujoData } = useQuery({
    queryKey: ['flujo', id], queryFn: () => api.get(`/flujos/${id}`), enabled: !esNuevo,
  })

  useEffect(() => {
    if (!flujoData?.flujo) return
    const f = flujoData.flujo
    setNombre(f.nombre || '')
    setLineas((f.lineas || []).map(l => (l._id || l).toString()))
    if (f.rfNodes?.length) {
      setNodes(f.rfNodes)
      setEdges((f.rfEdges || []).map(e => ({ ...e, type: 'deleteEdge' })))
    }
  }, [flujoData])

  const onConnect = useCallback((params) =>
    setEdges(eds => addEdge({ ...params, type: 'deleteEdge', animated: true }, eds)), [])

  const onNodeClick  = useCallback((_, node) => setSelectedNode(node), [])
  const onPaneClick  = useCallback(() => setSelectedNode(null), [])

  const updateNodeData = (nodeId, newData) => {
    setNodes(nds => nds.map(n => {
      if (n.id !== nodeId) return n
      const merged = { ...n.data, ...newData }
      if (n.type === 'trigger') merged.label = DISP_LABELS[merged.tipo] || merged.tipo
      return { ...n, data: merged }
    }))
    setSelectedNode(prev => prev?.id === nodeId ? { ...prev, data: { ...prev.data, ...newData } } : prev)
  }

  const deleteNode = (nodeId) => {
    setNodes(nds => nds.filter(n => n.id !== nodeId))
    setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId))
    setSelectedNode(null)
  }

  const addNode = (tipo) => {
    const id = `${tipo}_${Date.now()}`
    const cx = 120 + Math.random() * 280
    const cy = 280 + nodes.length * 15
    const defaults = {
      mensaje:   { label: 'Mensaje',       contenido: '' },
      condicion: { label: 'Condicion',     ramas: [] },
      ia:        { label: 'IA' },
      delay:     { label: 'Delay',         segundos: 3 },
      typing:    { label: 'Typing',        duracion: 2 },
      capturar:  { label: 'Capturar dato', pregunta: '', variable: 'nombre' },
      media:     { label: 'Media',         mediaTipo: 'imagen', mediaUrl: '', mediaCaption: '' },
      etiqueta:  { label: 'Etiqueta',      etiqueta: '' },
      random:    { label: 'Aleatorio',     variantes: ['', ''] },
      fin:       { label: 'Fin' },
    }
    setNodes(nds => [...nds, { id, type: tipo, position: { x: cx, y: cy }, data: defaults[tipo] || {} }])
  }

  const canvasToFlow = () => {
    const trigger = nodes.find(n => n.type === 'trigger')
    return {
      nombre,
      lineas,
      disparador: { tipo: trigger?.data.tipo || 'primer_mensaje', keywords: trigger?.data.keywords || [], soloLeads: trigger?.data.soloLeads || false },
      pasos: nodes.filter(n => n.type !== 'trigger').map(n => ({ id: n.id, tipo: n.type, ...n.data })),
      rfNodes: nodes,
      rfEdges: edges,
    }
  }

  const guardar = useMutation({
    mutationFn: () => {
      const body = canvasToFlow()
      return esNuevo ? api.post('/flujos', body) : api.put(`/flujos/${id}`, body)
    },
    onSuccess: () => { qc.invalidateQueries(['flujos']); setSaved(true); setTimeout(() => { setSaved(false); navigate('/flujos') }, 1500) },
  })

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-gray-50">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200 bg-white shrink-0 shadow-sm">
        <button onClick={() => navigate('/flujos')} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <input className="text-base font-bold border-0 outline-none flex-1 bg-transparent text-gray-800 placeholder-gray-300"
          value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre del flujo..." />
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span className="hidden sm:inline">Arrastra nodos · Conecta puntos · Haz clic para editar</span>
        </div>
        <button onClick={() => guardar.mutate()} disabled={guardar.isPending}
          className="btn-primary flex items-center gap-2 text-sm disabled:opacity-40 shrink-0">
          {saved ? <><CheckCircle size={14} /> Guardado</> : <><Save size={14} /> {guardar.isPending ? 'Guardando...' : 'Guardar'}</>}
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Canvas */}
        <div className="flex-1 min-h-0 relative">
          <style>{`.edge-delete-btn:hover button { opacity: 1 !important; } .react-flow__edge:hover .edge-delete-btn button { opacity: 1 !important; }`}</style>
          <ReactFlow
            nodes={nodes} edges={edges}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onConnect={onConnect} onNodeClick={onNodeClick} onPaneClick={onPaneClick}
            nodeTypes={NODE_TYPES} edgeTypes={EDGE_TYPES}
            deleteKeyCode="Delete"
            fitView fitViewOptions={{ padding: 0.2 }}
            defaultEdgeOptions={{ type: 'deleteEdge', animated: true }}
            snapToGrid snapGrid={[15, 15]}
          >
            <Background color="#dde1e7" gap={20} size={1} />
            <Controls showInteractive={false} />
            <MiniMap nodeStrokeWidth={3} zoomable pannable style={{ background: '#f8fafc' }} />

            <Panel position="top-left">
              <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-3 space-y-1.5 min-w-[140px]">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1 pb-1">+ Agregar nodo</p>
                {[
                  { tipo: 'mensaje',   icon: MessageSquare, label: 'Mensaje',      bg: C.mensaje.bg },
                  { tipo: 'condicion', icon: GitBranch,     label: 'Condicion',    bg: C.condicion.bg },
                  { tipo: 'ia',        icon: Bot,           label: 'IA (GPT)',     bg: C.ia.bg },
                  { tipo: 'delay',     icon: Clock,         label: 'Esperar',      bg: C.delay.bg },
                  { tipo: 'typing',    icon: Mic,           label: 'Escribiendo',  bg: C.typing.bg },
                  { tipo: 'capturar',  icon: Download,      label: 'Capturar dato',bg: C.capturar.bg },
                  { tipo: 'media',     icon: Camera,        label: 'Enviar imagen',bg: C.media.bg },
                  { tipo: 'etiqueta',  icon: Tag,           label: 'Etiqueta',     bg: C.etiqueta.bg },
                  { tipo: 'random',    icon: Shuffle,       label: 'Aleatorio A/B',bg: C.random.bg },
                  { tipo: 'fin',       icon: X,             label: 'Fin',          bg: C.fin.bg },
                ].map(({ tipo, icon: Icon, label, bg }) => (
                  <button key={tipo} onClick={() => addNode(tipo)}
                    className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors text-sm font-medium text-gray-700 group">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform" style={{ background: bg }}>
                      <Icon size={13} className="text-white" />
                    </div>
                    {label}
                  </button>
                ))}
                <div className="pt-1 border-t border-gray-100 mt-1">
                  <p className="text-[9px] text-gray-400 px-1">Supr = eliminar seleccionado</p>
                </div>
              </div>
            </Panel>
          </ReactFlow>
        </div>

        {/* Panel propiedades */}
        <div className="w-72 shrink-0 border-l border-gray-200 bg-white overflow-y-auto flex flex-col">

          {/* ── Líneas del flujo ── */}
          <div className="px-4 pt-3 pb-3 border-b border-gray-100 shrink-0">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Líneas WhatsApp</p>
              {lineas.length > 0 && (
                <button onClick={() => setLineas([])} className="text-[10px] text-red-400 hover:text-red-600 font-medium transition-colors">
                  Limpiar
                </button>
              )}
            </div>
            <p className="text-[10px] leading-relaxed mb-2" style={{ color: lineas.length === 0 ? '#10b981' : '#6366f1' }}>
              {lineas.length === 0
                ? '✅ Aplica a todas las líneas'
                : `⚡ Solo ${lineas.length} línea${lineas.length > 1 ? 's' : ''} seleccionada${lineas.length > 1 ? 's' : ''}`}
            </p>
            <div className="space-y-0.5 max-h-40 overflow-y-auto pr-0.5">
              {vendedores.map(v => {
                const checked = lineas.includes(v._id.toString())
                return (
                  <label key={v._id} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${checked ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-gray-50 border border-transparent'}`}>
                    <input type="checkbox"
                      checked={checked}
                      onChange={e => {
                        const sid = v._id.toString()
                        setLineas(prev => e.target.checked ? [...prev, sid] : prev.filter(x => x !== sid))
                      }}
                      className="accent-indigo-500 shrink-0"
                    />
                    <span className="text-xs font-medium text-gray-700 truncate flex-1">{v.nombre}</span>
                    {v.zona && <span className="text-[10px] text-gray-400 shrink-0">{v.zona}</span>}
                  </label>
                )
              })}
            </div>
          </div>

          {/* ── Propiedades del nodo ── */}
          <div className="px-4 py-3 border-b border-gray-100 shrink-0">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Propiedades</p>
          </div>
          <div className="flex-1">
            <PropsPanel node={selectedNode} onUpdate={updateNodeData} onDelete={deleteNode} vendedores={vendedores} />
          </div>
        </div>
      </div>
    </div>
  )
}
