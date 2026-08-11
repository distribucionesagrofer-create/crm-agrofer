const Broadcast             = require('../models/Broadcast')
const BroadcastDestinatario = require('../models/BroadcastDestinatario')
const Customer               = require('../models/Customer')
const Tenant                 = require('../models/Tenant')
const Conversation            = require('../models/Conversation')
const Message                 = require('../models/Message')
const PlantillaWhatsApp       = require('../models/PlantillaWhatsApp')
const { MESSAGE_DIRECTION }   = require('../config/constants')

let io = null
let schedulerStarted = false

function startBroadcastScheduler(socketIo) {
  if (schedulerStarted) return
  schedulerStarted = true
  io = socketIo

  setInterval(async () => {
    try {
      const pendientes = await Broadcast.find({
        estado: 'programada',
        scheduledAt: { $lte: new Date() },
      }).lean()
      for (const b of pendientes) {
        ejecutarBroadcast(b._id.toString()).catch(e =>
          console.error(`Scheduler error broadcast ${b._id}:`, e.message)
        )
      }
    } catch (e) {
      console.error('Broadcast scheduler error:', e.message)
    }
  }, 60_000)
}

// Arma los parámetros de {{n}} en orden — cada entrada de `personalizacion` dice si esa
// posición es un valor fijo o un campo del cliente (name/empresa/zona/ciudad).
function resolverComponents(personalizacion, customer) {
  if (!personalizacion?.length) return []
  const ordenado = [...personalizacion].sort((a, b) => a.variable - b.variable)
  const parameters = ordenado.map(p => {
    const texto = p.tipo === 'campo' ? (customer?.[p.valor] || '') : p.valor
    return { type: 'text', text: String(texto || '') }
  })
  return [{ type: 'body', parameters }]
}

// Sustituye {{n}} en el cuerpo de la plantilla con los valores resueltos, para guardar
// el mensaje real (no solo el nombre de la plantilla) en el Message del inbox.
function resolverTextoPlantilla(cuerpo, personalizacion, customer) {
  let texto = cuerpo || ''
  for (const p of (personalizacion || [])) {
    const valor = p.tipo === 'campo' ? (customer?.[p.valor] || '') : p.valor
    texto = texto.split(`{{${p.variable}}}`).join(String(valor || ''))
  }
  return texto
}

// Registra el envío en el inbox (Conversation + Message) para que el asesor vea, en el
// hilo del contacto, exactamente la plantilla que se le mandó — con botones y todo.
async function registrarEnInbox(tenantId, dest, customer, plantilla, textoResuelto, whatsappMsgId) {
  try {
    let conv = await Conversation.findOneAndUpdate(
      { tenantId, phone: dest.phone, status: { $in: ['open', 'closed', 'pending'] } },
      { $set: { lastMessageAt: new Date(), ...(customer ? { customer: customer._id } : {}) } },
      { upsert: false, new: true, sort: { createdAt: -1 } }
    )
    if (!conv) {
      conv = await Conversation.create({
        tenantId, phone: dest.phone,
        customer: customer?._id || null,
        contactName: dest.nombre || customer?.name || '',
        aiEnabled: false, lastMessageAt: new Date(),
      })
    }
    await Message.create({
      tenantId, conversation: conv._id,
      direction: MESSAGE_DIRECTION.OUTBOUND,
      content: textoResuelto, type: 'template',
      templateHeader: plantilla?.header?.tipo === 'texto' ? plantilla.header.contenido : '',
      templateFooter: plantilla?.footer || '',
      templateButtons: plantilla?.botones || [],
      aiGenerated: false,
      whatsappMsgId: whatsappMsgId || undefined,
    })
  } catch (e) {
    console.error(`[Broadcast] Error registrando en inbox (${dest.phone}):`, e.message)
  }
}

async function ejecutarBroadcast(broadcastId) {
  const broadcast = await Broadcast.findOneAndUpdate(
    { _id: broadcastId, estado: { $in: ['programada', 'pendiente'] } },
    { $set: { estado: 'enviando', iniciadaAt: new Date() } },
    { new: true }
  ).lean()
  if (!broadcast) return

  const tenant = await Tenant.findById(broadcast.tenantId).lean()
  if (!tenant?.metaApi?.enabled || !tenant?.metaApi?.accessToken) {
    await Broadcast.findByIdAndUpdate(broadcastId, { estado: 'error' })
    return
  }

  const destinatarios = await BroadcastDestinatario.find({ broadcastId, estado: 'pendiente' }).lean()
  if (!destinatarios.length) {
    await Broadcast.findByIdAndUpdate(broadcastId, { estado: 'completada', completadaAt: new Date() })
    return
  }

  const provider  = require('./message-provider.service')
  const plantilla = await PlantillaWhatsApp.findById(broadcast.plantillaId).lean()

  let enviados = 0
  let fallidos = 0
  const BATCH = 20

  for (let i = 0; i < destinatarios.length; i += BATCH) {
    const lote = destinatarios.slice(i, i + BATCH)
    await Promise.all(lote.map(async (dest) => {
      try {
        const customer = dest.customerId ? await Customer.findById(dest.customerId).lean() : null
        const components = resolverComponents(broadcast.personalizacion, customer)

        const result = await provider.sendTemplate(
          tenant, broadcast.tenantId.toString(), dest.phone,
          broadcast.plantillaNombre, broadcast.idioma || 'es', components
        )

        if (result?.ok) {
          enviados++
          await BroadcastDestinatario.findByIdAndUpdate(dest._id, {
            estado: 'enviado', enviadoAt: new Date(), whatsappMsgId: result.messageId || '',
          })
          const textoResuelto = resolverTextoPlantilla(plantilla?.cuerpo, broadcast.personalizacion, customer)
          await registrarEnInbox(broadcast.tenantId, dest, customer, plantilla, textoResuelto, result.messageId)
        } else {
          fallidos++
          await BroadcastDestinatario.findByIdAndUpdate(dest._id, {
            estado: 'fallido', errorMsg: result?.error || 'Error desconocido',
          })
        }
      } catch (e) {
        fallidos++
        await BroadcastDestinatario.findByIdAndUpdate(dest._id, { estado: 'fallido', errorMsg: e.message })
        console.error(`Broadcast ${broadcastId} → ${dest.phone}: ${e.message}`)
      }
    }))

    await Broadcast.findByIdAndUpdate(broadcastId, { enviados, fallidos })
    emitProgress(broadcastId, { enviados, fallidos, destinatarios: destinatarios.length })
  }

  await Broadcast.findByIdAndUpdate(broadcastId, {
    enviados, fallidos, estado: 'completada', completadaAt: new Date(),
  })
  emitProgress(broadcastId, { enviados, fallidos, estado: 'completada', destinatarios: destinatarios.length })
  console.log(`Broadcast ${broadcastId} completado: ${enviados} enviados, ${fallidos} fallidos`)
}

function emitProgress(broadcastId, data) {
  if (io) io.emit('broadcast:progress', { broadcastId, ...data })
}

module.exports = { startBroadcastScheduler, ejecutarBroadcast }
