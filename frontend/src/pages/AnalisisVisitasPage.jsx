import { useState, useRef, useCallback } from 'react'
import { Bar, Line, Doughnut } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Title, Tooltip, Legend, Filler,
} from 'chart.js'
import * as XLSX from 'xlsx'
import {
  Download, AlertTriangle, FileSpreadsheet, Users, TrendingUp,
  Target, ShoppingCart, MapPin, UserX, Clock, BarChart2, Activity,
} from 'lucide-react'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Title, Tooltip, Legend, Filler)

// ── Paleta y constantes ───────────────────────────────────────────────────────
const PALETA = ['#1e3a5f','#2563eb','#059669','#d97706','#7c3aed','#db2777','#0891b2','#65a30d','#ea580c','#6366f1']
const DIAS_ES = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
const COLS_REQUERIDAS = ['representante','fecha_visita','hora_inicial','hora_final','pedido_check','pago_check','pqr_check','otro_check']

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeToMin(t) {
  if (!t) return null
  const s = String(t).trim().split(':').map(Number)
  if (s.length < 2 || s.some(isNaN)) return null
  return s[0] * 60 + s[1]
}
function duracion(hi, hf) {
  const a = timeToMin(hi), b = timeToMin(hf)
  if (a === null || b === null) return null
  const d = b - a
  return d <= 0 ? null : d
}
function fmtMin(m) {
  if (m === null || m === undefined || isNaN(m)) return '—'
  const r = Math.round(m)
  return r < 60 ? `${r} min` : `${Math.floor(r/60)}h ${r%60}m`
}
function fmtHora(t) {
  if (!t) return '—'
  return String(t).trim().slice(0, 5)
}
function semana(fechaStr) {
  const d = new Date(fechaStr)
  const start = new Date(d)
  start.setDate(d.getDate() - d.getDay() + 1)
  return start.toISOString().slice(0, 10)
}
function mediana(arr) {
  if (!arr.length) return null
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m-1] + s[m]) / 2
}

// ── Procesamiento ─────────────────────────────────────────────────────────────
function procesar(rows) {
  const cols = Object.keys(rows[0] || {}).map(c => c.toLowerCase())
  const faltantes = COLS_REQUERIDAS.filter(c => !cols.includes(c))
  if (faltantes.length) throw new Error(`Columnas faltantes: ${faltantes.join(', ')}`)

  const norm = rows.map(r => {
    const get = (...keys) => { for (const k of keys) { const v = r[k] ?? r[k.toLowerCase()] ?? r[k.toUpperCase()]; if (v !== undefined) return v } return '' }
    return {
      id:         get('visita_id'),
      cliente:    String(get('nombrecliente','nombre') || '').trim(),
      estab:      String(get('establecimiento') || '').trim(),
      vend:       String(get('representante') || '').trim(),
      depto:      String(get('departamento') || '').trim(),
      ciudad:     String(get('ciudad') || '').trim(),
      barrio:     String(get('barrio') || '').trim(),
      posicion:   String(get('posicion') || '').trim(),
      fecha:      String(get('fecha_visita') || get('fecha_visita_registro') || '').slice(0, 10),
      fechaReg:   String(get('fecha_visita_registro') || '').slice(0, 10),
      hi:         String(get('hora_inicial') || '').trim(),
      hf:         String(get('hora_final') || '').trim(),
      pedido:     Number(get('pedido_check')) === 1,
      pago:       Number(get('pago_check'))   === 1,
      pqr:        Number(get('pqr_check'))    === 1,
      otro:       Number(get('otro_check'))   === 1,
      otroMotivo: String(get('otro_motivo') || '').trim(),
    }
  }).filter(r => r.vend && r.fecha)

  // Acumuladores por vendedor
  const vMap = {}
  const ciudadesMap = {}, clientesUnicosSet = new Set(), semanas = {}, semanasPedidos = {}, semanasCobros = {}

  norm.forEach(r => {
    if (!vMap[r.vend]) vMap[r.vend] = {
      visitas: [], dias: new Set(), duraciones: [], horasIni: [],
      clientes: new Set(), establs: new Set(), deptos: new Set(),
    }
    const v = vMap[r.vend]
    v.visitas.push(r)
    if (r.fecha) v.dias.add(r.fecha)
    const dur = duracion(r.hi, r.hf)
    if (dur) v.duraciones.push(dur)
    const ini = timeToMin(r.hi)
    if (ini) v.horasIni.push(ini)
    if (r.cliente) { v.clientes.add(r.cliente); clientesUnicosSet.add(r.cliente) }
    if (r.estab)   v.establs.add(r.estab)
    if (r.depto)   v.deptos.add(r.depto)
    if (r.ciudad)  ciudadesMap[r.ciudad] = (ciudadesMap[r.ciudad] || 0) + 1

    const sem = r.fecha ? semana(r.fecha) : null
    if (sem) {
      if (!semanas[sem]) semanas[sem] = {}
      semanas[sem][r.vend] = (semanas[sem][r.vend] || 0) + 1
      if (!semanasPedidos[sem]) semanasPedidos[sem] = {}
      if (r.pedido) semanasPedidos[sem][r.vend] = (semanasPedidos[sem][r.vend] || 0) + 1
      if (!semanasCobros[sem]) semanasCobros[sem] = {}
      if (r.pago) semanasCobros[sem][r.vend] = (semanasCobros[sem][r.vend] || 0) + 1
    }
  })

  const vendedores = Object.entries(vMap).map(([nombre, d]) => {
    const dias    = d.dias.size || 1
    const pedidos = d.visitas.filter(v => v.pedido).length
    const pagos   = d.visitas.filter(v => v.pago).length
    const pqrs    = d.visitas.filter(v => v.pqr).length
    const otros   = d.visitas.filter(v => v.otro).length
    const avgDur  = d.duraciones.length ? d.duraciones.reduce((a,b)=>a+b,0)/d.duraciones.length : null
    const medDur  = mediana(d.duraciones)
    const avgIni  = d.horasIni.length   ? d.horasIni.reduce((a,b)=>a+b,0)/d.horasIni.length   : null
    return {
      nombre, total: d.visitas.length, dias,
      vpd: Math.round((d.visitas.length/dias)*10)/10,
      avgDur, medDur, avgIni, pedidos, pagos, pqrs, otros,
      visitas: d.visitas,
      clientesUnicos: d.clientes.size,
      establUnicos:   d.establs.size,
      deptosUnicos:   d.deptos.size,
      tasaConv: d.visitas.length ? Math.round((pedidos/d.visitas.length)*100) : 0,
    }
  }).sort((a,b) => b.total - a.total)

  // Franjas horarias
  const franjas = { mañana: 0, tarde: 0, noche: 0 }
  norm.forEach(r => {
    const ini = timeToMin(r.hi)
    if (ini === null) return
    if (ini < 12*60) franjas.mañana++
    else if (ini < 18*60) franjas.tarde++
    else franjas.noche++
  })

  // Alertas
  const alertas = norm.flatMap(r => {
    const dur = duracion(r.hi, r.hf)
    if (!r.hi || !r.hf || dur === null) return [{ ...r, tipo: 'Sin registro de hora', dur: null }]
    if (dur < 2)   return [{ ...r, tipo: 'Visita muy corta (posible fantasma)', dur }]
    if (dur > 120) return [{ ...r, tipo: 'Visita muy larga', dur }]
    return []
  })

  // Visitas por día semana
  const porDiaSemana = [0,1,2,3,4,5,6].map(d => ({ dia: DIAS_ES[d], count: 0 }))
  norm.forEach(r => {
    if (!r.fecha) return
    const d = new Date(r.fecha + 'T12:00:00').getDay()
    porDiaSemana[d].count++
  })

  // Top otro motivo
  const motOtro = {}
  norm.filter(r => r.otro && r.otroMotivo).forEach(r => {
    const k = r.otroMotivo.slice(0, 60)
    motOtro[k] = (motOtro[k] || 0) + 1
  })
  const topOtroMotivo = Object.entries(motOtro).sort((a,b)=>b[1]-a[1]).slice(0,15)
  const totalOtro = norm.filter(r=>r.otro).length

  // Top clientes
  const clienteMap = {}
  norm.forEach(r => {
    if (!r.cliente) return
    if (!clienteMap[r.cliente]) clienteMap[r.cliente] = { nombre: r.cliente, visitas: 0, pedidos: 0, pagos: 0, pqrs: 0, otros: 0, ciudad: r.ciudad, estab: r.estab }
    clienteMap[r.cliente].visitas++
    if (r.pedido) clienteMap[r.cliente].pedidos++
    if (r.pago)   clienteMap[r.cliente].pagos++
    if (r.pqr)    clienteMap[r.cliente].pqrs++
    if (r.otro)   clienteMap[r.cliente].otros++
  })
  const topClientes = Object.values(clienteMap).sort((a,b) => b.visitas - a.visitas).slice(0, 20)
  const clientesSinPedido = Object.values(clienteMap)
    .filter(c => c.visitas >= 2 && c.pedidos === 0)
    .sort((a,b) => b.visitas - a.visitas).slice(0, 20)

  // Top establecimientos por tasa conversión
  const establMap = {}
  norm.forEach(r => {
    if (!r.estab) return
    if (!establMap[r.estab]) establMap[r.estab] = { nombre: r.estab, visitas: 0, pedidos: 0, ciudad: r.ciudad }
    establMap[r.estab].visitas++
    if (r.pedido) establMap[r.estab].pedidos++
  })
  const topEstabs = Object.values(establMap)
    .filter(e => e.visitas >= 2)
    .sort((a,b) => (b.pedidos/b.visitas) - (a.pedidos/a.visitas))
    .slice(0, 15)

  // Top departamentos
  const deptosMap = {}
  norm.forEach(r => { if (r.depto) deptosMap[r.depto] = (deptosMap[r.depto] || 0) + 1 })
  const topDeptos = Object.entries(deptosMap).sort((a,b)=>b[1]-a[1]).slice(0,10)

  // Visitas duplicadas: mismo vendedor + mismo cliente + mismo día
  const claveDia = {}
  norm.forEach(r => {
    if (!r.cliente || !r.fecha) return
    const key = `${r.vend}||${r.cliente}||${r.fecha}`
    if (!claveDia[key]) claveDia[key] = []
    claveDia[key].push(r)
  })
  const visitasMultiples = Object.values(claveDia).filter(g => g.length > 1).flat()

  const fechas = norm.map(r=>r.fecha).filter(Boolean).sort()
  const fechaMin = fechas[0] || '', fechaMax = fechas[fechas.length-1] || ''

  return {
    vendedores, ciudades: ciudadesMap, clientesUnicos: clientesUnicosSet.size,
    alertas, porDiaSemana, topOtroMotivo, totalOtro, semanas, semanasPedidos, semanasCobros, norm,
    fechaMin, fechaMax, total: norm.length,
    franjas, topClientes, clientesSinPedido, topEstabs, topDeptos, visitasMultiples,
  }
}

