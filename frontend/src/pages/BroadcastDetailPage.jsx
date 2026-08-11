import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Download, Users, Send, CheckCheck, Eye, MessageSquare, AlertTriangle } from 'lucide-react'
import api from '../services/api'

const ESTADO_BADGE = {
  pendiente: 'bg-gray-100 text-gray-600',
  enviado:   'bg-blue-100 text-blue-700',
  entregado: 'bg-indigo-100 text-indigo-700',
  leido:     'bg-green-100 text-green-700',
  fallido:   'bg-red-100 text-red-600',
}

function KPI({ label, value, pct, icon: Icon, color }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center justify-between mb-2">
        <Icon size={16} className={color} />
        <span className={`text-xs font-bold ${color}`}>{pct}</span>
      </div>
      <p className="text-2xl font-black text-gray-900">{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{label}</p>
    </div>
  )
}

function FunnelBar({ label, value, total, color }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 w-24 shrink-0">{label}</span>
      <div className="flex-1 h-6 bg-gray-100 rounded-lg overflow-hidden relative">
        <div className={`h-full ${color} rounded-lg transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-gray-700 w-20 text-right shrink-0">{value} ({pct}%)</span>
    </div>
  )
}

function formatFecha(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function exportarCSV(broadcast, destinatarios) {
  const filas = [
    ['Contacto', 'Teléfono', 'Estado', 'Enviado', 'Entregado', 'Leído', 'Respondió', 'Error'],
    ...destinatarios.map(d => [
      d.nombre || '', d.phone, d.estado,
      formatFecha(d.enviadoAt), formatFecha(d.entregadoAt), formatFecha(d.leidoAt),
      d.respondio ? 'Sí' : 'No', d.errorMsg || '',
    ]),
  ]
  const csv = filas.map(f => f.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${broadcast.nombre.replace(/[^a-z0-9]/gi, '_')}_destinatarios.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function BroadcastDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [filtroEstado, setFiltroEstado] = useState('')

  const { data: bData, isLoading: cargandoBroadcast } = useQuery({
    queryKey: ['broadcast-detail', id],
    queryFn: () => api.get(`/broadcasts/${id}`),
    refetchInterval: 8000,
  })
  const broadcast = bData?.broadcast

  const { data: dData, isLoading: cargandoDest } = useQuery({
    queryKey: ['broadcast-destinatarios', id],
    queryFn: () => api.get(`/broadcasts/${id}/destinatarios?limit=500`),
    refetchInterval: 8000,
  })
  const destinatarios = dData?.destinatarios || []

  const filtrados = useMemo(() => (
    filtroEstado ? destinatarios.filter(d => d.estado === filtroEstado) : destinatarios
  ), [destinatarios, filtroEstado])

  if (cargandoBroadcast || !broadcast) {
    return <div className="p-6 text-gray-400 text-sm">Cargando…</div>
  }

  const total = broadcast.destinatarios || 0
  const pct = (n) => total > 0 ? `${Math.round((n / total) * 100)}%` : '0%'

  return (
    <div className="p-6 max-w-5xl space-y-5">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft size={14} /> Volver
      </button>

      <div>
        <h1 className="text-xl font-bold">{broadcast.nombre}</h1>
        <p className="text-sm text-gray-400">Plantilla: {broadcast.plantillaNombre} · Creado {formatFecha(broadcast.createdAt)}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPI label="Destinatarios" value={total} pct="100%" icon={Users} color="text-gray-500" />
        <KPI label="Enviados"     value={broadcast.enviados}     pct={pct(broadcast.enviados)}     icon={Send}         color="text-blue-600" />
        <KPI label="Entregados"   value={broadcast.entregados}   pct={pct(broadcast.entregados)}   icon={CheckCheck}   color="text-indigo-600" />
        <KPI label="Leídos"       value={broadcast.leidos}       pct={pct(broadcast.leidos)}       icon={Eye}          color="text-green-600" />
        <KPI label="Respondidos" value={broadcast.respondieron} pct={pct(broadcast.respondieron)} icon={MessageSquare} color="text-violet-600" />
        <KPI label="Fallidos"     value={broadcast.fallidos}     pct={pct(broadcast.fallidos)}     icon={AlertTriangle} color="text-red-500" />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-2.5">
        <h2 className="text-sm font-bold text-gray-800 mb-1">Funnel</h2>
        <FunnelBar label="Enviados"    value={broadcast.enviados}     total={total} color="bg-blue-500" />
        <FunnelBar label="Entregados"  value={broadcast.entregados}   total={total} color="bg-indigo-500" />
        <FunnelBar label="Leídos"      value={broadcast.leidos}       total={total} color="bg-green-500" />
        <FunnelBar label="Respondidos" value={broadcast.respondieron} total={total} color="bg-violet-500" />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between p-4 border-b border-gray-50">
          <h2 className="text-sm font-bold text-gray-800">Destinatarios ({filtrados.length})</h2>
          <div className="flex items-center gap-2">
            <select className="input text-xs py-1.5" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
              <option value="">Todos los estados</option>
              <option value="pendiente">Pendiente</option>
              <option value="enviado">Enviado</option>
              <option value="entregado">Entregado</option>
              <option value="leido">Leído</option>
              <option value="fallido">Fallido</option>
            </select>
            <button onClick={() => exportarCSV(broadcast, filtrados)}
              className="btn-secondary flex items-center gap-1.5 text-xs py-1.5">
              <Download size={12} /> Exportar CSV
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-50">
                <th className="px-4 py-2 font-medium">Contacto</th>
                <th className="px-4 py-2 font-medium">Teléfono</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 font-medium">Enviado</th>
                <th className="px-4 py-2 font-medium">Entregado</th>
                <th className="px-4 py-2 font-medium">Leído</th>
                <th className="px-4 py-2 font-medium">Respondió</th>
              </tr>
            </thead>
            <tbody>
              {cargandoDest && <tr><td colSpan={7} className="text-center text-gray-400 py-6 text-xs">Cargando…</td></tr>}
              {!cargandoDest && !filtrados.length && (
                <tr><td colSpan={7} className="text-center text-gray-400 py-6 text-xs">Sin destinatarios</td></tr>
              )}
              {filtrados.map(d => (
                <tr key={d._id} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-2.5">{d.nombre || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-500">{d.phone}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${ESTADO_BADGE[d.estado] || ESTADO_BADGE.pendiente}`}>
                      {d.estado}
                    </span>
                    {d.errorMsg && <span className="text-[10px] text-red-500 ml-1.5">{d.errorMsg}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{formatFecha(d.enviadoAt)}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{formatFecha(d.entregadoAt)}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{formatFecha(d.leidoAt)}</td>
                  <td className="px-4 py-2.5 text-xs">{d.respondio ? <span className="text-violet-600 font-medium">Sí</span> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
