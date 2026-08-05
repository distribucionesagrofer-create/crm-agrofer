const Tenant       = require('../models/Tenant')
const Conversation = require('../models/Conversation')
const Message      = require('../models/Message')
const { MESSAGE_DIRECTION } = require('../config/constants')

const VENTANA_24H_MS = 24 * 60 * 60 * 1000

function init() {
  // Correr cada 30 minutos
  setInterval(ejecutarFollowUps, 30 * 60 * 1000)
  console.log('Follow-up service iniciado (cada 30 min)')
}

async function ejecutarFollowUps() {
  try {
    // Solo líneas Meta API — las líneas por QR (whatsapp-web.js) nunca deben enviar
    // mensajes en vivo desde el CRM (el vendedor responde siempre desde su propio
    // celular, decisión de arquitectura ya confirmada), así que el seguimiento
    // automático no aplica ahí. Antes este filtro no existía y el follow-up intentaba
    // usar `session.client.sendMessage` (sintaxis de whatsapp-web.js) para TODOS los
    // tenants — para una línea Meta eso nunca encontraba sesión y se saltaba en
    // silencio, así que en la práctica el seguimiento jamás llegaba a la línea principal.
    const tenants = await Tenant.find({
      activo: true,
      'metaApi.enabled': true,
      'metaApi.accessToken': { $ne: '' },
      'automations.followUp.enabled': true,
      'automations.followUp.content': { $ne: '' },
    }).lean()

    const provider = require('./message-provider.service')

    for (const tenant of tenants) {
      const horas         = tenant.automations.followUp.hours || 24
      const content        = tenant.automations.followUp.content
      const templateName   = tenant.automations.followUp.templateName
      const corte          = new Date(Date.now() - horas * 60 * 60 * 1000)

      // Conversaciones abiertas sin respuesta del cliente en X horas
      const convs = await Conversation.find({
        tenantId: tenant._id,
        status:   'open',
        lastMessageAt: { $lt: corte },
      }).lean()

      for (const conv of convs) {
        // Verificar que el último mensaje NO fue del cliente (inbound) — solo hacer
        // follow-up si el ÚLTIMO mensaje fue nuestro y no respondieron
        const lastMsg = await Message.findOne({ conversation: conv._id })
          .sort({ timestamp: -1 }).lean()
        if (!lastMsg || lastMsg.direction !== MESSAGE_DIRECTION.OUTBOUND) continue

        // La ventana de mensajería libre de Meta se mide desde el ÚLTIMO mensaje del
        // cliente (no desde el nuestro) — si ya pasaron 24h desde esa última respuesta,
        // solo se puede reabrir la conversación con una plantilla aprobada.
        const lastInbound = await Message.findOne({ conversation: conv._id, direction: MESSAGE_DIRECTION.INBOUND })
          .sort({ timestamp: -1 }).lean()
        const ventanaAbierta = !!lastInbound && (Date.now() - new Date(lastInbound.timestamp).getTime()) < VENTANA_24H_MS

        try {
          let resultado
          let contenidoGuardado

          if (ventanaAbierta) {
            resultado = await provider.sendText(tenant, tenant._id.toString(), conv.phone, content)
            contenidoGuardado = content
          } else if (templateName) {
            resultado = await provider.sendTemplate(tenant, tenant._id.toString(), conv.phone, templateName)
            contenidoGuardado = `[Plantilla: ${templateName}]`
          } else {
            console.warn(`[Follow-up] ${conv.phone} [${tenant.nombre}]: ventana de 24h cerrada y sin plantilla configurada — se omite`)
            continue
          }
          if (resultado?.ok === false) throw new Error(resultado.error || 'Error enviando follow-up')

          await Message.create({
            tenantId:      tenant._id,
            conversation:  conv._id,
            direction:     MESSAGE_DIRECTION.OUTBOUND,
            content:       contenidoGuardado,
            aiGenerated:   false,
            whatsappMsgId: resultado?.messageId || undefined,
          })
          console.log(`Follow-up enviado (${ventanaAbierta ? 'texto libre' : 'plantilla'}) → ${conv.phone} [${tenant.nombre}]`)
        } catch (e) {
          console.error(`Error follow-up ${conv.phone}:`, e.message)
        }

        // Pequeño delay entre follow-ups
        await new Promise(r => setTimeout(r, 3000))
      }
    }
  } catch (err) {
    console.error('Error en follow-up service:', err.message)
  }
}

module.exports = { init, ejecutarFollowUps }
