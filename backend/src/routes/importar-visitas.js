const router  = require('express').Router()
const Customer = require('../models/Customer')
const Tenant   = require('../models/Tenant')
const { authenticate } = require('../middleware/auth')

router.use(authenticate)

// Parsear coordenadas del campo ubicacion: "7.8834,-72.5396"
function parseCoordenadas(ubicacion) {
  if (!ubicacion) return { lat: null, lng: null }
  const str = String(ubicacion).trim()
  const m = str.match(/(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)/)
  if (!m) return { lat: null, lng: null }
  return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) }
}

// Limpiar nombre del representante: "06.ARNOLD JOSE GARAVITO" → "ARNOLD JOSE GARAVITO"
function limpiarRepresentante(rep) {
  if (!rep) return ''
  return String(rep).replace(/^\d+\.?\s*/, '').trim().toUpperCase()
}

// Buscar el vendedor más cercano en la BD (match por apellido o nombre parcial)
function matchVendedor(repNombre, vendedores) {
  if (!repNombre) return null
  const palabras = repNombre.split(' ').filter(p => p.length > 3)
  let mejorMatch = null, mejorPuntaje = 0
  for (const v of vendedores) {
    const nombreV = v.nombre.toUpperCase()
    let puntaje = 0
    for (const p of palabras) {
      if (nombreV.includes(p)) puntaje++
    }
    if (puntaje > mejorPuntaje) { mejorPuntaje = puntaje; mejorMatch = v }
  }
  return mejorPuntaje >= 1 ? mejorMatch : null
}

// POST /api/importar-visitas/preview — analizar sin guardar
router.post('/preview', async (req, res) => {
  const { filas } = req.body  // array de objetos del Excel
  if (!Array.isArray(filas) || !filas.length) {
    return res.status(400).json({ error: 'Sin datos' })
  }

  const vendedores = await Tenant.find({ activo: true }).lean()

  // Deduplicar: mismo cliente = mismo nombrecliente + establecimiento
  // Si aparece con 2 vendedores → quedarse con la visita más reciente
  // Función helper para buscar campo con cualquier capitalización
  function getField(row, ...keys) {
    const rowLower = {}
    for (const k of Object.keys(row)) rowLower[k.toLowerCase().replace(/\s+/g,'_')] = row[k]
    for (const key of keys) {
      const v = rowLower[key.toLowerCase()]
      if (v !== undefined && v !== null && v !== '') return String(v).trim()
    }
    return ''
  }

  const mapaClientes = {}
  for (const f of filas) {
    const nombre  = getField(f, 'nombrecliente', 'nombre_cliente', 'cliente', 'nombre').toUpperCase()
    const empresa = getField(f, 'establecimiento', 'negocio', 'empresa')

    // Solo saltar filas completamente vacías (sin nombre Y sin establecimiento)
    if (!nombre && !empresa) continue

    // Clave de deduplicación: nombre + establecimiento tal como vienen del Excel
    const key = `${nombre}|${empresa}`

    const fecha = getField(f, 'fecha_visita', 'fecha', 'fecha_visita_registro')
    const fechaActual = mapaClientes[key]?.fecha || ''

    if (!mapaClientes[key] || fecha > fechaActual) {
      const repRaw  = getField(f, 'representante', 'vendedor', 'agente')
      const repLimp = limpiarRepresentante(repRaw)
      const vendedor = matchVendedor(repLimp, vendedores.filter(v => v.slug !== 'linea-principal'))
      const coords  = parseCoordenadas(getField(f, 'ubicacion', 'coordenadas', 'posicion'))

      mapaClientes[key] = {
        nombre,
        empresa,
        ciudad:   getField(f, 'ciudad', 'municipio'),
        barrio:   getField(f, 'barrio', 'sector'),
        depto:    getField(f, 'departamento', 'depto'),
        lat:      coords.lat,
        lng:      coords.lng,
        repRaw,
        repLimp,
        vendedorId:    vendedor?._id || null,
        vendedorNombre:vendedor?.nombre || null,
        fecha,
        ultimaVisita:  fecha,
      }
    }
  }

  const lista = Object.values(mapaClientes)

  // Verificar cuáles ya existen en BD
  const existentes = await Customer.find({
    name: { $in: lista.map(c => c.nombre) }
  }).lean()
  const setExistentes = new Set(existentes.map(e => e.name.toUpperCase()))

  const nuevos     = lista.filter(c => !setExistentes.has(c.nombre))
  const actualizar = lista.filter(c =>  setExistentes.has(c.nombre))

  // Resumen de vendedores detectados
  const vendedoresDetectados = {}
  for (const c of lista) {
    if (c.repLimp) {
      vendedoresDetectados[c.repLimp] = {
        original:  c.repRaw,
        limpio:    c.repLimp,
        vendedorId:    c.vendedorId,
        vendedorNombre:c.vendedorNombre,
        count: (vendedoresDetectados[c.repLimp]?.count || 0) + 1,
      }
    }
  }

  res.json({
    totalFilas:  filas.length,
    clientesUnicos: lista.length,
    nuevos:      nuevos.length,
    actualizar:  actualizar.length,
    conCoordenadas: lista.filter(c => c.lat && c.lng).length,
    vendedoresDetectados: Object.values(vendedoresDetectados),
    muestra:     lista.slice(0, 10),
  })
})

