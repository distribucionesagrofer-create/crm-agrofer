const router  = require('express').Router()
const { authenticate } = require('../middleware/auth')
const { getDatosComerciales } = require('../services/sistema-principal.service')
const Cache            = require('../models/AnalisisComercialCache')
const ProductoCatalogo  = require('../models/ProductoCatalogo')

router.use(authenticate)

// Recalcula las métricas de UN vendedor desde su `pedidosDetalle` crudo, aplicando (o no) un
// filtro de línea/artículo — es la única fuente de verdad: se usa tanto con filtro como sin él,
// para no mantener dos caminos de cálculo distintos que puedan desincronizarse entre sí.
function calcularVendedor(pedidosDetalle, { linea, codigo } = {}) {
  const hayFiltro = !!(linea || codigo)
  let valorPedidos = 0, totalArticulos = 0, totalPedidos = 0
  const clientes  = new Set()
  const prodMap   = {}
  const evolMap   = {}

  for (const p of (pedidosDetalle || [])) {
    // Sin filtro, TODO pedido cuenta — usando su `total` real, no la suma de sus líneas.
    // Algunos pedidos (ajustes, notas del sistema externo) llegan con `detalle` vacío; si
    // acá exigiéramos "al menos una línea que matchee" incluso sin filtro activo, esos
    // pedidos desaparecían de los totales generales sin ningún aviso. Con filtro sí aplica
    // ese requisito, y ahí el valor es la suma de las líneas que matchean (no el total del
    // pedido completo, que podría incluir otras líneas fuera del filtro).
    const lineasMatch = hayFiltro
      ? (p.detalle || []).filter(d => (!linea || d.linea === linea) && (!codigo || d.codigo === codigo))
      : (p.detalle || [])
    if (hayFiltro && !lineasMatch.length) continue

    totalPedidos++
    if (p.clienteId != null) clientes.add(p.clienteId)
    const valorEstePedido = hayFiltro ? lineasMatch.reduce((s, d) => s + d.valor, 0) : (p.total || 0)
    valorPedidos += valorEstePedido

    for (const d of lineasMatch) {
      totalArticulos += d.cantidad

      const key = d.codigo || d.nombre
      if (key) {
        if (!prodMap[key]) prodMap[key] = { codigo: d.codigo, nombre: d.nombre, linea: d.linea, cantidad: 0, valor: 0 }
        prodMap[key].cantidad += d.cantidad
        prodMap[key].valor    += d.valor
      }
    }

    if (p.fecha) {
      if (!evolMap[p.fecha]) evolMap[p.fecha] = { pedidos: 0, valor: 0 }
      evolMap[p.fecha].pedidos++
      evolMap[p.fecha].valor += valorEstePedido
    }
  }

  return {
    totalPedidos,
    valorPedidos,
    clientesImpactados: clientes.size,
    clientesIds: clientes,
    totalArticulos,
    productos: Object.values(prodMap).sort((a, b) => b.valor - a.valor).slice(0, 20),
    evolucion: Object.entries(evolMap).sort(([a], [b]) => a.localeCompare(b)).map(([dia, e]) => ({ dia, ...e })),
  }
}

// GET — leer desde MongoDB (instantáneo), con filtros opcionales ?linea=&codigo=
router.get('/', async (req, res) => {
  const cache = await Cache.findById('cache').lean()

  if (!cache || !cache.syncAt) {
    return res.json({ sinDatos: true, syncStatus: cache?.syncStatus || 'idle' })
  }

  const { linea, codigo } = req.query
  const hayFiltro = !!(linea || codigo)

  const vendedores = (cache.vendedores || []).map(v => {
    const calc = calcularVendedor(v.pedidosDetalle, { linea, codigo })
    return {
      nombre: v.nombre, terid: v.terid,
      totalPedidos: calc.totalPedidos, valorPedidos: calc.valorPedidos,
      clientesImpactados: calc.clientesImpactados, totalArticulos: calc.totalArticulos,
      productos: calc.productos, evolucion: calc.evolucion,
    }
  })

  const totalPedidos = vendedores.reduce((s, v) => s + v.totalPedidos, 0)
  const valorPedidos = vendedores.reduce((s, v) => s + v.valorPedidos, 0)
  const totalArticulos = vendedores.reduce((s, v) => s + v.totalArticulos, 0)

  // Clientes impactados globales = únicos de verdad (no la suma de los de cada vendedor —
  // un mismo cliente no debería contarse dos veces si por algún motivo aparece en más de uno).
  const clientesGlobales = new Set()
  for (const v of cache.vendedores || []) {
    const calc = calcularVendedor(v.pedidosDetalle, { linea, codigo })
    for (const id of calc.clientesIds) clientesGlobales.add(id)
  }

  const prodMap = {}
  for (const v of vendedores) {
    for (const p of (v.productos || [])) {
      if (!prodMap[p.codigo]) prodMap[p.codigo] = { ...p }
      else { prodMap[p.codigo].cantidad += p.cantidad; prodMap[p.codigo].valor += p.valor }
    }
  }
  const topProductos = Object.values(prodMap).sort((a, b) => b.valor - a.valor).slice(0, 10)

  const evolMap = {}
  for (const v of vendedores) {
    for (const e of (v.evolucion || [])) {
      if (!evolMap[e.dia]) evolMap[e.dia] = { pedidos: 0, valor: 0 }
      evolMap[e.dia].pedidos += e.pedidos
      evolMap[e.dia].valor   += e.valor
    }
  }
  const evolucion = Object.entries(evolMap).sort(([a], [b]) => a.localeCompare(b)).map(([dia, e]) => ({ dia, ...e }))

  res.json({
    fechaDesde: cache.fechaDesde,
    fechaHasta: cache.fechaHasta,
    vendedores: vendedores.sort((a, b) => b.valorPedidos - a.valorPedidos),
    topProductos, evolucion,
    totalPedidos, valorPedidos,
    clientesImpactados: clientesGlobales.size,
    totalArticulos,
    filtro: hayFiltro ? { linea: linea || null, codigo: codigo || null } : null,
    syncAt: cache.syncAt,
    syncStatus: cache.syncStatus,
    fromCache: true,
  })
})

