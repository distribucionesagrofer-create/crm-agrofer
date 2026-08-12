/**
 * Webhook Meta WhatsApp Business API
 *
 * GET  /webhook/meta  → verificacion del webhook (Meta llama esto una sola vez al configurar)
 * POST /webhook/meta  → mensajes entrantes en tiempo real desde Meta
 */

const express = require('express')
const crypto  = require('crypto')
const router  = express.Router()
const Tenant     = require('../models/Tenant')
const Message    = require('../models/Message')
const Plantilla  = require('../models/PlantillaWhatsApp')
const Broadcast             = require('../models/Broadcast')
const BroadcastDestinatario = require('../models/BroadcastDestinatario')
const { parseIncomingWebhook } = require('../services/meta-api.service')
const audit = require('../services/audit.service')

// Meta manda estos nombres de estado en el evento; PAUSED/UNPAUSED no cambian
// nuestro enum local, se ignoran (el estado ya aprobado se mantiene).
const TEMPLATE_STATUS_MAP = { APPROVED: 'aprobada', REJECTED: 'rechazada', DISABLED: 'pausada' }

// Valida X-Hub-Signature-256: HMAC-SHA256 del body crudo con el App Secret del tenant.
// Meta firma cada request para que el receptor pueda confirmar que viene de ellos.
function firmaValida(rawBody, header, appSecret) {
  if (!header || !rawBody) return false
  const esperado = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')
  const a = Buffer.from(header)
  const b = Buffer.from(esperado)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

// ─── GET /webhook/meta — Verificacion de Meta ─────────────────────────────────
// Meta llama este endpoint con hub.verify_token para confirmar que el servidor es tuyo

router.get('/', async (req, res) => {
  const mode      = req.query['hub.mode']
  const token     = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']

  if (mode !== 'subscribe') {
    return res.status(400).send('Mode invalido')
  }

  // Buscar el tenant cuyo webhookVerifyToken coincide
  const tenant = await Tenant.findOne({ 'metaApi.webhookVerifyToken': token, 'metaApi.enabled': true })

  if (!tenant) {
    console.warn(`[META-WEBHOOK] Verificacion fallida para token: ${token}`)
    return res.status(403).send('Token de verificacion no coincide')
  }

  console.log(`[META-WEBHOOK] Verificacion exitosa para tenant: ${tenant.nombre}`)
  res.status(200).send(challenge)
})

// ─── POST /webhook/meta — Mensajes entrantes ──────────────────────────────────

// Mapea el status que manda Meta al enum que usa el modelo Message
const STATUS_MAP = { sent: 'sent', delivered: 'delivered', read: 'read', failed: 'failed' }

// Un mensaje de WhatsApp puede recibir varios eventos en secuencia (sent→delivered→read) —
// cada uno solo avanza el estado del destinatario del Broadcast, nunca lo retrocede, y solo
// suma al contador del Broadcast cuando de verdad avanzó (Meta puede reenviar el mismo evento).
async function actualizarBroadcastDestinatario(whatsappMsgId, metaStatus) {
  let campoEstado, campoFecha, campoContador, estadosPrevios
  if (metaStatus === 'delivered') {
    campoEstado = 'entregado'; campoFecha = 'entregadoAt'; campoContador = 'entregados'
    estadosPrevios = ['enviado']
  } else if (metaStatus === 'read') {
    campoEstado = 'leido'; campoFecha = 'leidoAt'; campoContador = 'leidos'
    estadosPrevios = ['enviado', 'entregado']
  } else {
    return
  }
  const dest = await BroadcastDestinatario.findOneAndUpdate(
    { whatsappMsgId, estado: { $in: estadosPrevios } },
    { $set: { estado: campoEstado, [campoFecha]: new Date() } },
    { new: true }
  )
  if (dest) {
    await Broadcast.findByIdAndUpdate(dest.broadcastId, { $inc: { [campoContador]: 1 } })
  }
}

router.post('/', async (req, res) => {
  // Meta espera 200 inmediato — siempre responder rapido
  res.sendStatus(200)

  try {
    const body = req.body

    // Validar que es un evento de WhatsApp
    if (body?.object !== 'whatsapp_business_account') return

    const change = body?.entry?.[0]?.changes?.[0]
    const value  = change?.value

    // Cambios de estado de plantillas (aprobada/rechazada/pausada) — no traen
    // phone_number_id porque son a nivel de WABA, no de un número — se procesan
    // aparte, buscando el tenant por businessAccountId en vez de phoneNumberId.
    if (change?.field === 'message_template_status_update') {
      const wabaId = body?.entry?.[0]?.id
      const tenantTpl = await Tenant.findOne({ 'metaApi.businessAccountId': wabaId }).lean()
      if (!tenantTpl) return

      const nuevoEstado = TEMPLATE_STATUS_MAP[value?.event]
      if (!nuevoEstado) return

      await Plantilla.findOneAndUpdate(
        { tenantId: tenantTpl._id, metaTemplateId: String(value.message_template_id) },
        { $set: { estado: nuevoEstado, motivoRechazo: value?.reason || '', ultimaConsulta: new Date() } }
      )
      console.log(`[META-WEBHOOK] Plantilla "${value?.message_template_name}" → ${nuevoEstado}`)
      return
    }

    // Identificar a que tenant pertenece este evento
    // Meta envia el phoneNumberId en entry.changes.value.metadata.phone_number_id
    const phoneNumberId = value?.metadata?.phone_number_id
    if (!phoneNumberId) return

    const tenant = await Tenant.findOne({
      'metaApi.phoneNumberId': phoneNumberId,
      'metaApi.enabled':       true,
    })
    if (!tenant) {
      console.warn(`[META-WEBHOOK] No se encontro tenant para phoneNumberId: ${phoneNumberId}`)
      audit.warn(null, 'Sistema', `Webhook Meta: no se encontró línea para phoneNumberId ${phoneNumberId}`)
      return
    }

    // Validar firma del webhook si el tenant ya configuro su App Secret.
    // Si aun no lo configuro, se procesa igual (para no romper la conexion antes de que
    // lo agreguen) pero se deja constancia en el log de que no esta protegido.
    const signatureHeader = req.get('x-hub-signature-256')
    if (tenant.metaApi.appSecret) {
      if (!firmaValida(req.rawBody, signatureHeader, tenant.metaApi.appSecret)) {
        console.warn(`[META-WEBHOOK] ⚠️ Firma invalida — evento descartado (tenant: ${tenant.nombre})`)
        audit.error(tenant._id, tenant.nombre, `Webhook Meta: firma inválida — evento descartado`)
        return
      }
    } else {
      console.warn(`[META-WEBHOOK] ⚠️ Sin App Secret configurado para ${tenant.nombre} — firma no verificada`)
      audit.warn(tenant._id, tenant.nombre, `Webhook Meta sin App Secret configurado — firma no verificada`)
    }

    // Confirmaciones de entrega/lectura/fallo de mensajes ya enviados
    if (value?.statuses?.length) {
      for (const st of value.statuses) {
        // Log siempre — antes esto era silencioso y no había forma de ver POR QUÉ falló
        // un envío (ej. plantilla de prueba) si no existía un Message guardado con ese id.
        const detalle = st.errors?.map(e => `${e.code}: ${e.title} — ${e.message || ''}`).join(' | ')
        console.log(`[META-WEBHOOK] Estado de ${st.id}: ${st.status}${detalle ? ` (${detalle})` : ''}`)
        if (st.status === 'failed') {
          audit.error(tenant._id, tenant.nombre, `Envío falló (${st.id}): ${detalle || 'sin detalle'}`)
        } else if (st.status === 'sent' || st.status === 'delivered') {
          audit.msg(tenant._id, tenant.nombre, `Estado de mensaje ${st.id}: ${st.status}`)
        }
        const mapped = STATUS_MAP[st.status]
        if (!mapped) continue
        await Message.findOneAndUpdate({ whatsappMsgId: st.id }, { status: mapped }).catch(() => {})
        await actualizarBroadcastDestinatario(st.id, st.status).catch(() => {})
      }
      return
    }

    const parsed = parseIncomingWebhook(body)
    if (!parsed || !parsed.text) return

    console.log(`[META-WEBHOOK] Mensaje de ${parsed.phone} → tenant: ${tenant.nombre} | "${parsed.text}"`)
    audit.msg(tenant._id, tenant.nombre, `📩 Mensaje de ${parsed.phone}: "${parsed.text.substring(0, 80)}"`, { phone: parsed.phone })

    // Delegar al mismo handler de mensajes que usa Baileys
    // Inyectamos el io desde el servidor principal via req.app
    const io = req.app.get('io')
    const { handleIncomingMetaMessage } = require('../services/whatsapp.service')
    await handleIncomingMetaMessage(tenant, parsed, io)

  } catch (err) {
    console.error('[META-WEBHOOK] Error procesando mensaje:', err.message)
    audit.error(null, 'Sistema', `Webhook Meta: error procesando evento — ${err.message}`)
  }
})

module.exports = router
