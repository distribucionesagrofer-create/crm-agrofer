const router  = require('express').Router()
const Producto = require('../models/ProductoCatalogo')
const { authenticate } = require('../middleware/auth')
const { spPost } = require('../services/sistema-principal.service')

router.use(authenticate)

// El sistema principal entrega FOTO_URL como ruta local de Windows del servidor
// (ej: "T:\productosImagenes\01.01.0001.png"), pero su propio dominio sí sirve esas
// mismas imágenes por HTTP público — la app oficial (AgroferSis.apk, decompilada con
// JADX) arma la URL real tomando el texto desde "productosImagenes" en adelante,
// cambiando \ por /, y pegándolo a esta base:
const IMG_BASE = 'https://agrofer.link/sistemas/vistas/img/productos/'

function resolveFotoUrl(fotoUrlRaw) {
  const raw = (fotoUrlRaw || '').trim()
  if (!raw) return ''
  if (raw.startsWith('http')) return raw
  const idx = raw.indexOf('productosImagenes')
  if (idx === -1) return ''
  return IMG_BASE + raw.slice(idx).replace(/\\/g, '/')
}

// GET /api/productos-catalogo — listar con filtros
router.get('/', async (req, res) => {
  const { search, linea, page = 1, limit = 50, conStock } = req.query
  const query = { activo: true }

  if (linea)  query.linea = linea
  if (conStock === 'true') query.existencia = { $gt: 0 }

  if (search) {
    const re = { $regex: search, $options: 'i' }
    query.$or = [{ descripcion: re }, { codigo: re }, { referencia: re }]
  }

  const skip  = (parseInt(page) - 1) * parseInt(limit)
  const [productos, total] = await Promise.all([
    Producto.find(query).sort({ linea: 1, descripcion: 1 }).skip(skip).limit(parseInt(limit)).lean(),
    Producto.countDocuments(query),
  ])

  // Líneas disponibles para el filtro
  const lineas = await Producto.distinct('linea', { activo: true }).then(l => l.sort())

  res.json({ productos, total, page: parseInt(page), lineas })
})

// GET /api/productos-catalogo/stats — estadísticas rápidas
router.get('/stats', async (req, res) => {
  const [total, conStock, lineas] = await Promise.all([
    Producto.countDocuments({ activo: true }),
    Producto.countDocuments({ activo: true, existencia: { $gt: 0 } }),
    Producto.distinct('linea', { activo: true }),
  ])
  res.json({ total, conStock, totalLineas: lineas.length })
})

// POST /api/productos-catalogo/sync — sincronizar desde sistema principal
router.post('/sync', async (req, res) => {
  try {
    // Traer todos con paginación
    let offset = 0, todos = [], cont = true
    while (cont) {
      const resp = await spPost({ action: 'get_productos', vendedor_id: '61132', usuario_id: '3', perfil: 'Administrador', offset })
      const items = resp?.data || []
      todos = todos.concat(items)
      cont  = items.length === 100
      offset += 100
    }

    let creados = 0, actualizados = 0

    for (const p of todos) {
      const update = {
        codigo:       (p.CODIGO || '').trim(),
        referencia:   (p.REFERENCIA  || '').trim(),
        descripcion:  (p.DESCRIPCION || '').trim(),
        linea:        (p.LINEA       || '').trim(),
        precio:       parseFloat(p.PRECIO)       || 0,
        iva:          parseFloat(p.IVA)           || 0,
        ultCosto:     parseFloat(p.ULTCOSTO)      || 0,
        promCosto:    parseFloat(p.PROMCOST)      || 0,
        porcUtilidad: parseFloat(p.PORCUTILIDAD)  || 0,
        existencia:   parseFloat(p.EXISTENCIA)    || 0,
        unidad:       (p.UNIDAD || 'UND').trim(),
        peso:         parseFloat(p.PESO)          || 0,
        factor:       parseFloat(p.FACTOR)        || 0,
        fotoUrl:      resolveFotoUrl(p.FOTO_URL),
        activo:       true,
      }

      const existing = await Producto.findOne({ idSistemaPrincipal: p.ID })
      if (existing) {
        await Producto.findByIdAndUpdate(existing._id, { $set: update })
        actualizados++
      } else {
        await Producto.create({ idSistemaPrincipal: p.ID, ...update })
        creados++
      }
    }

    console.log(`[Productos] Sync completo: ${creados} creados, ${actualizados} actualizados`)
    res.json({ ok: true, total: todos.length, creados, actualizados })
  } catch (e) {
    console.error('[Productos Sync]', e.message)
    res.status(500).json({ error: e.message })
  }
})

module.exports = router
