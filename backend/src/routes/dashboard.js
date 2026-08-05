const router = require('express').Router()
const { authenticate } = require('../middleware/auth')
const Customer     = require('../models/Customer')
const Conversation = require('../models/Conversation')
const Message      = require('../models/Message')
const Tenant       = require('../models/Tenant')
const Lead         = require('../models/Lead')
const Campana      = require('../models/Campana')

router.use(authenticate)

router.get('/', async (req, res) => {
  const now          = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const hace7dias    = new Date(now - 7 * 24 * 60 * 60 * 1000)
  const hace30dias   = new Date(now - 30 * 24 * 60 * 60 * 1000)
  const hoy          = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const [
    totalVendedores,
    vendedoresConectados,
    totalClientes,
    clientesSinContactar,
    conversacionesAbiertas,
    mensajesMes,
    clientesNuevosSemana,
    conversacionesRecientes,
    // Bot stats
    convsBotRespondio,
    convsNeedsAttention,
    convsEscaladas,
    // Actividad diaria (últimos 7 días, mensajes inbound)
    actividadRaw,
    // Funnel de leads
    funnelRaw,
    // Campañas recientes
    campanasRecientes,
    // Líneas
    lineas,
  ] = await Promise.all([
    Tenant.countDocuments({ activo: true }),
    Tenant.countDocuments({ activo: true, 'whatsapp.status': 'connected' }),
    Customer.countDocuments({ active: true }),
    Customer.countDocuments({ active: true, $or: [{ lastContactAt: null }, { lastContactAt: { $lt: hace30dias } }] }),
    Conversation.countDocuments({ status: 'open' }),
    Message.countDocuments({ createdAt: { $gte: startOfMonth } }),
    Customer.countDocuments({ active: true, createdAt: { $gte: hace7dias } }),
    Conversation.find({ status: 'open' })
      .populate('customer', 'name phone')
      .populate('lead', 'name phone')
      .select('customer lead tenantId phone waJid isGroup groupName lastMessageAt status')
      .sort({ lastMessageAt: -1 })
      .limit(8)
      .lean(),
    // Conversaciones donde el bot respondió al menos 1 vez este mes
    Conversation.countDocuments({
      lastMessageAt: { $gte: startOfMonth },
      aiEnabled: true,
    }),
    // Conversaciones que necesitan atención ahora
    Conversation.countDocuments({ needsAttention: true, status: 'open' }),
    // Conversaciones escaladas este mes
    Conversation.countDocuments({
      escaladoAt: { $gte: startOfMonth },
      escalacionRazon: { $ne: null },
    }),
    // Mensajes inbound por día — últimos 7 días
    Message.aggregate([
      { $match: { direction: 'inbound', createdAt: { $gte: hace7dias } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: '-05:00' } },
        count: { $sum: 1 },
      }},
      { $sort: { _id: 1 } },
    ]),
    // Leads por estado
    Lead.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    // Últimas 5 campañas completadas
    Campana.find({ estado: { $in: ['completada', 'enviando'] } })
      .populate('vendedorId', 'nombre')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
    // Líneas con stats básicos
    Tenant.find({ activo: true })
      .select('nombre zona whatsapp soloMonitoreo pausado')
      .lean(),
  ])

  // Construir array de 7 días con zeros para días sin mensajes
  const actividadDiaria = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000)
    const key = d.toISOString().split('T')[0]  // 'YYYY-MM-DD'
    const entry = actividadRaw.find(a => a._id === key)
    actividadDiaria.push({
      fecha: d.toLocaleDateString('es', { weekday: 'short', day: 'numeric' }),
      count: entry?.count || 0,
    })
  }

  // Funnel de leads en orden
  const ordenFunnel = ['nuevo', 'contactado', 'interesado', 'convertido', 'descartado']
  const funnelLeads = ordenFunnel.map(s => ({
    status: s,
    count: funnelRaw.find(f => f._id === s)?.count || 0,
  }))

  // Stats de líneas con open convs y mensajes hoy
  const lineasStats = await Promise.all(lineas.map(async (l) => {
    const [openConvs, msgsHoy] = await Promise.all([
      Conversation.countDocuments({ tenantId: l._id, status: 'open' }),
      Message.countDocuments({ tenantId: l._id, direction: 'inbound', createdAt: { $gte: hoy } }),
    ])
    return {
      _id:          l._id,
      nombre:       l.nombre,
      zona:         l.zona,
      status:       l.whatsapp?.status,
      soloMonitoreo:l.soloMonitoreo,
      pausado:      l.pausado,
      openConvs,
      msgsHoy,
    }
  }))

  res.json({
    stats: {
      totalVendedores,
      vendedoresConectados,
      totalClientes,
      clientesSinContactar,
      conversacionesAbiertas,
      mensajesMes,
      clientesNuevosSemana,
      convsBotRespondio,
      convsNeedsAttention,
      convsEscaladas,
    },
    conversacionesRecientes,
    actividadDiaria,
    funnelLeads,
    campanasRecientes,
    lineasStats,
  })
})

module.exports = router
