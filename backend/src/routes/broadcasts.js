const router = require('express').Router()
const mongoose = require('mongoose')
const { authenticate } = require('../middleware/auth')
const Customer               = require('../models/Customer')
const Tenant                 = require('../models/Tenant')
const PlantillaWhatsApp      = require('../models/PlantillaWhatsApp')
const Broadcast              = require('../models/Broadcast')
const BroadcastDestinatario  = require('../models/BroadcastDestinatario')

router.use(authenticate)

const CAMPOS_PERSONALIZABLES = ['name', 'empresa', 'zona', 'ciudad']

async function lineaPrincipal() {
  return Tenant.findOne({ esPrincipal: true })
}

// GET /api/broadcasts/plantillas-disponibles — plantillas aprobadas de la línea principal
router.get('/plantillas-disponibles', async (req, res) => {
  const linea = await lineaPrincipal()
  if (!linea) return res.json({ plantillas: [] })
  const plantillas = await PlantillaWhatsApp.find({ tenantId: linea._id, estado: 'aprobada' })
    .sort({ createdAt: -1 })
    .lean()
  res.json({ plantillas })
})

// GET /api/broadcasts/plantillas/:id/variables — extrae {{n}} del cuerpo
router.get('/plantillas/:id/variables', async (req, res) => {
  const plantilla = await PlantillaWhatsApp.findById(req.params.id).lean()
  if (!plantilla) return res.status(404).json({ error: 'Plantilla no encontrada' })
  const variables = [...new Set((plantilla.cuerpo.match(/\{\{\d+\}\}/g) || []))]
    .map(v => parseInt(v.replace(/\D/g, '')))
    .sort((a, b) => a - b)
  res.json({ variables, camposDisponibles: CAMPOS_PERSONALIZABLES })
})

// GET /api/broadcasts/audiencia/preview — cuenta y muestra clientes según filtros
router.get('/audiencia/preview', async (req, res) => {
  const { zona, temperatura, potencial, sector, pais, vendedorId } = req.query
  const query = { active: true, phone: { $exists: true, $ne: '' } }
  if (zona)        query.zona        = zona
  if (temperatura) query.temperatura = temperatura
  if (potencial)   query.potencial   = potencial
  if (sector)       query.sector     = sector
  if (pais)         query.pais       = pais
  if (vendedorId)   query.vendedorId = vendedorId

  const [clientes, total] = await Promise.all([
    Customer.find(query).select('name phone zona empresa ciudad').limit(5).lean(),
    Customer.countDocuments(query),
  ])
  res.json({ muestra: clientes, total })
})

// GET /api/broadcasts — historial
router.get('/', async (req, res) => {
  const broadcasts = await Broadcast.find({}).sort({ createdAt: -1 }).limit(50).lean()
  res.json({ broadcasts })
})

// GET /api/broadcasts/:id — detalle con contadores para el panel de analytics
router.get('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'ID inválido' })
  const broadcast = await Broadcast.findById(req.params.id).lean()
  if (!broadcast) return res.status(404).json({ error: 'Broadcast no encontrado' })
  res.json({ broadcast })
})

// GET /api/broadcasts/:id/destinatarios
router.get('/:id/destinatarios', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'ID inválido' })
  const { page = 1, limit = 50 } = req.query
  const skip = (parseInt(page) - 1) * parseInt(limit)
  const [destinatarios, total] = await Promise.all([
    BroadcastDestinatario.find({ broadcastId: req.params.id })
      .sort({ createdAt: 1 }).skip(skip).limit(parseInt(limit)).lean(),
    BroadcastDestinatario.countDocuments({ broadcastId: req.params.id }),
  ])
  res.json({ destinatarios, total })
})

// POST /api/broadcasts — crea y (si no está programado) arranca el envío
router.post('/', async (req, res) => {
  const { nombre, plantillaId, segmento = {}, personalizacion = [], scheduledAt } = req.body
  if (!plantillaId) return res.status(400).json({ error: 'plantillaId es requerido' })

  const plantilla = await PlantillaWhatsApp.findById(plantillaId)
  if (!plantilla) return res.status(404).json({ error: 'Plantilla no encontrada' })
  if (plantilla.estado !== 'aprobada') return res.status(400).json({ error: 'Esta plantilla todavía no está aprobada por Meta' })

  const linea = await lineaPrincipal()
  if (!linea?.metaApi?.enabled) return res.status(400).json({ error: 'La línea principal no tiene Meta API habilitada' })

  const query = { active: true, phone: { $exists: true, $ne: '' } }
  if (segmento.zona)        query.zona        = segmento.zona
  if (segmento.temperatura) query.temperatura = segmento.temperatura
  if (segmento.potencial)   query.potencial   = segmento.potencial
  if (segmento.sector)      query.sector      = segmento.sector
  if (segmento.pais)        query.pais        = segmento.pais
  if (segmento.vendedorId)  query.vendedorId  = segmento.vendedorId

  const clientes = await Customer.find(query).select('_id phone name').lean()
  if (!clientes.length) return res.status(400).json({ error: 'No hay destinatarios con ese filtro' })

  const ahora     = new Date()
  const scheduled = scheduledAt ? new Date(scheduledAt) : null
  const esProgram = scheduled && scheduled > ahora

  const broadcast = await Broadcast.create({
    tenantId:        linea._id,
    nombre:          nombre || `Broadcast ${ahora.toLocaleDateString('es')}`,
    plantillaId:     plantilla._id,
    plantillaNombre: plantilla.nombre,
    idioma:          plantilla.idioma || 'es',
    categoria:       plantilla.categoria,
    segmento,
    personalizacion,
    scheduledAt:     scheduled || null,
    destinatarios:   clientes.length,
    estado:          esProgram ? 'programada' : 'pendiente',
    iniciadaAt:      esProgram ? null : ahora,
  })

  await BroadcastDestinatario.insertMany(
    clientes.map(c => ({
      broadcastId: broadcast._id,
      customerId:  c._id,
      phone:       c.phone,
      nombre:      c.name,
      estado:      'pendiente',
    }))
  )

  res.json({
    ok: true,
    broadcastId: broadcast._id,
    total:       clientes.length,
    programada:  esProgram,
    scheduledAt: scheduled,
  })

  if (!esProgram) {
    const { ejecutarBroadcast } = require('../services/broadcast-scheduler.service')
    ejecutarBroadcast(broadcast._id.toString()).catch(e =>
      console.error('Error ejecutando broadcast:', e.message)
    )
  }
})

// DELETE /api/broadcasts/:id
router.delete('/:id', async (req, res) => {
  const broadcast = await Broadcast.findById(req.params.id)
  if (!broadcast) return res.status(404).json({ error: 'Broadcast no encontrado' })
  if (broadcast.estado === 'enviando') return res.status(400).json({ error: 'No se puede cancelar un broadcast en curso' })
  await BroadcastDestinatario.deleteMany({ broadcastId: broadcast._id })
  await broadcast.deleteOne()
  res.json({ ok: true })
})

module.exports = router
