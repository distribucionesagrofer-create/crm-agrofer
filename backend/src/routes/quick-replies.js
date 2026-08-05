const router = require('express').Router()
const QuickReply = require('../models/QuickReply')
const { authenticate } = require('../middleware/auth')

router.use(authenticate)

// GET — globales (sin filtro de tenant)
router.get('/', async (req, res) => {
  const replies = await QuickReply.find({ active: true }).sort({ title: 1 })
  res.json({ replies })
})

router.post('/', async (req, res) => {
  const { title, content, mediaUrl, mediaType } = req.body
  if (!title?.trim()) return res.status(400).json({ error: 'Título requerido' })
  const reply = await QuickReply.create({ title, content, mediaUrl, mediaType })
  res.status(201).json({ reply })
})

router.patch('/:id', async (req, res) => {
  const { title, content, mediaUrl, mediaType } = req.body
  const reply = await QuickReply.findByIdAndUpdate(
    req.params.id,
    { title, content, mediaUrl, mediaType },
    { new: true }
  )
  if (!reply) return res.status(404).json({ error: 'Plantilla no encontrada' })
  res.json({ reply })
})

router.delete('/:id', async (req, res) => {
  await QuickReply.findByIdAndUpdate(req.params.id, { active: false })
  res.json({ ok: true })
})

module.exports = router