// GET /filtros — líneas disponibles y, si se pasa ?linea=X, los artículos de esa línea —
// alimenta los dos selects del frontend. Consulta directa a ProductoCatalogo, sin tocar
// la caché de ventas ni la API externa — es instantáneo.
router.get('/filtros', async (req, res) => {
  const lineas = await ProductoCatalogo.distinct('linea', { linea: { $ne: '' } })
  lineas.sort()

  let articulos = []
  if (req.query.linea) {
    const productos = await ProductoCatalogo.find({ linea: req.query.linea }, 'codigo descripcion').sort('codigo').lean()
    articulos = productos.map(p => ({ codigo: p.codigo, descripcion: p.descripcion }))
  }

  res.json({ lineas, articulos })
})

// GET /status — estado del sync
router.get('/status', async (req, res) => {
  const cache = await Cache.findById('cache', 'syncStatus syncAt syncError').lean()
  res.json(cache || { syncStatus: 'idle', syncAt: null })
})

// POST /sync — lanzar sincronización en background
router.post('/sync', async (req, res) => {
  const cache = await Cache.findById('cache').lean()
  if (cache?.syncStatus === 'syncing') {
    return res.json({ ok: false, message: 'Ya hay una sincronización en curso' })
  }

  const hoy = new Date().toISOString().slice(0, 10)
  const fechaHasta = req.body.fechaHasta || hoy
  const fechaDesde = req.body.fechaDesde || `${hoy.slice(0, 7)}-01`

  // Marcar como syncing
  await Cache.findOneAndUpdate(
    { _id: 'cache' },
    { $set: { syncStatus: 'syncing', syncError: '' } },
    { upsert: true }
  )

  res.json({ ok: true, message: 'Sincronización iniciada en background', fechaDesde, fechaHasta })

  // Procesar en background — NO bloquea la respuesta. Solo se guarda `vendedores` (con su
  // `pedidosDetalle` crudo) — los totales/rankings/top productos se calculan siempre al
  // vuelo en GET / vía `calcularVendedor`, para no mantener dos caminos de cálculo que
  // puedan desincronizarse (guardar un totalPedidos/valorPedidos pre-agregado acá quedaba
  // sin usar y con una definición distinta a la que de verdad se muestra en pantalla).
  ;(async () => {
    try {
      console.log(`[Análisis] Sincronizando ${fechaDesde} → ${fechaHasta}`)
      const vendedores = await getDatosComerciales(fechaDesde, fechaHasta)
      const totalPedidos = vendedores.reduce((s, v) => s + v.totalPedidos, 0)

      await Cache.findOneAndUpdate(
        { _id: 'cache' },
        { $set: { fechaDesde, fechaHasta, vendedores: vendedores.sort((a, b) => b.valorPedidos - a.valorPedidos), syncAt: new Date(), syncStatus: 'done', syncError: '' } },
        { upsert: true }
      )
      console.log(`[Análisis] Sync completado: ${totalPedidos} pedidos`)
    } catch (e) {
      console.error('[Análisis] Sync error:', e.message)
      await Cache.findOneAndUpdate({ _id: 'cache' }, { $set: { syncStatus: 'error', syncError: e.message } }, { upsert: true })
    }
  })()
})

module.exports = router
