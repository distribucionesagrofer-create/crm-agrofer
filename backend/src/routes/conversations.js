const router = require('express').Router()
const Conversation = require('../models/Conversation')
const Message = require('../models/Message')
const { authenticate } = require('../middleware/auth')

router.use(authenticate)

router.get('/', async (req, res) => {
  const { status, vendedorId, page = 1, limit = 30 } = req.query
  const query = {}
  if (vendedorId) query.tenantId = vendedorId
  if (status && status !== 'all') query.status = status

  const skip = (parseInt(page) - 1) * parseInt(limit)
  const [conversations, total] = await Promise.all([
    Conversation.find(query)
      .populate('customer', 'name phone')
      .populate('lead', 'name phone status')
      .sort({ lastMessageAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Conversation.countDocuments(query),
  ])

  // Agregar preview del último mensaje a cada conversación
  const convIds = conversations.map(c => c._id)
  const lastMsgs = await Message.aggregate([
    { $match: { conversation: { $in: convIds } } },
    { $sort: { timestamp: -1 } },
    { $group: {
      _id: '$conversation',
      content:   { $first: '$content' },
      type:      { $first: '$type' },
      direction: { $first: '$direction' },
      aiGenerated: { $first: '$aiGenerated' },
    }},
  ])
  const lastMsgMap = {}
  lastMsgs.forEach(m => { lastMsgMap[m._id.toString()] = m })

  const enriched = conversations.map(c => ({
    ...c,
    lastMessage: lastMsgMap[c._id.toString()] || null,
  }))

  res.json({ conversations: enriched, total })
})

router.get('/:id/messages', async (req, res) => {
  const conversation = await Conversation.findById(req.params.id)
  if (!conversation) return res.status(404).json({ error: 'Conversación no encontrada' })

  const { page = 1, limit = 50 } = req.query
  const skip = (parseInt(page) - 1) * parseInt(limit)
  const messages = await Message.find({ conversation: req.params.id })
    .sort({ timestamp: -1 }).skip(skip).limit(parseInt(limit))

  await Conversation.findByIdAndUpdate(req.params.id, { unreadCount: 0 })
  res.json({ messages: messages.reverse() })
})

router.post('/:id/messages', async (req, res) => {
  const { content } = req.body
  if (!content?.trim()) return res.status(400).json({ error: 'Mensaje vacío' })

  const conversation = await Conversation.findById(req.params.id)
  if (!conversation) return res.status(404).json({ error: 'Conversación no encontrada' })

  const vendedorId = conversation.tenantId?.toString()
  const Tenant   = require('../models/Tenant')
  const provider = require('../services/message-provider.service')
  const tenant   = await Tenant.findById(vendedorId).lean()
  if (!tenant) return res.status(404).json({ error: 'Línea no encontrada' })
  if (!provider.isAvailable(tenant, vendedorId)) {
    return res.status(503).json({ error: 'WhatsApp no conectado' })
  }

  // Meta API no usa JID de whatsapp-web.js — algunas conversaciones viejas traen un waJid
  // (a veces con formato @lid) que no es un número real, así que para Meta siempre se usa
  // el teléfono directo, nunca el waJid.
  const usaMeta   = tenant.metaApi?.enabled && tenant.metaApi?.accessToken
  const targetJid = usaMeta
    ? conversation.phone
    : (conversation.waJid || (conversation.phone ? `${conversation.phone}@c.us` : null))
  if (!targetJid) return res.status(400).json({ error: 'Conversación sin número de destino válido' })

  const result = await provider.sendText(tenant, vendedorId, targetJid, content)
  if (result?.ok === false) {
    return res.status(502).json({ error: result.error || 'Error enviando mensaje' })
  }

  const message = await Message.create({
    tenantId: conversation.tenantId,
    conversation: conversation._id,
    direction: 'outbound',
    content,
    sentBy: req.user._id,
    aiGenerated: false,
    whatsappMsgId: result?.messageId || undefined,
  })

  const io = req.app.get('io')
  io.to(`vendedor:${vendedorId}`).emit('message:new', { conversation: conversation._id, message })
  res.status(201).json({ message })
})

const MAX_MEDIA_MB = 50
router.post('/:id/media', async (req, res) => {
  const { base64, mimetype, filename, caption } = req.body
  if (!base64 || !mimetype) return res.status(400).json({ error: 'base64 y mimetype requeridos' })

  // Verificar tamaño antes de procesar (base64 es ~33% más grande que el archivo real)
  const estimatedBytes = Math.ceil((base64.length * 3) / 4)
  if (estimatedBytes > MAX_MEDIA_MB * 1024 * 1024) {
    return res.status(413).json({ error: `El archivo supera el límite de ${MAX_MEDIA_MB}MB` })
  }

  const conversation = await Conversation.findById(req.params.id)
  if (!conversation) return res.status(404).json({ error: 'Conversación no encontrada' })

  const vendedorId = conversation.tenantId?.toString()
  const Tenant = require('../models/Tenant')
  const tenant = await Tenant.findById(vendedorId).lean()
  if (!tenant) return res.status(404).json({ error: 'Línea no encontrada' })

  const usaMeta = tenant.metaApi?.enabled && tenant.metaApi?.accessToken

  // Guardar en disco primero — necesario para servir al frontend y, si aplica,
  // para construir la URL pública que requiere Meta API (link, no base64)
  const fs   = require('fs')
  const path = require('path')
  const ext  = mimetype.split('/')[1]?.split(';')[0] || 'bin'
  const safeName = `${Date.now()}_${(filename || 'archivo').replace(/[^a-zA-Z0-9._-]/g, '_')}`
  const uploadDir = path.join(__dirname, '../../uploads')
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })
  const buffer = Buffer.from(base64, 'base64')
  fs.writeFileSync(path.join(uploadDir, safeName), buffer)
  const mediaUrl = `/media/${safeName}`

  let msgType = 'document'
  if (mimetype.startsWith('image/')) msgType = 'image'
  else if (mimetype.startsWith('video/')) msgType = 'video'
  else if (mimetype.startsWith('audio/')) msgType = 'audio'

  let metaResult = null
  if (usaMeta) {
    if (!process.env.PUBLIC_URL) {
      return res.status(500).json({ error: 'PUBLIC_URL no configurado en el servidor — requerido para enviar adjuntos por Meta API' })
    }
    if (!conversation.phone) return res.status(400).json({ error: 'Conversación sin número de destino válido' })

    const provider = require('../services/message-provider.service')
    const publicMediaUrl = `${process.env.PUBLIC_URL}${mediaUrl}`
    metaResult = msgType === 'image'
      ? await provider.sendImage(tenant, vendedorId, conversation.phone, publicMediaUrl, caption || '')
      : msgType === 'video'
      ? await provider.sendVideo(tenant, vendedorId, conversation.phone, publicMediaUrl, caption || '')
      : msgType === 'audio'
      ? await provider.sendAudio(tenant, vendedorId, conversation.phone, publicMediaUrl)
      : await provider.sendDocument(tenant, vendedorId, conversation.phone, publicMediaUrl, filename || 'archivo', caption || '')
    if (metaResult?.ok === false) {
      return res.status(502).json({ error: metaResult.error || 'Error enviando adjunto por Meta API' })
    }
  } else {
    const { sessions }     = require('../services/whatsapp.service')
    const { MessageMedia } = require('whatsapp-web.js')
    const session = sessions.get(vendedorId)
    if (!session || session.status !== 'connected') {
      return res.status(503).json({ error: 'WhatsApp no conectado' })
    }
    const media    = new MessageMedia(mimetype, base64, filename || 'archivo')
    const mediaJid = conversation.waJid || (conversation.phone ? `${conversation.phone}@c.us` : null)
    if (!mediaJid) return res.status(400).json({ error: 'Conversación sin número de destino válido' })
    await session.client.sendMessage(mediaJid, media, { caption: caption || '' })
  }

  const message = await Message.create({
    tenantId: conversation.tenantId,
    conversation: conversation._id,
    direction: 'outbound',
    content: caption || '',
    type: msgType,
    mediaUrl,
    mediaType: mimetype,
    fileName: filename || 'archivo',
    fileSize: buffer.length,
    sentBy: req.user._id,
    aiGenerated: false,
    whatsappMsgId: metaResult?.messageId || undefined,
  })

  const io = req.app.get('io')
  io.to(`vendedor:${vendedorId}`).emit('message:new', { conversation: conversation._id, message })
  res.status(201).json({ message })
})

