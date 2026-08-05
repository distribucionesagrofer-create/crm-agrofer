/**
 * Message Provider — Capa de abstracción de transporte
 *
 * El bot no sabe si envía por Meta API o WhatsApp Web.
 * Solo llama sendText(), sendImage(), etc.
 * Este servicio decide cuál proveedor usar según tenant.metaApi.enabled
 */

const metaApi = require('./meta-api.service')

// sessions se inyecta desde whatsapp.service para evitar dependencia circular
let _sessions = null
function setSessions(sessions) { _sessions = sessions }

// ─── Enviar texto ──────────────────────────────────────────────────────────────
async function sendText(tenant, tenantId, to, text) {
  if (tenant.metaApi?.enabled && tenant.metaApi?.accessToken) {
    return metaApi.sendText(tenant, to, text)
  }
  const sess = _sessions?.get(tenantId)
  if (sess?.client) {
    const jid = to.includes('@') ? to : `${to}@c.us`
    return sess.client.sendMessage(jid, text)
  }
  console.warn(`[PROVIDER] Sin sesión disponible para ${tenantId}`)
}

// ─── Enviar imagen ─────────────────────────────────────────────────────────────
async function sendImage(tenant, tenantId, to, imageUrl, caption = '') {
  if (tenant.metaApi?.enabled && tenant.metaApi?.accessToken) {
    return metaApi.sendImage(tenant, to, imageUrl, caption)
  }
  const sess = _sessions?.get(tenantId)
  if (sess?.client) {
    const { MessageMedia } = require('whatsapp-web.js')
    const jid   = to.includes('@') ? to : `${to}@c.us`
    const media = await MessageMedia.fromUrl(imageUrl)
    return sess.client.sendMessage(jid, media, { caption })
  }
}

// ─── Enviar documento ─────────────────────────────────────────────────────────
async function sendDocument(tenant, tenantId, to, docUrl, filename = 'documento.pdf', caption = '') {
  if (tenant.metaApi?.enabled && tenant.metaApi?.accessToken) {
    return metaApi.sendDocument(tenant, to, docUrl, filename, caption)
  }
  const sess = _sessions?.get(tenantId)
  if (sess?.client) {
    const { MessageMedia } = require('whatsapp-web.js')
    const jid   = to.includes('@') ? to : `${to}@c.us`
    const media = await MessageMedia.fromUrl(docUrl)
    return sess.client.sendMessage(jid, media, { caption, sendMediaAsDocument: true })
  }
}

// ─── Enviar video ──────────────────────────────────────────────────────────────
async function sendVideo(tenant, tenantId, to, videoUrl, caption = '') {
  if (tenant.metaApi?.enabled && tenant.metaApi?.accessToken) {
    return metaApi.sendVideo(tenant, to, videoUrl, caption)
  }
  const sess = _sessions?.get(tenantId)
  if (sess?.client) {
    const { MessageMedia } = require('whatsapp-web.js')
    const jid   = to.includes('@') ? to : `${to}@c.us`
    const media = await MessageMedia.fromUrl(videoUrl)
    return sess.client.sendMessage(jid, media, { caption })
  }
}

// ─── Enviar audio ──────────────────────────────────────────────────────────────
async function sendAudio(tenant, tenantId, to, audioUrl) {
  if (tenant.metaApi?.enabled && tenant.metaApi?.accessToken) {
    return metaApi.sendAudio(tenant, to, audioUrl)
  }
  const sess = _sessions?.get(tenantId)
  if (sess?.client) {
    const { MessageMedia } = require('whatsapp-web.js')
    const jid   = to.includes('@') ? to : `${to}@c.us`
    const media = await MessageMedia.fromUrl(audioUrl)
    return sess.client.sendMessage(jid, media, { sendAudioAsVoice: true })
  }
}

// ─── Enviar botones interactivos ───────────────────────────────────────────────
async function sendButtons(tenant, tenantId, to, bodyText, buttons) {
  if (tenant.metaApi?.enabled && tenant.metaApi?.accessToken) {
    return metaApi.sendButtons(tenant, to, bodyText, buttons)
  }
  // WhatsApp Web no soporta botones nativos — enviar como texto con opciones
  const sess = _sessions?.get(tenantId)
  if (sess?.client) {
    const jid = to.includes('@') ? to : `${to}@c.us`
    const opcionesTexto = buttons.map((b, i) => `${i + 1}. ${b.title}`).join('\n')
    return sess.client.sendMessage(jid, `${bodyText}\n\n${opcionesTexto}`)
  }
}

// ─── Enviar template (solo Meta) ───────────────────────────────────────────────
async function sendTemplate(tenant, tenantId, to, templateName, languageCode = 'es', components = []) {
  if (tenant.metaApi?.enabled && tenant.metaApi?.accessToken) {
    return metaApi.sendTemplate(tenant, to, templateName, languageCode, components)
  }
  console.warn(`[PROVIDER] Templates solo disponibles con Meta API`)
}

// ─── Indicador de escritura ────────────────────────────────────────────────────
async function sendTyping(tenant, tenantId, chat) {
  if (tenant.metaApi?.enabled) return // Meta no tiene typing indicator
  try { if (chat?.sendStateTyping) await chat.sendStateTyping() } catch (_) {}
}

// ─── Marcar como leído ─────────────────────────────────────────────────────────
async function markAsRead(tenant, tenantId, chat, messageId) {
  if (tenant.metaApi?.enabled && tenant.metaApi?.accessToken) {
    // Meta: marcar como leído via API
    const { phoneNumberId, accessToken } = tenant.metaApi
    try {
      await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: messageId }),
      })
    } catch (_) {}
    return
  }
  try { if (chat?.sendSeen) await chat.sendSeen() } catch (_) {}
}

// ─── ¿Está disponible el proveedor? ───────────────────────────────────────────
function isAvailable(tenant, tenantId) {
  if (tenant.metaApi?.enabled && tenant.metaApi?.accessToken) return true
  return !!_sessions?.get(tenantId)?.client
}

module.exports = { setSessions, sendText, sendImage, sendDocument, sendVideo, sendAudio, sendButtons, sendTemplate, sendTyping, markAsRead, isAvailable }
