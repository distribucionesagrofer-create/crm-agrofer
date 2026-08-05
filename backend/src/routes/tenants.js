const router = require('express').Router()
const Tenant = require('../models/Tenant')
const Customer = require('../models/Customer')
const Message = require('../models/Message')
const Conversation = require('../models/Conversation')
const { authenticate } = require('../middleware/auth')

router.use(authenticate)

// GET /api/vendedores — lista todos los vendedores
router.get('/', async (req, res) => {
  const vendedores = await Tenant.find({}).sort({ nombre: 1 }).lean()
  res.json({ vendedores })
})

// GET /api/vendedores/monitor — stats completas de todos
router.get('/monitor', async (req, res) => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const vendedores = await Tenant.find({}).sort({ nombre: 1 }).lean()

  const stats = await Promise.all(vendedores.map(async (v) => {
    const [inbound, outbound, openConvs, totalClientes] = await Promise.all([
      Message.countDocuments({ tenantId: v._id, direction: 'inbound', createdAt: { $gte: since } }),
      Message.countDocuments({ tenantId: v._id, direction: 'outbound', createdAt: { $gte: since } }),
      Conversation.countDocuments({ tenantId: v._id, status: 'open' }),
      Customer.countDocuments({ vendedorId: v._id, active: true }),
    ])
    return {
      ...v,
      stats: { inbound, outbound, openConvs, totalClientes },
      responseRate: inbound > 0 ? Math.round((outbound / inbound) * 100) : 0,
    }
  }))

  res.json({ vendedores: stats })
})

// GET /api/vendedores/historico — mensajes diarios últimos 7 días
router.get('/historico', async (req, res) => {
  const dias = 7
  const desde = new Date(); desde.setDate(desde.getDate() - dias + 1); desde.setHours(0,0,0,0)
  const vendedores = await Tenant.find({}).sort({ nombre: 1 }).lean()

  const labels = Array.from({ length: dias }, (_, i) => {
    const d = new Date(desde); d.setDate(desde.getDate() + i)
    return d.toLocaleDateString('es', { weekday: 'short', day: '2-digit' })
  })

  const series = await Promise.all(vendedores.map(async (v) => {
    const porDia = await Promise.all(Array.from({ length: dias }, (_, i) => {
      const ini = new Date(desde); ini.setDate(desde.getDate() + i); ini.setHours(0,0,0,0)
      const fin = new Date(ini); fin.setHours(23,59,59,999)
      return Promise.all([
        Message.countDocuments({ tenantId: v._id, direction: 'inbound',  createdAt: { $gte: ini, $lte: fin } }),
        Message.countDocuments({ tenantId: v._id, direction: 'outbound', createdAt: { $gte: ini, $lte: fin } }),
      ])
    }))
    return { id: v._id, nombre: v.nombre, slug: v.slug, porDia }
  }))
  res.json({ labels, series })
})

// GET /api/vendedores/tiempos-respuesta — tiempo promedio de respuesta (aggregation, 1 query total)
router.get('/tiempos-respuesta', async (req, res) => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const vendedores = await Tenant.find({}, 'nombre slug').lean()

  // Un solo aggregation en mensajes agrupa por conversación y calcula el primer inbound y primer outbound
  const pipeline = [
    { $match: { createdAt: { $gte: since }, direction: { $in: ['inbound', 'outbound'] } } },
    { $sort: { conversation: 1, timestamp: 1 } },
    { $group: {
      _id: '$conversation',
      tenantId:     { $first: '$tenantId' },
      firstInbound: { $min: { $cond: [{ $eq: ['$direction', 'inbound'] }, '$timestamp', null] } },
      firstOutbound:{ $min: { $cond: [{ $eq: ['$direction', 'outbound'] }, '$timestamp', null] } },
    }},
    { $match: { firstInbound: { $ne: null }, firstOutbound: { $ne: null }, $expr: { $gt: ['$firstOutbound', '$firstInbound'] } } },
    { $group: {
      _id: '$tenantId',
      totalMs:     { $sum: { $subtract: ['$firstOutbound', '$firstInbound'] } },
      respondidas: { $sum: 1 },
    }},
  ]

  const resultados = await Message.aggregate(pipeline)
  const mapaResult = {}
  for (const r of resultados) mapaResult[r._id.toString()] = r

  const tiempos = vendedores.map(v => {
    const r = mapaResult[v._id.toString()]
    return {
      _id:        v._id,
      nombre:     v.nombre,
      slug:       v.slug,
      avgMinutos: r ? Math.round(r.totalMs / r.respondidas / 60000) : null,
      respondidas: r?.respondidas || 0,
    }
  })

  res.json({ tiempos })
})

// GET /api/vendedores/:id — detalle de un vendedor
router.get('/:id', async (req, res) => {
  const vendedor = await Tenant.findById(req.params.id)
  if (!vendedor) return res.status(404).json({ error: 'Vendedor no encontrado' })
  res.json({ vendedor })
})

