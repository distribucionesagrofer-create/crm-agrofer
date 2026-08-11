import { useState, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Package, Plus, Search, Trash2, Minus, X, Upload,
  Filter, Tag, ShirtIcon, Gift, Building2,
  ArrowDown, ArrowUp, History, RotateCcw, Send, FileDown, Pencil, CheckCircle2,
  LayoutGrid, List, Users, ChevronLeft, ChevronRight, Camera, ChevronDown, FileText,
} from 'lucide-react'
import XLSXStyle from 'xlsx-js-style'
import api from '../services/api'

const TIPO_ARTICULO = {
  prenda:     'Prenda',
  papeleria:  'Papelería',
  publicidad: 'POP',
  accesorio:  'Accesorio',
}

function exportarExcel(items) {
  const fecha = new Date().toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' })
  const CAT_LABEL = { prenda: 'Ropa', papeleria: 'Papelería', publicidad: 'Material POP', accesorio: 'Accesorio' }
  const CAT_ORDER = ['prenda', 'papeleria', 'publicidad', 'accesorio']
  const TALLAS    = ['S', 'M', 'L', 'XL', 'XXL']

  // Agrupar por nombre+marca+color+categoria → pivot de tallas
  const grouped = {}
  items.forEach(it => {
    const cat = CAT_ORDER.includes(it.categoria) ? it.categoria : 'accesorio'
    const key = `${cat}||${(it.subcategoria||'').toLowerCase()}||${(it.nombre||'').toLowerCase()}||${(it.marca||'').toLowerCase()}||${(it.color||'').toLowerCase()}`
    if (!grouped[key]) grouped[key] = { ...it, categoria: cat, tallasMap: {}, sinTalla: 0 }
    const tal = (it.talla || '').toUpperCase().trim()
    if (tal) grouped[key].tallasMap[tal] = (grouped[key].tallasMap[tal] || 0) + (it.cantidad || 0)
    else grouped[key].sinTalla += (it.cantidad || 0)
  })
  Object.values(grouped).forEach(g => {
    const t = Object.values(g.tallasMap).reduce((s,v)=>s+v, 0)
    g.total = t > 0 ? t : g.sinTalla
  })

  const filas = Object.values(grouped).sort((a, b) => {
    const co = { prenda:0, papeleria:1, publicidad:2, accesorio:3 }
    return (co[a.categoria]??4)-(co[b.categoria]??4) ||
           (a.subcategoria||'').localeCompare(b.subcategoria||'') ||
           (a.nombre||'').localeCompare(b.nombre||'')
  })

  // Totales por categoría
  const totCat = { prenda:0, papeleria:0, publicidad:0, accesorio:0 }
  filas.forEach(g => { if (totCat[g.categoria] !== undefined) totCat[g.categoria] += g.total })
  const totalGeneral = Object.values(totCat).reduce((s,v)=>s+v, 0)

  // Estilos
  const S = {
    hdr:   { fill:{fgColor:{rgb:'1E3A5F'}}, font:{bold:true,color:{rgb:'FFFFFF'},sz:11}, alignment:{horizontal:'center',vertical:'center'} },
    title: { font:{bold:true,sz:13,color:{rgb:'1E3A5F'}} },
    date:  { font:{sz:10,italic:true,color:{rgb:'666666'}} },
    cat:   { fill:{fgColor:{rgb:'D6E4F0'}}, font:{bold:true,sz:10,color:{rgb:'1E3A5F'}}, alignment:{horizontal:'left'} },
    data:  { font:{sz:10}, alignment:{vertical:'center'} },
    num:   { font:{sz:10}, alignment:{horizontal:'center',vertical:'center'} },
    bold:  { font:{bold:true,sz:10,color:{rgb:'1E3A5F'}}, alignment:{vertical:'center'} },
    totY:  { fill:{fgColor:{rgb:'FFFF00'}}, font:{bold:true,sz:11} },
    totYn: { fill:{fgColor:{rgb:'FFFF00'}}, font:{bold:true,sz:12}, alignment:{horizontal:'center'} },
    rHdr:  { fill:{fgColor:{rgb:'1E3A5F'}}, font:{bold:true,color:{rgb:'FFFFFF'},sz:10}, alignment:{horizontal:'center'} },
    rCat:  { fill:{fgColor:{rgb:'EBF3FB'}}, font:{bold:true,sz:10,color:{rgb:'1E3A5F'}} },
    rVal:  { font:{bold:true,sz:12,color:{rgb:'1E3A5F'}}, alignment:{horizontal:'center'} },
  }
  const N = 14 // total columnas incluyendo resumen (A-K=11, L=sep, M-N=resumen)
  const ce = (v, s) => ({ v, t: typeof v==='number' ? 'n' : 's', s })
  const em = (s={}) => ce('', s)

  // ── Construir AOA (14 columnas) ──
  const COLS = ['Categoría','Tipo','Artículo','Marca','Color','S','M','L','XL','XXL','Total','','RESUMEN','Uds']
  const aoa = []
  aoa.push([ce('INVENTARIO MERCHANDISING — DISTRIBUCIONES AGROFER', S.title), ...Array(N-1).fill(em())])
  aoa.push([ce(`Fecha de corte: ${fecha}`, S.date), ...Array(N-1).fill(em())])
  aoa.push(Array(N).fill(em()))
  aoa.push(COLS.map((col,i) => {
    if (i === 11) return em()
    if (i === 12) return ce('RESUMEN', S.rHdr)
    if (i === 13) return ce('Uds', S.rHdr)
    return ce(col, S.hdr)
  }))

  // Filas de resumen a la derecha (se mezclan con las primeras filas de datos)
  const resRows = [
    ...CAT_ORDER.map(cat => [ce(CAT_LABEL[cat], S.rCat), ce(totCat[cat], S.rVal)]),
    [em(), em()],
    [ce('TOTAL', S.totY), ce(totalGeneral, S.totYn)],
  ]

  let catActual = null
  let dataRowIdx = 0

  filas.forEach(it => {
    const catLabel = CAT_LABEL[it.categoria] || it.categoria
    if (catLabel !== catActual) {
      catActual = catLabel
      const resCell = resRows[dataRowIdx] || [em(), em()]
      aoa.push([
        ce(catLabel.toUpperCase(), S.cat),
        ...Array(9).fill(em(S.cat)),
        em(S.cat),
        em(), // sep
        resCell[0], resCell[1],
      ])
      dataRowIdx++
    }
    const resCell = resRows[dataRowIdx] || [em(), em()]
    dataRowIdx++
    aoa.push([
      ce(catLabel, S.bold),
      ce(it.subcategoria||'—', S.data),
      ce(it.nombre||'—', S.data),
      ce(it.marca||'—', S.data),
      ce(it.color||'—', S.data),
      ...TALLAS.map(t => ce(it.tallasMap[t]||'', S.num)),
      ce(it.total||0, S.num),
      em(),
      resCell[0], resCell[1],
    ])
  })

  // Fila vacía + TOTAL GENERAL
  aoa.push(Array(N).fill(em()))
  aoa.push([
    ce('TOTAL GENERAL', S.totY), ...Array(9).fill(em(S.totY)),
    ce(totalGeneral, S.totYn),
    em(), em(), em(),
  ])

  const wb = XLSXStyle.utils.book_new()
  const ws = XLSXStyle.utils.aoa_to_sheet(aoa)

  // Tabla nativa con filtros
  ws['!tables'] = [{
    name: 'Inventario', displayName: 'Inventario',
    ref: `A4:K${aoa.length}`,
    headerRow: true, totalsRow: false,
    tableStyleInfo: { name:'TableStyleMedium9', showRowStripes:true },
  }]

  ws['!ref'] = `A1:N${aoa.length}`
  ws['!cols'] = [
    {wch:14},{wch:14},{wch:32},{wch:16},{wch:14},
    {wch:5},{wch:5},{wch:5},{wch:5},{wch:6},
    {wch:8},{wch:2},{wch:18},{wch:10},
  ]
  ws['!rows'] = [{hpt:22},{hpt:14},{hpt:6},{hpt:22}]
  ws['!sheetviews'] = [{ state:'frozen', ySplit:4, topLeftCell:'A5' }]

  XLSXStyle.utils.book_append_sheet(wb, ws, 'Inventario')
  XLSXStyle.writeFile(wb, `Inventario_Merchandising_${fecha.replace(/ /g,'_')}.xlsx`)
}

