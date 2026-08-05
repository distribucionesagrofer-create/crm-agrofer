const router = require('express').Router()
const Lead = require('../models/Lead')
const Customer = require('../models/Customer')
const { authenticate } = require('../middleware/auth')

router.use(authenticate)

// GET /api/leads
router.get('/', async (req, res) => {
  const { status, vendedorId, search, page = 1, limit = 50 } = req.query
  const query = {}
  if (status) query.status = status
  if (vendedorId) query.tenantId = vendedorId
  if (search) query.$or = [
    { name:  { $regex: search, $options: 'i' } },
    { phone: { $regex: search, $options: 'i' } },
  ]

  const skip = (parseInt(page) - 1) * parseInt(limit)
  const [leads, total] = await Promise.all([
    Lead.find(query).populate('tenantId', 'nombre zona').sort({ lastMessageAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
    Lead.countDocuments(query),
  ])
  res.json({ leads, total })
})

// PATCH /api/leads/:id — cambiar status o notas
router.patch('/:id', async (req, res) => {
  const { status, notes, name } = req.body
  const update = {}
  if (status !== undefined) update.status = status
  if (notes  !== undefined) update.notes  = notes
  if (name   !== undefined) update.name   = name
  const lead = await Lead.findByIdAndUpdate(req.params.id, update, { new: true })
  if (!lead) return res.status(404).json({ error: 'Lead no encontrado' })
  res.json({ lead })
})

// POST /api/leads/:id/delegar — asignar lead a un vendedor y enviar mensaje inicial
router.post('/:id/delegar', async (req, res) => {
  const { vendedorId, mensaje } = req.body
  if (!vendedorId) return res.status(400).json({ error: 'vendedorId requerido' })

  const lead = await Lead.findById(req.params.id)
  if (!lead) return res.status(404).json({ error: 'Lead no encontrado' })

  const Tenant       = require('../models/Tenant')
  const Conversation = require('../models/Conversation')
  const Message      = require('../models/Message')
  const { getClient } = require('../services/whatsapp.service')

  const vendedor = await Tenant.findById(vendedorId)
  if (!vendedor) return res.status(404).json({ error: 'Vendedor no encontrado' })
  if (vendedor.whatsapp?.status !== 'connected') {
    return res.status(400).json({ error: `El WhatsApp de ${vendedor.nombre} no está conectado` })
  }

  // Mensaje por defecto si no se especifica
  const msgTexto = mensaje?.trim() ||
    `Hola! 👋 Soy ${vendedor.nombre} de AGROFER. ¿En qué te puedo ayudar?`

  // Enviar mensaje desde el WhatsApp del vendedor
  const client = getClient(vendedorId.toString())
  if (!client) return res.status(400).json({ error: 'Cliente WhatsApp no disponible' })

  const chatId = lead.phone.includes('@') ? lead.phone : `${lead.phone}@c.us`
  await client.sendMessage(chatId, msgTexto)

  // Crear o reutilizar conversación en el inbox del vendedor
  let conv = await Conversation.findOne({ tenantId: vendedorId, lead: lead._id })
  if (!conv) {
    conv = await Conversation.create({
      tenantId:      vendedorId,
      lead:          lead._id,
      phone:         lead.phone,
      waJid:         chatId,
      aiEnabled:     vendedor.ai?.autoReply ?? false,
      lastMessageAt: new Date(),
    })
  }

  // Guardar el mensaje enviado
  await Message.create({
    tenantId:   vendedorId,
    conversation: conv._id,
    direction:  'outbound',
    content:    msgTexto,
    aiGenerated: false,
  })

  // Actualizar lead — marcarlo como contactado y asignar vendedor
  await Lead.findByIdAndUpdate(lead._id, {
    status:    'contactado',
    tenantId:  vendedorId,  // reasignar al vendedor
  })

  res.json({
    ok: true,
    mensaje: `Mensaje enviado desde ${vendedor.nombre}. La conversación aparece en su inbox.`,
    conversacionId: conv._id,
  })
})

// POST /api/leads/:id/convertir — convertir lead en cliente
router.post('/:id/convertir', async (req, res) => {
  const lead = await Lead.findById(req.params.id)
  if (!lead) return res.status(404).json({ error: 'Lead no encontrado' })
  if (lead.status === 'convertido') {
    return res.status(400).json({ error: 'Este lead ya fue convertido' })
  }

  // Verificar que no exista ya como cliente
  const existe = await Customer.findOne({ phone: lead.phone })
  if (existe) {
    await Lead.findByIdAndUpdate(lead._id, { status: 'convertido', customerId: existe._id, convertedAt: new Date() })
    return res.json({ customer: existe, message: 'Ya existía como cliente — lead marcado como convertido' })
  }

  // Crear cliente
  const customer = await Customer.create({
    name:      lead.name || lead.phone,
    phone:     lead.phone,
    tenantId:  lead.tenantId,
    vendedorId: lead.tenantId,
    importado: false,
  })

  await Lead.findByIdAndUpdate(lead._id, {
    status: 'convertido',
    customerId: customer._id,
    convertedAt: new Date(),
  })

  res.json({ customer, message: 'Lead convertido a cliente exitosamente' })
})

// DELETE /api/leads/:id — eliminar lead permanentemente
router.delete('/:id', async (req, res) => {
  await Lead.findByIdAndDelete(req.params.id)
  res.json({ ok: true })
})

// POST /api/leads/eliminar-masivo — eliminar lista de IDs
router.post('/eliminar-masivo', async (req, res) => {
  const { ids } = req.body
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids requeridos' })
  const result = await Lead.deleteMany({ _id: { $in: ids } })
  res.json({ ok: true, eliminados: result.deletedCount })
})

module.exports = router
