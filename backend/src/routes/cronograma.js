const router = require('express').Router()
const { authenticate: auth } = require('../middleware/auth')
const CronogramaImagen = require('../models/CronogramaImagen')

// GET /api/cronograma?año=2026&mes=6
router.get('/', auth, async (req, res) => {
  const { año, mes } = req.query
  const q = {}
  if (año) q.año = parseInt(año)
  if (mes) q.mes = parseInt(mes)
  const items = await CronogramaImagen.find(q).sort({ semana: 1 })
  res.json(items)
})

// POST /api/cronograma
router.post('/', auth, async (req, res) => {
  const item = await CronogramaImagen.create(req.body)
  res.status(201).json(item)
})

// PATCH /api/cronograma/:id
router.patch('/:id', auth, async (req, res) => {
  const item = await CronogramaImagen.findByIdAndUpdate(req.params.id, req.body, { new: true })
  if (!item) return res.status(404).json({ error: 'No encontrado' })
  res.json(item)
})

// DELETE /api/cronograma/:id
router.delete('/:id', auth, async (req, res) => {
  await CronogramaImagen.findByIdAndDelete(req.params.id)
  res.json({ ok: true })
})

module.exports = router
