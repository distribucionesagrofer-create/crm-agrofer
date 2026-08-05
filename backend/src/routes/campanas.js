const router = require('express').Router()
const mongoose = require('mongoose')
const { authenticate } = require('../middleware/auth')
const Customer             = require('../models/Customer')
const Tenant               = require('../models/Tenant')
const Campana              = require('../models/Campana')
const CampanaDestinatario  = require('../models/CampanaDestinatario')

router.use(authenticate)

// GET /api/campanas — historial con estadísticas
router.get('/', async (req, res) => {
  const campanas = await Campana.find({})
    .populate('vendedorId', 'nombre zona')
    .sort({ createdAt: -1 })
    .limit(50)
    .lean()
  res.json({ campanas })
})

// GET /api/campanas/:id/destinatarios
router.get('/:id/destinatarios', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'ID inválido' })
  }
  const { estado, page = 1, limit = 50 } = req.query
  const query = { campanaId: req.params.id }
  if (estado) query.estado = estado

  const skip = (parseInt(page) - 1) * parseInt(limit)
  const [destinatarios, total] = await Promise.all([
    CampanaDestinatario.find(query)
      .populate('customerId', 'name zona')
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    CampanaDestinatario.countDocuments(query),
  ])
  const stats = await CampanaDestinatario.aggregate([
    { $match: { campanaId: mongoose.Types.ObjectId.createFromHexString(req.params.id) } },
    { $group: { _id: '$estado', count: { $sum: 1 } } },
  ])
  res.json({ destinatarios, total, stats })
})

// GET /api/campanas/preview
router.get('/preview', async (req, res) => {
  const { vendedorId, zona } = req.query
  const query = { active: true }
  if (zona)       query.zona = zona
  else if (vendedorId) query.vendedorId = vendedorId

  const [clientes, total] = await Promise.all([
    Customer.find(query).select('name phone zona').limit(5).lean(),
    Customer.countDocuments(query),
  ])
  res.json({ muestra: clientes, total })
})

// POST /api/campanas/enviar
router.post('/enviar', async (req, res) => {
  const {
    vendedorId,
    zona,
    mensaje,
    imageUrl,
    nombre,
    scheduledAt,
    batchSize          = 50,
    delayBetweenMessages = 60,
    delayBetweenBatches  = 1800,
  } = req.body

  if (!mensaje?.trim() && !imageUrl?.trim()) {
    return res.status(400).json({ error: 'Se requiere mensaje o imagen' })
  }
  if (!vendedorId) return res.status(400).json({ error: 'vendedorId es requerido' })

  const vendedor = await Tenant.findById(vendedorId)
  if (!vendedor) return res.status(404).json({ error: 'Vendedor no encontrado' })
  if (vendedor.whatsapp?.status !== 'connected') {
    return res.status(400).json({ error: 'El WhatsApp de este vendedor no está conectado' })
  }

  const query = { active: true }
  if (zona) query.zona = zona
  else      query.vendedorId = vendedorId

  const clientes = await Customer.find(query).select('_id phone name').lean()
  if (!clientes.length) return res.status(400).json({ error: 'No hay destinatarios' })

  const ahora     = new Date()
  const scheduled = scheduledAt ? new Date(scheduledAt) : null
  const esProgram = scheduled && scheduled > ahora

  const campana = await Campana.create({
    vendedorId,
    nombre:               nombre || `Campaña ${ahora.toLocaleDateString('es')}`,
    mensaje:              mensaje || '',
    imageUrl:             imageUrl || '',
    zona:                 zona || '',
    scheduledAt:          scheduled || null,
    batchSize:            parseInt(batchSize),
    delayBetweenMessages: parseInt(delayBetweenMessages),
    delayBetweenBatches:  parseInt(delayBetweenBatches),
    destinatarios:        clientes.length,
    estado:               esProgram ? 'programada' : 'pendiente',
    iniciadaAt:           esProgram ? null : ahora,
  })

  await CampanaDestinatario.insertMany(
    clientes.map(c => ({
      campanaId:  campana._id,
      customerId: c._id,
      phone:      c.phone,
      nombre:     c.name,
      estado:     'pendiente',
    }))
  )

  res.json({
    ok: true,
    campanaId:  campana._id,
    total:      clientes.length,
    programada: esProgram,
    scheduledAt: scheduled,
    mensaje:    esProgram ? 'Campaña programada' : 'Campaña iniciada',
  })

  if (!esProgram) {
    const { ejecutarCampana } = require('../services/campana-scheduler.service')
    ejecutarCampana(campana._id.toString()).catch(e =>
      console.error('Error ejecutando campaña:', e.message)
    )
  }
})

// DELETE /api/campanas/:id — cancelar campaña programada
router.delete('/:id', async (req, res) => {
  const campana = await Campana.findById(req.params.id)
  if (!campana) return res.status(404).json({ error: 'Campaña no encontrada' })
  if (campana.estado === 'enviando') {
    return res.status(400).json({ error: 'No se puede cancelar una campaña en curso' })
  }
  await CampanaDestinatario.deleteMany({ campanaId: campana._id })
  await campana.deleteOne()
  res.json({ ok: true })
})

module.exports = router