// ── Generar informe PDF (programático con jsPDF) — informe filtrado por marca/categoría ──
async function generarInformePDF(items, filtros = {}) {
  const { jsPDF } = await import('jspdf')

  const CAT_LABEL = { prenda: 'Ropa', papeleria: 'Papelería', publicidad: 'Material POP', accesorio: 'Accesorio' }
  const CAT_ORDER = ['prenda', 'papeleria', 'publicidad', 'accesorio']
  const TALLAS    = ['S', 'M', 'L', 'XL', 'XXL']

  // Agrupar igual que en el Excel: por categoría+subcategoría+nombre+marca+color, pivot de tallas
  const grouped = {}
  items.forEach(it => {
    const cat = CAT_ORDER.includes(it.categoria) ? it.categoria : 'accesorio'
    const key = `${cat}||${(it.subcategoria||'').toLowerCase()}||${(it.nombre||'').toLowerCase()}||${(it.marca||'').toLowerCase()}||${(it.color||'').toLowerCase()}`
    if (!grouped[key]) grouped[key] = { ...it, categoria: cat, tallasMap: {}, sinTalla: 0 }
    const tal = (it.talla || '').toUpperCase().trim()
    if (tal) grouped[key].tallasMap[tal] = (grouped[key].tallasMap[tal] || 0) + (it.cantidad || 0)
    else grouped[key].sinTalla += (it.cantidad || 0)
  })
  Object.values(grouped).forEach(g => {
    const t = Object.values(g.tallasMap).reduce((s,v)=>s+v, 0)
    g.total = t > 0 ? t : g.sinTalla
  })
  const filas = Object.values(grouped).sort((a, b) => {
    const co = { prenda:0, papeleria:1, publicidad:2, accesorio:3 }
    return (co[a.categoria]??4)-(co[b.categoria]??4) ||
           (a.subcategoria||'').localeCompare(b.subcategoria||'') ||
           (a.nombre||'').localeCompare(b.nombre||'')
  })

  const totalUnidades  = filas.reduce((s,g)=>s+g.total,0)
  const totalArticulos = filas.length
  const totalInvertido = items.reduce((s,it)=>s+(it.cantidad||0)*(it.costo||0),0)

  const pdf = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' })
  const PW=210, PH=297, MG=14, CW=PW-MG*2
  const CN=[30,58,95], CW255=[255,255,255], CGR=[107,114,128], CLT=[244,246,248]
  let pg = 0

  const hdr = () => {
    pdf.setFillColor(...CN); pdf.rect(0,0,PW,11,'F')
    pdf.setFont('helvetica','bold'); pdf.setFontSize(7.5); pdf.setTextColor(...CW255)
    pdf.text('AGROFER CRM  ·  Informe de Inventario Merchandising', MG, 7.5)
    const fd = new Date().toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'})
    pdf.text(fd, PW-MG, 7.5, {align:'right'})
  }
  const ftr = () => {
    pdf.setFillColor(238,240,243); pdf.rect(0,PH-8,PW,8,'F')
    pdf.setFont('helvetica','normal'); pdf.setFontSize(7); pdf.setTextColor(...CGR)
    pdf.text(`Página ${pg}`, PW/2, PH-3, {align:'center'})
    pdf.text('AGROFER CRM', PW-MG, PH-3, {align:'right'})
  }
  const nxt = (first=false) => { if(!first){ pdf.addPage(); hdr() } pg++ }
  const tblHdrRow = (cols, y) => {
    pdf.setFillColor(...CN); pdf.rect(MG,y,CW,7,'F')
    pdf.setFont('helvetica','bold'); pdf.setFontSize(7.5); pdf.setTextColor(...CW255)
    let x=MG
    cols.forEach(c => { pdf.text(c.h, c.a==='c'?x+c.w/2:x+2, y+4.8, {align:c.a==='c'?'center':'left'}); x+=c.w })
    return y+7
  }

  // Portada
  nxt(true)
  pdf.setFillColor(...CN); pdf.rect(0,0,PW,80,'F')
  pdf.setFont('helvetica','bold'); pdf.setFontSize(26); pdf.setTextColor(...CW255)
  pdf.text('AGROFER CRM', PW/2, 28, {align:'center'})
  pdf.setFont('helvetica','normal'); pdf.setFontSize(13); pdf.setTextColor(170,200,235)
  pdf.text('Informe de Inventario — Merchandising', PW/2, 40, {align:'center'})
  const filtroTxt = [
    filtros.marca && filtros.marca !== 'todas' ? `Marca: ${filtros.marca}` : 'Todas las marcas',
    filtros.categoria && filtros.categoria !== 'todas' ? `Categoría: ${CAT_LABEL[filtros.categoria] || filtros.categoria}` : null,
  ].filter(Boolean).join('   ·   ')
  pdf.setFont('helvetica','bold'); pdf.setFontSize(10); pdf.setTextColor(130,170,220)
  pdf.text(filtroTxt, PW/2, 50, {align:'center'})

  const bW=(CW/3)-3
  ;[
    { l:'Artículos', v:totalArticulos },
    { l:'Unidades',  v:totalUnidades.toLocaleString('es-CO') },
    { l:'Valor invertido', v:`$${Math.round(totalInvertido).toLocaleString('es-CO')}` },
  ].forEach((k,i) => {
    const bX=MG+i*(bW+4.5)
    pdf.setDrawColor(...CW255); pdf.setLineWidth(0.4); pdf.roundedRect(bX,55,bW,20,2,2,'S')
    pdf.setFont('helvetica','bold'); pdf.setFontSize(15); pdf.setTextColor(...CW255)
    pdf.text(String(k.v), bX+bW/2, 65, {align:'center'})
    pdf.setFont('helvetica','normal'); pdf.setFontSize(7); pdf.setTextColor(170,200,235)
    pdf.text(k.l, bX+bW/2, 71, {align:'center'})
  })

  // Tabla detalle
  let y = 92
  pdf.setFont('helvetica','bold'); pdf.setFontSize(11); pdf.setTextColor(...CN)
  pdf.text('Detalle de artículos', MG, y); y+=7

  const cols = [
    { h:'Categoría', w:26, a:'l' },
    { h:'Artículo',  w:44, a:'l' },
    { h:'Marca',     w:28, a:'l' },
    { h:'Color',     w:22, a:'l' },
    { h:'Tallas',    w:38, a:'l' },
    { h:'Total',     w:24, a:'c' },
  ]
  y = tblHdrRow(cols, y)

  if (!filas.length) {
    pdf.setFont('helvetica','normal'); pdf.setFontSize(9); pdf.setTextColor(...CGR)
    pdf.text('No hay artículos que coincidan con los filtros seleccionados.', MG+2, y+8)
  }

  filas.forEach((g, i) => {
    if (y > PH-22) { ftr(); nxt(); y=19; y=tblHdrRow(cols, y) }
    const rH = 7.5
    if (i%2===0) { pdf.setFillColor(...CLT); pdf.rect(MG,y,CW,rH,'F') }
    const tallasStr = Object.keys(g.tallasMap).length
      ? TALLAS.filter(t=>g.tallasMap[t]).map(t=>`${t}:${g.tallasMap[t]}`).join(' ')
      : '—'
    let x=MG
    pdf.setFont('helvetica','normal'); pdf.setFontSize(7.5); pdf.setTextColor(60,60,70)
    pdf.text(CAT_LABEL[g.categoria] || g.categoria, x+2, y+5); x+=cols[0].w
    pdf.setFont('helvetica','bold'); pdf.setTextColor(...CN)
    pdf.text((g.nombre||'').slice(0,32), x+2, y+5); x+=cols[1].w
    pdf.setFont('helvetica','normal'); pdf.setTextColor(60,60,70)
    pdf.text(g.marca||'—', x+2, y+5); x+=cols[2].w
    pdf.text(g.color||'—', x+2, y+5); x+=cols[3].w
    pdf.setFontSize(6.8)
    pdf.text(tallasStr.slice(0,40), x+2, y+5); x+=cols[4].w
    pdf.setFont('helvetica','bold'); pdf.setFontSize(8); pdf.setTextColor(...CN)
    pdf.text(String(g.total), x+cols[5].w/2, y+5, {align:'center'})
    y += rH
  })
  ftr()

  const marcaFile = filtros.marca && filtros.marca !== 'todas' ? `_${filtros.marca.replace(/\s+/g,'-')}` : ''
  const catFile    = filtros.categoria && filtros.categoria !== 'todas' ? `_${filtros.categoria}` : ''
  pdf.save(`informe-merchandising${marcaFile}${catFile}_${new Date().toISOString().slice(0,10)}.pdf`)
}

