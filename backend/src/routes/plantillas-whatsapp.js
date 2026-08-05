const router     = require('express').Router()
const Plantilla  = require('../models/PlantillaWhatsApp')
const Tenant     = require('../models/Tenant')
const { authenticate } = require('../middleware/auth')
const { crearPlantillaEnMeta, consultarEstadoEnMeta, eliminarPlantillaEnMeta } = require('../services/meta-templates.service')

router.use(authenticate)

// GET /api/plantillas-whatsapp?tenantId= — listar plantillas de una línea
router.get('/', async (req, res) => {
  const { tenantId } = req.query
  const query = tenantId ? { tenantId } : {}
  const plantillas = await Plantilla.find(query).sort({ createdAt: -1 }).lean()
  res.json({ plantillas })
})

// POST /api/plantillas-whatsapp — crear en estado 'borrador' (siempre local, sin llamar a Meta)
router.post('/', async (req, res) => {
  const { tenantId, nombre, categoria, idioma, header, cuerpo, footer, botones } = req.body
  if (!tenantId || !nombre || !categoria || !cuerpo) {
    return res.status(400).json({ error: 'tenantId, nombre, categoria y cuerpo son requeridos' })
  }
  const nombreNorm = nombre.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
  try {
    const plantilla = await Plantilla.create({
      tenantId, nombre: nombreNorm, categoria,
      idioma: idioma || 'es', header, cuerpo, footer: footer || '', botones: botones || [],
    })
    res.status(201).json({ plantilla })
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: 'Ya existe una plantilla con ese nombre en esta línea' })
    res.status(500).json({ error: e.message })
  }
})

// POST /api/plantillas-whatsapp/:id/enviar — intenta crear la plantilla en Meta para aprobación
router.post('/:id/enviar', async (req, res) => {
  const plantilla = await Plantilla.findById(req.params.id)
  if (!plantilla) return res.status(404).json({ error: 'Plantilla no encontrada' })

  const tenant = await Tenant.findById(plantilla.tenantId).lean()
  if (!tenant?.metaApi?.accessToken || !tenant?.metaApi?.businessAccountId) {
    return res.status(400).json({ error: 'Esta línea todavía no tiene credenciales de Meta configuradas' })
  }

  const result = await crearPlantillaEnMeta(tenant, plantilla)
  if (!result.ok) return res.status(502).json({ error: result.error })

  plantilla.estado         = 'enviada'
  plantilla.metaTemplateId = result.metaTemplateId
  plantilla.ultimaConsulta = new Date()
  await plantilla.save()

  res.json({ plantilla })
})

// POST /api/plantillas-whatsapp/:id/probar — envía la plantilla YA APROBADA a un número real,
// para probarla (distinto de /enviar, que solo la somete a aprobación de Meta)
router.post('/:id/probar', async (req, res) => {
  const { to, params } = req.body
  if (!to?.trim()) return res.status(400).json({ error: 'Falta el número de destino' })

  const plantilla = await Plantilla.findById(req.params.id)
  if (!plantilla) return res.status(404).json({ error: 'Plantilla no encontrada' })
  if (plantilla.estado !== 'aprobada') return res.status(400).json({ error: 'Esta plantilla todavía no está aprobada por Meta' })

  const tenant = await Tenant.findById(plantilla.tenantId).lean()
  if (!tenant?.metaApi?.accessToken) return res.status(400).json({ error: 'Esta línea no tiene Meta API configurada' })

  const components = params?.length
    ? [{ type: 'body', parameters: params.map(p => ({ type: 'text', text: String(p) })) }]
    : []

  const provider = require('../services/message-provider.service')
  const result = await provider.sendTemplate(tenant, plantilla.tenantId.toString(), to, plantilla.nombre, plantilla.idioma || 'es', components)
  if (!result?.ok) return res.status(502).json({ error: result?.error || 'Error enviando la plantilla' })

  res.json({ ok: true, messageId: result.messageId })
})

// GET /api/plantillas-whatsapp/:id/estado — sincroniza estado/motivoRechazo desde Meta
router.get('/:id/estado', async (req, res) => {
  const plantilla = await Plantilla.findById(req.params.id)
  if (!plantilla) return res.status(404).json({ error: 'Plantilla no encontrada' })
  if (!plantilla.metaTemplateId) return res.status(400).json({ error: 'Esta plantilla todavía no se ha enviado a Meta' })

  const tenant = await Tenant.findById(plantilla.tenantId).lean()
  const result = await consultarEstadoEnMeta(tenant, plantilla.metaTemplateId)
  if (!result.ok) return res.status(502).json({ error: result.error })

  const ESTADO_MAP = { APPROVED: 'aprobada', REJECTED: 'rechazada', PENDING: 'enviada', PAUSED: 'pausada' }
  plantilla.estado         = ESTADO_MAP[result.status] || plantilla.estado
  plantilla.motivoRechazo  = result.rejectedReason || ''
  plantilla.ultimaConsulta = new Date()
  await plantilla.save()

  res.json({ plantilla })
})

// DELETE /api/plantillas-whatsapp/:id
router.delete('/:id', async (req, res) => {
  const plantilla = await Plantilla.findById(req.params.id)
  if (!plantilla) return res.status(404).json({ error: 'Plantilla no encontrada' })

  if (plantilla.metaTemplateId) {
    const tenant = await Tenant.findById(plantilla.tenantId).lean()
    if (tenant?.metaApi?.accessToken) {
      await eliminarPlantillaEnMeta(tenant, plantilla.nombre).catch(() => {})
    }
  }

  await plantilla.deleteOne()
  res.json({ ok: true })
})

module.exports = router
