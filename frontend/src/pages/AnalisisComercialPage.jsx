import { useState, useMemo, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bar, Line, Doughnut } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, Title, Tooltip, Legend, ArcElement, Filler,
} from 'chart.js'
import { TrendingUp, RefreshCw, Loader2, Calendar, DollarSign, ShoppingCart, Users, ChevronDown, ChevronUp, Package, Boxes, Filter, X, Download } from 'lucide-react'
import api from '../services/api'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, ArcElement, Filler)

const COLORES = ['#EF4444','#3B82F6','#10B981','#F59E0B','#8B5CF6','#EC4899','#06B6D4','#84CC16','#F97316','#6366F1']

const fmt = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)
const fmtM = (n) => {
  if (n >= 1_000_000_000) return `$${(n/1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000)     return `$${(n/1_000_000).toFixed(1)}M`
  return `$${(n/1000).toFixed(0)}K`
}

function KPICard({ label, value, sub, color, icon: Icon }) {
  return (
    <div className={`rounded-2xl border p-5 ${color}`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-gray-500">{label}</p>
        <Icon size={18} className="text-gray-400" />
      </div>
      <p className="text-3xl font-black text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

function VendedorRow({ v, idx, totalValor }) {
  const [open, setOpen] = useState(false)
  const color = COLORES[idx % COLORES.length]
  const pct = totalValor > 0 ? (v.valorPedidos / totalValor) * 100 : 0

  return (
    <>
      <tr className="hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => setOpen(o => !o)}>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ background: color }} />
            <span className="font-semibold text-sm text-gray-800">{v.nombre.split(' ')[0]}</span>
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-right font-bold text-gray-800">{v.totalPedidos}</td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
            </div>
            <span className="text-sm font-bold text-gray-800 w-20 text-right">{fmtM(v.valorPedidos)}</span>
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-right text-gray-600">{Math.round(v.totalArticulos).toLocaleString('es')}</td>
        <td className="px-4 py-3 text-sm text-right text-gray-600">{v.clientesImpactados.toLocaleString('es')}</td>
        <td className="px-4 py-3 text-gray-300">
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} className="px-4 pb-3 bg-gray-50/50">
            <div className="pt-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Top productos</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {v.productos.slice(0, 6).map((p, i) => (
                  <div key={i} className="bg-white rounded-xl border border-gray-100 px-3 py-2">
                    <p className="text-[11px] font-semibold text-gray-700 leading-tight truncate">{p.nombre}</p>
                    <div className="flex justify-between mt-1">
                      <span className="text-[10px] text-gray-400">{Math.round(p.cantidad)} uds</span>
                      <span className="text-[10px] font-bold text-brand">{fmtM(p.valor)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function AnalisisComercialPage() {
  const qc = useQueryClient()
  const hoy = new Date().toISOString().slice(0, 10)
  const primerDiaMes = `${hoy.slice(0, 7)}-01`

  const [fechaDesde, setFechaDesde] = useState(primerDiaMes)
  const [fechaHasta, setFechaHasta] = useState(hoy)
  const [linea, setLinea]   = useState('')
  const [codigo, setCodigo] = useState('')

  const [syncing, setSyncing] = useState(false)

  // Opciones de los dos selects — líneas siempre disponibles, artículos solo tras elegir línea.
  const { data: filtrosData } = useQuery({
    queryKey: ['analisis-comercial-filtros', linea],
    queryFn:  () => api.get(`/analisis-comercial/filtros${linea ? `?linea=${encodeURIComponent(linea)}` : ''}`),
    staleTime: 10 * 60 * 1000,
  })

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['analisis-comercial', linea, codigo],
    queryFn:  () => api.get(`/analisis-comercial?linea=${encodeURIComponent(linea)}&codigo=${encodeURIComponent(codigo)}`),
    staleTime: 5 * 60 * 1000,
    refetchInterval: syncing ? 5000 : false, // polling cada 5s mientras sincroniza
  })

  // Detectar cuando termina el sync
  useEffect(() => {
    if (syncing && data?.syncStatus === 'done') setSyncing(false)
    if (syncing && data?.syncStatus === 'error') setSyncing(false)
  }, [data?.syncStatus])

  const handleSync = async () => {
    setSyncing(true)
    await api.post('/analisis-comercial/sync', { fechaDesde, fechaHasta })
    setTimeout(() => refetch(), 2000)
  }

  const handleLinea = (val) => { setLinea(val); setCodigo('') } // el artículo depende de la línea elegida

  // ── Exportar PDF (mismo patrón/paleta que AnalisisVisitasPage.jsx, para que los informes
  // del CRM se vean consistentes) — corre 100% en el navegador, sin backend ni Chromium, para
  // no sumarle carga a las sesiones de WhatsApp que ya consumen bastante CPU en esta máquina.
  const [pdfLoading, setPdfLoading] = useState(false)
  const exportPDF = async () => {
    if (!data || data.sinDatos) return
    setPdfLoading(true)
    try {
      const { jsPDF } = await import('jspdf')
      const vends = [...data.vendedores].sort((a, b) => b.valorPedidos - a.valorPedidos)

      const mkChart = (type, chartData, opts = {}, w = 1000, h = 420) => {
        const cv = document.createElement('canvas')
        cv.width = w; cv.height = h
        const inst = new ChartJS(cv, { type, data: chartData, options: { ...opts, animation: false, responsive: false, devicePixelRatio: 2 } })
        const src = cv.toDataURL('image/png')
        inst.destroy()
        return src
      }
      const imgRanking = mkChart('bar', {
        labels: vends.map(v => v.nombre.split(' ')[0]),
        datasets: [{ data: vends.map(v => v.valorPedidos), backgroundColor: COLORES.map(c => c + 'CC'), borderRadius: 4 }],
      }, {
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, grid: { color: '#e5e7eb' } }, y: { grid: { display: false } } },
      }, 1000, Math.max(300, vends.length * 40 + 40))

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const PW = 210, PH = 297, MG = 14, CW = PW - MG * 2
      const CN = [30, 58, 95], CW255 = [255, 255, 255], CGR = [107, 114, 128], CLT = [244, 246, 248]
      let pg = 0

      const hdr = () => {
        pdf.setFillColor(...CN); pdf.rect(0, 0, PW, 11, 'F')
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.5); pdf.setTextColor(...CW255)
        pdf.text('AGROFER CRM  ·  Análisis Comercial', MG, 7.5)
        pdf.text(`${fechaDesde} – ${fechaHasta}`, PW - MG, 7.5, { align: 'right' })
      }
      const ftr = () => {
        pdf.setFillColor(238, 240, 243); pdf.rect(0, PH - 8, PW, 8, 'F')
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(...CGR)
        const fd = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
        pdf.text(`Generado: ${fd}`, MG, PH - 3)
        pdf.text(`Página ${pg}`, PW / 2, PH - 3, { align: 'center' })
        pdf.text('AGROFER CRM', PW - MG, PH - 3, { align: 'right' })
      }
      const nxt = (first = false) => { if (!first) { pdf.addPage(); hdr() } pg++ }
      const filtroTxt = data.filtro ? `${data.filtro.linea || 'Todas las líneas'}${data.filtro.codigo ? ` · ${data.filtro.codigo}` : ''}` : 'Todas las líneas'

      // Portada
      nxt(true)
      pdf.setFillColor(...CN); pdf.rect(0, 0, PW, 90, 'F')
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(28); pdf.setTextColor(...CW255)
      pdf.text('AGROFER CRM', PW / 2, 28, { align: 'center' })
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(13); pdf.setTextColor(170, 200, 235)
      pdf.text('Análisis Comercial', PW / 2, 40, { align: 'center' })
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(130, 170, 220)
      pdf.text(`Período: ${fechaDesde}  al  ${fechaHasta}`, PW / 2, 50, { align: 'center' })
      pdf.text(`Filtro: ${filtroTxt}`, PW / 2, 57, { align: 'center' })

      const kpis = [
        { l: 'Total pedidos', v: data.totalPedidos.toLocaleString('es') },
        { l: 'Facturado', v: fmtM(data.valorPedidos) },
        { l: 'Total artículos', v: Math.round(data.totalArticulos).toLocaleString('es') },
        { l: 'Clientes impactados', v: data.clientesImpactados.toLocaleString('es') },
      ]
      const bW = (CW - 3 * 4) / 4
      kpis.forEach((k, i) => {
        const bX = MG + i * (bW + 4)
        pdf.setDrawColor(...CW255); pdf.setLineWidth(0.4); pdf.roundedRect(bX, 62, bW, 20, 2, 2, 'S')
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13); pdf.setTextColor(...CW255)
        pdf.text(String(k.v), bX + bW / 2, 71, { align: 'center' })
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.5); pdf.setTextColor(170, 200, 235)
        pdf.text(k.l, bX + bW / 2, 78, { align: 'center' })
      })

      let y = 100
      if (vends.length) {
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(...CN)
        pdf.text('Podio', MG, y + 3); y += 10
        vends.slice(0, 3).forEach((v, i) => {
          const pX = MG + i * (CW / 3 + 1.5), pW = CW / 3 - 1.5
          pdf.setFillColor(...[[245, 180, 0], [185, 195, 200], [205, 130, 60]][i])
          pdf.roundedRect(pX, y, pW, 24, 3, 3, 'F')
          pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.5); pdf.setTextColor(30, 30, 30)
          pdf.text(`${i + 1}° lugar`, pX + pW / 2, y + 6, { align: 'center' })
          pdf.setFontSize(8.5); pdf.text(v.nombre.split(' ').slice(0, 2).join(' '), pX + pW / 2, y + 12, { align: 'center' })
          pdf.setFontSize(13); pdf.text(fmtM(v.valorPedidos), pX + pW / 2, y + 20, { align: 'center' })
        })
        y += 32
      }

      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(...CN)
      pdf.text('Facturado por vendedor', MG, y + 3); y += 8
      const cH = Math.min(90, Math.max(40, vends.length * 8))
      pdf.addImage(imgRanking, 'PNG', MG, y, CW, cH); y += cH + 8
      ftr()

      // Página 2: tabla completa
      nxt(); y = 19
      pdf.setFillColor(...CN); pdf.roundedRect(MG, y, 7, 7, 1, 1, 'F')
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.setTextColor(...CN)
      pdf.text('Ranking completo por vendedor', MG + 10, y + 5.8)
      y += 11
      const cols = [{ h: '#', w: 9, a: 'c' }, { h: 'Vendedor', w: 55, a: 'l' }, { h: 'Pedidos', w: 25, a: 'c' }, { h: 'Facturado', w: 30, a: 'c' }, { h: 'Total artículos', w: 30, a: 'c' }, { h: 'Clientes impact.', w: 33, a: 'c' }]
      const tblHdr = (yy) => {
        pdf.setFillColor(...CN); pdf.rect(MG, yy, CW, 7, 'F')
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.5); pdf.setTextColor(...CW255)
        let x = MG
        cols.forEach(c => { pdf.text(c.h, c.a === 'c' ? x + c.w / 2 : x + 2, yy + 4.8, { align: c.a === 'c' ? 'center' : 'left' }); x += c.w })
        return yy + 7
      }
      y = tblHdr(y)
      vends.forEach((v, i) => {
        if (y > PH - 22) { ftr(); nxt(); y = 19; y = tblHdr(y) }
        const rH = 8
        if (i % 2 === 0) { pdf.setFillColor(...CLT); pdf.rect(MG, y, CW, rH, 'F') }
        let x = MG
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.5); pdf.setTextColor(...CN)
        pdf.text(String(i + 1), x + cols[0].w / 2, y + 5.3, { align: 'center' }); x += cols[0].w
        pdf.text(v.nombre, x + 2, y + 5.3); x += cols[1].w
        pdf.setFont('helvetica', 'normal'); pdf.setTextColor(60, 60, 70)
        pdf.text(String(v.totalPedidos), x + cols[2].w / 2, y + 5.3, { align: 'center' }); x += cols[2].w
        pdf.setFont('helvetica', 'bold'); pdf.setTextColor(5, 120, 80)
        pdf.text(fmtM(v.valorPedidos), x + cols[3].w / 2, y + 5.3, { align: 'center' }); x += cols[3].w
        pdf.setFont('helvetica', 'normal'); pdf.setTextColor(60, 60, 70)
        pdf.text(Math.round(v.totalArticulos).toLocaleString('es'), x + cols[4].w / 2, y + 5.3, { align: 'center' }); x += cols[4].w
        pdf.text(String(v.clientesImpactados), x + cols[5].w / 2, y + 5.3, { align: 'center' })
        y += rH
      })
      ftr()

      pdf.save(`Analisis_Comercial_${fechaDesde}_${fechaHasta}${data.filtro?.linea ? `_${data.filtro.linea}` : ''}.pdf`)
    } finally {
      setPdfLoading(false)
    }
  }

  // Mes calendario N meses atrás de hoy (offset 1 = el mes pasado, 2 = hace dos meses, etc.)
  // — reemplaza los atajos que antes tenían "Mayo"/"Abril" escritos a mano con fecha fija
  // (2026), que se iban a quedar apuntando a mayo/abril de 2026 para siempre sin importar
  // en qué mes real estuviera el usuario.
  const mesAtras = (offsetMeses) => {
    const base = new Date(Date.UTC(+hoy.slice(0, 4), +hoy.slice(5, 7) - 1 - offsetMeses, 1))
    const y = base.getUTCFullYear(), m = base.getUTCMonth()
    const desde = `${y}-${String(m + 1).padStart(2, '0')}-01`
    const ultimoDia = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
    const hasta = `${y}-${String(m + 1).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`
    const nombre = base.toLocaleString('es', { month: 'long', timeZone: 'UTC' })
    return { label: nombre.charAt(0).toUpperCase() + nombre.slice(1), desde, hasta }
  }

  const periodos = [
    { label: 'Este mes', desde: primerDiaMes, hasta: hoy },
    { ...mesAtras(1), label: 'Mes ant.' },
    mesAtras(2),
    mesAtras(3),
  ]

  // Gráfica evolución diaria → agrupar por semana si hay muchos días
  const evolData = useMemo(() => {
    if (!data?.evolucion?.length) return null
    const labels = data.evolucion.map(e => e.dia.slice(5)) // MM-DD
    return {
      labels,
      datasets: [{
        label: 'Facturación diaria',
        data: data.evolucion.map(e => e.valor),
        fill: true,
        backgroundColor: 'rgba(99,102,241,0.08)',
        borderColor: '#6366f1',
        borderWidth: 2,
        pointRadius: labels.length > 20 ? 0 : 3,
        tension: 0.3,
      }],
    }
  }, [data])

  // Gráfica ranking vendedores
  const rankingData = useMemo(() => {
    if (!data?.vendedores) return null
    const vends = [...data.vendedores].sort((a, b) => b.valorPedidos - a.valorPedidos)
    return {
      labels: vends.map(v => v.nombre.split(' ')[0]),
      datasets: [
        {
          label: 'Facturado',
          data: vends.map(v => v.valorPedidos),
          backgroundColor: COLORES.map(c => c + 'CC'),
          borderRadius: 6,
        },
      ],
    }
  }, [data])

  // Gráfica top productos
  const prodData = useMemo(() => {
    if (!data?.topProductos?.length) return null
    const top = data.topProductos.slice(0, 8)
    return {
      labels: top.map(p => p.nombre?.slice(0, 25) + (p.nombre?.length > 25 ? '…' : '')),
      datasets: [{
        label: 'Valor vendido',
        data: top.map(p => p.valor),
        backgroundColor: COLORES.map(c => c + 'BB'),
        borderRadius: 6,
      }],
    }
  }, [data])

  const lastUpdate = data?.syncAt ? new Date(data.syncAt).toLocaleString('es', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : null

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="bg-white border-b border-gray-100 px-6 py-4 shrink-0">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center">
              <TrendingUp size={20} className="text-brand" />
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900">Análisis Comercial</h1>
              <p className="text-xs text-gray-400">
                Ventas y cobros del sistema principal
                {lastUpdate && <span className="ml-2">· Datos: {lastUpdate}</span>}
                {data?.fromCache && <span className="ml-1 text-amber-500">(caché)</span>}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Atajos de período */}
            {periodos.map(p => (
              <button key={p.label}
                onClick={() => { setFechaDesde(p.desde); setFechaHasta(p.hasta) }}
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                  fechaDesde === p.desde && fechaHasta === p.hasta
                    ? 'bg-brand text-white border-brand'
                    : 'border-gray-200 text-gray-500 hover:border-brand/40'
                }`}>{p.label}</button>
            ))}
            <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-brand" />
            <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-brand" />
            <button onClick={handleSync} disabled={syncing}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:border-brand/40 hover:text-brand disabled:opacity-40 transition-colors">
              {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              {syncing ? 'Sincronizando…' : 'Actualizar datos'}
            </button>
            {data && !data.sinDatos && (
              <button onClick={exportPDF} disabled={pdfLoading}
                title="Genera un PDF comparativo con el ranking de vendedores para compartir manualmente"
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-brand text-white rounded-lg hover:bg-brand/80 disabled:opacity-40 transition-colors">
                <Download size={13} /> {pdfLoading ? 'Generando…' : 'Exportar PDF'}
              </button>
            )}
          </div>
        </div>

        {/* Filtros de línea / artículo — el objetivo es poder ver la efectividad de cada
            vendedor en una marca o artículo puntual (ej. campañas), no solo el total general */}
        <div className="flex items-center gap-2 flex-wrap mt-3">
          <Filter size={13} className="text-gray-300" />
          <select value={linea} onChange={e => handleLinea(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-brand bg-white">
            <option value="">Todas las líneas</option>
            {filtrosData?.lineas?.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <select value={codigo} onChange={e => setCodigo(e.target.value)} disabled={!linea}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-brand bg-white disabled:opacity-40 disabled:bg-gray-50">
            <option value="">Todos los artículos</option>
            {filtrosData?.articulos?.map(a => (
              <option key={a.codigo} value={a.codigo}>{a.codigo} — {a.descripcion?.slice(0, 40)}</option>
            ))}
          </select>
          {(linea || codigo) && (
            <button onClick={() => { setLinea(''); setCodigo('') }}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors">
              <X size={12} /> Quitar filtro
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 p-6 space-y-6">
        {/* Sin datos aún */}
        {!isLoading && data?.sinDatos && (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <TrendingUp size={40} className="opacity-20 mb-3" />
            <p className="text-sm font-medium text-gray-600">Sin datos sincronizados aún</p>
            <p className="text-xs mt-1 mb-4">Presiona "Actualizar datos" para obtener los datos del sistema principal</p>
            <button onClick={handleSync} disabled={syncing}
              className="flex items-center gap-2 bg-brand text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-brand/80 disabled:opacity-50">
              {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {syncing ? 'Sincronizando (2-3 min)…' : 'Sincronizar ahora'}
            </button>
          </div>
        )}

        {/* Sincronizando en background */}
        {syncing && data && !data.sinDatos && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 flex items-center gap-2 text-sm text-amber-700 mb-2">
            <Loader2 size={14} className="animate-spin shrink-0" />
            Actualizando datos del sistema principal… puede tardar 2-3 minutos
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-red-700 text-sm">
            Error al cargar: {error?.error || error?.message}
          </div>
        )}

        {data && !data.sinDatos && !isLoading && (
          <>
            {/* Indicador de filtro activo */}
            {data.filtro && (
              <div className="bg-brand/5 border border-brand/20 rounded-xl px-4 py-2 text-xs text-brand font-medium">
                Filtro activo: {data.filtro.linea || 'Todas las líneas'}{data.filtro.codigo ? ` · ${data.filtro.codigo}` : ''}
              </div>
            )}

            {/* KPIs globales */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KPICard label="Total pedidos"        value={data.totalPedidos.toLocaleString('es')} sub={`${fechaDesde} → ${fechaHasta}`} color="bg-white border border-gray-100 shadow-sm" icon={ShoppingCart} />
              <KPICard label="Facturado"             value={fmtM(data.valorPedidos)}  sub="Valor total de pedidos"     color="bg-blue-50 border border-blue-100"   icon={DollarSign} />
              <KPICard label="Total artículos"       value={Math.round(data.totalArticulos).toLocaleString('es')}  sub="Unidades vendidas"  color="bg-amber-50 border border-amber-100"  icon={Boxes} />
              <KPICard label="Clientes impactados"   value={data.clientesImpactados.toLocaleString('es')}  sub="Clientes distintos que compraron"  color="bg-green-50 border border-green-100"  icon={Users} />
            </div>

            {/* Evolución diaria */}
            {evolData && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <h2 className="text-sm font-bold text-gray-800 mb-4">Evolución de facturación</h2>
                <div className="h-56">
                  <Line data={evolData} options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmtM(ctx.raw) } } },
                    scales: {
                      x: { grid: { color: '#f3f4f6' }, ticks: { font: { size: 10 } } },
                      y: { grid: { color: '#f3f4f6' }, ticks: { font: { size: 10 }, callback: v => fmtM(v) } },
                    },
                  }} />
                </div>
              </div>
            )}

            {/* Ranking + Top productos */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Ranking gráfica */}
              {rankingData && (
                <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <h2 className="text-sm font-bold text-gray-800 mb-4">Facturado por vendedor</h2>
                  <Bar data={rankingData} options={{
                    responsive: true,
                    plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmtM(ctx.raw)}` } } },
                    scales: {
                      x: { grid: { display: false }, ticks: { font: { size: 10 } } },
                      y: { grid: { color: '#f3f4f6' }, ticks: { font: { size: 10 }, callback: v => fmtM(v) } },
                    },
                  }} />
                </div>
              )}

              {/* Top productos */}
              {prodData && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <h2 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <Package size={14} className="text-brand" /> Top productos
                  </h2>
                  <Bar data={prodData} options={{
                    responsive: true,
                    indexAxis: 'y',
                    plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmtM(ctx.raw) } } },
                    scales: {
                      x: { grid: { color: '#f3f4f6' }, ticks: { font: { size: 9 }, callback: v => fmtM(v) } },
                      y: { grid: { display: false }, ticks: { font: { size: 9 } } },
                    },
                  }} />
                </div>
              )}
            </div>

            {/* Tabla de vendedores */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-bold text-gray-800">Detalle por vendedor</h2>
                <p className="text-xs text-gray-400 mt-0.5">Clic en una fila para ver sus productos más vendidos</p>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Vendedor</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">Pedidos</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Facturado</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">Total artículos</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">Clientes impactados</th>
                    <th className="px-4 py-3 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.vendedores.map((v, i) => (
                    <VendedorRow key={v.terid} v={v} idx={i} totalValor={data.valorPedidos} />
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t border-gray-200">
                  <tr>
                    <td className="px-4 py-3 text-xs font-black text-gray-700">TOTAL</td>
                    <td className="px-4 py-3 text-right text-xs font-black text-gray-700">{data.totalPedidos.toLocaleString('es')}</td>
                    <td className="px-4 py-3 text-xs font-black text-gray-700 pl-6">{fmtM(data.valorPedidos)}</td>
                    <td className="px-4 py-3 text-right text-xs font-black text-gray-700">{Math.round(data.totalArticulos).toLocaleString('es')}</td>
                    <td className="px-4 py-3 text-right text-xs font-black text-gray-700">{data.clientesImpactados.toLocaleString('es')}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
