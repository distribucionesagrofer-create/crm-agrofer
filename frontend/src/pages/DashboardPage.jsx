import { useQuery } from '@tanstack/react-query'
import {
  Users, MessageSquare, Smartphone, AlertTriangle, TrendingUp,
  Wifi, ExternalLink, Bot, CheckSquare, UserCheck, ShieldAlert,
  Megaphone, Eye, PauseCircle, BarChart2, Zap,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import api from '../services/api'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

// ── Componentes reutilizables ──────────────────────────────────────────────────

function Stat({ icon: Icon, label, value, sub, color, alert, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`card flex items-center gap-4 ${alert ? 'border-amber-200 bg-amber-50' : ''} ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
    >
      <div className={`p-3 rounded-xl ${color} shrink-0`}>
        <Icon size={20} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-2xl font-bold leading-tight">{value ?? '—'}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function MiniStat({ label, value, color = 'text-gray-800', sub }) {
  return (
    <div className="flex flex-col items-center justify-center p-3 bg-gray-50 rounded-xl text-center">
      <p className={`text-2xl font-bold ${color}`}>{value ?? '—'}</p>
      <p className="text-xs text-gray-500 mt-0.5 font-medium">{label}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

const STATUS_WA = {
  connected:    { dot: 'bg-green-500',  label: 'Conectado' },
  qr_ready:     { dot: 'bg-yellow-400', label: 'Escanear QR' },
  connecting:   { dot: 'bg-blue-400 animate-pulse', label: 'Conectando' },
  disconnected: { dot: 'bg-gray-300',   label: 'Desconectado' },
}

const FUNNEL_CONFIG = {
  nuevo:      { label: 'Nuevo',      color: 'bg-blue-400' },
  contactado: { label: 'Contactado', color: 'bg-cyan-400' },
  interesado: { label: 'Interesado', color: 'bg-violet-500' },
  convertido: { label: 'Convertido', color: 'bg-green-500' },
  descartado: { label: 'Descartado', color: 'bg-gray-300' },
}

// ── Página principal ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/dashboard'),
    refetchInterval: 60_000,
  })

  const { data: botData } = useQuery({
    queryKey: ['dashboard-bot'],
    queryFn: async () => {
      const [tareas, leads] = await Promise.all([
        api.get('/tareas/pendientes-count'),
        api.get('/leads?status=interesado&limit=1'),
      ])
      return { tareasPendientes: tareas.count || 0, leadsBot: leads.total || 0 }
    },
    refetchInterval: 60_000,
  })

  const s           = data?.stats || {}
  const recientes   = data?.conversacionesRecientes  || []
  const actividad   = data?.actividadDiaria           || []
  const funnel      = data?.funnelLeads               || []
  const campanas    = data?.campanasRecientes         || []
  const lineas      = data?.lineasStats               || []
  const tareasPend  = botData?.tareasPendientes ?? 0
  const leadsBot    = botData?.leadsBot ?? 0

  // Chart.js data
  const chartData = {
    labels: actividad.map(d => d.fecha),
    datasets: [{
      label: 'Mensajes recibidos',
      data:  actividad.map(d => d.count),
      backgroundColor: 'rgba(22, 163, 74, 0.15)',
      borderColor:     'rgba(22, 163, 74, 0.8)',
      borderWidth: 2,
      borderRadius: 6,
    }],
  }
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: {
      label: ctx => ` ${ctx.parsed.y} mensajes`,
    }}},
    scales: {
      y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 } }, grid: { color: '#f3f4f6' } },
      x: { ticks: { font: { size: 11 } }, grid: { display: false } },
    },
  }

  const funnelTotal = funnel.reduce((acc, f) => acc + f.count, 0) || 1

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold">Dashboard</h2>
        <p className="text-sm text-gray-400">Vista general de AGROFER</p>
      </div>

      {/* ── Fila 1: stats principales ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon={Smartphone} label="Líneas WhatsApp"
          value={isLoading ? '…' : `${s.vendedoresConectados ?? 0}/${s.totalVendedores ?? 0}`}
          sub="sincronizadas" color="bg-green-500"
          onClick={() => navigate('/vendedores')} />
        <Stat icon={Users} label="Total clientes"
          value={isLoading ? '…' : s.totalClientes ?? 0}
          sub={s.clientesNuevosSemana ? `+${s.clientesNuevosSemana} esta semana` : 'en base de datos'}
          color="bg-brand"
          onClick={() => navigate('/clientes')} />
        <Stat icon={MessageSquare} label="Mensajes este mes"
          value={isLoading ? '…' : (s.mensajesMes ?? 0).toLocaleString('es')}
          sub="enviados + recibidos" color="bg-violet-500" />
        <Stat icon={AlertTriangle} label="Sin contactar"
          value={isLoading ? '…' : s.clientesSinContactar ?? 0}
          sub="más de 30 días" color="bg-amber-500"
          alert={s.clientesSinContactar > 0}
          onClick={() => navigate('/clientes')} />
      </div>

      {/* ── Fila 2: actividad + bot ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Gráfico de actividad */}
        <div className="card lg:col-span-2 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart2 size={16} className="text-brand" />
              <p className="font-semibold text-sm">Mensajes recibidos — últimos 7 días</p>
            </div>
            <p className="text-xs text-gray-400">
              {actividad.reduce((a, d) => a + d.count, 0)} total
            </p>
          </div>
          <div style={{ height: 140 }}>
            <Bar data={chartData} options={chartOptions} />
          </div>
        </div>

        {/* Bot IA stats */}
        <div className="card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Bot size={16} className="text-brand" />
            <p className="font-semibold text-sm">Bot IA</p>
          </div>
          <div className="grid grid-cols-1 gap-2">
            <button onClick={() => navigate('/tareas')}
              className={`flex items-center gap-3 p-3 rounded-xl text-left transition-colors ${tareasPend > 0 ? 'bg-red-50 hover:bg-red-100' : 'bg-gray-50 hover:bg-gray-100'}`}>
              <CheckSquare size={16} className={tareasPend > 0 ? 'text-red-500' : 'text-gray-400'} />
              <div>
                <p className={`font-bold ${tareasPend > 0 ? 'text-red-600' : 'text-gray-700'}`}>{tareasPend}</p>
                <p className="text-[11px] text-gray-400">Tareas pendientes</p>
              </div>
            </button>
            <button onClick={() => navigate('/leads')}
              className="flex items-center gap-3 p-3 rounded-xl text-left bg-gray-50 hover:bg-gray-100 transition-colors">
              <UserCheck size={16} className="text-green-500" />
              <div>
                <p className="font-bold text-gray-700">{leadsBot}</p>
                <p className="text-[11px] text-gray-400">Leads calificados</p>
              </div>
            </button>
            <div className={`flex items-center gap-3 p-3 rounded-xl ${(s.convsNeedsAttention || 0) > 0 ? 'bg-amber-50' : 'bg-gray-50'}`}>
              <ShieldAlert size={16} className={(s.convsNeedsAttention || 0) > 0 ? 'text-amber-500' : 'text-gray-400'} />
              <div>
                <p className={`font-bold ${(s.convsNeedsAttention || 0) > 0 ? 'text-amber-600' : 'text-gray-700'}`}>
                  {s.convsNeedsAttention ?? 0}
                </p>
                <p className="text-[11px] text-gray-400">Esperan atención</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Fila 3: funnel de leads + líneas ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Funnel de leads */}
        <div className="card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-brand" />
            <p className="font-semibold text-sm">Embudo de leads</p>
            <span className="ml-auto text-xs text-gray-400">{funnelTotal === 1 ? 0 : funnelTotal} total</span>
          </div>
          <div className="space-y-2.5">
            {funnel.map(f => {
              const cfg = FUNNEL_CONFIG[f.status] || {}
              const pct = funnelTotal > 1 ? Math.round((f.count / funnelTotal) * 100) : 0
              if (f.status === 'descartado' && f.count === 0) return null
              return (
                <div key={f.status}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-600">{cfg.label}</span>
                    <span className="text-xs text-gray-500">{f.count} · {pct}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full ${cfg.color} rounded-full transition-all duration-500`}
                      style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
          <button onClick={() => navigate('/leads')}
            className="text-xs text-brand hover:underline flex items-center gap-1 mt-1">
            Ver todos los leads →
          </button>
        </div>

        {/* Estado de líneas */}
        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wifi size={16} className="text-brand" />
              <p className="font-semibold text-sm">Líneas WhatsApp</p>
            </div>
            <button onClick={() => navigate('/vendedores')} className="text-xs text-brand hover:underline">
              Gestionar →
            </button>
          </div>
          <div className="space-y-2 max-h-52 overflow-y-auto">
            {lineas.map(l => {
              const wa = STATUS_WA[l.status] || STATUS_WA.disconnected
              return (
                <div key={l._id} className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-xl">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${wa.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-semibold truncate">{l.nombre}</p>
                      {l.soloMonitoreo && (
                        <span className="text-[9px] bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5 shrink-0">
                          <Eye size={8} />MON
                        </span>
                      )}
                      {l.pausado && (
                        <span className="text-[9px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-bold shrink-0 flex items-center gap-0.5">
                          <PauseCircle size={8} />PAUSADA
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-400">{l.zona || 'Sin zona'} · {wa.label}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-bold text-gray-700">{l.openConvs}</p>
                    <p className="text-[10px] text-gray-400">abiertas</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-bold text-gray-700">{l.msgsHoy}</p>
                    <p className="text-[10px] text-gray-400">hoy</p>
                  </div>
                </div>
              )
            })}
            {lineas.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-4">Sin líneas configuradas</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Fila 4: campañas recientes ── */}
      {campanas.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <div className="flex items-center gap-2">
              <Megaphone size={15} className="text-brand" />
              <h3 className="font-semibold text-sm">Campañas recientes</h3>
            </div>
            <button onClick={() => navigate('/campanas')} className="text-xs text-brand hover:underline">
              Nueva campaña →
            </button>
          </div>
          <div className="divide-y divide-gray-50">
            {campanas.map(c => {
              const pct = c.destinatarios > 0 ? Math.round((c.enviados / c.destinatarios) * 100) : 0
              const respPct = c.enviados > 0 ? Math.round((c.respondieron / c.enviados) * 100) : 0
              return (
                <div key={c._id} className="px-5 py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{c.nombre}</p>
                      {c.estado === 'enviando' && (
                        <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-bold animate-pulse">ENVIANDO</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">{c.vendedorId?.nombre} · {new Date(c.createdAt).toLocaleDateString('es', { day: '2-digit', month: 'short' })}</p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 text-center">
                    <div>
                      <p className="text-sm font-bold text-blue-600">{c.enviados}/{c.destinatarios}</p>
                      <p className="text-[10px] text-gray-400">enviados</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-indigo-600">{c.leyeron}</p>
                      <p className="text-[10px] text-gray-400">leyeron</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-green-600">{respPct}%</p>
                      <p className="text-[10px] text-gray-400">respondieron</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Fila 5: conversaciones recientes ── */}
      {recientes.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <div className="flex items-center gap-2">
              <MessageSquare size={15} className="text-brand" />
              <h3 className="font-semibold text-sm">Conversaciones activas</h3>
            </div>
            <button onClick={() => navigate('/vendedores')} className="text-xs text-brand hover:underline">
              Ver por línea →
            </button>
          </div>
          <ul className="divide-y divide-gray-50">
            {recientes.map(c => (
              <li key={c._id}
                onClick={() => navigate(`/inbox-principal?v=${c.tenantId}&c=${c._id}`)}
                className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 cursor-pointer transition-colors group">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${c.isGroup ? 'bg-blue-100 text-blue-600' : 'bg-brand/10 text-brand'}`}>
                  {c.isGroup ? '👥' : (c.customer?.name?.[0]?.toUpperCase() || c.lead?.name?.[0]?.toUpperCase() || '?')}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium truncate">
                      {c.isGroup ? (c.groupName || c.waJid) : (c.customer?.name || c.lead?.name || c.phone)}
                    </p>
                    {c.lead && !c.isGroup && (
                      <span className="shrink-0 text-[10px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full font-semibold">LEAD</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 truncate">
                    {c.isGroup ? c.waJid : (c.customer?.phone || c.lead?.phone || c.phone)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-gray-300">
                    {new Date(c.lastMessageAt).toLocaleDateString('es', { day: '2-digit', month: 'short' })}
                  </span>
                  <ExternalLink size={13} className="text-gray-300 group-hover:text-brand transition-colors" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