// ── Componentes UI ────────────────────────────────────────────────────────────
function KPI({ icon: Icon, label, value, sub, bg = 'bg-[#1e3a5f]' }) {
  return (
    <div className={`${bg} text-white rounded-2xl p-5`}>
      <Icon size={20} className="opacity-50 mb-3" />
      <p className="text-3xl font-bold leading-none">{value}</p>
      <p className="text-sm font-semibold mt-2 opacity-80">{label}</p>
      {sub && <p className="text-xs mt-0.5 opacity-50">{sub}</p>}
    </div>
  )
}

function Card({ children, className = '' }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden ${className}`}>
      {children}
    </div>
  )
}

function CardHead({ title, sub }) {
  return (
    <div className="px-5 pt-4 pb-3 border-b border-gray-50">
      <p className="text-sm font-bold text-gray-800">{title}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5 leading-snug">{sub}</p>}
    </div>
  )
}

function Seccion({ num, titulo, descripcion, children }) {
  return (
    <section id={`sec-${num}`} className="scroll-mt-20 mb-20">
      <div className="flex items-start gap-4 mb-6 pt-2">
        <span className="w-10 h-10 rounded-xl bg-[#1e3a5f] text-white text-sm font-bold flex items-center justify-center shrink-0">
          {num}
        </span>
        <div className="pt-0.5">
          <h2 className="text-xl font-bold text-[#1e3a5f]">{titulo}</h2>
          <p className="text-sm text-gray-400 mt-1 leading-relaxed max-w-2xl">{descripcion}</p>
        </div>
      </div>
      {children}
      {num < 7 && <div className="mt-16 border-t border-gray-200" />}
    </section>
  )
}

const NAV_SECS = [
  { num:1, label:'KPIs Globales'  },
  { num:2, label:'Productividad'  },
  { num:3, label:'Efectividad'    },
  { num:4, label:'Temporal'       },
  { num:5, label:'Cobertura'      },
  { num:6, label:'Clientes'       },
  { num:7, label:'Alertas'        },
]

const CHART_BAR_H = {
  responsive: true, indexAxis: 'y',
  plugins: { legend: { display: false } },
  scales: {
    x: { beginAtZero: true, grid: { color: '#f3f4f6' }, ticks: { font: { size: 11 } } },
    y: { grid: { display: false }, ticks: { font: { size: 11 } } },
  },
}
const CHART_BAR_V = {
  responsive: true,
  plugins: { legend: { display: false } },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 11 } } },
    y: { beginAtZero: true, grid: { color: '#f3f4f6' }, ticks: { font: { size: 11 } } },
  },
}

const STORAGE_KEY      = 'agrofer_visitas_datos'
const STORAGE_META_KEY = 'agrofer_visitas_meta'

// ── Página principal ──────────────────────────────────────────────────────────
export default function AnalisisVisitasPage() {
  const [datos, setDatos] = useState(() => {
    try { const s = localStorage.getItem(STORAGE_KEY); return s ? JSON.parse(s) : null } catch { return null }
  })
  const [meta, setMeta] = useState(() => {
    try { const s = localStorage.getItem(STORAGE_META_KEY); return s ? JSON.parse(s) : null } catch { return null }
  })
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [modoLinea, setModoLinea] = useState('visitas')
  const [vendFiltro, setVendFiltro] = useState(null)
  const reportRef = useRef()

  const guardarDatos = (d, fileName) => {
    setDatos(d)
    const m = { fileName, date: new Date().toISOString() }
    setMeta(m)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(d))
      localStorage.setItem(STORAGE_META_KEY, JSON.stringify(m))
    } catch { /* datos muy grandes — se muestran pero no se persisten */ }
  }

  const limpiarDatos = () => {
    setDatos(null); setMeta(null)
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(STORAGE_META_KEY)
  }

  const handleFile = useCallback((e) => {
    const file = e.target.files?.[0] || e.dataTransfer?.files?.[0]
    if (!file) return
    setLoading(true); setError('')
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const wb   = XLSX.read(ev.target.result, { type: 'binary', cellDates: false })
        const ws   = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
        if (!rows.length) throw new Error('El archivo está vacío')
        guardarDatos(procesar(rows), file.name)
      } catch(err) { setError(err.message) }
      finally { setLoading(false) }
    }
    reader.readAsBinaryString(file)
    if (e.target) e.target.value = ''
  }, [])

  const onDrop = useCallback((e) => { e.preventDefault(); handleFile(e) }, [handleFile])

  const scrollTo = (num) => {
    document.getElementById(`sec-${num}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // ── Exportar PDF (programático con jsPDF) ────────────────────────────────
  const exportPDF = async () => {
    if (!datos) return
    setPdfLoading(true)
    try {
      const { jsPDF } = await import('jspdf')

      const mkChart = (type, data, opts = {}, w = 1000, h = 420) => {
        const cv = document.createElement('canvas')
        cv.width = w; cv.height = h
        const inst = new ChartJS(cv, { type, data, options: { ...opts, animation: false, responsive: false, devicePixelRatio: 2 } })
        const src = cv.toDataURL('image/png')
        inst.destroy()
        return src
      }
      const hexRgb = h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)]

      const chartPxH = Math.max(300, rv.length * 44 + 60)
      const imgVisitas  = mkChart('bar', barVisitas,   { indexAxis:'y', plugins:{legend:{display:false}}, scales:{x:{beginAtZero:true,grid:{color:'#e5e7eb'}},y:{grid:{display:false}}} }, 1000, chartPxH)
      const imgDuracion = mkChart('bar', barDuracion,  { indexAxis:'y', plugins:{legend:{display:false}}, scales:{x:{beginAtZero:true,grid:{color:'#e5e7eb'}},y:{grid:{display:false}}} }, 1000, chartPxH)
      const imgDonut    = mkChart('doughnut', donutMotivos, { cutout:'62%', plugins:{legend:{position:'bottom',labels:{font:{size:14},boxWidth:14}}} }, 700, 600)
      const imgDias     = mkChart('bar', porDiaBarData, { plugins:{legend:{display:false}}, scales:{x:{grid:{display:false}},y:{beginAtZero:true,grid:{color:'#e5e7eb'}}} }, 1000, 420)
      const imgLinea    = mkChart('line', lineaSemanal,  { plugins:{legend:{position:'bottom',labels:{font:{size:12},boxWidth:12,usePointStyle:true}}}, scales:{x:{grid:{display:false}},y:{beginAtZero:true,grid:{color:'#e5e7eb'}}} }, 1200, 500)

      const pdf = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' })
      const PW=210, PH=297, MG=14, CW=PW-MG*2
      const CN=[30,58,95], CW255=[255,255,255], CGR=[107,114,128], CLT=[244,246,248]
      let pg = 0

      const hdr = () => {
        pdf.setFillColor(...CN); pdf.rect(0,0,PW,11,'F')
        pdf.setFont('helvetica','bold'); pdf.setFontSize(7.5); pdf.setTextColor(...CW255)
        pdf.text('AGROFER CRM  ·  Análisis de Visitas de Vendedores', MG, 7.5)
        pdf.text(`${fechaMin} – ${fechaMax}`, PW-MG, 7.5, {align:'right'})
      }
      const ftr = () => {
        pdf.setFillColor(238,240,243); pdf.rect(0,PH-8,PW,8,'F')
        pdf.setFont('helvetica','normal'); pdf.setFontSize(7); pdf.setTextColor(...CGR)
        const fd = new Date().toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'})
        pdf.text(`Generado: ${fd}`, MG, PH-3)
        pdf.text(`Página ${pg}`, PW/2, PH-3, {align:'center'})
        pdf.text('AGROFER CRM', PW-MG, PH-3, {align:'right'})
      }
      const sec = (num, title, y) => {
        pdf.setFillColor(...CN); pdf.roundedRect(MG,y,7,7,1,1,'F')
        pdf.setFont('helvetica','bold'); pdf.setFontSize(7.5); pdf.setTextColor(...CW255)
        pdf.text(String(num), MG+3.5, y+4.8, {align:'center'})
        pdf.setFont('helvetica','bold'); pdf.setFontSize(11); pdf.setTextColor(...CN)
        pdf.text(title, MG+10, y+5.8)
        return y+11
      }
      const tblHdr = (cols, y) => {
        pdf.setFillColor(...CN); pdf.rect(MG,y,CW,7,'F')
        pdf.setFont('helvetica','bold'); pdf.setFontSize(7.5); pdf.setTextColor(...CW255)
        let x=MG
        cols.forEach(c => { pdf.text(c.h, c.a==='c'?x+c.w/2:x+2, y+4.8, {align:c.a==='c'?'center':'left'}); x+=c.w })
        return y+7
      }
      const nxt = (first=false) => { if(!first){ pdf.addPage(); hdr() } pg++ }
      const pct = n => total ? `${((n/total)*100).toFixed(0)}%` : '0%'

      // PAGE 1: Portada
      nxt(true)
      pdf.setFillColor(...CN); pdf.rect(0,0,PW,92,'F')
      pdf.setFont('helvetica','bold'); pdf.setFontSize(30); pdf.setTextColor(...CW255)
      pdf.text('AGROFER CRM', PW/2, 30, {align:'center'})
      pdf.setFont('helvetica','normal'); pdf.setFontSize(13); pdf.setTextColor(170,200,235)
      pdf.text('Análisis de Visitas de Vendedores', PW/2, 43, {align:'center'})
      pdf.setFont('helvetica','bold'); pdf.setFontSize(10); pdf.setTextColor(130,170,220)
      pdf.text(`Período: ${fechaMin}  al  ${fechaMax}`, PW/2, 55, {align:'center'})
      const bW=(CW/3)-3
      ;[{l:'Total Visitas',v:total.toLocaleString('es-CO')},{l:'Vendedores',v:rv.length},{l:'Clientes Únicos',v:clientesUnicos.toLocaleString('es-CO')}]
        .forEach((k,i) => {
          const bX=MG+i*(bW+4.5)
          pdf.setDrawColor(...CW255); pdf.setLineWidth(0.4); pdf.roundedRect(bX,64,bW,21,2,2,'S')
          pdf.setFont('helvetica','bold'); pdf.setFontSize(18); pdf.setTextColor(...CW255)
          pdf.text(String(k.v), bX+bW/2, 74, {align:'center'})
          pdf.setFont('helvetica','normal'); pdf.setFontSize(7.5); pdf.setTextColor(170,200,235)
          pdf.text(k.l, bX+bW/2, 81, {align:'center'})
        })
      let y=98
      pdf.setFillColor(...CLT); pdf.roundedRect(MG,y,CW,52,3,3,'F')
      pdf.setFont('helvetica','bold'); pdf.setFontSize(10); pdf.setTextColor(...CN)
      pdf.text('Resumen Ejecutivo', MG+6, y+7)
      pdf.setFont('helvetica','normal'); pdf.setFontSize(8.5); pdf.setTextColor(50,55,65)
      const avgV = rv.length ? (rv.reduce((s,v)=>s+v.vpd,0)/rv.length).toFixed(1) : 0
      ;[
        `El análisis comprende ${fechaMin} al ${fechaMax} con ${total.toLocaleString('es-CO')} visitas registradas.`,
        `El equipo realizó en promedio ${avgV} visitas/día entre ${rv.length} vendedores activos.`,
        ...(rv[0] ? [`${rv[0].nombre} lidera con ${rv[0].total} visitas (${pct(rv[0].total)} del total).`] : []),
        `Pedidos: ${totalPedidos} (${pct(totalPedidos)})  ·  Cobros: ${totalPagos} (${pct(totalPagos)})  ·  PQRs: ${totalPqrs} (${pct(totalPqrs)}).`,
        ...(alertas.length ? [`Se detectaron ${alertas.length} alertas que requieren revisión.`] : []),
      ].forEach((line,i) => pdf.text(`•  ${line}`, MG+6, y+15+i*6.5))
      y=157
      pdf.setFont('helvetica','bold'); pdf.setFontSize(10); pdf.setTextColor(...CN)
      pdf.text('Podio de Vendedores', MG, y+3); y+=10
      rv.slice(0,3).forEach((v,i) => {
        const pX=MG+i*(CW/3+1.5), pW=CW/3-1.5
        pdf.setFillColor(...[[245,180,0],[185,195,200],[205,130,60]][i])
        pdf.roundedRect(pX,y,pW,25,3,3,'F')
        pdf.setFont('helvetica','bold'); pdf.setFontSize(7.5); pdf.setTextColor(30,30,30)
        pdf.text(`${i+1}° lugar`, pX+pW/2, y+6, {align:'center'})
        pdf.setFontSize(8.5); pdf.text(v.nombre.split(' ').slice(0,2).join(' '), pX+pW/2, y+12, {align:'center'})
        pdf.setFontSize(16); pdf.text(String(v.total), pX+pW/2, y+20, {align:'center'})
        pdf.setFontSize(7); pdf.setTextColor(80,80,80); pdf.text('visitas', pX+pW/2, y+24, {align:'center'})
      })
      ftr()

      // PAGE 2: Ranking
      nxt(); y=19; y=sec(2,'Ranking de Vendedores',y)
      const rC=[{h:'#',w:9,a:'c'},{h:'Vendedor',w:45,a:'l'},{h:'Visitas',w:19,a:'c'},{h:'Días',w:14,a:'c'},{h:'V/Día',w:15,a:'c'},{h:'Dur.Prom.',w:24,a:'c'},{h:'Dur.Med.',w:21,a:'c'},{h:'H.Inicio',w:20,a:'c'},{h:'Clientes',w:18,a:'c'},{h:'Estab.',w:17,a:'c'}]
      y=tblHdr(rC,y)
      rv.forEach((v,i) => {
        if(y>PH-22){ ftr(); nxt(); y=19; y=tblHdr(rC,y) }
        const rH=8
        if(i%2===0){ pdf.setFillColor(...CLT); pdf.rect(MG,y,CW,rH,'F') }
        const horaI = v.avgIni ? `${Math.floor(v.avgIni/60).toString().padStart(2,'0')}:${Math.round(v.avgIni%60).toString().padStart(2,'0')}` : '—'
        const durC = !v.avgDur?[...CGR]:v.avgDur>35?[185,28,28]:v.avgDur>25?[146,64,14]:[5,120,80]
        let x=MG
        pdf.setFillColor(...hexRgb(PALETA[i%PALETA.length])); pdf.roundedRect(x+0.5,y+1.8,8,4.5,1,1,'F')
        pdf.setFont('helvetica','bold'); pdf.setFontSize(7); pdf.setTextColor(...CW255)
        pdf.text(String(i+1), x+4.5, y+5, {align:'center'}); x+=rC[0].w
        pdf.setFont('helvetica','bold'); pdf.setFontSize(8); pdf.setTextColor(...CN)
        pdf.text(v.nombre, x+2, y+5.5); x+=rC[1].w
        pdf.setFont('helvetica','bold'); pdf.setFontSize(8.5); pdf.setTextColor(30,30,30)
        pdf.text(String(v.total), x+rC[2].w/2, y+5.5, {align:'center'}); x+=rC[2].w
        pdf.setFont('helvetica','normal'); pdf.setFontSize(8); pdf.setTextColor(60,60,70)
        pdf.text(String(v.dias),  x+rC[3].w/2, y+5.5, {align:'center'}); x+=rC[3].w
        pdf.text(String(v.vpd),   x+rC[4].w/2, y+5.5, {align:'center'}); x+=rC[4].w
        pdf.setFont('helvetica','bold'); pdf.setTextColor(...durC)
        pdf.text(fmtMin(v.avgDur), x+rC[5].w/2, y+5.5, {align:'center'}); x+=rC[5].w
        pdf.setFont('helvetica','normal'); pdf.setTextColor(60,60,70)
        pdf.text(fmtMin(v.medDur), x+rC[6].w/2, y+5.5, {align:'center'}); x+=rC[6].w
        pdf.text(horaI,            x+rC[7].w/2, y+5.5, {align:'center'}); x+=rC[7].w
        pdf.text(String(v.clientesUnicos), x+rC[8].w/2, y+5.5, {align:'center'}); x+=rC[8].w
        pdf.text(String(v.establUnicos),   x+rC[9].w/2, y+5.5, {align:'center'})
        y+=rH
      })
      ftr()

      // PAGE 3: Visitas + efectividad
      nxt(); y=19; y=sec(3,'Visitas por Vendedor',y)
      const cH=Math.min(130, Math.max(50, rv.length*13+20))
      pdf.addImage(imgVisitas,'PNG',MG,y,CW,cH); y+=cH+8
      y=sec(5,'Efectividad Comercial por Vendedor',y)
      const eC=[{h:'Vendedor',w:46,a:'l'},{h:'Visitas',w:19,a:'c'},{h:'Pedidos',w:20,a:'c'},{h:'%Conv.',w:18,a:'c'},{h:'Cobros',w:20,a:'c'},{h:'%',w:14,a:'c'},{h:'PQRs',w:18,a:'c'},{h:'Otros',w:27,a:'c'}]
      y=tblHdr(eC,y)
      rv.forEach((v,i) => {
        if(y>PH-22){ ftr(); nxt(); y=19; y=tblHdr(eC,y) }
        const rH=7
        if(i%2===0){ pdf.setFillColor(...CLT); pdf.rect(MG,y,CW,rH,'F') }
        let x=MG
        pdf.setFont('helvetica','bold'); pdf.setFontSize(8); pdf.setTextColor(...CN)
        pdf.text(v.nombre, x+2, y+4.8); x+=eC[0].w
        pdf.setTextColor(60,60,70); pdf.setFont('helvetica','normal')
        pdf.text(String(v.total), x+eC[1].w/2, y+4.8, {align:'center'}); x+=eC[1].w
        pdf.setFont('helvetica','bold'); pdf.setTextColor(5,120,80)
        pdf.text(String(v.pedidos), x+eC[2].w/2, y+4.8, {align:'center'}); x+=eC[2].w
        const tColor = v.tasaConv>=50?[5,120,80]:v.tasaConv>=30?[146,64,14]:[185,28,28]
        pdf.setTextColor(...tColor)
        pdf.text(`${v.tasaConv}%`, x+eC[3].w/2, y+4.8, {align:'center'}); x+=eC[3].w
        pdf.setFont('helvetica','bold'); pdf.setTextColor(37,99,235)
        pdf.text(String(v.pagos), x+eC[4].w/2, y+4.8, {align:'center'}); x+=eC[4].w
        pdf.setFont('helvetica','normal'); pdf.setTextColor(80,80,90)
        pdf.text(v.total?`${((v.pagos/v.total)*100).toFixed(0)}%`:'—', x+eC[5].w/2, y+4.8, {align:'center'}); x+=eC[5].w
        if(v.pqrs){ pdf.setTextColor(185,28,28) } else { pdf.setTextColor(...CGR) }
        pdf.text(v.pqrs?String(v.pqrs):'—', x+eC[6].w/2, y+4.8, {align:'center'}); x+=eC[6].w
        pdf.setTextColor(60,60,70); pdf.text(String(v.otros), x+eC[7].w/2, y+4.8, {align:'center'})
        y+=rH
      })
      ftr()

      // PAGE 4: Duración
      nxt(); y=19; y=sec(4,'Duración Promedio de Visita',y)
      pdf.addImage(imgDuracion,'PNG',MG,y,CW,cH); y+=cH+6
      ;[{bg:[255,200,200],tc:[185,28,28],t:'> 35 min — Muy larga'},{bg:[255,240,160],tc:[146,64,14],t:'25–35 min — Normal-larga'},{bg:[160,230,190],tc:[5,120,80],t:'< 25 min — Óptimo'}]
        .forEach((l,i) => {
          const lx=MG+i*65
          pdf.setFillColor(...l.bg); pdf.roundedRect(lx,y,4,4,1,1,'F')
          pdf.setFont('helvetica','normal'); pdf.setFontSize(7.5); pdf.setTextColor(...l.tc)
          pdf.text(l.t, lx+6, y+3.3)
        })
      ftr()

      // PAGE 5: Motivos + días
      nxt(); y=19; y=sec(5,'Distribución de Motivos de Visita',y)
      const dSz=78
      pdf.addImage(imgDonut,'PNG',MG,y,dSz,dSz*0.86)
      const sX=MG+dSz+8, sW=CW-dSz-8
      ;[{l:'Pedidos',v:totalPedidos,c:[5,120,80]},{l:'Cobros',v:totalPagos,c:[37,99,235]},{l:'PQRs',v:totalPqrs,c:[185,28,28]},{l:'Otros',v:totalOtros,c:[...CGR]}]
        .forEach((m,i) => {
          const mY=y+i*18
          pdf.setFillColor(245,247,250); pdf.roundedRect(sX,mY,sW,15,2,2,'F')
          pdf.setFont('helvetica','bold'); pdf.setFontSize(14); pdf.setTextColor(...m.c)
          pdf.text(String(m.v), sX+7, mY+9)
          pdf.setFont('helvetica','normal'); pdf.setFontSize(8); pdf.setTextColor(...CGR)
          pdf.text(`${m.l}  ·  ${pct(m.v)}`, sX+7, mY+13.5)
        })
      y+=Math.max(dSz*0.86,4*18)+8
      y=sec(6,'Actividad por Día de la Semana',y)
      pdf.addImage(imgDias,'PNG',MG,y,CW,65); y+=70
      const sDias=porDiaSemana.slice(1)
      const mxD=sDias.reduce((m,d)=>d.count>m.count?d:m,sDias[0])
      const mnD=sDias.filter(d=>d.count>0).reduce((m,d)=>d.count<m.count?d:m,sDias[0])
      pdf.setFont('helvetica','normal'); pdf.setFontSize(8); pdf.setTextColor(...CGR)
      pdf.text(`Más activo: ${mxD.dia} (${mxD.count} vis.)  ·  Menos activo: ${mnD?.dia||'—'} (${mnD?.count||0} vis.)`, MG, y)
      ftr()

      // PAGE 6: Tendencia + cobertura
      nxt(); y=19; y=sec(7,'Tendencia Semanal por Vendedor',y)
      pdf.addImage(imgLinea,'PNG',MG,y,CW,82); y+=88
      if(y>PH-95){ ftr(); nxt(); y=19 }
      y=sec(8,'Cobertura Geográfica — Top Ciudades',y)
      const topC=Object.entries(ciudades).sort((a,b)=>b[1]-a[1]).slice(0,15)
      const gC=[{h:'Ciudad / Municipio',w:65,a:'l'},{h:'Visitas',w:25,a:'c'},{h:'% Total',w:25,a:'c'},{h:'Distribución',w:67,a:'l'}]
      y=tblHdr(gC,y)
      topC.forEach(([ciudad,n],i) => {
        if(y>PH-18){ ftr(); nxt(); y=19; y=tblHdr(gC,y) }
        const rH=7.5
        if(i%2===0){ pdf.setFillColor(...CLT); pdf.rect(MG,y,CW,rH,'F') }
        let x=MG
        pdf.setFont('helvetica','bold'); pdf.setFontSize(8); pdf.setTextColor(...CN)
        pdf.text(ciudad, x+2, y+5); x+=gC[0].w
        pdf.setFont('helvetica','bold'); pdf.setFontSize(8.5); pdf.setTextColor(30,30,30)
        pdf.text(String(n), x+gC[1].w/2, y+5, {align:'center'}); x+=gC[1].w
        pdf.setFont('helvetica','normal'); pdf.setFontSize(8); pdf.setTextColor(80,80,90)
        pdf.text(`${((n/total)*100).toFixed(1)}%`, x+gC[2].w/2, y+5, {align:'center'}); x+=gC[2].w
        const bMax=gC[3].w-6, bFill=(n/topC[0][1])*bMax
        pdf.setFillColor(210,220,235); pdf.rect(x+3,y+2.5,bMax,2.5,'F')
        pdf.setFillColor(...CN); pdf.rect(x+3,y+2.5,bFill,2.5,'F')
        y+=rH
      })
      ftr()

      // PAGE: Alertas
      if(alertas.length>0){
        nxt(); y=19; y=sec(10,`Alertas y Anomalías (${alertas.length} registros)`,y)
        ;[{tipo:'Sin registro de hora',bg:[254,226,226],tc:[185,28,28]},{tipo:'Visita muy corta (posible fantasma)',bg:[255,243,199],tc:[146,64,14]},{tipo:'Visita muy larga',bg:[219,234,254],tc:[29,78,216]}]
          .forEach((at,i) => {
            const aX=MG+i*(CW/3+1.5), aW=CW/3-1.5
            const cnt=alertas.filter(a=>a.tipo===at.tipo).length
            pdf.setFillColor(...at.bg); pdf.roundedRect(aX,y,aW,22,2,2,'F')
            pdf.setFont('helvetica','bold'); pdf.setFontSize(18); pdf.setTextColor(...at.tc)
            pdf.text(String(cnt), aX+aW/2, y+12, {align:'center'})
            pdf.setFont('helvetica','normal'); pdf.setFontSize(7.5); pdf.setTextColor(...at.tc)
            pdf.splitTextToSize(at.tipo,aW-6).forEach((l,li)=>pdf.text(l, aX+aW/2, y+17+li*4, {align:'center'}))
          })
        y+=28
        const aC=[{h:'Vendedor',w:35,a:'l'},{h:'Fecha',w:22,a:'c'},{h:'Cliente',w:38,a:'l'},{h:'H.Ini',w:17,a:'c'},{h:'H.Fin',w:17,a:'c'},{h:'Duración',w:22,a:'c'},{h:'Tipo Alerta',w:31,a:'l'}]
        y=tblHdr(aC,y)
        alertas.slice(0,200).forEach((a,i) => {
          if(y>PH-18){ ftr(); nxt(); y=19; y=tblHdr(aC,y) }
          const rH=6.5
          if(i%2===0){ pdf.setFillColor(...CLT); pdf.rect(MG,y,CW,rH,'F') }
          const atc=a.tipo.includes('Sin')?[185,28,28]:a.tipo.includes('corta')?[146,64,14]:[29,78,216]
          let x=MG
          pdf.setFont('helvetica','normal'); pdf.setFontSize(7.5); pdf.setTextColor(50,50,60)
          pdf.text(a.vend.split(' ').slice(0,2).join(' '), x+2, y+4.5); x+=aC[0].w
          pdf.text(a.fecha||'—', x+aC[1].w/2, y+4.5, {align:'center'}); x+=aC[1].w
          pdf.text((a.cliente||a.estab||'—').slice(0,20), x+2, y+4.5); x+=aC[2].w
          pdf.text(fmtHora(a.hi), x+aC[3].w/2, y+4.5, {align:'center'}); x+=aC[3].w
          pdf.text(fmtHora(a.hf), x+aC[4].w/2, y+4.5, {align:'center'}); x+=aC[4].w
          pdf.text(fmtMin(a.dur), x+aC[5].w/2, y+4.5, {align:'center'}); x+=aC[5].w
          pdf.setFont('helvetica','bold'); pdf.setFontSize(7); pdf.setTextColor(...atc)
          pdf.text(a.tipo, x+2, y+4.5)
          y+=rH
        })
        ftr()
      }

      pdf.save(`Informe_Visitas_${fechaMin}_${fechaMax}.pdf`)
    } catch(e) {
      console.error(e)
      alert('Error generando PDF: ' + e.message)
    } finally { setPdfLoading(false) }
  }

  // ── PANTALLA DE CARGA ────────────────────────────────────────────────────
  if (!datos) return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-[#1e3a5f]">Análisis de Visitas de Vendedores</h2>
        <p className="text-gray-500 mt-1">Sube el Excel del reporte para generar el análisis completo</p>
      </div>
      <label
        className="flex flex-col items-center justify-center border-2 border-dashed border-[#1e3a5f]/30 rounded-2xl py-16 bg-[#f4f6f8] cursor-pointer hover:border-[#1e3a5f] hover:bg-[#1e3a5f]/5 transition-all"
        onDrop={onDrop} onDragOver={e => e.preventDefault()}>
        <FileSpreadsheet size={48} className="text-[#1e3a5f]/40 mb-4" />
        <p className="text-base font-semibold text-[#1e3a5f]">Arrastra el Excel aquí o haz clic para seleccionar</p>
        <p className="text-sm text-gray-400 mt-2 text-center max-w-md">
          Columnas requeridas: representante, fecha_visita, hora_inicial, hora_final,<br/>pedido_check, pago_check, pqr_check, otro_check
        </p>
        <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} disabled={loading} />
        {loading && <p className="mt-4 text-[#1e3a5f] font-medium animate-pulse">Procesando…</p>}
      </label>
      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2">
          <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700 font-medium">{error}</p>
        </div>
      )}
      <div className="mt-6 p-4 bg-blue-50 rounded-xl text-xs text-blue-700">
        <p className="font-semibold mb-1">Columnas soportadas:</p>
        <p className="font-mono leading-relaxed">visita_id · nombrecliente · establecimiento · representante · departamento · ciudad · barrio · posicion · pedido_check · pago_check · pqr_check · otro_check · otro_motivo · fecha_visita_registro · fecha_visita · hora_inicial · hora_final</p>
      </div>
    </div>
  )

  // ── DESESTRUCTURAR DATOS ─────────────────────────────────────────────────
  const {
    vendedores: rv, ciudades, clientesUnicos, alertas, porDiaSemana,
    topOtroMotivo, totalOtro, semanas, semanasPedidos = {}, semanasCobros = {}, fechaMin, fechaMax, total,
    franjas, topClientes, clientesSinPedido, topEstabs, topDeptos, visitasMultiples,
  } = datos

  const totalPedidos = rv.reduce((s,v)=>s+v.pedidos,0)
  const totalPagos   = rv.reduce((s,v)=>s+v.pagos,0)
  const totalPqrs    = rv.reduce((s,v)=>s+v.pqrs,0)
  const totalOtros   = rv.reduce((s,v)=>s+v.otros,0)
  const topCiudades  = Object.entries(ciudades).sort((a,b)=>b[1]-a[1]).slice(0,15)
  const avgTasaConv  = rv.length ? Math.round(rv.reduce((s,v)=>s+v.tasaConv,0)/rv.length) : 0
  const semanasOrd   = Object.keys(semanas).sort()

  // Datos para gráficas
  const barVisitas = {
    labels: rv.map(v => v.nombre),
    datasets: [{ label:'Visitas', data:rv.map(v=>v.total), backgroundColor:rv.map((_,i)=>PALETA[i%PALETA.length]), borderRadius:5 }],
  }
  const barDuracion = {
    labels: rv.map(v => v.nombre),
    datasets: [{
      label:'Duración prom. (min)',
      data: rv.map(v => v.avgDur ? Math.round(v.avgDur) : 0),
      backgroundColor: rv.map(v => !v.avgDur?'#9ca3af':v.avgDur>35?'#ef4444':v.avgDur>25?'#f59e0b':'#10b981'),
      borderRadius: 5,
    }],
  }
  const barResultados = {
    labels: rv.map(v => v.nombre),
    datasets: [
      { label:'Pedidos', data:rv.map(v=>v.pedidos), backgroundColor:'#10b981', borderRadius:4 },
      { label:'Cobros',  data:rv.map(v=>v.pagos),   backgroundColor:'#2563eb', borderRadius:4 },
      { label:'PQRs',    data:rv.map(v=>v.pqrs),    backgroundColor:'#ef4444', borderRadius:4 },
    ],
  }
  const donutMotivos = {
    labels: ['Pedido','Cobro','PQR','Otro'],
    datasets: [{ data:[totalPedidos,totalPagos,totalPqrs,totalOtros], backgroundColor:['#10b981','#2563eb','#ef4444','#94a3b8'], borderWidth:0 }],
  }
  const porDiaBarData = {
    labels: porDiaSemana.slice(1).map(d => d.dia.slice(0,3)),
    datasets: [{
      label:'Visitas', data:porDiaSemana.slice(1).map(d=>d.count),
      backgroundColor: porDiaSemana.slice(1).map(d => d.count===Math.max(...porDiaSemana.slice(1).map(x=>x.count))?'#1e3a5f':'#93c5fd'),
      borderRadius: 5,
    }],
  }
  const barFranjas = {
    labels: ['Mañana\n6h–12h', 'Tarde\n12h–18h', 'Noche\n18h+'],
    datasets: [{ label:'Visitas', data:[franjas.mañana,franjas.tarde,franjas.noche], backgroundColor:['#f59e0b','#2563eb','#7c3aed'], borderRadius:5 }],
  }
  const rvLinea = rv.map((v, i) => ({ v, i })).filter(({ v }) => !vendFiltro || v.nombre === vendFiltro)
  const lineaSemanal = {
    labels: semanasOrd.map(s => s.slice(5)),
    datasets: rvLinea.map(({ v, i }) => ({
      label: v.nombre.split(' ').slice(0,2).join(' '),
      data: semanasOrd.map(s => semanas[s]?.[v.nombre] || 0),
      borderColor: PALETA[i%PALETA.length],
      backgroundColor: PALETA[i%PALETA.length] + '18',
      fill: false, tension: 0.4, pointRadius: 4, borderWidth: 2.5,
    })),
  }
  const lineaSemanalPedidos = {
    labels: semanasOrd.map(s => s.slice(5)),
    datasets: rvLinea.map(({ v, i }) => ({
      label: v.nombre.split(' ').slice(0,2).join(' '),
      data: semanasOrd.map(s => semanasPedidos[s]?.[v.nombre] || 0),
      borderColor: PALETA[i%PALETA.length],
      backgroundColor: PALETA[i%PALETA.length] + '18',
      fill: false, tension: 0.4, pointRadius: 4, borderWidth: 2.5,
    })),
  }
  const lineaSemanalCobros = {
    labels: semanasOrd.map(s => s.slice(5)),
    datasets: rvLinea.map(({ v, i }) => ({
      label: v.nombre.split(' ').slice(0,2).join(' '),
      data: semanasOrd.map(s => semanasCobros[s]?.[v.nombre] || 0),
      borderColor: PALETA[i%PALETA.length],
      backgroundColor: PALETA[i%PALETA.length] + '18',
      fill: false, tension: 0.4, pointRadius: 4, borderWidth: 2.5,
    })),
  }
  const lineaSemanalAmbos = {
    labels: semanasOrd.map(s => s.slice(5)),
    datasets: rvLinea.flatMap(({ v, i }) => [
      {
        label: `${v.nombre.split(' ').slice(0,2).join(' ')} (vis.)`,
        data: semanasOrd.map(s => semanas[s]?.[v.nombre] || 0),
        borderColor: PALETA[i%PALETA.length],
        backgroundColor: 'transparent',
        fill: false, tension: 0.4, pointRadius: 4, borderWidth: 2.5,
      },
      {
        label: `${v.nombre.split(' ').slice(0,2).join(' ')} (ped.)`,
        data: semanasOrd.map(s => semanasPedidos[s]?.[v.nombre] || 0),
        borderColor: PALETA[i%PALETA.length],
        backgroundColor: 'transparent',
        fill: false, tension: 0.4, pointRadius: 4, borderWidth: 2,
        borderDash: [6, 3],
      },
      {
        label: `${v.nombre.split(' ').slice(0,2).join(' ')} (cob.)`,
        data: semanasOrd.map(s => semanasCobros[s]?.[v.nombre] || 0),
        borderColor: PALETA[i%PALETA.length],
        backgroundColor: 'transparent',
        fill: false, tension: 0.4, pointRadius: 4, borderWidth: 1.5,
        borderDash: [2, 3],
      },
    ]),
  }
  const barCiudades = {
    labels: topCiudades.map(([c])=>c),
    datasets: [{ label:'Visitas', data:topCiudades.map(([,n])=>n), backgroundColor:'#1e3a5f', borderRadius:4 }],
  }
  const barDeptos = {
    labels: topDeptos.map(([d])=>d||'Sin dato'),
    datasets: [{ label:'Visitas', data:topDeptos.map(([,n])=>n), backgroundColor:'#2563eb', borderRadius:4 }],
  }

  const durColor = d => !d?'text-gray-400':d>35?'text-red-600 font-bold':d>25?'text-amber-600 font-semibold':'text-emerald-600 font-semibold'
  const convBadge = t => t>=50?'bg-emerald-100 text-emerald-700':t>=30?'bg-amber-100 text-amber-700':'bg-red-100 text-red-700'

  // ── RENDER PRINCIPAL ─────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#f6f8fb]">

      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-100 shrink-0 gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-[#1e3a5f]">Análisis de Visitas de Vendedores</h2>
          <p className="text-xs text-gray-400 mt-0.5">Período: {fechaMin} al {fechaMax} · {total.toLocaleString('es-CO')} visitas · {rv.length} vendedores</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {meta && (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-1.5 text-xs text-emerald-700 max-w-[240px]">
              <FileSpreadsheet size={12} className="shrink-0" />
              <span className="truncate font-medium">{meta.fileName}</span>
              <span className="text-emerald-400 shrink-0">
                {new Date(meta.date).toLocaleDateString('es-CO', { day:'2-digit', month:'short' })}
              </span>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm px-3 py-2 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors text-gray-600 font-medium">
            <FileSpreadsheet size={14} /> Cambiar Excel
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
          </label>
          <button onClick={limpiarDatos}
            className="flex items-center gap-1.5 text-sm px-3 py-2 border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition-colors font-medium">
            <span className="text-base leading-none">×</span> Limpiar
          </button>
          <button onClick={exportPDF} disabled={pdfLoading}
            className="flex items-center gap-2 text-sm px-4 py-2 bg-[#1e3a5f] text-white rounded-lg hover:bg-[#163060] transition-colors font-medium disabled:opacity-50">
            <Download size={14} /> {pdfLoading ? 'Generando…' : 'Exportar PDF'}
          </button>
        </div>
      </div>

      {/* Nav de secciones */}
      <div className="flex items-center gap-1 px-6 py-2 bg-white border-b border-gray-100 overflow-x-auto shrink-0">
        {NAV_SECS.map(s => (
          <button key={s.num} onClick={() => scrollTo(s.num)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-gray-500 hover:bg-[#1e3a5f]/8 hover:text-[#1e3a5f] transition-colors whitespace-nowrap">
            <span className="w-4 h-4 rounded bg-[#1e3a5f]/12 text-[#1e3a5f] text-[9px] font-bold flex items-center justify-center">{s.num}</span>
            {s.label}
          </button>
        ))}
      </div>

      {/* Contenido scrollable */}
      <div ref={reportRef} className="flex-1 overflow-y-auto px-6 py-8">

        {/* ── 1. KPIs Globales ─────────────────────────────────────────────── */}
        <Seccion num={1} titulo="KPIs Globales"
          descripcion="Resumen ejecutivo del período. Estos indicadores clave muestran el volumen total de actividad y el desempeño general del equipo comercial.">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <KPI icon={BarChart2}     label="Total Visitas"         value={total.toLocaleString('es-CO')}          bg="bg-[#1e3a5f]" />
            <KPI icon={Users}         label="Vendedores Activos"    value={rv.length}                              bg="bg-blue-600" />
            <KPI icon={ShoppingCart}  label="Clientes Únicos"       value={clientesUnicos.toLocaleString('es-CO')} bg="bg-emerald-600" />
            <KPI icon={Target}        label="Tasa Conv. Media"      value={`${avgTasaConv}%`}                      bg="bg-violet-600" sub="visitas con pedido" />
            <KPI icon={AlertTriangle} label="Alertas Detectadas"    value={alertas.length}                         bg={alertas.length > 10 ? 'bg-red-500' : 'bg-amber-500'} />
          </div>
        </Seccion>

        {/* ── 2. Productividad ─────────────────────────────────────────────── */}
        <Seccion num={2} titulo="Productividad por Vendedor"
          descripcion="Cuántas visitas realizó cada vendedor, cuántos días estuvo activo en campo, su ritmo diario y cuánto tiempo dedica a cada cliente. La duración se marca en semáforo: verde es óptimo (< 25 min), amarillo es aceptable, rojo requiere atención (> 35 min).">

          <Card className="mb-4">
            <CardHead title="Ranking de Vendedores" sub="Ordenado por total de visitas" />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
                    {['#','Vendedor','Visitas','Días','V/Día','Dur. Prom.','Dur. Med.','H. Inicio','Clientes','Establ.'].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rv.map((v, i) => {
                    const horaI = v.avgIni ? `${Math.floor(v.avgIni/60).toString().padStart(2,'0')}:${Math.round(v.avgIni%60).toString().padStart(2,'0')}` : '—'
                    return (
                      <tr key={v.nombre} className="border-t border-gray-50 hover:bg-blue-50/30 transition-colors">
                        <td className="px-4 py-3">
                          <span className="w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0" style={{ background: PALETA[i%PALETA.length] }}>{i+1}</span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-[#1e3a5f] whitespace-nowrap">{v.nombre}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-xl font-bold text-[#1e3a5f]">{v.total}</span>
                        </td>
                        <td className="px-4 py-3 text-center text-gray-600">{v.dias}</td>
                        <td className="px-4 py-3 text-center font-semibold text-gray-700">{v.vpd}</td>
                        <td className={`px-4 py-3 text-center text-sm ${durColor(v.avgDur)}`}>{fmtMin(v.avgDur)}</td>
                        <td className="px-4 py-3 text-center text-gray-500 text-sm">{fmtMin(v.medDur)}</td>
                        <td className="px-4 py-3 text-center font-mono text-gray-600 text-sm">{horaI}</td>
                        <td className="px-4 py-3 text-center text-emerald-700 font-semibold">{v.clientesUnicos}</td>
                        <td className="px-4 py-3 text-center text-blue-700 font-semibold">{v.establUnicos}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHead title="Visitas totales por vendedor" />
              <div className="p-5">
                <Bar data={barVisitas} options={CHART_BAR_H} height={Math.min(300, Math.max(160, rv.length*20))} />
              </div>
            </Card>
            <Card>
              <CardHead title="Duración promedio por vendedor" sub="Verde < 25 min · Amarillo 25–35 · Rojo > 35 min" />
              <div className="p-5">
                <Bar data={barDuracion} options={CHART_BAR_H} height={Math.min(300, Math.max(160, rv.length*20))} />
              </div>
            </Card>
          </div>
        </Seccion>

        {/* ── 3. Efectividad Comercial ─────────────────────────────────────── */}
        <Seccion num={3} titulo="Efectividad Comercial"
          descripcion="Analizamos qué tan productivas son las visitas para el negocio: qué porcentaje generan un pedido (tasa de conversión), cuántos cobros se realizaron, PQRs atendidas y comparativo entre vendedores.">

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              { label:'Pedidos tomados',   value:totalPedidos, pct:total?((totalPedidos/total)*100).toFixed(1):0, bg:'bg-emerald-50', border:'border-emerald-100', tc:'text-emerald-700', pc:'text-emerald-400' },
              { label:'Cobros realizados', value:totalPagos,   pct:total?((totalPagos/total)*100).toFixed(1):0,   bg:'bg-blue-50',    border:'border-blue-100',    tc:'text-blue-700',    pc:'text-blue-400' },
              { label:'PQRs atendidas',    value:totalPqrs,    pct:total?((totalPqrs/total)*100).toFixed(1):0,    bg:'bg-red-50',     border:'border-red-100',     tc:'text-red-700',     pc:'text-red-400' },
              { label:'Tasa conv. media',  value:`${avgTasaConv}%`, pct:'de visitas con pedido',                  bg:'bg-violet-50',  border:'border-violet-100',  tc:'text-violet-700',  pc:'text-violet-400' },
            ].map(k => (
              <div key={k.label} className={`${k.bg} border ${k.border} rounded-2xl p-4 text-center`}>
                <p className={`text-3xl font-bold ${k.tc}`}>{k.value}</p>
                <p className={`text-sm font-semibold ${k.tc} mt-1`}>{k.label}</p>
                <p className={`text-xs ${k.pc} mt-0.5`}>{k.pct}{typeof k.pct === 'number' ? '% del total' : ''}</p>
              </div>
            ))}
          </div>

          {(() => {
            const chartH = Math.min(300, Math.max(180, rv.length * 20))
            return (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
                <div className="lg:col-span-2">
                  <Card>
                    <CardHead title="Pedidos, cobros y PQRs por vendedor" />
                    <div className="p-5">
                      <Bar data={barResultados} options={{
                        responsive:true, indexAxis:'y',
                        plugins:{ legend:{ position:'bottom', labels:{ font:{size:11}, boxWidth:12, padding:16 } } },
                        scales:{ x:{ beginAtZero:true, grid:{color:'#f3f4f6'} }, y:{ grid:{display:false} } },
                      }} height={chartH} />
                    </div>
                  </Card>
                </div>
                <Card>
                  <CardHead title="Distribución global de motivos" />
                  <div className="p-5">
                    <div style={{height: chartH, maxWidth: chartH, margin:'0 auto'}}>
                      <Doughnut data={donutMotivos} options={{ responsive:true, maintainAspectRatio:false, cutout:'65%', plugins:{ legend:{ position:'bottom', labels:{ font:{size:11}, boxWidth:12 } } } }} />
                    </div>
                  </div>
                </Card>
              </div>
            )
          })()}

          <Card>
            <CardHead title="Tasa de conversión por vendedor" sub="% de visitas que generaron un pedido — verde ≥ 50% · amarillo 30–49% · rojo < 30%" />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
                    {['Vendedor','Total Visitas','Pedidos','Tasa Conv.','Cobros','% Cobros','PQRs','Otros'].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rv.map((v, i) => (
                    <tr key={v.nombre} className="border-t border-gray-50 hover:bg-blue-50/20 transition-colors">
                      <td className="px-4 py-2.5 font-semibold text-[#1e3a5f]">{v.nombre}</td>
                      <td className="px-4 py-2.5 text-center font-bold text-gray-700">{v.total}</td>
                      <td className="px-4 py-2.5 text-center font-bold text-emerald-600">{v.pedidos}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${convBadge(v.tasaConv)}`}>{v.tasaConv}%</span>
                      </td>
                      <td className="px-4 py-2.5 text-center font-bold text-blue-600">{v.pagos}</td>
                      <td className="px-4 py-2.5 text-center text-gray-500">{v.total ? `${((v.pagos/v.total)*100).toFixed(0)}%` : '—'}</td>
                      <td className="px-4 py-2.5 text-center text-red-500 font-medium">{v.pqrs || <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-2.5 text-center text-gray-400">{v.otros || <span className="text-gray-300">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </Seccion>

        {/* ── 4. Comportamiento Temporal ───────────────────────────────────── */}
        <Seccion num={4} titulo="Comportamiento Temporal"
          descripcion="Cómo evoluciona la actividad comercial en el tiempo: tendencia semanal por vendedor para detectar rachas altas o bajas, los días de la semana con más visitas y la franja horaria en que trabaja el equipo.">

          <Card className="mb-4">
            <div className="px-5 pt-4 pb-3 border-b border-gray-50 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-sm font-bold text-gray-800">Tendencia semanal por vendedor</p>
                <p className="text-xs text-gray-400 mt-0.5">Cada punto es una semana · Haz clic en la leyenda para mostrar u ocultar</p>
              </div>
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                {[['visitas','Visitas'],['ventas','Pedidos'],['cobros','Cobros'],['ambos','Ambos']].map(([key,label]) => (
                  <button key={key} onClick={() => setModoLinea(key)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-all whitespace-nowrap ${modoLinea===key?'bg-white text-[#1e3a5f] shadow-sm':'text-gray-500 hover:text-gray-700'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {/* Filtro por vendedor */}
            <div className="px-5 py-2 border-b border-gray-50 flex items-center gap-2 overflow-x-auto">
              <span className="text-xs text-gray-400 shrink-0 mr-1">Vendedor:</span>
              <button
                onClick={() => setVendFiltro(null)}
                className={`text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap transition-all shrink-0 ${!vendFiltro ? 'bg-[#1e3a5f] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                Todos
              </button>
              {rv.map((v, i) => (
                <button key={v.nombre}
                  onClick={() => setVendFiltro(vendFiltro === v.nombre ? null : v.nombre)}
                  className="text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap transition-all shrink-0"
                  style={{
                    background: vendFiltro === v.nombre ? PALETA[i%PALETA.length] : '#f3f4f6',
                    color: vendFiltro === v.nombre ? '#fff' : '#6b7280',
                  }}>
                  {v.nombre.split(' ').slice(0,2).join(' ')}
                </button>
              ))}
            </div>
            {modoLinea === 'ambos' && (
              <div className="px-5 pt-2 flex items-center gap-5 text-xs text-gray-400 flex-wrap">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-7 h-0.5 bg-gray-400 rounded" />
                  Sólida = Visitas
                </span>
                <span className="flex items-center gap-1.5">
                  <svg width="28" height="4"><line x1="0" y1="2" x2="28" y2="2" stroke="#9ca3af" strokeWidth="1.5" strokeDasharray="6,3"/></svg>
                  Guiones = Pedidos
                </span>
                <span className="flex items-center gap-1.5">
                  <svg width="28" height="4"><line x1="0" y1="2" x2="28" y2="2" stroke="#9ca3af" strokeWidth="1.5" strokeDasharray="2,3"/></svg>
                  Punteada = Cobros
                </span>
                <span className="text-amber-500 font-medium">· Filtra por vendedor para mejor lectura</span>
              </div>
            )}
            <div className="p-5">
              <Line
                data={modoLinea==='visitas' ? lineaSemanal : modoLinea==='ventas' ? lineaSemanalPedidos : modoLinea==='cobros' ? lineaSemanalCobros : lineaSemanalAmbos}
                options={{
                  responsive:true, maintainAspectRatio:false,
                  plugins:{ legend:{ position:'bottom', labels:{ font:{size:11}, boxWidth:12, usePointStyle:true, padding:16 } } },
                  scales:{ x:{ grid:{display:false}, ticks:{font:{size:11}} }, y:{ beginAtZero:true, grid:{color:'#f3f4f6'} } },
                }}
                style={{ height:300 }} />
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHead title="Visitas por día de la semana" sub="Qué días concentra más actividad el equipo" />
              <div className="p-5">
                <Bar data={porDiaBarData} options={CHART_BAR_V} height={160} />
                {(() => {
                  const s = porDiaSemana.slice(1)
                  const mx = s.reduce((m,d) => d.count > m.count ? d : m, s[0])
                  const mn = s.filter(d => d.count > 0).reduce((m,d) => d.count < m.count ? d : m, s[0])
                  return <p className="text-xs text-gray-400 mt-3">Pico: <strong className="text-gray-600">{mx.dia}</strong> ({mx.count} vis.) · Mínimo: <strong className="text-gray-600">{mn?.dia||'—'}</strong> ({mn?.count||0} vis.)</p>
                })()}
              </div>
            </Card>
            <Card>
              <CardHead title="Distribución por franja horaria" sub="En qué parte del día se realizan las visitas" />
              <div className="p-5">
                <Bar data={barFranjas} options={CHART_BAR_V} height={160} />
                <div className="flex gap-4 mt-3 text-xs">
                  <span className="flex items-center gap-1.5 text-amber-600"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block"/>Mañana: <strong>{franjas.mañana}</strong></span>
                  <span className="flex items-center gap-1.5 text-blue-600"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block"/>Tarde: <strong>{franjas.tarde}</strong></span>
                  <span className="flex items-center gap-1.5 text-violet-600"><span className="w-2.5 h-2.5 rounded-full bg-violet-500 inline-block"/>Noche: <strong>{franjas.noche}</strong></span>
                </div>
              </div>
            </Card>
          </div>
        </Seccion>

        {/* ── 5. Cobertura Geográfica ──────────────────────────────────────── */}
        <Seccion num={5} titulo="Cobertura Geográfica"
          descripcion="Presencia territorial del equipo comercial: qué ciudades, municipios y departamentos se están cubriendo. Permite identificar zonas de alta actividad y zonas con poca o ninguna presencia.">

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <Card>
              <CardHead title="Top ciudades / municipios" sub="Por número de visitas realizadas" />
              <div className="p-5">
                <Bar data={barCiudades} options={CHART_BAR_H} height={Math.min(300, Math.max(160, topCiudades.length*18))} />
              </div>
            </Card>
            <Card>
              <CardHead title="Visitas por departamento" />
              <div className="p-5">
                {topDeptos.length > 0
                  ? <Bar data={barDeptos} options={CHART_BAR_H} height={Math.min(260, Math.max(140, topDeptos.length*18))} />
                  : <p className="text-sm text-gray-400 py-8 text-center">No hay datos de departamento en el Excel</p>
                }
              </div>
            </Card>
          </div>

          <Card>
            <CardHead title="Cobertura por vendedor" sub="Alcance geográfico y de clientes de cada representante" />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
                    {['Vendedor','Total Visitas','Clientes Únicos','Vis./Cliente','Estab. Únicos','Dptos. Cubiertos'].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rv.map((v, i) => {
                    const vxc = v.clientesUnicos ? (v.total / v.clientesUnicos).toFixed(1) : '—'
                    const vxcNum = v.clientesUnicos ? v.total / v.clientesUnicos : 0
                    const vxcColor = vxcNum >= 6 ? 'bg-emerald-100 text-emerald-700' : vxcNum >= 3 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'
                    return (
                    <tr key={v.nombre} className="border-t border-gray-50 hover:bg-blue-50/20 transition-colors">
                      <td className="px-4 py-3 font-semibold text-[#1e3a5f]">{v.nombre}</td>
                      <td className="px-4 py-3 text-center font-bold text-gray-700">{v.total}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">{v.clientesUnicos}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${vxcColor}`}>{vxc}x</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-2.5 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">{v.establUnicos}</span>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-500">{v.deptosUnicos || '—'}</td>
                    </tr>
                  )})}

                </tbody>
              </table>
            </div>
          </Card>
        </Seccion>

        {/* ── 6. Análisis de Clientes ──────────────────────────────────────── */}
        <Seccion num={6} titulo="Análisis de Clientes"
          descripcion="Identificamos los clientes más visitados, los establecimientos con mejor tasa de conversión (más pedidos por visita) y — muy importante — los clientes que se visitan repetidamente sin generar ningún pedido, que representan una oportunidad comercial sin explotar.">

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <Card>
              <CardHead title="Top 20 clientes más visitados" sub="Ordenados por frecuencia de visita" />
              <div className="overflow-y-auto max-h-80">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="text-xs text-gray-500 uppercase tracking-wide">
                      {['#','Cliente','Visitas','Pedidos','Ciudad'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left font-semibold border-b border-gray-100">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {topClientes.map((c, i) => (
                      <tr key={i} className="border-t border-gray-50 hover:bg-gray-50/60 transition-colors">
                        <td className="px-4 py-2 text-gray-300 text-xs font-mono">{i+1}</td>
                        <td className="px-4 py-2 font-medium text-gray-800 max-w-[150px] truncate">{c.nombre || '(sin nombre)'}</td>
                        <td className="px-4 py-2 text-center font-bold text-[#1e3a5f]">{c.visitas}</td>
                        <td className="px-4 py-2 text-center">
                          {c.pedidos > 0
                            ? <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">{c.pedidos}</span>
                            : <span className="text-gray-300 text-xs">—</span>
                          }
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-400 truncate max-w-[80px]">{c.ciudad || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card>
              <CardHead
                title={`Clientes sin pedido (${clientesSinPedido.length})`}
                sub="Visitados 2+ veces sin generar ningún pedido · Oportunidad de mejora"
              />
              {clientesSinPedido.length === 0 ? (
                <div className="p-10 text-center">
                  <p className="text-2xl mb-2">🎉</p>
                  <p className="text-emerald-600 font-semibold">¡Excelente resultado!</p>
                  <p className="text-xs text-gray-400 mt-1">No hay clientes visitados múltiples veces sin pedido</p>
                </div>
              ) : (
                <div className="overflow-y-auto max-h-80">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-amber-50">
                      <tr className="text-xs text-amber-700 uppercase tracking-wide">
                        {['Cliente','Visitas','Cobros','PQRs','Otro','Sin resultado','Ciudad'].map(h => (
                          <th key={h} className="px-3 py-2.5 text-left font-semibold border-b border-amber-100 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {clientesSinPedido.map((c, i) => {
                        const sinRes = c.visitas - c.pagos - c.pqrs - c.otros
                        return (
                          <tr key={i} className="border-t border-amber-50 hover:bg-amber-50/60 transition-colors">
                            <td className="px-3 py-2 font-medium text-gray-800 max-w-[160px] truncate">{c.nombre || '(sin nombre)'}</td>
                            <td className="px-3 py-2 text-center">
                              <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-bold rounded-full">{c.visitas}</span>
                            </td>
                            <td className="px-3 py-2 text-center">
                              {c.pagos > 0 ? <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">{c.pagos}</span> : <span className="text-gray-300 text-xs">—</span>}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {c.pqrs > 0 ? <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs font-bold rounded-full">{c.pqrs}</span> : <span className="text-gray-300 text-xs">—</span>}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {c.otros > 0 ? <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-bold rounded-full">{c.otros}</span> : <span className="text-gray-300 text-xs">—</span>}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {sinRes > 0 ? <span className="px-2 py-0.5 bg-rose-100 text-rose-700 text-xs font-bold rounded-full">{sinRes}</span> : <span className="text-emerald-400 text-xs">✓</span>}
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-400">{c.ciudad || '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          {topEstabs.length > 0 && (
            <Card>
              <CardHead title="Establecimientos con mejor tasa de conversión" sub="Puntos de venta con mayor porcentaje de visitas que generan pedido — mínimo 2 visitas" />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
                      {['Establecimiento','Visitas','Pedidos','Tasa de Conversión','Ciudad'].map(h => (
                        <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {topEstabs.map((e, i) => {
                      const tasa = Math.round((e.pedidos/e.visitas)*100)
                      return (
                        <tr key={i} className="border-t border-gray-50 hover:bg-blue-50/20 transition-colors">
                          <td className="px-4 py-2.5 font-medium text-gray-800">{e.nombre}</td>
                          <td className="px-4 py-2.5 text-center text-gray-600">{e.visitas}</td>
                          <td className="px-4 py-2.5 text-center font-bold text-emerald-600">{e.pedidos}</td>
                          <td className="px-4 py-2.5 min-w-[180px]">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full transition-all" style={{ width:`${tasa}%`, background: tasa>=50?'#10b981':tasa>=30?'#f59e0b':'#ef4444' }} />
                              </div>
                              <span className={`text-xs font-bold w-9 text-right ${tasa>=50?'text-emerald-600':tasa>=30?'text-amber-600':'text-red-500'}`}>{tasa}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-gray-400">{e.ciudad || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </Seccion>

        {/* ── 7. Alertas y Anomalías ───────────────────────────────────────── */}
        <Seccion num={7} titulo="Alertas y Anomalías"
          descripcion="Detección automática de registros incompletos o sospechosos: visitas sin horario registrado, visitas muy cortas que podrían ser registros falsos (menos de 2 minutos), visitas inusualmente largas y visitas duplicadas al mismo cliente en el mismo día.">

          {/* Ranking de vendedores por alertas */}
          {(() => {
            const resumen = {}
            alertas.forEach(a => {
              if (!resumen[a.vend]) resumen[a.vend] = { sinHora:0, fantasma:0, larga:0, duplicadas:0 }
              if (a.tipo === 'Sin registro de hora') resumen[a.vend].sinHora++
              else if (a.tipo.includes('corta'))    resumen[a.vend].fantasma++
              else if (a.tipo === 'Visita muy larga') resumen[a.vend].larga++
            })
            visitasMultiples.forEach(a => {
              if (!resumen[a.vend]) resumen[a.vend] = { sinHora:0, fantasma:0, larga:0, duplicadas:0 }
              resumen[a.vend].duplicadas++
            })
            const ranking = Object.entries(resumen)
              .map(([vend, d]) => ({ vend, ...d, total: d.sinHora + d.fantasma + d.larga + d.duplicadas }))
              .sort((a, b) => b.total - a.total)
            const maxTotal = ranking[0]?.total || 1
            return (
              <Card className="mb-6 mt-2">
                <CardHead title="Ranking de incidencias por vendedor" sub="Quién acumula más registros anómalos — ordenado por total de alertas" />
                <div className="overflow-x-auto">
                  <table style={{ borderCollapse:'separate', borderSpacing:0, width:'100%', fontSize:'13px' }}>
                    <thead>
                      <tr style={{ background:'#f8fafc' }}>
                        {[
                          { label:'#',          w:48  },
                          { label:'Vendedor',   w:260 },
                          { label:'Total',      w:90  },
                          { label:'Sin Hora',   w:100 },
                          { label:'Fantasma',   w:100 },
                          { label:'Muy Larga',  w:100 },
                          { label:'Duplicadas', w:110 },
                          { label:'Incidencia', w:200 },
                        ].map(col => (
                          <th key={col.label} style={{ width:col.w, minWidth:col.w, padding:'14px 16px', textAlign:'left', fontSize:'11px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em', color:'#6b7280', borderBottom:'2px solid #e5e7eb', whiteSpace:'nowrap' }}>
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ranking.map((r, i) => {
                        const pct = Math.round((r.total / maxTotal) * 100)
                        const totalBg = pct > 60 ? '#fee2e2' : pct > 30 ? '#fef3c7' : '#d1fae5'
                        const totalTc = pct > 60 ? '#b91c1c' : pct > 30 ? '#92400e' : '#065f46'
                        const Chip = ({ n, bg, tc }) => n > 0
                          ? <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', minWidth:'2rem', height:'1.6rem', padding:'0 10px', borderRadius:'9999px', fontSize:'12px', fontWeight:700, background:bg, color:tc }}>{n}</span>
                          : <span style={{ color:'#d1d5db', fontSize:'13px' }}>—</span>
                        return (
                          <tr key={r.vend} style={{ background: i%2===0 ? '#fff' : '#fafafa' }}
                            onMouseEnter={e=>e.currentTarget.style.background='#fff7f7'}
                            onMouseLeave={e=>e.currentTarget.style.background=i%2===0?'#fff':'#fafafa'}>
                            <td style={{ padding:'14px 16px', color:'#9ca3af', fontFamily:'monospace', fontSize:'12px', borderBottom:'1px solid #f3f4f6' }}>{i+1}</td>
                            <td style={{ padding:'14px 16px', fontWeight:600, color:'#1e3a5f', whiteSpace:'nowrap', borderBottom:'1px solid #f3f4f6' }}>{r.vend}</td>
                            <td style={{ padding:'14px 16px', borderBottom:'1px solid #f3f4f6' }}>
                              <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', minWidth:'2.2rem', height:'1.8rem', padding:'0 12px', borderRadius:'9999px', fontSize:'12px', fontWeight:700, background:totalBg, color:totalTc }}>{r.total}</span>
                            </td>
                            <td style={{ padding:'14px 16px', textAlign:'center', borderBottom:'1px solid #f3f4f6' }}><Chip n={r.sinHora}   bg="#fee2e2" tc="#dc2626" /></td>
                            <td style={{ padding:'14px 16px', textAlign:'center', borderBottom:'1px solid #f3f4f6' }}><Chip n={r.fantasma}  bg="#fef3c7" tc="#b45309" /></td>
                            <td style={{ padding:'14px 16px', textAlign:'center', borderBottom:'1px solid #f3f4f6' }}><Chip n={r.larga}     bg="#dbeafe" tc="#1d4ed8" /></td>
                            <td style={{ padding:'14px 16px', textAlign:'center', borderBottom:'1px solid #f3f4f6' }}><Chip n={r.duplicadas} bg="#ede9fe" tc="#6d28d9" /></td>
                            <td style={{ padding:'14px 24px 14px 16px', borderBottom:'1px solid #f3f4f6' }}>
                              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                                <div style={{ flex:1, height:8, background:'#f3f4f6', borderRadius:9999, overflow:'hidden' }}>
                                  <div style={{ height:'100%', borderRadius:9999, width:`${pct}%`, background: pct>60?'#ef4444':pct>30?'#f59e0b':'#10b981', transition:'width 0.3s' }} />
                                </div>
                                <span style={{ minWidth:'2.8rem', textAlign:'right', fontSize:'12px', fontWeight:600, color:'#6b7280' }}>{pct}%</span>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )
          })()}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              { label:'Sin registro de hora',                cnt: alertas.filter(a=>a.tipo==='Sin registro de hora').length,               bg:'bg-red-50',    border:'border-red-100',    tc:'text-red-700' },
              { label:'Visita muy corta\n(posible fantasma)', cnt: alertas.filter(a=>a.tipo.includes('corta')).length,                     bg:'bg-amber-50',  border:'border-amber-100',  tc:'text-amber-700' },
              { label:'Visita muy larga\n(> 2 horas)',        cnt: alertas.filter(a=>a.tipo==='Visita muy larga').length,                   bg:'bg-blue-50',   border:'border-blue-100',   tc:'text-blue-700' },
              { label:'Visitas duplicadas\nmismo cliente/día', cnt: visitasMultiples.length,                                               bg:'bg-violet-50', border:'border-violet-100', tc:'text-violet-700' },
            ].map(({ label, cnt, bg, border, tc }) => (
              <div key={label} className={`${bg} border ${border} rounded-2xl p-4 text-center`}>
                <p className={`text-4xl font-bold ${tc}`}>{cnt}</p>
                <p className={`text-xs font-semibold ${tc} mt-2 leading-snug whitespace-pre-line`}>{label}</p>
              </div>
            ))}
          </div>

          {alertas.length > 0 && (
            <Card className="mb-4">
              <CardHead title={`Detalle de alertas (${alertas.length})`} sub="Visitas con registros incompletos o con tiempos anómalos" />
              <div className="overflow-auto max-h-80">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-[#1e3a5f] text-white">
                    <tr>{['Vendedor','Fecha','Cliente / Establecimiento','H. Ini.','H. Fin','Duración','Tipo de Alerta'].map(h=>(
                      <th key={h} className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {alertas.slice(0,200).map((a,i) => (
                      <tr key={i} className={`border-t border-gray-50 ${i%2===0?'bg-white':'bg-gray-50/50'}`}>
                        <td className="px-3 py-2 font-semibold text-gray-700">{a.vend}</td>
                        <td className="px-3 py-2 text-gray-500">{a.fecha}</td>
                        <td className="px-3 py-2 max-w-[150px] truncate text-gray-700">{a.cliente||a.estab||'—'}</td>
                        <td className="px-3 py-2 font-mono text-gray-500">{fmtHora(a.hi)}</td>
                        <td className="px-3 py-2 font-mono text-gray-500">{fmtHora(a.hf)}</td>
                        <td className="px-3 py-2 text-gray-500">{fmtMin(a.dur)}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${a.tipo.includes('Sin')?'bg-red-100 text-red-700':a.tipo.includes('corta')?'bg-amber-100 text-amber-700':'bg-blue-100 text-blue-700'}`}>
                            {a.tipo}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {visitasMultiples.length > 0 && (
            <Card>
              <CardHead title={`Visitas duplicadas al mismo cliente el mismo día (${visitasMultiples.length} registros)`} sub="El mismo vendedor visitó al mismo cliente más de una vez en el mismo día" />
              <div className="overflow-auto max-h-64">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-violet-700 text-white">
                    <tr>{['Vendedor','Fecha','Cliente','H. Inicio','H. Fin','Duración'].map(h=>(
                      <th key={h} className="px-3 py-2.5 text-left font-semibold">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {visitasMultiples.slice(0,100).map((a,i) => (
                      <tr key={i} className={`border-t border-violet-50 ${i%2===0?'bg-white':'bg-violet-50/40'}`}>
                        <td className="px-3 py-2 font-semibold text-gray-700">{a.vend}</td>
                        <td className="px-3 py-2 text-gray-500">{a.fecha}</td>
                        <td className="px-3 py-2 font-semibold text-violet-700 max-w-[150px] truncate">{a.cliente||'—'}</td>
                        <td className="px-3 py-2 font-mono text-gray-500">{fmtHora(a.hi)}</td>
                        <td className="px-3 py-2 font-mono text-gray-500">{fmtHora(a.hf)}</td>
                        <td className="px-3 py-2 text-gray-500">{fmtMin(duracion(a.hi,a.hf))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </Seccion>

        <div className="h-16" />
      </div>

      {/* Botón PDF flotante */}
      <button onClick={exportPDF} disabled={pdfLoading}
        className="fixed bottom-6 right-6 flex items-center gap-2 bg-[#1e3a5f] text-white px-5 py-3 rounded-2xl shadow-xl hover:bg-[#163060] transition-colors font-semibold z-50 disabled:opacity-50">
        <Download size={18} /> {pdfLoading ? 'Generando…' : 'Exportar PDF'}
      </button>
    </div>
  )
}
