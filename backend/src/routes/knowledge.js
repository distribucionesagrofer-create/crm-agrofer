const router = require('express').Router()
const KnowledgeBase = require('../models/KnowledgeBase')
const { authenticate } = require('../middleware/auth')

router.use(authenticate)

// Listar todos los FAQs del tenant
router.get('/', async (req, res) => {
  const faqs = await KnowledgeBase.find({ tenantId: req.query.vendedorId || req.body.vendedorId || undefined })
    .sort({ createdAt: -1 })
  res.json({ faqs })
})

// Crear FAQ
router.post('/', async (req, res) => {
  const { question, answer } = req.body
  if (!question?.trim() || !answer?.trim()) {
    return res.status(400).json({ error: 'Pregunta y respuesta son obligatorias' })
  }
  const keywords = question.toLowerCase().replace(/[¿?¡!.,;:]/g, '').split(/\s+/).filter(w => w.length >= 4)
  const faq = await KnowledgeBase.create({ question: question.trim(), answer: answer.trim(), keywords })
  res.status(201).json({ faq })
})

// Actualizar FAQ
router.patch('/:id', async (req, res) => {
  const { question, answer, active } = req.body
  const update = {}
  if (question !== undefined) update.question = question
  if (answer !== undefined) update.answer = answer
  if (active !== undefined) update.active = active

  const faq = await KnowledgeBase.findOneAndUpdate(
    { _id: req.params.id },
    update,
    { new: true, runValidators: true }
  )
  if (!faq) return res.status(404).json({ error: 'FAQ no encontrado' })
  res.json({ faq })
})

// Eliminar FAQ
router.delete('/:id', async (req, res) => {
  const faq = await KnowledgeBase.findOneAndDelete({ _id: req.params.id })
  if (!faq) return res.status(404).json({ error: 'FAQ no encontrado' })
  res.json({ ok: true })
})

module.exports = router

