const router = require('express').Router()
const Flow   = require('../models/Flow')
const { authenticate } = require('../middleware/auth')

router.use(authenticate)

// GET /api/flujos
router.get('/', async (req, res) => {
  const flujos = await Flow.find({})
    .populate('lineas', 'nombre zona')
    .populate('pasos.ramas.accion.vendedorId', 'nombre')
    .sort({ orden: 1, createdAt: -1 })
    .lean()
  res.json({ flujos })
})

// GET /api/flujos/:id
router.get('/:id', async (req, res) => {
  const flujo = await Flow.findById(req.params.id)
    .populate('lineas', 'nombre zona')
    .lean()
  if (!flujo) return res.status(404).json({ error: 'Flujo no encontrado' })
  res.json({ flujo })
})

// POST /api/flujos
router.post('/', async (req, res) => {
  const { nombre, descripcion, disparador, pasos, lineas, orden, rfNodes, rfEdges } = req.body
  if (!nombre?.trim()) return res.status(400).json({ error: 'nombre es requerido' })
  const flujo = await Flow.create({ nombre, descripcion, disparador, pasos: pasos || [], lineas: lineas || [], orden: orden || 0, rfNodes: rfNodes || [], rfEdges: rfEdges || [] })
  res.status(201).json({ flujo })
})

// PUT /api/flujos/:id
router.put('/:id', async (req, res) => {
  const { nombre, descripcion, disparador, pasos, lineas, orden, activo, rfNodes, rfEdges } = req.body
  const flujo = await Flow.findByIdAndUpdate(
    req.params.id,
    { nombre, descripcion, disparador, pasos, lineas, orden, activo, rfNodes, rfEdges },
    { new: true }
  )
  if (!flujo) return res.status(404).json({ error: 'Flujo no encontrado' })
  res.json({ flujo })
})

// PATCH /api/flujos/:id/toggle — activar/desactivar
router.patch('/:id/toggle', async (req, res) => {
  const flujo = await Flow.findById(req.params.id)
  if (!flujo) return res.status(404).json({ error: 'Flujo no encontrado' })
  flujo.activo = !flujo.activo
  await flujo.save()
  res.json({ flujo })
})

// DELETE /api/flujos/:id
router.delete('/:id', async (req, res) => {
  const flujo = await Flow.findByIdAndDelete(req.params.id)
  if (!flujo) return res.status(404).json({ error: 'Flujo no encontrado' })
  res.json({ ok: true })
})

module.exports = router