// ── Modal: elegir marca/categoría antes de generar el informe ──────────────────
function ModalGenerarInforme({ items, onClose }) {
  const marcas = useMemo(() => [...new Set(items.map(i => i.marca).filter(Boolean))].sort(), [items])
  const [marca, setMarca]         = useState('todas')
  const [categoria, setCategoria] = useState('todas')
  const [generando, setGenerando] = useState(false)

  const filtrados = items.filter(it =>
    (marca === 'todas' || it.marca === marca) &&
    (categoria === 'todas' || it.categoria === categoria)
  )

  const generar = async () => {
    setGenerando(true)
    try {
      await generarInformePDF(filtrados, { marca, categoria })
      onClose()
    } catch (e) {
      alert('Error generando el informe: ' + (e.message || 'intenta de nuevo'))
    } finally {
      setGenerando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-800 flex items-center gap-2"><FileText size={16} className="text-brand" /> Generar informe PDF</h3>
          <button onClick={onClose}><X size={18} className="text-gray-400 hover:text-gray-600" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Marca</label>
            <select value={marca} onChange={e => setMarca(e.target.value)} className="input w-full text-sm">
              <option value="todas">Todas las marcas</option>
              {marcas.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Categoría</label>
            <select value={categoria} onChange={e => setCategoria(e.target.value)} className="input w-full text-sm">
              <option value="todas">Todas las categorías</option>
              {Object.entries(TIPO_ARTICULO).map(([k,l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <p className="text-xs text-gray-400">
            {filtrados.length} artículo{filtrados.length !== 1 ? 's' : ''} coinciden con estos filtros.
          </p>
          <button onClick={generar} disabled={generando || !filtrados.length}
            className="w-full flex items-center justify-center gap-2 bg-brand text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-brand/80 disabled:opacity-40 transition-colors">
            <FileText size={14} /> {generando ? 'Generando…' : 'Generar informe PDF'}
          </button>
        </div>
      </div>
    </div>
  )
}

const CATEGORIAS = ['prenda', 'papeleria', 'publicidad', 'accesorio']

const CAT_COLOR = {
  prenda:      'bg-blue-100 text-blue-700',
  papeleria:   'bg-yellow-100 text-yellow-700',
  publicidad:  'bg-rose-100 text-rose-700',
  accesorio:   'bg-purple-100 text-purple-700',
}

function imgSrc(url) {
  if (!url) return null
  return url
}

function fmt(n) {
  return n > 0 ? `$${Number(n).toLocaleString('es')}` : '—'
}

// ─── Stat card ───────────────────────────────────────────────────────────────
function Stat({ label, value, sub, color }) {
  return (
    <div className="card p-4">
      <p className="text-[11px] text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-0.5 ${color || 'text-gray-800'}`}>{value ?? '—'}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────
function Lightbox({ src, nombre, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="relative max-w-2xl w-full" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute -top-10 right-0 text-white/70 hover:text-white flex items-center gap-1 text-sm">
          <X size={16} /> Cerrar
        </button>
        <img src={src} alt={nombre} className="w-full rounded-xl object-contain max-h-[80vh] shadow-2xl" />
        <p className="text-center text-white/80 text-sm mt-3">{nombre}</p>
      </div>
    </div>
  )
}

// ─── Modal movimiento individual (entrada/salida) ─────────────────────────────
function MovimientoModal({ item, tipo, onClose, onDone }) {
  const [form, setForm] = useState({ cantidad: 1, destinatario: '', motivo: '', costoUnit: item.costo || 0 })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (tipo === 'salida' && form.cantidad > item.cantidad) {
      setError(`Stock insuficiente. Disponible: ${item.cantidad}`)
      return
    }
    setSaving(true)
    try {
      await api.post(`/merchandising/${item._id}/${tipo}`, form)
      onDone(); onClose()
    } catch (err) {
      setError(err?.error || 'Error al registrar el movimiento')
    } finally { setSaving(false) }
  }

  const esSalida = tipo === 'salida'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-800 flex items-center gap-2">
            {esSalida
              ? <><ArrowDown size={16} className="text-orange-500" /> Registrar salida</>
              : <><ArrowUp size={16} className="text-green-600" /> Registrar entrada</>}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          <div className="bg-gray-50 rounded-xl p-3 flex items-center gap-3">
            {item.imagenUrl
              ? <img src={imgSrc(item.imagenUrl)} alt={item.nombre} className="w-12 h-12 rounded-lg object-cover shrink-0" />
              : <div className="w-12 h-12 rounded-lg bg-gray-200 flex items-center justify-center shrink-0"><Package size={18} className="text-gray-400" /></div>}
            <div>
              <p className="font-semibold text-gray-800 text-sm">{item.nombre}</p>
              <p className="text-xs text-gray-400 mt-0.5">Stock actual: <strong className="text-gray-700">{item.cantidad} uds</strong></p>
            </div>
          </div>

          <div className={`grid gap-3 ${tipo === 'entrada' ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cantidad *</label>
              <input type="number" required min="1" max={esSalida ? item.cantidad : 99999}
                className="input text-sm" value={form.cantidad}
                onChange={e => set('cantidad', Number(e.target.value))} />
            </div>
            {!esSalida && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Costo unitario ($)</label>
                <input type="number" min="0" className="input text-sm" value={form.costoUnit}
                  onChange={e => set('costoUnit', Number(e.target.value))} />
              </div>
            )}
          </div>

          {esSalida && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Destinatario</label>
              <input className="input text-sm" placeholder="¿A quién se entrega?" value={form.destinatario}
                onChange={e => set('destinatario', e.target.value)} />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Motivo / Nota</label>
            <input className="input text-sm"
              placeholder={esSalida ? 'Obsequio feria, cliente especial…' : 'Compra a proveedor, reposición…'}
              value={form.motivo} onChange={e => set('motivo', e.target.value)} />
          </div>

          {!esSalida && form.cantidad > 0 && form.costoUnit > 0 && (
            <div className="bg-green-50 rounded-lg px-3 py-2 text-xs text-green-700">
              Total a registrar: <strong>{fmt(form.cantidad * form.costoUnit)}</strong>
            </div>
          )}

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
            <button type="submit" disabled={saving}
              className={`text-sm font-semibold px-4 py-2 rounded-xl transition-colors disabled:opacity-40 text-white ${esSalida ? 'bg-orange-500 hover:bg-orange-600' : 'bg-green-600 hover:bg-green-700'}`}>
              {saving ? 'Guardando…' : esSalida ? 'Registrar salida' : 'Registrar entrada'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Subida múltiple de fotos ─────────────────────────────────────────────────
function FotoEvidencia({ fotos, onChange, max = 3 }) {
  const fileRef = useRef()

  const handleFile = (e) => {
    const files = Array.from(e.target.files)
    files.forEach(f => {
      const reader = new FileReader()
      reader.onload = (ev) => {
        onChange(prev => {
          if (prev.length >= max) return prev
          return [...prev, {
            base64:   ev.target.result.split(',')[1],
            mimetype: f.type,
            preview:  ev.target.result,
            nota:     '',
          }]
        })
      }
      reader.readAsDataURL(f)
    })
    e.target.value = ''
  }

  const quitar = (idx) => onChange(prev => prev.filter((_, i) => i !== idx))
  const nota   = (idx, v) => onChange(prev => prev.map((f, i) => i === idx ? { ...f, nota: v } : f))

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-medium text-gray-600">
          Fotos de evidencia <span className="text-gray-400">({fotos.length}/{max})</span>
        </label>
        {fotos.length < max && (
          <button type="button" onClick={() => fileRef.current.click()}
            className="flex items-center gap-1 text-xs text-brand hover:underline font-medium">
            <Upload size={12} /> Subir foto
          </button>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFile} />

      {fotos.length === 0 ? (
        <div
          onClick={() => fileRef.current.click()}
          className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center cursor-pointer hover:border-brand/40 hover:bg-brand/5 transition-colors">
          <Upload size={20} className="text-gray-300 mx-auto mb-1" />
          <p className="text-xs text-gray-400">Clic para agregar fotos del cliente con el kit</p>
          <p className="text-[10px] text-gray-300 mt-0.5">Opcional — hasta {max} fotos</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {fotos.map((f, i) => (
            <div key={i} className="relative group">
              <img src={f.preview} alt={`foto ${i+1}`}
                className="w-full aspect-square object-cover rounded-xl border border-gray-100" />
              <button type="button" onClick={() => quitar(i)}
                className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <X size={10} />
              </button>
              <input
                type="text"
                value={f.nota}
                onChange={e => nota(i, e.target.value)}
                placeholder="Nota…"
                className="mt-1 w-full text-[10px] border border-gray-100 rounded-lg px-2 py-1 outline-none focus:border-brand"
              />
            </div>
          ))}
          {fotos.length < max && (
            <button type="button" onClick={() => fileRef.current.click()}
              className="aspect-square border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center text-gray-300 hover:border-brand/40 hover:text-brand/50 transition-colors">
              <Upload size={18} />
              <span className="text-[10px] mt-1">Más</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Modal entregar / devolver kit ───────────────────────────────────────────
function EntregarKitModal({ kit, tipo, onClose, onDone }) {
  const esEntregar = tipo === 'entregar'
  const [cantidad, setCantidad]     = useState(1)
  const [vendedor, setVendedor]     = useState({ id: kit.vendedorId || '', nombre: kit.vendedorNombre || '' })
  const [clienteQ, setClienteQ]     = useState(kit.clienteNombre || '')
  const [clienteSel, setClienteSel] = useState(kit.clienteId ? { _id: kit.clienteId, name: kit.clienteNombre, phone: kit.clientePhone } : null)
  const [sugerencias, setSugerencias] = useState([])
  const [notas, setNotas]           = useState('')
  const [fotos, setFotos]           = useState([])
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')

  const { data: _vData } = useQuery({
    queryKey: ['vendedores-list'],
    queryFn: () => api.get('/vendedores'),
    enabled: esEntregar,
  })
  const vendedores = _vData?.vendedores || []

  const buscarCliente = async (q) => {
    setClienteQ(q); setClienteSel(null)
    if (q.length < 2) { setSugerencias([]); return }
    try {
      const res = await api.get('/clientes', { params: { search: q, limit: 8 } })
      setSugerencias(Array.isArray(res) ? res : res.clientes || [])
    } catch { setSugerencias([]) }
  }

  const componentesOk = esEntregar
    ? (kit.items || []).every(l => l.item && l.item.cantidad >= l.cantidad * cantidad)
    : true

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true); setError('')
    try {
      const payload = { cantidad }
      if (esEntregar) {
        if (vendedor.id)     { payload.vendedorId = vendedor.id; payload.vendedorNombre = vendedor.nombre }
        if (clienteSel)      { payload.clienteId = clienteSel._id; payload.clienteNombre = clienteSel.name; payload.clientePhone = clienteSel.phone }
        else if (clienteQ)   { payload.clienteNombre = clienteQ }
        if (notas)           { payload.notas = notas }
        if (fotos.length)    { payload.evidenciasBase64 = fotos.map(f => ({ base64: f.base64, mimetype: f.mimetype, nota: f.nota })) }
      }
      await api.post(`/merchandising/kits/${kit._id}/${tipo}`, payload)
      onDone(); onClose()
    } catch (err) {
      setError(err?.error || 'Error al procesar el kit')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="font-bold text-gray-800 flex items-center gap-2">
            {esEntregar
              ? <><Send size={15} className="text-purple-600" /> Entregar kit a cliente</>
              : <><RotateCcw size={15} className="text-blue-600" /> Devolver al stock</>}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="p-6 flex flex-col gap-4">
          {/* Resumen de items */}
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-xs font-semibold text-gray-500 mb-2">
              Kit: <span className="text-gray-800">{kit.nombre}</span>
              {kit.marca && <span className="ml-2 text-[10px] bg-brand/10 text-brand px-2 py-0.5 rounded-full">{kit.marca}</span>}
            </p>
            <div className="space-y-1.5">
              {(kit.items || []).map((linea, i) => {
                const disponible = linea.item?.cantidad || 0
                const necesario  = linea.cantidad * cantidad
                const ok         = disponible >= necesario
                return (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${!esEntregar ? 'bg-blue-400' : ok ? 'bg-green-400' : 'bg-red-400'}`} />
                    <span className="flex-1 truncate text-gray-700">{linea.item?.nombre || 'Producto eliminado'}</span>
                    <span className={`font-semibold shrink-0 ${!esEntregar ? 'text-blue-600' : ok ? 'text-green-600' : 'text-red-600'}`}>
                      ×{necesario}{esEntregar ? ` (stock: ${disponible})` : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cant. de kits</label>
              <input type="number" min="1" className="input text-sm w-24"
                value={cantidad} onChange={e => setCantidad(Number(e.target.value))} />
            </div>

            {esEntregar && (
              <>
                {/* Vendedor selector */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Vendedor que entrega</label>
                  <select className="input text-sm" value={vendedor.id}
                    onChange={e => {
                      const v = vendedores.find(v => v._id === e.target.value)
                      setVendedor({ id: e.target.value, nombre: v?.nombre || '' })
                    }}>
                    <option value="">— Seleccionar vendedor —</option>
                    {vendedores.map(v => (
                      <option key={v._id} value={v._id}>{v.nombre}</option>
                    ))}
                  </select>
                </div>

                {/* Cliente search */}
                <div className="relative">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Cliente que recibe
                    {clienteSel && <span className="ml-2 text-green-600 font-normal">✓ {clienteSel.name}</span>}
                  </label>
                  <div className="relative">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      className="input text-sm pl-8"
                      placeholder="Buscar cliente por nombre o teléfono…"
                      value={clienteSel ? clienteSel.name : clienteQ}
                      onChange={e => { if (clienteSel) setClienteSel(null); buscarCliente(e.target.value) }}
                    />
                  </div>
                  {sugerencias.length > 0 && !clienteSel && (
                    <div className="absolute z-20 left-0 right-0 bg-white border border-gray-100 rounded-xl shadow-lg mt-1 max-h-48 overflow-y-auto">
                      {sugerencias.map(c => (
                        <button key={c._id} type="button"
                          onClick={() => { setClienteSel(c); setClienteQ(c.name); setSugerencias([]) }}
                          className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
                            <span className="text-[10px] font-bold text-brand">{c.name?.[0] || '?'}</span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-800">{c.name}</p>
                            <p className="text-[10px] text-gray-400">{c.phone}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Notas */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Notas / Observaciones</label>
                  <input className="input text-sm" placeholder="Feria, visita especial, obsequio…"
                    value={notas} onChange={e => setNotas(e.target.value)} />
                </div>

                {/* Fotos evidencia — SIN LÍMITE */}
                <FotoEvidencia fotos={fotos} onChange={setFotos} max={20} />

                {!componentesOk && (
                  <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                    ⚠️ Stock insuficiente en uno o más componentes (marcados en rojo).
                  </p>
                )}
              </>
            )}

            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
              <button type="submit" disabled={saving || (esEntregar && !componentesOk)}
                className={`text-sm font-semibold px-4 py-2 rounded-xl transition-colors disabled:opacity-40 text-white ${esEntregar ? 'bg-purple-600 hover:bg-purple-700' : 'bg-blue-500 hover:bg-blue-600'}`}>
                {saving ? 'Procesando…' : esEntregar ? 'Confirmar entrega' : 'Devolver al stock'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

// ─── Tarjeta de producto ──────────────────────────────────────────────────────
function ItemCard({ item, onCantidad, onDelete, onSalida, onEntrada, onEditar }) {
  const [lightbox, setLightbox] = useState(false)
  const src = imgSrc(item.imagenUrl)
  return (
    <>
    <div className={`card p-0 overflow-hidden flex flex-col ${item.cantidad === 0 ? 'opacity-80' : ''}`}>
      <div className="relative bg-gray-100 h-36 flex items-center justify-center shrink-0">
        {src
          ? <img src={src} alt={item.nombre} className="h-full w-full object-cover cursor-zoom-in" onClick={() => setLightbox(true)} />
          : <Package size={34} className="text-gray-300" />}

        {/* Badge agotado / escaso */}
        {item.cantidad === 0 && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
            <span className="bg-red-600 text-white text-[11px] font-black px-3 py-1 rounded-full shadow-lg tracking-wide">
              AGOTADO
            </span>
          </div>
        )}
        {item.cantidad > 0 && item.cantidad <= 2 && (
          <div className="absolute bottom-2 left-0 right-0 flex justify-center">
            <span className="bg-orange-500 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow">
              ⚠ Escaso — {item.cantidad} ud{item.cantidad !== 1 ? 's' : ''}
            </span>
          </div>
        )}

        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {item.marca && (
            <span className="bg-white/90 text-[10px] font-bold text-brand px-2 py-0.5 rounded-full shadow-sm truncate max-w-[120px]">
              {item.marca}
            </span>
          )}
          {item.esFamilia
            ? <span className="bg-green-500/90 text-[9px] font-bold text-white px-1.5 py-0.5 rounded-full shadow-sm">✓ Familia AGROFER</span>
            : <span className="bg-gray-400/80 text-[9px] font-bold text-white px-1.5 py-0.5 rounded-full shadow-sm">Externo</span>
          }
        </div>
        <div className="absolute top-2 right-2 flex gap-1">
          <button onClick={() => onEditar(item)}
            className="w-6 h-6 bg-white/90 rounded-full flex items-center justify-center text-blue-400 hover:text-blue-600 shadow-sm">
            <Pencil size={11} />
          </button>
          <button onClick={() => onDelete(item._id)}
            className="w-6 h-6 bg-white/90 rounded-full flex items-center justify-center text-red-400 hover:text-red-600 shadow-sm">
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      <div className="p-3 flex-1 flex flex-col gap-1.5">
        <p className="font-semibold text-gray-800 text-sm leading-tight line-clamp-2">{item.nombre}</p>
        <div className="flex flex-wrap gap-1">
          {item.categoria && (
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${CAT_COLOR[item.categoria] || CAT_COLOR.otro}`}>
              {item.categoria}
            </span>
          )}
          {item.subcategoria && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{item.subcategoria}</span>}
          {item.talla && <span className="text-[10px] bg-indigo-100 text-indigo-600 font-bold px-1.5 py-0.5 rounded-full">{item.talla}</span>}
          {item.color && <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full">{item.color}</span>}
        </div>

        <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-50">
          <span className="text-xs text-gray-400">Stock</span>
          <div className="flex items-center gap-1">
            <button onClick={() => onCantidad(item._id, -1)} disabled={item.cantidad <= 0}
              className="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center disabled:opacity-30 transition-colors">
              <Minus size={11} />
            </button>
            <span className="text-sm font-bold text-gray-800 w-8 text-center">{item.cantidad}</span>
            <button onClick={() => onCantidad(item._id, 1)}
              className="w-6 h-6 rounded-full bg-brand/10 hover:bg-brand/20 flex items-center justify-center text-brand transition-colors">
              <Plus size={11} />
            </button>
          </div>
        </div>

        {/* Botones salida / entrada */}
        <div className="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-gray-50">
          <button onClick={() => onSalida(item)}
            className="flex items-center justify-center gap-1 text-[11px] font-semibold px-2 py-1.5 rounded-lg bg-orange-50 text-orange-600 hover:bg-orange-100 transition-colors">
            <ArrowDown size={11} /> Salida
          </button>
          <button onClick={() => onEntrada(item)}
            className="flex items-center justify-center gap-1 text-[11px] font-semibold px-2 py-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition-colors">
            <ArrowUp size={11} /> Entrada
          </button>
        </div>
      </div>
    </div>
    {lightbox && src && <Lightbox src={src} nombre={item.nombre} onClose={() => setLightbox(false)} />}
    </>
  )
}

// ─── Modal nuevo producto ─────────────────────────────────────────────────────
function NuevoItemModal({ onClose, onCreated, itemEditar }) {
  const esEdicion = !!itemEditar
  const fileRef   = useRef()
  const [form, setForm] = useState(itemEditar ? {
    nombre:      itemEditar.nombre      || '',
    marca:       itemEditar.marca       || '',
    proveedor:   itemEditar.proveedor   || '',
    categoria:   itemEditar.categoria   || 'otro',
    subcategoria:itemEditar.subcategoria|| '',
    talla:       itemEditar.talla       || '',
    color:       itemEditar.color       || '',
    cantidad:    itemEditar.cantidad    ?? 0,
    costo:       itemEditar.costo       || 0,
    descripcion: itemEditar.descripcion || '',
    esFamilia:   itemEditar.esFamilia   || false,
  } : {
    nombre: '', marca: '', proveedor: '', categoria: 'otro',
    subcategoria: '', talla: '', color: '', cantidad: 1, costo: 0, descripcion: '', esFamilia: false,
  })
  const [imagen, setImagen] = useState(null) // { base64, mimetype, preview }
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleFile = (e) => {
    const f = e.target.files[0]; if (!f) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setImagen({
        base64:   ev.target.result.split(',')[1],
        mimetype: f.type,
        preview:  ev.target.result,
      })
    }
    reader.readAsDataURL(f)
  }

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      const payload = { ...form }
      if (imagen) { payload.imagenBase64 = imagen.base64; payload.imagenMimetype = imagen.mimetype }
      if (esEdicion) {
        await api.patch(`/merchandising/${itemEditar._id}`, payload)
      } else {
        await api.post('/merchandising', payload)
      }
      onCreated(); onClose()
    } finally { setSaving(false) }
  }

  const imagenPreview = imagen?.preview || (esEdicion && itemEditar.imagenUrl ? itemEditar.imagenUrl : null)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="font-bold text-gray-800">{esEdicion ? 'Editar producto' : 'Nuevo producto'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 grid grid-cols-2 gap-4">

          {/* ── Zona imagen (ancho completo) ── */}
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Foto del producto</label>
            <div
              onClick={() => fileRef.current.click()}
              className={`relative cursor-pointer rounded-xl border-2 border-dashed transition-colors overflow-hidden
                ${imagenPreview ? 'border-brand/30 bg-brand/5' : 'border-gray-200 hover:border-brand/40 hover:bg-gray-50'}`}
              style={{ height: imagenPreview ? 160 : 80 }}
            >
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
              {imagenPreview ? (
                <>
                  <img src={imagenPreview} alt="preview"
                    className="w-full h-full object-contain" />
                  <div className="absolute inset-0 bg-black/0 hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 hover:opacity-100">
                    <span className="text-white text-xs font-semibold bg-black/50 px-3 py-1.5 rounded-lg">
                      Cambiar foto
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-full gap-2 text-gray-400">
                  <Upload size={16} className="opacity-60" />
                  <span className="text-xs">Clic para subir foto</span>
                </div>
              )}
            </div>
          </div>

          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Nombre *</label>
            <input required className="input text-sm" value={form.nombre} placeholder="Ej: Camiseta polo azul"
              onChange={e => set('nombre', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Marca</label>
            <input className="input text-sm" value={form.marca} placeholder="Ej: Algreco"
              onChange={e => set('marca', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Empresa / Aliado</label>
            <input className="input text-sm" value={form.proveedor} placeholder="Ej: Alidal"
              onChange={e => set('proveedor', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Categoría</label>
            <select className="input text-sm" value={form.categoria} onChange={e => set('categoria', e.target.value)}>
              {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Subcategoría</label>
            <input className="input text-sm" value={form.subcategoria} placeholder="camiseta, gorra, bolígrafo…"
              onChange={e => set('subcategoria', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Talla</label>
            <input className="input text-sm" value={form.talla} placeholder="S / M / L / XL / UNICA"
              onChange={e => set('talla', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Color</label>
            <input className="input text-sm" value={form.color} placeholder="azul marino"
              onChange={e => set('color', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Cantidad inicial</label>
            <input type="number" min="0" className="input text-sm" value={form.cantidad}
              onChange={e => set('cantidad', Number(e.target.value))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Costo unitario ($)</label>
            <input type="number" min="0" className="input text-sm" value={form.costo}
              onChange={e => set('costo', Number(e.target.value))} />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Descripción</label>
            <textarea className="input text-sm resize-none" rows={2} value={form.descripcion}
              placeholder="Descripción breve…" onChange={e => set('descripcion', e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${form.esFamilia ? 'border-green-300 bg-green-50' : 'border-gray-200 hover:border-gray-300'}`}>
              <input type="checkbox" checked={form.esFamilia || false} onChange={e => set('esFamilia', e.target.checked)} className="accent-green-600 w-4 h-4 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-gray-800">✓ Es de la Familia AGROFER</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Marca aliada que AGROFER distribuye. Desmarca si es mercancía externa recibida de otro proveedor.</p>
              </div>
            </label>
          </div>
          <div className="col-span-2 flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary text-sm">
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Modal nuevo kit ──────────────────────────────────────────────────────────
function NuevoKitModal({ items, onClose, onCreated }) {
  const [nombre, setNombre]         = useState('')
  const [marca, setMarca]           = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [vendedor, setVendedor]     = useState({ id: '', nombre: '' })
  const [lineas, setLineas]         = useState([{ itemId: '', cantidad: 1 }])
  const [saving, setSaving]         = useState(false)

  const { data: _vData2 } = useQuery({
    queryKey: ['vendedores-list'],
    queryFn: () => api.get('/vendedores'),
  })
  const vendedores = _vData2?.vendedores || []

  const addLinea    = () => setLineas(l => [...l, { itemId: '', cantidad: 1 }])
  const removeLinea = (i) => setLineas(l => l.filter((_, idx) => idx !== i))
  const setLinea    = (i, k, v) => setLineas(l => l.map((ln, idx) => idx === i ? { ...ln, [k]: v } : ln))

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      const payload = {
        nombre, marca, descripcion,
        items: lineas.filter(l => l.itemId).map(l => ({ item: l.itemId, cantidad: Number(l.cantidad) })),
      }
      if (vendedor.id) { payload.vendedorId = vendedor.id; payload.vendedorNombre = vendedor.nombre }
      await api.post('/merchandising/kits', payload)
      onCreated(); onClose()
    } finally { setSaving(false) }
  }

  // Marcas únicas de los items disponibles
  const marcasItems = [...new Set(items.map(i => i.marca).filter(Boolean))]

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="font-bold text-gray-800">Nuevo kit / combo</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Nombre del kit *</label>
              <input required className="input text-sm" value={nombre} placeholder="Ej: Kit Algreco Verano 2026"
                onChange={e => setNombre(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Marca / Campaña</label>
              <input className="input text-sm" value={marca} placeholder="Ej: Algreco, Alidal…"
                list="marcas-list"
                onChange={e => setMarca(e.target.value)} />
              <datalist id="marcas-list">
                {marcasItems.map(m => <option key={m} value={m} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Vendedor asignado</label>
              <select className="input text-sm" value={vendedor.id}
                onChange={e => {
                  const v = vendedores.find(v => v._id === e.target.value)
                  setVendedor({ id: e.target.value, nombre: v?.nombre || '' })
                }}>
                <option value="">— Sin asignar —</option>
                {vendedores.map(v => <option key={v._id} value={v._id}>{v.nombre}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Descripción</label>
              <input className="input text-sm" value={descripcion} placeholder="Opcional"
                onChange={e => setDescripcion(e.target.value)} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-600">Artículos del kit</label>
              <button type="button" onClick={addLinea} className="text-xs text-brand hover:underline flex items-center gap-1">
                <Plus size={12} /> Agregar artículo
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {lineas.map((ln, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <select value={ln.itemId} onChange={e => setLinea(i, 'itemId', e.target.value)} className="input text-sm flex-1">
                    <option value="">— Seleccionar producto —</option>
                    {items.map(it => (
                      <option key={it._id} value={it._id}>
                        {it.nombre}{it.talla ? ` (${it.talla})` : ''}{it.marca ? ` · ${it.marca}` : ''} — stock: {it.cantidad}
                      </option>
                    ))}
                  </select>
                  <input type="number" min="1" value={ln.cantidad}
                    onChange={e => setLinea(i, 'cantidad', e.target.value)}
                    className="input text-sm w-16 text-center" />
                  {lineas.length > 1 && (
                    <button type="button" onClick={() => removeLinea(i)} className="text-red-400 hover:text-red-600">
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary text-sm">
              {saving ? 'Guardando…' : 'Crear kit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Pestaña Inventario ───────────────────────────────────────────────────────
function TabInventario({ onNuevo }) {
  const qc = useQueryClient()
  const [search, setSearch]         = useState('')
  const [filterCat, setFilterCat]   = useState('')
  const [filterMarca, setFilterMarca]   = useState('')
  const [filterFamilia, setFilterFamilia] = useState('') // '' | 'familia' | 'externo'
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false)
  const [movModal, setMovModal]         = useState(null)
  const [editItem, setEditItem]         = useState(null)

  const params = {}
  if (search)      params.search    = search
  if (filterCat)   params.categoria = filterCat
  if (filterMarca)   params.marca     = filterMarca
  if (filterFamilia === 'familia') params.esFamilia = 'true'
  if (filterFamilia === 'externo') params.esFamilia = 'false'

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['merchandising', params],
    queryFn:  () => api.get('/merchandising', { params }),
    refetchInterval: 30_000,
  })

  const { data: stats } = useQuery({
    queryKey: ['merchandising-stats'],
    queryFn:  () => api.get('/merchandising/stats'),
    refetchInterval: 30_000,
  })

  const refresh = () => {
    qc.invalidateQueries(['merchandising'])
    qc.invalidateQueries(['merchandising-stats'])
    qc.invalidateQueries(['merchandising-movimientos'])
  }

  const mutCantidad = useMutation({
    mutationFn: ({ id, delta }) => api.patch(`/merchandising/${id}/cantidad`, { delta }),
    onSuccess: refresh,
  })
  const mutDelete = useMutation({
    mutationFn: id => api.delete(`/merchandising/${id}`),
    onSuccess: refresh,
  })

  const marcasTop = (stats?.marcas || []).filter(m => m._id)

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Tipos de artículo"   value={stats?.totales?.totalItems} />
        <Stat label="Total unidades"      value={stats?.totales?.totalUnidades} />
        <Stat label="Top marca"           value={marcasTop[0]?._id || '—'} sub={marcasTop[0] ? `${marcasTop[0].total} uds` : null} />
        <Stat label="Marcas registradas"  value={(stats?.marcas || []).filter(m => m._id).length} />
      </div>

      {stats?.totales?.totalInvertido > 0 && (
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">💰</span>
            <div>
              <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">Total invertido en inventario</p>
              <p className="text-[11px] text-indigo-400 mt-0.5">Suma de stock × costo unitario de todos los artículos</p>
            </div>
          </div>
          <p className="text-2xl font-black text-indigo-700">
            ${Number(stats.totales.totalInvertido).toLocaleString('es')}
          </p>
        </div>
      )}

      {/* ── Barra de filtros compacta ── */}
      {(() => {
        const filtrosActivos = [filterCat, filterMarca, filterFamilia].filter(Boolean).length
        const limpiar = () => { setFilterCat(''); setFilterMarca(''); setFilterFamilia('') }
        return (
          <div className="flex flex-col gap-2">
            {/* Fila principal: búsqueda + botón filtros */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar producto, marca…" className="input pl-9 pr-8 text-sm w-full" />
                {search && (
                  <button onClick={() => setSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                    <X size={13} />
                  </button>
                )}
              </div>

              <button onClick={() => setFiltrosAbiertos(f => !f)}
                className={`flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-xl border transition-colors ${
                  filtrosAbiertos || filtrosActivos > 0
                    ? 'bg-brand text-white border-brand'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-brand hover:text-brand'}`}>
                <Filter size={13} />
                Filtros
                {filtrosActivos > 0 && (
                  <span className={`text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center ${
                    filtrosAbiertos ? 'bg-white text-brand' : 'bg-white/30 text-white'}`}>
                    {filtrosActivos}
                  </span>
                )}
                <ChevronDown size={13} className={`transition-transform ${filtrosAbiertos ? 'rotate-180' : ''}`} />
              </button>

              {filtrosActivos > 0 && (
                <button onClick={limpiar}
                  className="text-xs font-medium text-red-400 hover:text-red-600 px-2 transition-colors whitespace-nowrap">
                  Limpiar
                </button>
              )}
            </div>

            {/* Chips de filtros activos (panel cerrado) */}
            {!filtrosAbiertos && filtrosActivos > 0 && (
              <div className="flex gap-1.5 flex-wrap">
                {filterMarca && (
                  <span className="flex items-center gap-1 text-[11px] bg-brand/10 text-brand px-2.5 py-1 rounded-full font-medium">
                    {filterMarca}
                    <button onClick={() => setFilterMarca('')}><X size={10} /></button>
                  </span>
                )}
                {filterFamilia && (
                  <span className="flex items-center gap-1 text-[11px] bg-green-50 text-green-700 px-2.5 py-1 rounded-full font-medium">
                    {filterFamilia === 'familia' ? '✓ Familia AGROFER' : 'Externos'}
                    <button onClick={() => setFilterFamilia('')}><X size={10} /></button>
                  </span>
                )}
                {filterCat && (
                  <span className="flex items-center gap-1 text-[11px] bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full font-medium">
                    {filterCat}
                    <button onClick={() => setFilterCat('')}><X size={10} /></button>
                  </span>
                )}
              </div>
            )}

            {/* Panel desplegable */}
            {filtrosAbiertos && (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-col gap-4">
                {/* Marcas — scroll horizontal */}
                {marcasTop.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Marca</p>
                    <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                      <button onClick={() => setFilterMarca('')}
                        className={`shrink-0 text-xs px-3 py-1 rounded-full border transition-colors ${!filterMarca ? 'bg-brand text-white border-brand' : 'bg-white text-gray-500 border-gray-200 hover:border-brand hover:text-brand'}`}>
                        Todas
                      </button>
                      {marcasTop.map(m => (
                        <button key={m._id} onClick={() => setFilterMarca(filterMarca === m._id ? '' : m._id)}
                          className={`shrink-0 text-xs px-3 py-1 rounded-full border transition-colors ${filterMarca === m._id ? 'bg-brand text-white border-brand' : 'bg-white text-gray-500 border-gray-200 hover:border-brand hover:text-brand'}`}>
                          {m._id} <span className="opacity-60">({m.total})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Familia + Categoría */}
                <div className="flex flex-wrap gap-6 items-start">
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Familia</p>
                    <div className="flex gap-1.5">
                      {[
                        { v: '',        label: 'Todos' },
                        { v: 'familia', label: '✓ Familia AGROFER' },
                        { v: 'externo', label: 'Externos' },
                      ].map(opt => (
                        <button key={opt.v} onClick={() => setFilterFamilia(opt.v)}
                          className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                            filterFamilia === opt.v
                              ? opt.v === 'familia' ? 'bg-green-600 text-white border-green-600'
                                : opt.v === 'externo' ? 'bg-gray-500 text-white border-gray-500'
                                : 'bg-brand text-white border-brand'
                              : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Categoría</p>
                    <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="input text-sm py-1.5">
                      <option value="">Todas</option>
                      {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })()}

      <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-start gap-3">
        <Tag size={15} className="text-green-600 shrink-0 mt-0.5" />
        <p className="text-sm text-green-800">
          <span className="font-semibold">Inventariar por WhatsApp:</span>{' '}
          Escribe <code className="bg-green-100 px-1 rounded font-mono text-xs">INICIAR MERCHANDISING</code> en la línea principal
          → envía la foto con el texto en el mismo mensaje: <em>"Camiseta Alidal talla M — 5 unidades"</em>
          → la IA lo registra solo. Al terminar escribe <code className="bg-green-100 px-1 rounded font-mono text-xs">FIN MERCHANDISING</code>.
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card p-0 overflow-hidden animate-pulse">
              <div className="bg-gray-200 h-36" />
              <div className="p-3 space-y-2"><div className="h-3 bg-gray-200 rounded w-3/4" /><div className="h-3 bg-gray-100 rounded w-1/2" /></div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Package size={48} className="mb-3 opacity-30" />
          <p className="font-medium">Sin productos en inventario</p>
          <p className="text-sm mt-1">Agrega uno manualmente o usa WhatsApp con foto + descripción</p>
          <button onClick={onNuevo} className="btn-primary text-sm mt-4">Agregar primero</button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {items.map(item => (
            <ItemCard key={item._id} item={item}
              onCantidad={(id, delta) => mutCantidad.mutate({ id, delta })}
              onDelete={(id) => { if (confirm('¿Eliminar este producto?')) mutDelete.mutate(id) }}
              onSalida={(item) => setMovModal({ item, tipo: 'salida' })}
              onEntrada={(item) => setMovModal({ item, tipo: 'entrada' })}
              onEditar={(item) => setEditItem(item)}
            />
          ))}
        </div>
      )}

      {movModal && (
        <MovimientoModal
          item={movModal.item}
          tipo={movModal.tipo}
          onClose={() => setMovModal(null)}
          onDone={refresh}
        />
      )}
      {editItem && (
        <NuevoItemModal
          itemEditar={editItem}
          onClose={() => setEditItem(null)}
          onCreated={() => { refresh(); setEditItem(null) }}
        />
      )}
    </div>
  )
}

// ─── Pestaña Marcas ───────────────────────────────────────────────────────────
function TabMarcas() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['merchandising-stats'],
    queryFn: () => api.get('/merchandising/stats'),
    refetchInterval: 30_000,
  })

  const { data: allItems = [] } = useQuery({
    queryKey: ['merchandising', {}],
    queryFn: () => api.get('/merchandising'),
  })

  const marcas = (stats?.marcas || []).filter(m => m._id)

  if (isLoading) return <div className="py-20 text-center text-gray-400">Cargando…</div>
  if (marcas.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
      <Building2 size={48} className="mb-3 opacity-30" />
      <p>Sin marcas registradas aún</p>
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      {marcas.map(m => {
        const itemsDeMarca = allItems.filter(it => (it.marca || '').toLowerCase() === (m._id || '').toLowerCase())
        const totalUds     = itemsDeMarca.reduce((s, it) => s + it.cantidad, 0)
        return (
          <div key={m._id} className="card p-0 overflow-hidden">
            <div className="px-5 py-3 bg-brand/5 border-b border-gray-100 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center">
                <Building2 size={15} className="text-brand" />
              </div>
              <div>
                <p className="font-bold text-gray-800">{m._id}</p>
                <p className="text-xs text-gray-400">{m.items} tipo(s) · {totalUds} unidades totales</p>
              </div>
            </div>
            <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {itemsDeMarca.map(it => (
                <div key={it._id} className="flex items-start gap-2 bg-gray-50 rounded-lg p-2">
                  {it.imagenUrl
                    ? <img src={imgSrc(it.imagenUrl)} alt={it.nombre} className="w-10 h-10 rounded object-cover shrink-0" />
                    : <div className="w-10 h-10 rounded bg-gray-200 flex items-center justify-center shrink-0"><Package size={14} className="text-gray-400" /></div>}
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-700 leading-tight truncate">{it.nombre}</p>
                    <p className="text-[10px] text-gray-400">{it.subcategoria}{it.talla ? ` · ${it.talla}` : ''}</p>
                    <p className="text-xs font-bold text-brand mt-0.5">{it.cantidad} uds</p>
                    {it.costo > 0 && <p className="text-[10px] text-gray-400">{fmt(it.costo)}/u</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Modal agregar evidencias adicionales ─────────────────────────────────────
function AgregarEvidenciasModal({ kit, onClose, onDone }) {
  const [fotos, setFotos] = useState([])
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!fotos.length) { onClose(); return }
    setSaving(true)
    try {
      await api.post(`/merchandising/kits/${kit._id}/evidencias`, {
        evidenciasBase64: fotos.map(f => ({ base64: f.base64, mimetype: f.mimetype, nota: f.nota }))
      })
      onDone(); onClose()
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-800 text-sm">Agregar evidencias — {kit.nombre}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          <FotoEvidencia fotos={fotos} onChange={setFotos} max={20} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
            <button type="submit" disabled={saving || !fotos.length}
              className="btn-primary text-sm disabled:opacity-40">
              {saving ? 'Guardando…' : 'Guardar fotos'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Pestaña Kits ─────────────────────────────────────────────────────────────
function TabKits() {
  const qc = useQueryClient()
  const [showModal, setShowModal]     = useState(false)
  const [kitModal, setKitModal]       = useState(null) // { kit, tipo }
  const [kitModalEv, setKitModalEv]   = useState(null) // kit para agregar evidencias
  const [lightboxEv, setLightboxEv]   = useState(null) // { src, nota }
  const [expandidos, setExpandidos]   = useState({})
  const toggleExpand = (id) => setExpandidos(prev => ({ ...prev, [id]: !prev[id] }))

  const { data: kits = [], isLoading } = useQuery({
    queryKey: ['merchandising-kits'],
    queryFn: () => api.get('/merchandising/kits'),
  })

  const { data: items = [] } = useQuery({
    queryKey: ['merchandising', {}],
    queryFn: () => api.get('/merchandising'),
  })

  const refresh = () => {
    qc.invalidateQueries(['merchandising-kits'])
    qc.invalidateQueries(['merchandising'])
    qc.invalidateQueries(['merchandising-movimientos'])
  }

  const mutDelete = useMutation({
    mutationFn: id => api.delete(`/merchandising/kits/${id}`),
    onSuccess: () => qc.invalidateQueries(['merchandising-kits']),
  })

  const mutToggle = useMutation({
    mutationFn: ({ id, entregado }) => api.patch(`/merchandising/kits/${id}`, { entregado }),
    onSuccess: () => qc.invalidateQueries(['merchandising-kits']),
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={16} /> Nuevo kit
        </button>
      </div>

      {isLoading ? (
        <div className="py-20 text-center text-gray-400">Cargando…</div>
      ) : kits.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Gift size={48} className="mb-3 opacity-30" />
          <p className="font-medium">Sin kits creados</p>
          <p className="text-sm mt-1">Arma combos de artículos para entregar como obsequios</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {kits.map(kit => (
            <div key={kit._id} className={`card p-0 overflow-hidden ${kit.entregado ? 'opacity-75' : ''}`}>
              <div className={`px-4 py-3 border-b border-gray-100 flex items-center justify-between ${kit.entregado ? 'bg-green-50' : 'bg-purple-50'}`}>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Gift size={16} className={kit.entregado ? 'text-green-500' : 'text-purple-500'} />
                  <p className="font-bold text-gray-800 text-sm truncate">{kit.nombre}</p>
                  {kit.entregado && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full shrink-0">
                      <CheckCircle2 size={10} /> Entregado
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    title={kit.entregado ? 'Marcar como disponible' : 'Marcar como entregado'}
                    onClick={() => mutToggle.mutate({ id: kit._id, entregado: !kit.entregado })}
                    className={`text-[10px] font-semibold px-2 py-1 rounded-lg border transition-colors ${
                      kit.entregado
                        ? 'border-gray-300 text-gray-500 hover:bg-gray-100'
                        : 'border-green-300 text-green-600 hover:bg-green-50'
                    }`}>
                    {kit.entregado ? 'Disponible' : '✓ Marcar entregado'}
                  </button>
                  <button onClick={() => { if (confirm('¿Eliminar este kit?')) mutDelete.mutate(kit._id) }}
                    className="text-red-400 hover:text-red-600"><Trash2 size={13} /></button>
                </div>
              </div>
              {kit.descripcion && <p className="px-4 py-2 text-xs text-gray-400 border-b border-gray-50">{kit.descripcion}</p>}

              {/* Toggle artículos */}
              <button
                onClick={() => toggleExpand(kit._id)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors border-b border-gray-50">
                <span>{kit.items?.length || 0} artículo{kit.items?.length !== 1 ? 's' : ''} en el kit</span>
                <span className={`transition-transform duration-200 ${expandidos[kit._id] ? 'rotate-180' : ''}`}>▼</span>
              </button>

              {expandidos[kit._id] && (
                <div className="p-3 flex flex-col gap-2 border-b border-gray-50">
                  {(kit.items || []).map((linea, i) => (
                    <div key={i} className="flex items-center gap-2">
                      {linea.item?.imagenUrl
                        ? <img src={imgSrc(linea.item.imagenUrl)} alt={linea.item.nombre} className="w-8 h-8 rounded object-cover shrink-0" />
                        : <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center shrink-0"><Package size={12} className="text-gray-400" /></div>}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-700 truncate">{linea.item?.nombre || 'Producto eliminado'}</p>
                        {linea.item?.marca && <p className="text-[10px] text-gray-400">{linea.item.marca}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs font-bold text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full">×{linea.cantidad}</span>
                        {linea.item && (
                          <p className={`text-[10px] mt-0.5 ${linea.item.cantidad >= linea.cantidad ? 'text-green-600' : 'text-red-500'}`}>
                            stock: {linea.item.cantidad}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {kit.entregado ? (
                <div className="px-3 py-2 border-t border-gray-100 flex flex-col gap-1.5">
                  <div className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-green-50 border border-green-200">
                    <CheckCircle2 size={14} className="text-green-600" />
                    <span className="text-xs font-bold text-green-700">Entregado</span>
                  </div>
                  {kit.entregadoA && (
                    <p className="text-[10px] text-gray-400 text-center">a: <span className="font-medium text-gray-600">{kit.entregadoA}</span></p>
                  )}

                  {/* Evidencias fotográficas */}
                  {kit.evidencias?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Evidencia</p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {kit.evidencias.map((ev, i) => (
                          <div key={i} className="relative group cursor-pointer"
                            onClick={() => setLightboxEv({ src: ev.url, nota: ev.nota })}>
                            <img src={ev.url} alt={`evidencia ${i+1}`}
                              className="w-full aspect-square object-cover rounded-lg border border-gray-100 hover:brightness-90 transition-all" />
                            {ev.nota && (
                              <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[9px] px-1 py-0.5 rounded-b-lg truncate opacity-0 group-hover:opacity-100 transition-opacity">
                                {ev.nota}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-1.5">
                    <button onClick={() => setKitModal({ kit, tipo: 'devolver' })}
                      className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-lg border border-blue-300 text-blue-600 hover:bg-blue-50 transition-colors">
                      <RotateCcw size={11} /> Devolver al stock
                    </button>
                    <button onClick={() => setKitModalEv(kit)}
                      title="Agregar más fotos de evidencia"
                      className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-brand hover:border-brand/40 transition-colors">
                      <Upload size={13} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="px-3 py-2 border-t border-gray-100 grid grid-cols-2 gap-2">
                  <button onClick={() => setKitModal({ kit, tipo: 'entregar' })}
                    className="flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors">
                    <Send size={12} /> Entregar
                  </button>
                  <button onClick={() => setKitModal({ kit, tipo: 'devolver' })}
                    className="flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-lg border border-blue-300 text-blue-600 hover:bg-blue-50 transition-colors">
                    <RotateCcw size={12} /> Devolver
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <NuevoKitModal
          items={items}
          onClose={() => setShowModal(false)}
          onCreated={refresh}
        />
      )}

      {kitModal && (
        <EntregarKitModal
          kit={kitModal.kit}
          tipo={kitModal.tipo}
          onClose={() => setKitModal(null)}
          onDone={refresh}
        />
      )}

      {kitModalEv && (
        <AgregarEvidenciasModal
          kit={kitModalEv}
          onClose={() => setKitModalEv(null)}
          onDone={refresh}
        />
      )}

      {lightboxEv && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-4"
          onClick={() => setLightboxEv(null)}>
          <div className="relative max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <button onClick={() => setLightboxEv(null)}
              className="absolute -top-9 right-0 text-white/70 hover:text-white flex items-center gap-1 text-sm">
              <X size={16} /> Cerrar
            </button>
            <img src={lightboxEv.src} alt="evidencia"
              className="w-full rounded-2xl object-contain max-h-[80vh] shadow-2xl" />
            {lightboxEv.nota && (
              <p className="text-center text-white/80 text-sm mt-3">{lightboxEv.nota}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Pestaña Movimientos ──────────────────────────────────────────────────────
const TIPO_STYLE = {
  entrada:       { bg: 'bg-green-100',  text: 'text-green-700',  label: '↑ Entrada' },
  salida:        { bg: 'bg-orange-100', text: 'text-orange-700', label: '↓ Salida' },
  kit_entregado: { bg: 'bg-purple-100', text: 'text-purple-700', label: '📦 Kit entregado' },
  kit_devuelto:  { bg: 'bg-blue-100',   text: 'text-blue-700',   label: '↩ Devuelto' },
}

// ─── Pestaña Analytics Merchandising ─────────────────────────────────────────
function TabAnalytics() {
  const { data: analytics, isLoading } = useQuery({
    queryKey: ['merch-analytics'],
    queryFn: () => api.get('/merchandising/kits/analytics'),
    refetchInterval: 30_000,
  })

  if (isLoading) return <div className="py-20 text-center text-gray-400">Cargando…</div>

  const t = analytics?.totales || {}
  const pct = t.totalKits > 0 ? Math.round((t.totalEntregados / t.totalKits) * 100) : 0

  return (
    <div className="flex flex-col gap-6">
      {/* KPIs globales */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Total kits"         value={t.totalKits}          />
        <Stat label="Entregados"          value={t.totalEntregados}    color="text-green-700" />
        <Stat label="Pendientes"          value={t.totalPendientes}    color="text-orange-600" />
        <Stat label="Clientes impactados" value={t.clientesImpactados} color="text-blue-700" />
        <Stat label="Vendedores activos"  value={t.vendedoresActivos}  color="text-purple-700" />
      </div>

      {/* Barra de progreso global */}
      {t.totalKits > 0 && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-gray-700">Progreso de entrega global</p>
            <span className="text-sm font-bold text-green-700">{pct}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
            <div className="bg-green-500 h-3 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-gray-400 mt-1">{t.totalEntregados} de {t.totalKits} kits entregados</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Ranking vendedores */}
        <div className="card p-0 overflow-hidden">
          <div className="px-5 py-3 bg-purple-50 border-b border-purple-100 flex items-center gap-2">
            <Users size={15} className="text-purple-600" />
            <p className="font-bold text-gray-800 text-sm">Vendedores — kits entregados</p>
          </div>
          {(analytics?.porVendedor || []).length === 0 ? (
            <div className="py-10 text-center text-gray-400 text-sm">Sin datos aún</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {(analytics?.porVendedor || []).map((v, i) => (
                <div key={v._id} className="px-5 py-3 flex items-center gap-3">
                  <span className={`text-lg font-black w-6 text-center ${i === 0 ? 'text-yellow-500' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-amber-600' : 'text-gray-300'}`}>
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{v._id || 'Sin asignar'}</p>
                    <div className="flex gap-3 mt-0.5">
                      <span className="text-[10px] text-green-600 font-semibold">{v.entregados} entregados</span>
                      {v.pendientes > 0 && <span className="text-[10px] text-orange-500">{v.pendientes} pendientes</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xl font-black text-brand">{v.total}</span>
                    <p className="text-[10px] text-gray-400">kits</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ranking por marca */}
        <div className="card p-0 overflow-hidden">
          <div className="px-5 py-3 bg-brand/5 border-b border-brand/10 flex items-center gap-2">
            <Tag size={15} className="text-brand" />
            <p className="font-bold text-gray-800 text-sm">Por marca / campaña</p>
          </div>
          {(analytics?.porMarca || []).length === 0 ? (
            <div className="py-10 text-center text-gray-400 text-sm">Sin datos aún — asigna marcas al crear kits</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {(analytics?.porMarca || []).map(m => {
                const pctM = m.total > 0 ? Math.round((m.entregados / m.total) * 100) : 0
                return (
                  <div key={m._id} className="px-5 py-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-sm font-semibold text-gray-800">{m._id}</p>
                      <span className="text-xs font-bold text-gray-500">{m.entregados}/{m.total}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-brand h-1.5 rounded-full" style={{ width: `${pctM}%` }} />
                    </div>
                    <div className="flex gap-3 mt-1">
                      <span className="text-[10px] text-green-600">{m.entregados} entregados</span>
                      {m.pendientes > 0 && <span className="text-[10px] text-orange-500">{m.pendientes} pendientes</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {(t.totalKits === 0) && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Gift size={48} className="mb-3 opacity-30" />
          <p className="font-medium">Sin kits creados aún</p>
          <p className="text-sm mt-1">Crea kits con marca y vendedor asignado para ver el análisis</p>
        </div>
      )}
    </div>
  )
}

function TabMovimientos() {
  const qc = useQueryClient()
  const [expandido, setExpandido] = useState(null)

  const { data: movimientos = [], isLoading } = useQuery({
    queryKey: ['merchandising-movimientos'],
    queryFn: () => api.get('/merchandising/movimientos'),
    refetchInterval: 15_000,
  })

  const mutDelete = useMutation({
    mutationFn: id => api.delete(`/merchandising/movimientos/${id}`),
    onSuccess: () => qc.invalidateQueries(['merchandising-movimientos']),
  })

  const fmtDate = (d) => {
    const dt = new Date(d)
    return dt.toLocaleDateString('es', { day: '2-digit', month: 'short' }) + ' ' +
           dt.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
  }

  const totalEntradas = movimientos.filter(m => m.tipo === 'entrada').reduce((s, m) => s + (m.costoTotal || 0), 0)
  const totalSalidas  = movimientos.filter(m => m.tipo === 'salida' || m.tipo === 'kit_entregado').reduce((s, m) => s + (m.costoTotal || 0), 0)

  if (isLoading) return <div className="py-20 text-center text-gray-400">Cargando…</div>

  if (!movimientos.length) return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
      <History size={48} className="mb-3 opacity-30" />
      <p className="font-medium">Sin movimientos aún</p>
      <p className="text-sm mt-1">Aquí aparecerán todas las entradas, salidas y kits entregados</p>
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Total movimientos"   value={movimientos.length} />
        <Stat label="Invertido (compras)" value={fmt(totalEntradas)} color="text-green-700" />
        <Stat label="Salidas valorizadas" value={fmt(totalSalidas)}  color="text-orange-600" />
      </div>

      <div className="card p-0 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="w-6 px-2 py-3" />
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipo</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Producto / Kit</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Cant.</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Destinatario</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Motivo</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Costo total</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Fecha</th>
              <th className="px-2 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {movimientos.map(m => {
              const s        = TIPO_STYLE[m.tipo] || TIPO_STYLE.salida
              const nombre   = m.kitNombre || m.itemNombre || '—'
              const esKit    = m.kitItems?.length > 0
              const abierto  = expandido === m._id
              return (
                <>
                <tr key={m._id}
                  onClick={() => esKit && setExpandido(abierto ? null : m._id)}
                  className={`transition-colors ${esKit ? 'cursor-pointer hover:bg-purple-50' : 'hover:bg-gray-50'} ${abierto ? 'bg-purple-50' : ''}`}>
                  <td className="px-2 py-3 text-center">
                    {esKit && (
                      <span className={`text-gray-400 transition-transform inline-block ${abierto ? 'rotate-90' : ''}`}>▶</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${s.bg} ${s.text}`}>{s.label}</span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800 text-xs">{nombre}</p>
                    {esKit && !abierto && (
                      <p className="text-[10px] text-purple-400 mt-0.5">
                        {m.kitItems.length} artículo{m.kitItems.length !== 1 ? 's' : ''} — clic para ver
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center font-semibold text-gray-700 text-sm">{m.cantidad}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{m.destinatario || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs max-w-[140px] truncate">{m.motivo || '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-700 text-xs">{fmt(m.costoTotal)}</td>
                  <td className="px-4 py-3 text-right text-[11px] text-gray-400 whitespace-nowrap">{fmtDate(m.createdAt)}</td>
                  <td className="px-2 py-3">
                    <button onClick={e => { e.stopPropagation(); if (confirm('¿Eliminar este movimiento?')) mutDelete.mutate(m._id) }}
                      className="p-1 text-gray-300 hover:text-red-500 transition-colors rounded">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
                {esKit && abierto && (
                  <tr key={`${m._id}-detalle`} className="bg-purple-50/60">
                    <td colSpan={9} className="px-6 pb-4 pt-1">
                      <div className="border border-purple-100 rounded-xl overflow-hidden">
                        <div className="bg-purple-100/60 px-4 py-2 flex items-center gap-2">
                          <Gift size={13} className="text-purple-600" />
                          <p className="text-xs font-bold text-purple-700">Composición del kit: {nombre}</p>
                        </div>
                        <div className="divide-y divide-purple-50">
                          {m.kitItems.map((ki, idx) => (
                            <div key={idx} className="flex items-center justify-between px-4 py-2.5">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <div className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" />
                                <p className="text-xs text-gray-700 font-medium truncate">{ki.nombre}</p>
                                {ki.talla && (
                                  <span className="text-[10px] font-bold bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full shrink-0">
                                    {ki.talla}
                                  </span>
                                )}
                                {ki.color && (
                                  <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full shrink-0">
                                    {ki.color}
                                  </span>
                                )}
                              </div>
                              <span className="text-xs font-bold text-purple-600 bg-purple-100 px-2.5 py-0.5 rounded-full ml-2 shrink-0">
                                ×{ki.cantidad}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="bg-purple-50 px-4 py-2 flex justify-between items-center border-t border-purple-100">
                          <p className="text-[10px] text-gray-400">
                            {m.cantidad > 1 ? `${m.cantidad} kits entregados` : '1 kit entregado'}
                            {m.destinatario ? ` · a: ${m.destinatario}` : ''}
                          </p>
                          <p className="text-[10px] text-gray-400">{fmtDate(m.createdAt)}</p>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Pestaña Por Tipo ────────────────────────────────────────────────────────
function TabPorTipo() {
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['merchandising', {}],
    queryFn: () => api.get('/merchandising'),
    refetchInterval: 30_000,
  })

  if (isLoading) return <div className="py-20 text-center text-gray-400">Cargando…</div>

  // Agrupar por subcategoria
  const grupos = {}
  items.forEach(it => {
    const key = (it.subcategoria || it.categoria || 'sin tipo').toLowerCase().trim()
    if (!grupos[key]) grupos[key] = { items: [], total: 0, colores: {}, tallas: {} }
    grupos[key].items.push(it)
    grupos[key].total += it.cantidad || 0
    // Colores
    const col = (it.color || '—').toLowerCase().trim()
    grupos[key].colores[col] = (grupos[key].colores[col] || 0) + (it.cantidad || 0)
    // Tallas
    if (it.talla) {
      const tal = it.talla.toUpperCase().trim()
      grupos[key].tallas[tal] = (grupos[key].tallas[tal] || 0) + (it.cantidad || 0)
    }
  })

  const sorted = Object.entries(grupos).sort((a, b) => b[1].total - a[1].total)
  const totalGlobal = items.reduce((s, it) => s + (it.cantidad || 0), 0)

  return (
    <div className="flex flex-col gap-4">
      {/* Resumen global */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total unidades"    value={totalGlobal} />
        <Stat label="Tipos distintos"   value={sorted.length} />
        <Stat label="Artículos totales" value={items.length} />
        <Stat label="Categorías"        value={[...new Set(items.map(i => i.categoria))].length} />
      </div>

      {/* Grid de tipos */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {sorted.map(([tipo, data]) => {
          const coloresOrdenados = Object.entries(data.colores).sort((a,b) => b[1]-a[1])
          const tallasOrdenadas  = Object.entries(data.tallas).sort((a,b) => b[1]-a[1])
          const tieneColores     = coloresOrdenados.length > 1 || (coloresOrdenados.length === 1 && coloresOrdenados[0][0] !== '—')
          const tieneTallas      = tallasOrdenadas.length > 0

          return (
            <div key={tipo} className="card p-0 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                <div>
                  <p className="font-bold text-gray-800 capitalize">{tipo}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {data.items.length} referencia{data.items.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-black text-brand">{data.total}</span>
                  <p className="text-[10px] text-gray-400">unidades</p>
                </div>
              </div>

              <div className="p-4 space-y-3">
                {/* Por color */}
                {tieneColores && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Por color</p>
                    <div className="flex flex-wrap gap-1.5">
                      {coloresOrdenados.map(([col, qty]) => (
                        <span key={col} className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded-lg text-xs">
                          <span className="text-gray-600 capitalize">{col}</span>
                          <span className="font-bold text-gray-800 ml-0.5">{qty}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Por talla */}
                {tieneTallas && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Por talla</p>
                    <div className="flex flex-wrap gap-1.5">
                      {tallasOrdenadas.map(([tal, qty]) => (
                        <span key={tal} className="flex items-center gap-1 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-lg text-xs">
                          <span className="font-bold text-indigo-600">{tal}</span>
                          <span className="text-gray-500">→ {qty}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Marcas presentes */}
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Marcas</p>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    {[...new Set(data.items.map(i => i.marca).filter(Boolean))].join(' · ') || '—'}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
const TABS = [
  { id: 'inventario',  label: 'Inventario',  icon: Package   },
  { id: 'portipo',     label: 'Por Tipo',    icon: Filter    },
  { id: 'marcas',      label: 'Por Marcas',  icon: Building2 },
  { id: 'kits',        label: 'Kits',        icon: Gift      },
  { id: 'analytics',   label: 'Analytics',   icon: Users     },
  { id: 'movimientos', label: 'Movimientos', icon: History   },
]

export default function MerchandisingPage() {
  const [tab, setTab]                 = useState('inventario')
  const [showNuevo, setShowNuevo]     = useState(false)
  const [showInforme, setShowInforme] = useState(false)
  const qc = useQueryClient()

  const { data: allItems = [] } = useQuery({
    queryKey: ['merchandising', {}],
    queryFn: () => api.get('/merchandising'),
  })

  return (
    <div className="flex flex-col h-full overflow-auto bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-brand/10 rounded-xl flex items-center justify-center">
            <ShirtIcon size={18} className="text-brand" />
          </div>
          <div>
            <h1 className="font-bold text-gray-800">Inventario Merchandising</h1>
            <p className="text-xs text-gray-400">Obsequios y artículos de marcas aliadas</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowInforme(true)}
            className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl border border-brand/30 text-brand hover:bg-brand/5 transition-colors">
            <FileText size={15} /> Generar informe
          </button>
          <button onClick={() => exportarExcel(allItems)}
            className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl border border-green-300 text-green-700 hover:bg-green-50 transition-colors">
            <FileDown size={15} /> Exportar Excel
          </button>
          {tab === 'inventario' && (
            <button onClick={() => setShowNuevo(true)} className="btn-primary flex items-center gap-2 text-sm">
              <Plus size={16} /> Nuevo producto
            </button>
          )}
        </div>
      </div>

      {showInforme && <ModalGenerarInforme items={allItems} onClose={() => setShowInforme(false)} />}

      <div className="bg-white border-b border-gray-100 px-6 flex gap-1 shrink-0">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            <t.icon size={15} />{t.label}
          </button>
        ))}
      </div>

      <div className="p-6 flex-1 overflow-auto">
        {tab === 'inventario'  && <TabInventario onNuevo={() => setShowNuevo(true)} />}
        {tab === 'marcas'      && <TabMarcas />}
        {tab === 'portipo'     && <TabPorTipo />}
        {tab === 'kits'        && <TabKits />}
        {tab === 'analytics'   && <TabAnalytics />}
        {tab === 'movimientos' && <TabMovimientos />}
      </div>

      {showNuevo && (
        <NuevoItemModal
          onClose={() => setShowNuevo(false)}
          onCreated={() => { qc.invalidateQueries(['merchandising']); qc.invalidateQueries(['merchandising-stats']) }}
        />
      )}
    </div>
  )
}
