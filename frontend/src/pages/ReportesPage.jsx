import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement,
  Title, Tooltip, Legend, ArcElement, Filler,
} from 'chart.js'
import {
  BarChart2, Users, MessageSquare, TrendingUp, AlertTriangle,
  Wifi, WifiOff, ChevronRight, X, Download, FileSpreadsheet, Printer, Clock,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import api from '../services/api'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, ArcElement, Filler)

const COLORES = ['#6366f1','#10b981','#f59e0b','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#f97316','#84cc16']

function RateBar({ value }) {
  const pct = Math.min(value ?? 0, 100)
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${pct >= 75 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-400' : 'bg-red-400'}`}
          style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-gray-600 w-9 text-right">{pct}%</span>
    </div>
  )
}

function fmtMinutos(min) {
  if (min === null || min === undefined) return '—'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60), m = min % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

// ── Modal de detalle por vendedor ─────────────────────────────────────────────
function VendedorDetalle({ vendedor, colorIndex, tiempoResp, onClose }) {
  const color = COLORES[colorIndex % COLORES.length]
  const s     = vendedor.stats || {}
  const rate  = vendedor.responseRate ?? 0

  const { data: cData } = useQuery({
    queryKey: ['vendedor-clientes-reporte', vendedor._id],
    queryFn: () => api.get(`/vendedores/${vendedor._id}/clientes?limit=100`),
  })
  const clientes     = cData?.clientes || []
  const total        = cData?.total ?? 0
  const sinContactar = clientes.filter(c => !c.lastContactAt || Math.floor((Date.now() - new Date(c.lastContactAt)) / 86400000) > 30).length

  const barData = {
    labels: ['Recibidos', 'Respondidos', 'Convs. abiertas', 'Clientes'],
    datasets: [{
      label: vendedor.nombre.split(' ')[0],
      data: [s.inbound ?? 0, s.outbound ?? 0, s.openConvs ?? 0, total],
      backgroundColor: [color + 'CC', color + '99', color + '66', color + '44'],
      borderColor: color, borderWidth: 1, borderRadius: 6,
    }],
  }

  const donutData = {
    labels: ['Respondidos', 'Sin responder'],
    datasets: [{ data: [rate, 100 - rate], backgroundColor: [color, '#e5e7eb'], borderWidth: 0 }],
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-100 sticky top-0 bg-white">
          <div className="w-4 h-4 rounded-full shrink-0" style={{ background: color }} />
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-lg">{vendedor.nombre}</h3>
            <p className="text-sm text-gray-400">{vendedor.zona || 'Sin zona'}</p>
          </div>
          <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${vendedor.whatsapp?.status === 'connected' ? 'bg-green-50 text-green-600' : 'bg-gray-50 text-gray-400'}`}>
            {vendedor.whatsapp?.status === 'connected' ? <Wifi size={11} /> : <WifiOff size={11} />}
            {vendedor.whatsapp?.status === 'connected' ? 'Conectado' : 'Desconectado'}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 ml-2"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Recibidos',       value: s.inbound ?? 0,   bg: 'bg-blue-50 text-blue-700' },
              { label: 'Respondidos',     value: s.outbound ?? 0,  bg: 'bg-green-50 text-green-700' },
              { label: 'T. respuesta',    value: fmtMinutos(tiempoResp?.avgMinutos), bg: 'bg-violet-50 text-violet-700' },
              { label: 'Sin contactar',   value: sinContactar,     bg: sinContactar > 0 ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-500' },
            ].map(({ label, value, bg }) => (
              <div key={label} className={`rounded-xl px-3 py-3 text-center ${bg}`}>
                <p className="text-2xl font-bold">{value}</p>
                <p className="text-xs mt-0.5 opacity-70">{label}</p>
              </div>
            ))}
          </div>

          {/* Gráficas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <h4 className="text-sm font-semibold mb-3">Métricas del mes</h4>
              <Bar data={barData} options={{ responsive: true, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, grid: { color: '#f3f4f6' } }, y: { grid: { display: false } } } }} />
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-3 text-center">Tasa de respuesta</h4>
              <div className="w-40 mx-auto">
                <Doughnut data={donutData} options={{ responsive: true, cutout: '70%', plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } } }} />
              </div>
              <p className="text-center text-2xl font-bold mt-2" style={{ color }}>{rate}%</p>
            </div>
          </div>

          {/* Clientes */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold">Clientes asignados</h4>
              <span className="text-xs text-gray-400">{total} total · {sinContactar} sin contactar</span>
            </div>
            {clientes.length === 0
              ? <p className="text-xs text-gray-400 text-center py-4">Sin clientes asignados</p>
              : (
                <div className="divide-y divide-gray-50 max-h-52 overflow-y-auto rounded-xl border border-gray-100">
                  {clientes.map(c => {
                    const dias = c.lastContactAt ? Math.floor((Date.now() - new Date(c.lastContactAt)) / 86400000) : null
                    return (
                      <div key={c._id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ background: color }}>
                          {c.name?.[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{c.name}</p>
                          <p className="text-xs text-gray-400">{c.phone}</p>
                        </div>
                        <div className="shrink-0">
                          {dias === null ? <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Sin contactar</span>
                            : dias > 30 ? <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{dias}d</span>
                            : <span className="text-xs text-gray-400">{dias === 0 ? 'Hoy' : `${dias}d`}</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function ReportesPage() {
  const [vendedorDetalle, setVendedorDetalle] = useState(null)
  const [vistaHistorico, setVistaHistorico]   = useState('todos') // 'todos' | vendedorId

  const { data, isLoading } = useQuery({
    queryKey: ['monitor-stats'],
    queryFn: () => api.get('/vendedores/monitor'),
    refetchInterval: 60_000,
  })

  const { data: historico } = useQuery({
    queryKey: ['historico'],
    queryFn: () => api.get('/vendedores/historico'),
  })

  const { data: tiemposData } = useQuery({
    queryKey: ['tiempos-respuesta'],
    queryFn: () => api.get('/vendedores/tiempos-respuesta'),
  })

  const todos      = data?.vendedores || []
  const vendedores = todos.filter(v => v.slug !== 'linea-principal')
  const linea      = todos.find(v => v.slug === 'linea-principal')
  const tiempos    = tiemposData?.tiempos || []

  const totalIn   = vendedores.reduce((s, v) => s + (v.stats?.inbound  ?? 0), 0)
  const totalOut  = vendedores.reduce((s, v) => s + (v.stats?.outbound ?? 0), 0)
  const totalOpen = vendedores.reduce((s, v) => s + (v.stats?.openConvs ?? 0), 0)
  const totalCli  = vendedores.reduce((s, v) => s + (v.stats?.totalClientes ?? 0), 0)
  const globalRate = totalIn > 0 ? Math.round((totalOut / totalIn) * 100) : 0
  const conectados = vendedores.filter(v => v.whatsapp?.status === 'connected').length
  const ranking    = [...vendedores].sort((a, b) => (b.stats?.inbound ?? 0) - (a.stats?.inbound ?? 0))

  // Tiempo promedio global
  const tiemposValidos = tiempos.filter(t => t.avgMinutos !== null && t.slug !== 'linea-principal')
  const avgGlobal = tiemposValidos.length > 0
    ? Math.round(tiemposValidos.reduce((s, t) => s + t.avgMinutos, 0) / tiemposValidos.length)
    : null

  // ── Gráfica de barras general ──
  const barData = {
    labels: vendedores.map(v => v.nombre.split(' ')[0]),
    datasets: [
      { label: 'Recibidos',  data: vendedores.map(v => v.stats?.inbound  ?? 0), backgroundColor: 'rgba(99,102,241,0.75)', borderRadius: 5 },
      { label: 'Respondidos',data: vendedores.map(v => v.stats?.outbound ?? 0), backgroundColor: 'rgba(16,185,129,0.75)', borderRadius: 5 },
    ],
  }

  // ── Gráfica línea histórico ──
  const buildLineData = () => {
    if (!historico) return null
    const { labels, series } = historico
    const filtradas = vistaHistorico === 'todos'
      ? series
      : series.filter(s => s.id === vistaHistorico)

    return {
      labels,
      datasets: filtradas.map((s, i) => {
        const vIdx = vendedores.findIndex(v => v._id === s.id)
        const color = COLORES[(vIdx >= 0 ? vIdx : i) % COLORES.length]
        return {
          label: s.nombre.split(' ')[0],
          data: s.porDia.map(([inp]) => inp),
          borderColor: color,
          backgroundColor: color + '20',
          fill: true, tension: 0.4, pointRadius: 4, borderWidth: 2,
        }
      }),
    }
  }
  const lineData = buildLineData()

  // ── Exportar Excel ──
  const exportarExcel = () => {
    const filas = ranking.map((v, i) => {
      const t = tiempos.find(t => t._id?.toString() === v._id?.toString())
      return {
        '#': i + 1,
        Vendedor: v.nombre,
        Zona: v.zona || '',
        WhatsApp: v.whatsapp?.status === 'connected' ? 'Conectado' : 'Desconectado',
        'Msgs recibidos': v.stats?.inbound ?? 0,
        'Msgs respondidos': v.stats?.outbound ?? 0,
        'Tasa respuesta %': v.responseRate ?? 0,
        'Convs. abiertas': v.stats?.openConvs ?? 0,
        'Clientes asignados': v.stats?.totalClientes ?? 0,
        'T. respuesta promedio': t ? fmtMinutos(t.avgMinutos) : '—',
      }
    })
    const ws = XLSX.utils.json_to_sheet(filas)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Reportes')
    XLSX.writeFile(wb, `AGROFER_Reporte_${new Date().toLocaleDateString('es').replace(/\//g, '-')}.xlsx`)
  }

  const donutRate = {
    labels: ['Respondidos', 'Sin responder'],
    datasets: [{ data: [globalRate, 100 - globalRate], backgroundColor: [globalRate >= 75 ? '#10b981' : globalRate >= 40 ? '#f59e0b' : '#ef4444', '#e5e7eb'], borderWidth: 0 }],
  }
  const donutWA = {
    labels: ['Conectados', 'Desconectados'],
    datasets: [{ data: [conectados, vendedores.length - conectados], backgroundColor: ['#10b981', '#e5e7eb'], borderWidth: 0 }],
  }
  const donutOpts = { responsive: true, cutout: '70%', plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } } }

  return (
    <div className="p-6 space-y-6">
      {vendedorDetalle && (
        <VendedorDetalle
          vendedor={vendedorDetalle.v}
          colorIndex={vendedorDetalle.i}
          tiempoResp={tiempos.find(t => t._id?.toString() === vendedorDetalle.v._id?.toString())}
          onClose={() => setVendedorDetalle(null)}
        />
      )}

      {/* Header + acciones */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold">Reportes y métricas</h2>
          <p className="text-sm text-gray-400">Últimos 30 días · {vendedores.length} vendedores</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => window.print()}
            className="btn-secondary flex items-center gap-2 text-sm">
            <Printer size={14} /> Imprimir / PDF
          </button>
          <button onClick={exportarExcel}
            className="btn-primary flex items-center gap-2 text-sm">
            <FileSpreadsheet size={14} /> Exportar Excel
          </button>
        </div>
      </div>

      {/* KPIs globales */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { icon: Wifi,          label: 'WA activos',      value: `${conectados}/${vendedores.length}`, bg: 'bg-green-50 text-green-700' },
          { icon: MessageSquare, label: 'Msgs recibidos',  value: totalIn.toLocaleString('es'),          bg: 'bg-blue-50 text-blue-700' },
          { icon: TrendingUp,    label: 'Msgs respondidos',value: totalOut.toLocaleString('es'),          bg: 'bg-indigo-50 text-indigo-700' },
          { icon: BarChart2,     label: 'Tasa respuesta',  value: `${globalRate}%`,                      bg: globalRate >= 75 ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700' },
          { icon: Clock,         label: 'T. resp. promedio',value: fmtMinutos(avgGlobal),                bg: 'bg-violet-50 text-violet-700' },
        ].map(({ icon: Icon, label, value, bg }) => (
          <div key={label} className={`rounded-xl px-4 py-3 ${bg}`}>
            <Icon size={14} className="mb-1 opacity-60" />
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs opacity-70 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Gráficas principales */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 card p-5">
          <h3 className="font-semibold text-sm mb-4">Mensajes por vendedor (30 días)</h3>
          {isLoading ? <div className="h-48 bg-gray-50 animate-pulse rounded-lg" /> : (
            <Bar data={barData} options={{ responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: '#f3f4f6' } } } }} height={160} />
          )}
        </div>
        <div className="card p-5 space-y-4">
          <div>
            <h3 className="font-semibold text-sm mb-2 text-center">Tasa de respuesta</h3>
            <div className="w-32 mx-auto"><Doughnut data={donutRate} options={donutOpts} /></div>
          </div>
          <hr className="border-gray-100" />
          <div>
            <h3 className="font-semibold text-sm mb-2 text-center">WhatsApp conectados</h3>
            <div className="w-32 mx-auto"><Doughnut data={donutWA} options={donutOpts} /></div>
          </div>
        </div>
      </div>

      {/* Histórico semanal */}
      {lineData && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sm">Histórico semanal — mensajes recibidos</h3>
            <select className="input text-xs py-1 w-44"
              value={vistaHistorico} onChange={e => setVistaHistorico(e.target.value)}>
              <option value="todos">Todos los vendedores</option>
              {vendedores.map(v => <option key={v._id} value={v._id}>{v.nombre.split(' ')[0]}</option>)}
            </select>
          </div>
          <Line data={lineData} options={{
            responsive: true,
            plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12 } } },
            scales: {
              x: { grid: { display: false } },
              y: { beginAtZero: true, grid: { color: '#f3f4f6' }, ticks: { stepSize: 1 } },
            },
          }} height={100} />
        </div>
      )}

      {/* Tabla ranking */}
      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-sm">Ranking de vendedores</h3>
          <span className="text-xs text-gray-400">Haz clic en una fila para ver el detalle</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500 w-8">#</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Vendedor</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Zona</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">WA</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Recibidos</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Respondidos</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 w-32">Tasa</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">T. resp.</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Clientes</th>
                <th className="px-3 py-3 w-6"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading && <tr><td colSpan={10} className="px-5 py-8 text-center text-gray-400">Cargando…</td></tr>}
              {ranking.map((v, i) => {
                const conn  = v.whatsapp?.status === 'connected'
                const vIdx  = vendedores.indexOf(v)
                const tResp = tiempos.find(t => t._id?.toString() === v._id?.toString())
                return (
                  <tr key={v._id}
                    onClick={() => setVendedorDetalle({ v, i: vIdx >= 0 ? vIdx : i })}
                    className="hover:bg-brand/5 cursor-pointer transition-colors group">
                    <td className="px-4 py-3">
                      <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white group-hover:scale-110 transition-transform"
                        style={{ background: COLORES[i % COLORES.length] }}>{i + 1}</span>
                    </td>
                    <td className="px-4 py-3 font-medium">{v.nombre}</td>
                    <td className="px-4 py-3 text-xs">
                      <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{v.zona || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      {conn
                        ? <span className="flex items-center gap-1 text-xs text-green-600"><Wifi size={11}/> Activo</span>
                        : <span className="flex items-center gap-1 text-xs text-gray-400"><WifiOff size={11}/> Inactivo</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">{v.stats?.inbound ?? 0}</td>
                    <td className="px-4 py-3 text-right">{v.stats?.outbound ?? 0}</td>
                    <td className="px-4 py-3 w-32"><RateBar value={v.responseRate} /></td>
                    <td className="px-4 py-3 text-right text-xs text-gray-500 font-medium">
                      {fmtMinutos(tResp?.avgMinutos)}
                    </td>
                    <td className="px-4 py-3 text-right">{v.stats?.totalClientes ?? 0}</td>
                    <td className="px-3 py-3 text-gray-300 group-hover:text-brand transition-colors">
                      <ChevronRight size={15} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Línea principal */}
      {linea && (
        <div className="card p-4 bg-brand/5 border border-brand/10">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              {linea.whatsapp?.status === 'connected' ? <Wifi size={14} className="text-green-500"/> : <WifiOff size={14} className="text-gray-400"/>}
              <span className="font-semibold text-sm">Línea Principal AGROFER</span>
            </div>
            {[['Recibidos', linea.stats?.inbound??0,'text-blue-600'],['Respondidos',linea.stats?.outbound??0,'text-green-600'],['Tasa',`${linea.responseRate??0}%`,'text-brand'],['Convs.',linea.stats?.openConvs??0,'text-violet-600']].map(([l,v,c])=>(
              <div key={l} className="text-xs"><span className="text-gray-400">{l}: </span><span className={`font-bold ${c}`}>{v}</span></div>
            ))}
          </div>
        </div>
      )}

      {/* Alerta WhatsApp desconectados */}
      {vendedores.filter(v => v.whatsapp?.status !== 'connected').length > 0 && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={14} className="text-red-500"/>
            <p className="text-sm font-semibold text-red-700">WhatsApp sin conectar</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {vendedores.filter(v=>v.whatsapp?.status!=='connected').map(v=>(
              <span key={v._id} className="text-xs bg-red-100 text-red-600 px-2.5 py-1 rounded-full">{v.nombre} · {v.zona}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