router.patch('/:id', async (req, res) => {
  const { status, assignedTo, aiEnabled, needsAttention, contactoDesconocido, etiquetas } = req.body
  const update = {}
  if (status               !== undefined) update.status               = status
  if (assignedTo           !== undefined) update.assignedTo           = assignedTo || null
  if (aiEnabled            !== undefined) update.aiEnabled            = aiEnabled
  if (needsAttention       !== undefined) update.needsAttention       = needsAttention
  if (contactoDesconocido  !== undefined) update.contactoDesconocido  = contactoDesconocido
  if (etiquetas            !== undefined) update.etiquetas            = etiquetas

  const conversation = await Conversation.findByIdAndUpdate(req.params.id, update, { new: true })
    .populate('customer', 'name phone')
  if (!conversation) return res.status(404).json({ error: 'Conversación no encontrada' })

  const io = req.app.get('io')
  const vendedorId = conversation.tenantId?.toString()
  io.to(`vendedor:${vendedorId}`).emit('conversation:updated', { conversation })
  res.json({ conversation })
})

router.post('/:id/notes', async (req, res) => {
  const { content } = req.body
  if (!content?.trim()) return res.status(400).json({ error: 'Nota vacía' })
  const conversation = await Conversation.findByIdAndUpdate(
    req.params.id,
    { $push: { notes: { content, createdBy: req.user._id, createdAt: new Date() } } },
    { new: true }
  ).populate('notes.createdBy', 'name')
  if (!conversation) return res.status(404).json({ error: 'Conversación no encontrada' })
  res.json({ notes: conversation.notes })
})

