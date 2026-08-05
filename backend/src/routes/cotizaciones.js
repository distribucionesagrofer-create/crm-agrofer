const router      = require('express').Router()
const Cotizacion  = require('../models/Cotizacion')
const { authenticate } = require('../middleware/auth')

router.use(authenticate)

// GET /api/cotizaciones?tenantId=X&estado=X&page=1&limit=30
router.get('/', async (req, res) => {
  const { tenantId, estado, search, page = 1, limit = 30 } = req.query
  const query = {}
  if (tenantId) query.tenantId = tenantId
  if (estado)   query.estado   = estado
  if (search) {
    const re = new RegExp(search, 'i')
    query.$or = [{ contactName: re }, { phone: re }, { notas: re }]
  }
  const skip = (parseInt(page) - 1) * parseInt(limit)
  const [cotizaciones, total] = await Promise.all([
    Cotizacion.find(query)
      .populate('tenantId', 'nombre zona')
      .populate('customerId', 'name phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Cotizacion.countDocuments(query),
  ])
  res.json({ cotizaciones, total })
})

// GET /api/cotizaciones/:id
router.get('/:id', async (req, res) => {
  const c = await Cotizacion.findById(req.params.id)
    .populate('tenantId', 'nombre zona')
    .populate('customerId', 'name phone')
    .lean()
  if (!c) return res.status(404).json({ error: 'Cotización no encontrada' })
  res.json({ cotizacion: c })
})

// POST /api/cotizaciones
router.post('/', async (req, res) => {
  const { tenantId, customerId, conversationId, contactName, phone, items, descuento, notas, validoHasta } = req.body
  if (!tenantId)        return res.status(400).json({ error: 'tenantId requerido' })
  if (!items?.length)   return res.status(400).json({ error: 'Al menos un item requerido' })

  const parsedItems = items.map(it => ({
    descripcion: it.descripcion,
    cantidad:    parseFloat(it.cantidad) || 0,
    precioUnit:  parseFloat(it.precioUnit) || 0,
    subtotal:    Math.round((parseFloat(it.cantidad) || 0) * (parseFloat(it.precioUnit) || 0) * 100) / 100,
  }))
  const subtotalBruto = parsedItems.reduce((s, it) => s + it.subtotal, 0)
  const desc  = Math.max(0, Math.min(100, parseFloat(descuento) || 0))
  const total = Math.round(subtotalBruto * (1 - desc / 100) * 100) / 100

  const cot = await Cotizacion.create({
    tenantId, customerId: customerId || null, conversationId: conversationId || null,
    contactName: contactName || '',
    phone:       phone       || '',
    items:       parsedItems,
    descuento:   desc,
    subtotalBruto,
    total,
    notas:       notas || '',
    validoHasta: validoHasta || null,
    creadoPor:   req.user._id,
  })
  res.status(201).json({ cotizacion: cot })
})

// PATCH /api/cotizaciones/:id
router.patch('/:id', async (req, res) => {
  const { estado, contactName, phone, items, descuento, notas, validoHasta, customerId } = req.body
  const update = {}
  if (estado       !== undefined) update.estado      = estado
  if (contactName  !== undefined) update.contactName = contactName
  if (phone        !== undefined) update.phone       = phone
  if (notas        !== undefined) update.notas       = notas
  if (validoHasta  !== undefined) update.validoHasta = validoHasta
  if (customerId   !== undefined) update.customerId  = customerId

  if (items?.length) {
    const parsedItems = items.map(it => ({
      descripcion: it.descripcion,
      cantidad:    parseFloat(it.cantidad) || 0,
      precioUnit:  parseFloat(it.precioUnit) || 0,
      subtotal:    Math.round((parseFloat(it.cantidad) || 0) * (parseFloat(it.precioUnit) || 0) * 100) / 100,
    }))
    update.items = parsedItems
    update.subtotalBruto = parsedItems.reduce((s, it) => s + it.subtotal, 0)
    const desc = Math.max(0, Math.min(100, parseFloat(descuento ?? 0)))
    update.descuento = desc
    update.total = Math.round(update.subtotalBruto * (1 - desc / 100) * 100) / 100
  }

  const cot = await Cotizacion.findByIdAndUpdate(req.params.id, update, { new: true })
    .populate('tenantId', 'nombre')
    .populate('customerId', 'name phone')
  if (!cot) return res.status(404).json({ error: 'Cotización no encontrada' })
  res.json({ cotizacion: cot })
})

// DELETE /api/cotizaciones/:id
router.delete('/:id', async (req, res) => {
  await Cotizacion.findByIdAndDelete(req.params.id)
  res.json({ ok: true })
})

module.exports = router
