const express = require('express')
const router  = express.Router()
const path    = require('path')
const fs      = require('fs')
const { authenticate: auth } = require('../middleware/auth')
const MerchandisingItem      = require('../models/MerchandisingItem')
const MerchandisingKit       = require('../models/MerchandisingKit')
const MerchandisingMovimiento = require('../models/MerchandisingMovimiento')
const { analyzeMerchandisingImage } = require('../services/ai.service')

function guardarImagenBase64(base64, mimetype, prefijo = 'merch') {
  const uploadsDir = path.join(__dirname, '../../uploads')
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })
  const ext      = (mimetype || 'image/jpeg').split('/')[1]?.split(';')[0] || 'jpg'
  const fileName = `${prefijo}_${Date.now()}.${ext}`
  fs.writeFileSync(path.join(uploadsDir, fileName), Buffer.from(base64, 'base64'))
  return `/media/${fileName}`
}

// GET /api/merchandising
router.get('/', auth, async (req, res) => {
  const { marca, categoria, talla, search, esFamilia } = req.query
  const q = { activo: true }
  if (marca)      q.marca      = { $regex: marca, $options: 'i' }
  if (categoria)  q.categoria  = categoria
  if (talla)      q.talla      = { $regex: talla, $options: 'i' }
  if (esFamilia !== undefined) q.esFamilia = esFamilia === 'true'
  if (search)    q.$or = [
    { nombre:       { $regex: search, $options: 'i' } },
    { marca:        { $regex: search, $options: 'i' } },
    { subcategoria: { $regex: search, $options: 'i' } },
    { descripcion:  { $regex: search, $options: 'i' } },
  ]
  const items = await MerchandisingItem.find(q).sort({ createdAt: -1 })
  res.json(items)
})

