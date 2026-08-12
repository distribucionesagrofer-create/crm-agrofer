const router = require('express').Router()
const Customer       = require('../models/Customer')
const Conversation   = require('../models/Conversation')
const CarteraEnvio   = require('../models/CarteraEnvio')
const Tenant          = require('../models/Tenant')
const { authenticate } = require('../middleware/auth')
const { enviarRecordatorioCartera } = require('../services/cartera.service')
const { sincronizarCarteraTodos, estadoSync } = require('../services/cartera-sync.service')

router.use(authenticate)

async function lineaPrincipal() {
  return Tenant.findOne({ esPrincipal: true })
}

// GET /api/cartera — clientes con saldo pendiente (desde la caché), con su último envío
router.get('/', async (req, res) => {
  const clientes = await Customer.find({
    active: true,
    carteraTotal: { $gt: 0 },
  })
    .select('name phone zona ciudad empresa carteraFacturas carteraTotal carteraActualizadoAt vendedorId')
    .populate('vendedorId', 'nombre')
    .sort({ carteraTotal: -1 })
    .lean()

  const customerIds = clientes.map(c => c._id)
  const envios = await CarteraEnvio.aggregate([
    { $match: { customerId: { $in: customerIds } } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$customerId', ultimo: { $first: '$$ROOT' } } },
  ])
  const envioPorCliente = Object.fromEntries(envios.map(e => [String(e._id), e.ultimo]))

  const conFecha = clientes.map(c => {
    const proxVence = c.carteraFacturas?.length
      ? c.carteraFacturas.reduce((min, f) => (f.diasVcto < min.diasVcto ? f : min), c.carteraFacturas[0])
      : null
    return { ...c, proximoVencimiento: proxVence, ultimoEnvio: envioPorCliente[String(c._id)] || null }
  })

  res.json({ clientes: conFecha, sync: estadoSync() })
})

// POST /api/cartera/sincronizar — dispara una sincronización contra Sistema Principal
// (puede tardar varios minutos con cientos de clientes — corre en segundo plano)
router.post('/sincronizar', (req, res) => {
  sincronizarCarteraTodos().catch(e => console.error('[Cartera] Error sincronizando:', e.message))
  res.json({ ok: true, mensaje: 'Sincronización iniciada' })
})

// GET /api/cartera/sincronizar/estado
router.get('/sincronizar/estado', (req, res) => {
  res.json(estadoSync())
})

// GET /api/cartera/:customerId/destinatario — id de conversación (si existe) para poder
// navegar directo al chat del cliente desde el módulo
router.get('/:customerId/conversacion', async (req, res) => {
  const linea = await lineaPrincipal()
  if (!linea) return res.json({ conversationId: null })
  const conv = await Conversation.findOne({ tenantId: linea._id, customer: req.params.customerId }).select('_id').lean()
  res.json({ conversationId: conv?._id || null })
})

// GET /api/cartera/:customerId/preview — genera el PDF y lo devuelve directo, sin
// enviar nada ni crear Message — para revisar el diseño antes de mandarlo de verdad.
router.get('/:customerId/preview', async (req, res) => {
  const { obtenerCartera }  = require('../services/cartera.service')
  const { generarCarteraPDF } = require('../services/cartera-pdf.service')

  const customer = await Customer.findById(req.params.customerId).lean()
  if (!customer) return res.status(404).json({ error: 'Cliente no encontrado' })

  let cartera
  try {
    cartera = await obtenerCartera(customer)
  } catch (e) {
    return res.status(400).json({ error: e.message })
  }

  const pdfBuffer = await generarCarteraPDF(customer, cartera)
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename="Estado_Cartera_${(customer.name || 'cliente').replace(/[^a-zA-Z0-9]/g, '_')}.pdf"`)
  res.send(pdfBuffer)
})

// POST /api/cartera/:customerId/enviar — envía (o reenvía) el recordatorio a un cliente,
// creando la conversación si todavía no existe
router.post('/:customerId/enviar', async (req, res) => {
  const customer = await Customer.findById(req.params.customerId)
  if (!customer) return res.status(404).json({ error: 'Cliente no encontrado' })
  if (!customer.phone) return res.status(400).json({ error: 'Este cliente no tiene teléfono registrado' })

  const linea = await lineaPrincipal()
  if (!linea?.metaApi?.enabled) return res.status(400).json({ error: 'La línea principal no tiene Meta API habilitada' })

  let conversation = await Conversation.findOne({ tenantId: linea._id, customer: customer._id })
  if (!conversation) {
    conversation = await Conversation.create({
      tenantId: linea._id, customer: customer._id, phone: customer.phone,
      aiEnabled: false, lastMessageAt: new Date(),
    })
  }

  try {
    const io = req.app.get('io')
    const { message, cartera } = await enviarRecordatorioCartera(linea, conversation, customer, 'manual', io)
    res.status(201).json({ message, cartera, conversationId: conversation._id })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

module.exports = router