// POST /api/importar-visitas/confirmar — guardar en BD
router.post('/confirmar', async (req, res) => {
  const { filas, mapeoVendedores } = req.body
  // mapeoVendedores: { "REP_LIMPIO": vendedorId } — el usuario puede corregir el mapeo
  if (!Array.isArray(filas) || !filas.length) {
    return res.status(400).json({ error: 'Sin datos' })
  }

  const vendedores = await Tenant.find({ activo: true }).lean()

  // Helper seguro: siempre devuelve string
  const s = (v) => String(v == null ? '' : v).trim()
  const getLow = (row, ...keys) => {
    const low = {}
    for (const k of Object.keys(row)) low[k.toLowerCase().replace(/\s+/g,'_')] = row[k]
    for (const k of keys) { const v = low[k.toLowerCase()]; if (v != null && v !== '') return s(v) }
    return ''
  }

  const mapaClientes = {}
  for (const f of filas) {
    const nombre  = getLow(f,'nombrecliente','nombre_cliente','cliente','nombre').toUpperCase()
    const empresa = getLow(f,'establecimiento','negocio','empresa')
    if (!nombre && !empresa) continue
    const key   = `${nombre}|${empresa}`
    const fecha = getLow(f,'fecha_visita','fecha','fecha_visita_registro')

    const repLimp  = limpiarRepresentante(getLow(f,'representante','vendedor','agente'))
    const vendedorId = mapeoVendedores?.[repLimp] ||
      matchVendedor(repLimp, vendedores.filter(v => v.slug !== 'linea-principal'))?._id || null
    const vendedor = vendedores.find(v => v._id?.toString() === vendedorId?.toString())
    const coords   = parseCoordenadas(getLow(f,'ubicacion','coordenadas','posicion'))

    if (!mapaClientes[key]) {
      // Primera vez que vemos este cliente — crear entrada
      mapaClientes[key] = {
        name:      nombre,
        empresa,   // siempre guardar el establecimiento tal como viene
        ciudad:    getLow(f,'ciudad','municipio'),
        barrio:    getLow(f,'barrio','sector'),
        zona:      vendedor?.zona || '',  // zona del vendedor asignado
        vendedorId,
        lat:       coords.lat,
        lng:       coords.lng,
        fechaMax:  fecha,  // acumular fecha más reciente
        lastContactAt: fecha ? new Date(fecha) : null,
        importado: true,
      }
    } else {
      // Cliente ya visto — actualizar SOLO si la fecha es más reciente
      if (fecha > (mapaClientes[key].fechaMax || '')) {
        mapaClientes[key].fechaMax      = fecha
        mapaClientes[key].lastContactAt = fecha ? new Date(fecha) : null
        mapaClientes[key].vendedorId    = vendedorId  // actualizar al vendedor más reciente
        mapaClientes[key].zona          = vendedor?.zona || mapaClientes[key].zona
        if (coords.lat && coords.lng) {
          mapaClientes[key].lat = coords.lat
          mapaClientes[key].lng = coords.lng
        }
      }
    }
  }

  const lista = Object.values(mapaClientes)
  let creados = 0, actualizados = 0, errores = 0

  for (const c of lista) {
    try {
      // Buscar cliente existente por nombre (para importados del reporte)
      let cliente = await Customer.findOne({ name: c.name })

      if (cliente) {
        // Actualizar datos existentes — solo sobreescribir lastContactAt si es más reciente
        const upd = { importado: true }
        if (c.empresa)   upd.empresa = c.empresa
        if (c.ciudad)    upd.ciudad  = c.ciudad
        if (c.barrio)    upd.barrio  = c.barrio
        if (c.zona)      upd.zona    = c.zona
        if (c.lat && c.lng) { upd.lat = c.lat; upd.lng = c.lng }
        if (c.vendedorId)   upd.vendedorId = c.vendedorId
        // Solo actualizar lastContactAt si es más reciente que la existente
        if (c.lastContactAt && (!cliente.lastContactAt || c.lastContactAt > cliente.lastContactAt)) {
          upd.lastContactAt = c.lastContactAt
        }
        await Customer.findByIdAndUpdate(cliente._id, { $set: upd })
        actualizados++
      } else {
        // Crear nuevo — sin phone para no violar índice único
        const nuevo = { name: c.name || '', importado: true }
        if (c.empresa)   nuevo.empresa = c.empresa
        if (c.ciudad)    nuevo.ciudad  = c.ciudad
        if (c.barrio)    nuevo.barrio  = c.barrio
        if (c.zona)      nuevo.zona    = c.zona
        if (c.lat && c.lng)  { nuevo.lat = c.lat; nuevo.lng = c.lng }
        if (c.vendedorId)    nuevo.vendedorId = c.vendedorId
        if (c.lastContactAt) nuevo.lastContactAt = c.lastContactAt
        await Customer.create(nuevo)
        creados++
      }
    } catch (e) {
      errores++
      console.error('Error importando cliente:', c.name, e.message)
    }
  }

  res.json({ ok: true, creados, actualizados, errores, total: lista.length })
})

module.exports = router
