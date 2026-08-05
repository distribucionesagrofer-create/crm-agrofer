const Conversation = require('../models/Conversation')
const Message      = require('../models/Message')
const Lead         = require('../models/Lead')
const Tenant       = require('../models/Tenant')
const { MESSAGE_DIRECTION } = require('../config/constants')
const { sustituirVariables } = require('./flow.service')
const provider = require('./message-provider.service')

const MEDIA_TIPO_A_MESSAGE_TYPE = { imagen: 'image', documento: 'document', video: 'video' }

/**
 * Ejecuta las acciones de un flujo ya evaluado (ejecutarFlujo), usando
 * message-provider.service para que funcione igual sin importar si el tenant
 * usa whatsapp-web.js o Meta Cloud API. Compartido entre handleIncomingMessage
 * y handleIncomingMetaMessage — antes cada canal hubiera necesitado su propia copia.
 */
async function ejecutarAccionesFlujo({ tenant, tenantId, phone, waJid, acciones, conversacionId, contactType, contactId, io, chat }) {
  const convVarsFresh = (await Conversation.findById(conversacionId).lean())?.variables || {}
  let pasarAIA = false

  for (const accion of (acciones || [])) {
    if (accion.tipo === 'delay') {
      await new Promise(r => setTimeout(r, (accion.segundos || 3) * 1000))
      continue
    }

    if (accion.tipo === 'typing') {
      if (chat?.sendStateTyping) {
        await chat.sendStateTyping()
        await new Promise(r => setTimeout(r, (accion.duracion || 2) * 1000))
        await chat.clearState()
      }
      continue
    }

    if (accion.tipo === 'mensaje') {
      const texto_final = sustituirVariables(accion.contenido, convVarsFresh)
      await new Promise(r => setTimeout(r, 800 + Math.random() * 1200))
      await provider.sendText(tenant, tenantId, phone, texto_final)
      await Message.create({ tenantId, conversation: conversacionId, direction: MESSAGE_DIRECTION.OUTBOUND, content: texto_final, aiGenerated: false })
      io.to(`vendedor:${tenantId}`).emit('message:new', { conversation: conversacionId })
      continue
    }

    if (accion.tipo === 'media' && accion.url) {
      try {
        const captionFinal = sustituirVariables(accion.caption || '', convVarsFresh)
        const tipo = accion.mediaTipo || 'imagen'
        if (tipo === 'documento')    await provider.sendDocument(tenant, tenantId, phone, accion.url, undefined, captionFinal)
        else if (tipo === 'video')   await provider.sendVideo(tenant, tenantId, phone, accion.url, captionFinal)
        else                         await provider.sendImage(tenant, tenantId, phone, accion.url, captionFinal)
        await Message.create({
          tenantId, conversation: conversacionId, direction: MESSAGE_DIRECTION.OUTBOUND,
          content: accion.caption || '[media]', type: MEDIA_TIPO_A_MESSAGE_TYPE[tipo] || 'image', aiGenerated: false,
        })
        io.to(`vendedor:${tenantId}`).emit('message:new', { conversation: conversacionId })
      } catch (e) { console.error('Error enviando media desde flujo:', e.message) }
      continue
    }

    if (accion.tipo === 'etiqueta') {
      await Conversation.findByIdAndUpdate(conversacionId, { $addToSet: { etiquetas: accion.etiqueta } })
      if (contactType === 'lead') await Lead.findByIdAndUpdate(contactId, { $set: { status: 'interesado' } })
      continue
    }

    if (accion.tipo === 'delegar' && accion.vendedorId) {
      const vendedorTarget = await Tenant.findById(accion.vendedorId).lean()
      if (vendedorTarget && provider.isAvailable(vendedorTarget, accion.vendedorId.toString())) {
        const saludoMsg = `Hola! Soy ${vendedorTarget.nombre} de AGROFER. En que te puedo ayudar?`
        await provider.sendText(vendedorTarget, accion.vendedorId.toString(), phone, saludoMsg)
        await Conversation.create({ tenantId: accion.vendedorId, lead: contactId, phone, waJid, lastMessageAt: new Date() })
      }
      continue
    }

    if (accion.tipo === 'cambiar_estado' && contactType === 'lead') {
      await Lead.findByIdAndUpdate(contactId, { status: accion.estado })
      continue
    }

    if (accion.tipo === 'ia') {
      pasarAIA = true
    }
  }

  return { pasarAIA }
}

module.exports = { ejecutarAccionesFlujo }