// DELETE /conversations/:id — elimina conversación y sus mensajes (para pruebas / reset)
router.delete('/:id', async (req, res) => {
  const conv = await Conversation.findById(req.params.id)
  if (!conv) return res.status(404).json({ error: 'Conversación no encontrada' })
  await Message.deleteMany({ conversation: conv._id })
  await Conversation.findByIdAndDelete(conv._id)
  res.json({ ok: true })
})

router.delete('/:id/notes/:noteId', async (req, res) => {
  const conversation = await Conversation.findByIdAndUpdate(
    req.params.id,
    { $pull: { notes: { _id: req.params.noteId } } },
    { new: true }
  )
  if (!conversation) return res.status(404).json({ error: 'Conversación no encontrada' })
  res.json({ notes: conversation.notes })
})

// POST /conversations/:id/summarize — resumen IA de la conversación
router.post('/:id/summarize', async (req, res) => {
  const conv = await Conversation.findById(req.params.id).lean()
  if (!conv) return res.status(404).json({ error: 'Conversación no encontrada' })

  const messages = await Message.find({ conversation: conv._id })
    .sort({ createdAt: -1 }).limit(20).lean()
  if (!messages.length) return res.json({ summary: 'Sin mensajes para resumir.' })

  const SystemConfig = require('../models/SystemConfig')
  const OpenAI = require('openai')
  const cfg = await SystemConfig.findById('system').lean().catch(() => null)
  const key = cfg?.openaiKey || process.env.OPENAI_API_KEY
  if (!key) return res.status(400).json({ error: 'Token de OpenAI no configurado' })

  const lines = messages.reverse().map(m =>
    `${m.direction === 'inbound' ? 'Cliente' : 'Asesor'}: ${m.content || '[media]'}`
  ).join('\n')

  const openai = new OpenAI({ apiKey: key })
  const resp = await openai.chat.completions.create({
    model: cfg?.openaiModel || 'gpt-4o-mini',
    max_tokens: 120,
    messages: [
      { role: 'system', content: 'Resume en máximo 2 oraciones el estado de esta conversación de WhatsApp. Sé directo y conciso. Indica qué quiere el cliente y en qué punto está la conversación.' },
      { role: 'user', content: lines },
    ],
  })
  const summary = resp.choices?.[0]?.message?.content || 'No se pudo generar el resumen.'
  res.json({ summary })
})

module.exports = router