// POST /api/vendedores — crear vendedor
router.post('/', async (req, res) => {
  const { nombre, zona } = req.body
  if (!nombre) return res.status(400).json({ error: 'nombre es requerido' })
  const slug = nombre.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now()
  const vendedor = await Tenant.create({ nombre, zona: zona || '', slug, activo: true })
  res.status(201).json({ vendedor })
})

// PATCH /api/vendedores/:id — actualizar nombre/zona/ai/bot
router.patch('/:id', async (req, res) => {
  const { nombre, zona, activo, ai, botActivationKeyword } = req.body
  const update = {}
  if (nombre !== undefined) update.nombre = nombre
  if (zona  !== undefined) update.zona  = zona
  if (activo !== undefined) update.activo = activo
  if (botActivationKeyword !== undefined) update.botActivationKeyword = botActivationKeyword
  if (req.body.soloMonitoreo    !== undefined) update.soloMonitoreo    = req.body.soloMonitoreo
  if (req.body.monitorearGrupos !== undefined) update.monitorearGrupos = req.body.monitorearGrupos
  if (req.body.pausado          !== undefined) update.pausado          = req.body.pausado
  if (req.body.inboxActivo      !== undefined) update.inboxActivo      = req.body.inboxActivo
  if (req.body.rotarSoloEstados !== undefined) update.rotarSoloEstados = req.body.rotarSoloEstados
  if (req.body.tts !== undefined) {
    if (req.body.tts.enabled !== undefined) update['tts.enabled'] = req.body.tts.enabled
    if (req.body.tts.voice   !== undefined) update['tts.voice']   = req.body.tts.voice
  }
  if (ai) {
    if (ai.enabled      !== undefined) update['ai.enabled']      = ai.enabled
    if (ai.autoReply    !== undefined) update['ai.autoReply']    = ai.autoReply
    if (ai.systemPrompt !== undefined) update['ai.systemPrompt'] = ai.systemPrompt
  }
  if (req.body.intentActions !== undefined) {
    // Reemplaza el mapa completo; los que vienen como 'ia' se omiten (sin override)
    const clean = {}
    for (const [intent, accion] of Object.entries(req.body.intentActions)) {
      if (accion && accion !== 'ia') clean[intent] = accion
    }
    update['intentActions'] = clean
  }
  const metaApi = req.body.metaApi
  if (metaApi) {
    if (metaApi.enabled             !== undefined) update['metaApi.enabled']             = metaApi.enabled
    if (metaApi.phoneNumberId       !== undefined) update['metaApi.phoneNumberId']       = metaApi.phoneNumberId
    if (metaApi.accessToken         !== undefined) update['metaApi.accessToken']         = metaApi.accessToken
    if (metaApi.webhookVerifyToken  !== undefined) update['metaApi.webhookVerifyToken']  = metaApi.webhookVerifyToken
    if (metaApi.businessAccountId   !== undefined) update['metaApi.businessAccountId']  = metaApi.businessAccountId
    if (metaApi.appId               !== undefined) update['metaApi.appId']               = metaApi.appId
    if (metaApi.appSecret           !== undefined) update['metaApi.appSecret']           = metaApi.appSecret
  }
  const assistant = req.body.assistant
  if (assistant) {
    if (assistant.nombre             !== undefined) update['assistant.nombre']             = assistant.nombre
    if (assistant.rol                !== undefined) update['assistant.rol']                = assistant.rol
    if (assistant.tono               !== undefined) update['assistant.tono']               = assistant.tono
    if (assistant.objetivo           !== undefined) update['assistant.objetivo']           = assistant.objetivo
    if (assistant.reglas             !== undefined) update['assistant.reglas']             = assistant.reglas
    if (assistant.escalationKeywords !== undefined) update['assistant.escalationKeywords'] = assistant.escalationKeywords
    if (assistant.maxIntentos        !== undefined) update['assistant.maxIntentos']        = assistant.maxIntentos
  }
  const vendedor = await Tenant.findByIdAndUpdate(req.params.id, update, { new: true })
  if (!vendedor) return res.status(404).json({ error: 'Vendedor no encontrado' })
  res.json({ vendedor })
})

// POST /api/vendedores/:id/reasignar-clientes — mover clientes a otro vendedor
router.post('/:id/reasignar-clientes', async (req, res) => {
  const { nuevoVendedorId, actualizarZona } = req.body
  if (!nuevoVendedorId) return res.status(400).json({ error: 'nuevoVendedorId requerido' })

  const nuevoVendedor = await Tenant.findById(nuevoVendedorId).lean()
  if (!nuevoVendedor) return res.status(404).json({ error: 'Vendedor destino no encontrado' })

  const update = { vendedorId: nuevoVendedorId }
  if (actualizarZona) update.zona = nuevoVendedor.zona

  const result = await Customer.updateMany({ vendedorId: req.params.id }, { $set: update })
  res.json({ ok: true, clientesMovidos: result.modifiedCount, zonaActualizada: !!actualizarZona })
})