// GET /api/merchandising/stats
router.get('/stats', auth, async (req, res) => {
  const [marcas, categorias, totales] = await Promise.all([
    MerchandisingItem.aggregate([
      { $match: { activo: true } },
      { $group: { _id: { $concat: [{ $toUpper: { $substrCP: ['$marca', 0, 1] } }, { $substrCP: ['$marca', 1, 999] }] }, total: { $sum: '$cantidad' }, items: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]),
    MerchandisingItem.aggregate([
      { $match: { activo: true } },
      { $group: { _id: '$categoria', total: { $sum: '$cantidad' } } },
      { $sort: { total: -1 } },
    ]),
    MerchandisingItem.aggregate([
      { $match: { activo: true } },
      { $group: {
        _id: null,
        totalItems: { $sum: 1 },
        totalUnidades: { $sum: '$cantidad' },
        totalInvertido: { $sum: { $multiply: ['$cantidad', { $ifNull: ['$costo', 0] }] } },
      }},
    ]),
  ])
  res.json({ marcas, categorias, totales: totales[0] || { totalItems: 0, totalUnidades: 0, totalInvertido: 0 } })
})

// GET /api/merchandising/movimientos
router.get('/movimientos', auth, async (req, res) => {
  const movimientos = await MerchandisingMovimiento.find({}).sort({ createdAt: -1 }).limit(500)
  res.json(movimientos)
})

// DELETE /api/merchandising/movimientos/:id
router.delete('/movimientos/:id', auth, async (req, res) => {
  await MerchandisingMovimiento.findByIdAndDelete(req.params.id)
  res.json({ ok: true })
})

// POST /api/merchandising/analizar-imagen
router.post('/analizar-imagen', auth, async (req, res) => {
  const { imagenUrl } = req.body
  if (!imagenUrl) return res.status(400).json({ error: 'imagenUrl requerida' })
  const datos = await analyzeMerchandisingImage(imagenUrl)
  res.json(datos)
})

// POST /api/merchandising
router.post('/', auth, async (req, res) => {
  const { imagenBase64, imagenMimetype, ...rest } = req.body
  if (imagenBase64) rest.imagenUrl = guardarImagenBase64(imagenBase64, imagenMimetype)
  const item = await MerchandisingItem.create(rest)
  res.status(201).json(item)
})

// PATCH /api/merchandising/:id
router.patch('/:id', auth, async (req, res) => {
  const { imagenBase64, imagenMimetype, ...rest } = req.body
  if (imagenBase64) rest.imagenUrl = guardarImagenBase64(imagenBase64, imagenMimetype)
  const item = await MerchandisingItem.findByIdAndUpdate(req.params.id, rest, { new: true, runValidators: true })
  if (!item) return res.status(404).json({ error: 'No encontrado' })
  res.json(item)
})

// PATCH /api/merchandising/:id/cantidad
router.patch('/:id/cantidad', auth, async (req, res) => {
  const { delta } = req.body
  if (typeof delta !== 'number') return res.status(400).json({ error: 'delta requerido' })
  const item = await MerchandisingItem.findByIdAndUpdate(
    req.params.id,
    { $inc: { cantidad: delta } },
    { new: true }
  )
  if (!item) return res.status(404).json({ error: 'No encontrado' })
  res.json(item)
})

// POST /api/merchandising/:id/entrada — registrar compra/entrada de stock
router.post('/:id/entrada', auth, async (req, res) => {
  const { cantidad, motivo, costoUnit = 0 } = req.body
  if (!cantidad || cantidad <= 0) return res.status(400).json({ error: 'Cantidad inválida' })
  const update = { $inc: { cantidad } }
  if (costoUnit > 0) update.costo = costoUnit
  const item = await MerchandisingItem.findByIdAndUpdate(req.params.id, update, { new: true })
  if (!item) return res.status(404).json({ error: 'Item no encontrado' })
  await MerchandisingMovimiento.create({
    tipo: 'entrada',
    itemId: item._id,
    itemNombre: item.nombre,
    cantidad,
    motivo: motivo || 'Entrada de inventario',
    costoUnit,
    costoTotal: cantidad * costoUnit,
  })
  res.json(item)
})

// POST /api/merchandising/:id/salida — registrar entrega/salida de stock
router.post('/:id/salida', auth, async (req, res) => {
  const { cantidad, destinatario, motivo } = req.body
  if (!cantidad || cantidad <= 0) return res.status(400).json({ error: 'Cantidad inválida' })
  const item = await MerchandisingItem.findById(req.params.id)
  if (!item) return res.status(404).json({ error: 'Item no encontrado' })
  if (item.cantidad < cantidad) return res.status(400).json({ error: `Stock insuficiente. Disponible: ${item.cantidad}` })
  item.cantidad -= cantidad
  await item.save()
  await MerchandisingMovimiento.create({
    tipo: 'salida',
    itemId: item._id,
    itemNombre: item.nombre,
    cantidad,
    destinatario: destinatario || '',
    motivo: motivo || 'Salida de inventario',
    costoUnit: item.costo || 0,
    costoTotal: cantidad * (item.costo || 0),
  })
  res.json(item)
})

// POST /api/merchandising/:id/imagenes — agregar fotos a la galería
router.post('/:id/imagenes', auth, async (req, res) => {
  const { imagenesBase64 = [] } = req.body
  if (!imagenesBase64.length) return res.status(400).json({ error: 'Sin imágenes' })
  const item = await MerchandisingItem.findById(req.params.id)
  if (!item) return res.status(404).json({ error: 'No encontrado' })
  const nuevas = imagenesBase64.map(img => ({
    url:  guardarImagenBase64(img.base64, img.mimetype, 'merch'),
    nota: img.nota || '',
  }))
  item.imagenes = [...(item.imagenes || []), ...nuevas]
  await item.save()
  res.json(item)
})

// DELETE /api/merchandising/:id/imagenes/:imgId — quitar foto de galería
router.delete('/:id/imagenes/:imgId', auth, async (req, res) => {
  await MerchandisingItem.findByIdAndUpdate(req.params.id, {
    $pull: { imagenes: { _id: req.params.imgId } },
  })
  res.json({ ok: true })
})

// DELETE /api/merchandising/:id
router.delete('/:id', auth, async (req, res) => {
  await MerchandisingItem.findByIdAndDelete(req.params.id)
  res.json({ ok: true })
})

// ── KITS ──────────────────────────────────────────────────────────────────────

// GET /api/merchandising/kits/analytics — stats para el dashboard de merchandising
router.get('/kits/analytics', auth, async (req, res) => {
  const [porVendedor, porMarca, totales] = await Promise.all([
    MerchandisingKit.aggregate([
      { $match: { activo: true } },
      { $group: {
        _id: '$vendedorNombre',
        total:      { $sum: 1 },
        entregados: { $sum: { $cond: ['$entregado', 1, 0] } },
        pendientes: { $sum: { $cond: ['$entregado', 0, 1] } },
        ultimoAt:   { $max: '$entregadoEn' },
      }},
      { $match: { _id: { $ne: '' } } },
      { $sort: { entregados: -1 } },
    ]),
    MerchandisingKit.aggregate([
      { $match: { activo: true, marca: { $ne: '' } } },
      { $group: {
        _id: '$marca',
        total:      { $sum: 1 },
        entregados: { $sum: { $cond: ['$entregado', 1, 0] } },
        pendientes: { $sum: { $cond: ['$entregado', 0, 1] } },
      }},
      { $sort: { total: -1 } },
    ]),
    MerchandisingKit.aggregate([
      { $match: { activo: true } },
      { $group: {
        _id: null,
        totalKits:       { $sum: 1 },
        totalEntregados: { $sum: { $cond: ['$entregado', 1, 0] } },
        totalPendientes: { $sum: { $cond: ['$entregado', 0, 1] } },
        clientesImpactados: { $addToSet: '$clienteId' },
        vendedoresActivos:  { $addToSet: '$vendedorId' },
      }},
    ]),
  ])
  const t = totales[0] || { totalKits: 0, totalEntregados: 0, totalPendientes: 0, clientesImpactados: [], vendedoresActivos: [] }
  res.json({
    porVendedor,
    porMarca,
    totales: {
      totalKits:       t.totalKits,
      totalEntregados: t.totalEntregados,
      totalPendientes: t.totalPendientes,
      clientesImpactados: (t.clientesImpactados || []).filter(Boolean).length,
      vendedoresActivos:  (t.vendedoresActivos  || []).filter(Boolean).length,
    },
  })
})

// GET /api/merchandising/kits
router.get('/kits', auth, async (req, res) => {
  const { vendedorId, marca, entregado } = req.query
  const q = { activo: true }
  if (vendedorId) q.vendedorId = vendedorId
  if (marca)      q.marca = { $regex: marca, $options: 'i' }
  if (entregado !== undefined) q.entregado = entregado === 'true'
  const kits = await MerchandisingKit.find(q)
    .populate('items.item')
    .sort({ createdAt: -1 })
  res.json(kits)
})

// POST /api/merchandising/kits
router.post('/kits', auth, async (req, res) => {
  const kit = await MerchandisingKit.create(req.body)
  const populated = await MerchandisingKit.findById(kit._id).populate('items.item')
  res.status(201).json(populated)
})

// PATCH /api/merchandising/kits/:id
router.patch('/kits/:id', auth, async (req, res) => {
  const kit = await MerchandisingKit.findByIdAndUpdate(req.params.id, req.body, { new: true }).populate('items.item')
  if (!kit) return res.status(404).json({ error: 'Kit no encontrado' })
  res.json(kit)
})

// POST /api/merchandising/kits/:id/entregar — descontar stock y registrar entrega
router.post('/kits/:id/entregar', auth, async (req, res) => {
  const {
    cantidad = 1, evidenciasBase64 = [],
    clienteId, clienteNombre, clientePhone,
    vendedorId, vendedorNombre, notas,
  } = req.body

  const kit = await MerchandisingKit.findById(req.params.id).populate('items.item')
  if (!kit) return res.status(404).json({ error: 'Kit no encontrado' })

  for (const linea of kit.items) {
    if (!linea.item) return res.status(400).json({ error: 'Un componente del kit ya no existe en inventario' })
    const necesario = linea.cantidad * cantidad
    if (linea.item.cantidad < necesario) {
      return res.status(400).json({ error: `Stock insuficiente de: ${linea.item.nombre}. Disponible: ${linea.item.cantidad}, necesario: ${necesario}` })
    }
  }

  await Promise.all(kit.items.map(l =>
    MerchandisingItem.findByIdAndUpdate(l.item._id, { $inc: { cantidad: -(l.cantidad * cantidad) } })
  ))

  const evidencias = evidenciasBase64.map(ev => ({
    url:  guardarImagenBase64(ev.base64, ev.mimetype, 'evid'),
    nota: ev.nota || '',
  }))

  const destinatario = clienteNombre || kit.clienteNombre || ''
  await MerchandisingMovimiento.create({
    tipo: 'kit_entregado',
    kitId: kit._id,
    kitNombre: kit.nombre,
    kitItems: kit.items.map(l => ({
      itemId:   l.item._id,
      nombre:   l.item.nombre,
      talla:    l.item.talla  || '',
      color:    l.item.color  || '',
      marca:    l.item.marca  || '',
      cantidad: l.cantidad * cantidad,
    })),
    cantidad,
    destinatario,
    motivo: `Kit entregado a ${destinatario} por ${vendedorNombre || kit.vendedorNombre || '—'}`,
    evidencias,
  })

  await MerchandisingKit.findByIdAndUpdate(req.params.id, {
    entregado:     true,
    entregadoEn:   new Date(),
    ...(clienteId     && { clienteId }),
    ...(clienteNombre && { clienteNombre }),
    ...(clientePhone  && { clientePhone }),
    ...(vendedorId    && { vendedorId }),
    ...(vendedorNombre && { vendedorNombre }),
    ...(notas         && { notas }),
    $push: { evidencias: { $each: evidencias } },
  })

  res.json({ ok: true })
})

// POST /api/merchandising/kits/:id/evidencias — agregar fotos después de haber entregado
router.post('/kits/:id/evidencias', auth, async (req, res) => {
  const { evidenciasBase64 = [] } = req.body
  if (!evidenciasBase64.length) return res.status(400).json({ error: 'Sin imágenes' })
  const kit = await MerchandisingKit.findById(req.params.id)
  if (!kit) return res.status(404).json({ error: 'Kit no encontrado' })
  const nuevas = evidenciasBase64.map(ev => ({
    url:  guardarImagenBase64(ev.base64, ev.mimetype, 'evid'),
    nota: ev.nota || '',
  }))
  await MerchandisingKit.findByIdAndUpdate(req.params.id, {
    $push: { evidencias: { $each: nuevas } },
  })
  res.json({ ok: true, evidencias: nuevas })
})

// DELETE /api/merchandising/kits/:id/evidencias/:evidenciaId
router.delete('/kits/:id/evidencias/:eid', auth, async (req, res) => {
  await MerchandisingKit.findByIdAndUpdate(req.params.id, {
    $pull: { evidencias: { _id: req.params.eid } },
  })
  res.json({ ok: true })
})

// POST /api/merchandising/kits/:id/devolver — devolver kit al stock
router.post('/kits/:id/devolver', auth, async (req, res) => {
  const { destinatario, motivo, cantidad = 1 } = req.body
  const kit = await MerchandisingKit.findById(req.params.id).populate('items.item')
  if (!kit) return res.status(404).json({ error: 'Kit no encontrado' })

  await Promise.all(kit.items.map(l =>
    MerchandisingItem.findByIdAndUpdate(l.item._id, { $inc: { cantidad: l.cantidad * cantidad } })
  ))

  await MerchandisingMovimiento.create({
    tipo: 'kit_devuelto',
    kitId: kit._id,
    kitNombre: kit.nombre,
    kitItems: kit.items.map(l => ({
      itemId:   l.item._id,
      nombre:   l.item.nombre,
      talla:    l.item.talla  || '',
      color:    l.item.color  || '',
      marca:    l.item.marca  || '',
      cantidad: l.cantidad * cantidad,
    })),
    cantidad,
    destinatario: destinatario || '',
    motivo: motivo || 'Kit devuelto al stock',
  })

  await MerchandisingKit.findByIdAndUpdate(req.params.id, {
    entregado: false,
    entregadoA: '',
    entregadoEn: null,
  })

  res.json({ ok: true })
})

// DELETE /api/merchandising/kits/:id
router.delete('/kits/:id', auth, async (req, res) => {
  await MerchandisingKit.findByIdAndDelete(req.params.id)
  res.json({ ok: true })
})

module.exports = router
