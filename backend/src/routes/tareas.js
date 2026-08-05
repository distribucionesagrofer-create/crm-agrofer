const router = require('express').Router()
const Task   = require('../models/Task')
const { authenticate } = require('../middleware/auth')

router.use(authenticate)

// GET /api/tareas?vendedorId=X&estado=pendiente&page=1&limit=50
router.get('/', async (req, res) => {
  const { vendedorId, estado, page = 1, limit = 50 } = req.query
  const query = {}
  if (vendedorId) query.tenantId = vendedorId
  if (estado)     query.estado   = estado

  const skip = (parseInt(page) - 1) * parseInt(limit)
  const [tareas, total] = await Promise.all([
    Task.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
    Task.countDocuments(query),
  ])
  res.json({ tareas, total })
})

// GET /api/tareas/pendientes-count?vendedorId=X
router.get('/pendientes-count', async (req, res) => {
  const { vendedorId } = req.query
  const query = { estado: 'pendiente' }
  if (vendedorId) query.tenantId = vendedorId
  const count = await Task.countDocuments(query)
  res.json({ count })
})

// POST /api/tareas
router.post('/', async (req, res) => {
  const { tenantId, conversationId, customerId, phone, contactName, descripcion, tipo, prioridad, creadaPor } = req.body
  if (!tenantId) return res.status(400).json({ error: 'tenantId requerido' })
  const tarea = await Task.create({
    tenantId, conversationId, customerId,
    phone:       phone       || '',
    contactName: contactName || '',
    descripcion: descripcion || 'Llamar al cliente',
    tipo:        tipo        || 'llamar',
    prioridad:   prioridad   || 'media',
    creadaPor:   creadaPor   || 'manual',
  })
  res.status(201).json({ tarea })
})

// PATCH /api/tareas/:id
router.patch('/:id', async (req, res) => {
  const { estado, descripcion, notas, tipo, prioridad } = req.body
  const update = {}
  if (estado      !== undefined) update.estado      = estado
  if (descripcion !== undefined) update.descripcion = descripcion
  if (notas       !== undefined) update.notas       = notas
  if (tipo        !== undefined) update.tipo        = tipo
  if (prioridad   !== undefined) update.prioridad   = prioridad
  const tarea = await Task.findByIdAndUpdate(req.params.id, update, { new: true })
  if (!tarea) return res.status(404).json({ error: 'Tarea no encontrada' })
  res.json({ tarea })
})

// DELETE /api/tareas/:id
router.delete('/:id', async (req, res) => {
  await Task.findByIdAndDelete(req.params.id)
  res.json({ ok: true })
})

module.exports = router