// POST /api/vendedores/:id/actualizar-zona-clientes — sincronizar zona del vendedor a sus clientes
router.post('/:id/actualizar-zona-clientes', async (req, res) => {
  const vendedor = await Tenant.findById(req.params.id).lean()
  if (!vendedor) return res.status(404).json({ error: 'Vendedor no encontrado' })

  const result = await Customer.updateMany(
    { vendedorId: req.params.id },
    { $set: { zona: vendedor.zona } }
  )
  res.json({ ok: true, actualizados: result.modifiedCount, zona: vendedor.zona })
})

// PATCH /api/vendedores/:id/automations
router.patch('/:id/automations', async (req, res) => {
  const { welcomeMessage, followUp } = req.body
  const update = {}
  if (welcomeMessage !== undefined) {
    if (welcomeMessage.enabled !== undefined) update['automations.welcomeMessage.enabled'] = welcomeMessage.enabled
    if (welcomeMessage.content !== undefined) update['automations.welcomeMessage.content'] = welcomeMessage.content
  }
  if (followUp !== undefined) {
    if (followUp.enabled !== undefined) update['automations.followUp.enabled'] = followUp.enabled
    if (followUp.hours   !== undefined) update['automations.followUp.hours']   = followUp.hours
    if (followUp.content !== undefined) update['automations.followUp.content'] = followUp.content
  }
  const vendedor = await Tenant.findByIdAndUpdate(req.params.id, update, { new: true })
  if (!vendedor) return res.status(404).json({ error: 'Vendedor no encontrado' })
  res.json({ vendedor })
})

// DELETE /api/vendedores/:id/inbox — elimina todas las conversaciones y mensajes del vendedor
router.delete('/:id/inbox', async (req, res) => {
  const tenant = await Tenant.findById(req.params.id).lean()
  if (!tenant) return res.status(404).json({ error: 'Vendedor no encontrado' })
  const convs = await Conversation.find({ tenantId: req.params.id }).select('_id').lean()
  const convIds = convs.map(c => c._id)
  const [deletedMsgs, deletedConvs] = await Promise.all([
    Message.deleteMany({ conversation: { $in: convIds } }),
    Conversation.deleteMany({ tenantId: req.params.id }),
  ])
  console.log(`[Inbox limpiado] ${tenant.nombre}: ${deletedConvs.deletedCount} convs, ${deletedMsgs.deletedCount} mensajes`)
  res.json({ ok: true, conversaciones: deletedConvs.deletedCount, mensajes: deletedMsgs.deletedCount })
})

// POST /api/vendedores/:id/screencast/iniciar — transmite en vivo la pantalla real
// de WhatsApp Web de esa línea (conecta si hace falta, sesión ya guardada)
router.post('/:id/screencast/iniciar', async (req, res) => {
  const tenant = await Tenant.findById(req.params.id).lean()
  if (!tenant) return res.status(404).json({ error: 'Vendedor no encontrado' })
  // La línea principal / cualquier línea con Meta API no usa Puppeteer — no hay Chromium
  // que transmitir.
  if (tenant.esPrincipal || tenant.metaApi?.enabled) {
    return res.status(400).json({ error: 'Esta línea usa la API de Meta, no tiene WhatsApp Web para transmitir' })
  }
  const io = req.app.get('io')
  const { iniciarScreencast } = require('../services/screencast.service')
  const result = await iniciarScreencast(req.params.id, io)
  if (!result.ok) return res.status(502).json(result)
  res.json(result)
})

// POST /api/vendedores/:id/screencast/detener — detiene la transmisión y guarda la
// sesión (se desconecta sola solo si nosotros la conectamos para esto)
router.post('/:id/screencast/detener', async (req, res) => {
  const { detenerScreencast } = require('../services/screencast.service')
  const result = await detenerScreencast(req.params.id)
  res.json(result)
})

// DELETE /api/vendedores/:id
router.delete('/:id', async (req, res) => {
  await Tenant.findByIdAndDelete(req.params.id)
  res.json({ ok: true })
})

// GET /api/vendedores/:id/clientes — clientes asignados al vendedor
router.get('/:id/clientes', async (req, res) => {
  const { page = 1, limit = 50, sinContactar } = req.query
  const query = { vendedorId: req.params.id, active: true }

  if (sinContactar === 'true') {
    const hace30dias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    query.$or = [{ lastContactAt: null }, { lastContactAt: { $lt: hace30dias } }]
  }

  const skip = (parseInt(page) - 1) * parseInt(limit)
  const [clientes, total] = await Promise.all([
    Customer.find(query).sort({ lastContactAt: 1 }).skip(skip).limit(parseInt(limit)).lean(),
    Customer.countDocuments(query),
  ])
  res.json({ clientes, total })
})

module.exports = router
