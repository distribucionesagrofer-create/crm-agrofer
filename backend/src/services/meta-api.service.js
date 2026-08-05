/**
 * Meta WhatsApp Business API Service
 *
 * Gestiona el envio de mensajes a traves de la API oficial de Meta.
 * Se activa cuando tenant.metaApi.enabled = true.
 * Documentacion: https://developers.facebook.com/docs/whatsapp/cloud-api
 */

const META_API_VERSION = 'v19.0'
const META_BASE_URL    = `https://graph.facebook.com/${META_API_VERSION}`

// ─── Funcion base de envio ─────────────────────────────────────────────────────

async function sendMetaMessage(phoneNumberId, accessToken, to, body) {
  const phone = to.replace(/\D/g, '')
  const url   = `${META_BASE_URL}/${phoneNumberId}/messages`

  try {
    const res  = await fetch(url, {
      method:  'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) {
      const detail = data?.error?.message || `HTTP ${res.status}`
      console.error(`[META-API] Error enviando mensaje a ${phone}: ${detail}`)
      return { ok: false, error: detail }
    }
    return { ok: true, messageId: data?.messages?.[0]?.id }
  } catch (err) {
    console.error(`[META-API] Error de red enviando mensaje a ${phone}: ${err.message}`)
    return { ok: false, error: err.message }
  }
}

// ─── Texto simple ──────────────────────────────────────────────────────────────

async function sendText(tenant, to, text) {
  const { phoneNumberId, accessToken } = tenant.metaApi
  return sendMetaMessage(phoneNumberId, accessToken, to, {
    messaging_product: 'whatsapp',
    recipient_type:    'individual',
    to:                to.replace(/\D/g, ''),
    type:              'text',
    text:              { body: text, preview_url: false },
  })
}

// ─── Imagen ────────────────────────────────────────────────────────────────────

async function sendImage(tenant, to, imageUrl, caption = '') {
  const { phoneNumberId, accessToken } = tenant.metaApi
  return sendMetaMessage(phoneNumberId, accessToken, to, {
    messaging_product: 'whatsapp',
    recipient_type:    'individual',
    to:                to.replace(/\D/g, ''),
    type:              'image',
    image:             { link: imageUrl, caption },
  })
}

// ─── Documento (PDF, etc.) ─────────────────────────────────────────────────────

async function sendDocument(tenant, to, docUrl, filename = 'documento.pdf', caption = '') {
  const { phoneNumberId, accessToken } = tenant.metaApi
  return sendMetaMessage(phoneNumberId, accessToken, to, {
    messaging_product: 'whatsapp',
    recipient_type:    'individual',
    to:                to.replace(/\D/g, ''),
    type:              'document',
    document:          { link: docUrl, filename, caption },
  })
}

// ─── Video ─────────────────────────────────────────────────────────────────────

async function sendVideo(tenant, to, videoUrl, caption = '') {
  const { phoneNumberId, accessToken } = tenant.metaApi
  return sendMetaMessage(phoneNumberId, accessToken, to, {
    messaging_product: 'whatsapp',
    recipient_type:    'individual',
    to:                to.replace(/\D/g, ''),
    type:              'video',
    video:             { link: videoUrl, caption },
  })
}

// ─── Audio ─────────────────────────────────────────────────────────────────────

async function sendAudio(tenant, to, audioUrl) {
  const { phoneNumberId, accessToken } = tenant.metaApi
  return sendMetaMessage(phoneNumberId, accessToken, to, {
    messaging_product: 'whatsapp',
    recipient_type:    'individual',
    to:                to.replace(/\D/g, ''),
    type:              'audio',
    audio:             { link: audioUrl },
  })
}

// ─── Botones interactivos (hasta 3) ────────────────────────────────────────────

async function sendButtons(tenant, to, bodyText, buttons) {
  const { phoneNumberId, accessToken } = tenant.metaApi
  // buttons = [{ id: 'btn_1', title: 'Quiero cotizar' }, ...]  (max 3)
  return sendMetaMessage(phoneNumberId, accessToken, to, {
    messaging_product: 'whatsapp',
    recipient_type:    'individual',
    to:                to.replace(/\D/g, ''),
    type:              'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: {
        buttons: buttons.slice(0, 3).map(b => ({
          type:  'reply',
          reply: { id: b.id, title: b.title },
        })),
      },
    },
  })
}

// ─── Lista de opciones ─────────────────────────────────────────────────────────

async function sendList(tenant, to, bodyText, buttonLabel, sections) {
  const { phoneNumberId, accessToken } = tenant.metaApi
  // sections = [{ title: 'Productos', rows: [{ id: 'p1', title: 'Fertilizante', description: '' }] }]
  return sendMetaMessage(phoneNumberId, accessToken, to, {
    messaging_product: 'whatsapp',
    recipient_type:    'individual',
    to:                to.replace(/\D/g, ''),
    type:              'interactive',
    interactive: {
      type:   'list',
      body:   { text: bodyText },
      action: { button: buttonLabel, sections },
    },
  })
}

// ─── Template (HSM) — para primer contacto o mensajes fuera de ventana 24h ────

async function sendTemplate(tenant, to, templateName, languageCode = 'es', components = []) {
  const { phoneNumberId, accessToken } = tenant.metaApi
  return sendMetaMessage(phoneNumberId, accessToken, to, {
    messaging_product: 'whatsapp',
    to:                to.replace(/\D/g, ''),
    type:              'template',
    template: {
      name:     templateName,
      language: { code: languageCode },
      components,
    },
  })
}

// ─── Descargar media entrante (fotos, audios, videos, documentos) ────────────
// Meta no manda el archivo directo en el webhook, solo un media_id. Hay que
// pedirle a la Graph API la URL temporal (expira en minutos) y luego descargarla,
// ambos pasos con el access token como Authorization.
async function downloadMedia(tenant, mediaId) {
  const { accessToken } = tenant.metaApi
  try {
    const metaRes  = await fetch(`${META_BASE_URL}/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const metaData = await metaRes.json()
    if (!metaRes.ok || !metaData.url) {
      return { ok: false, error: metaData?.error?.message || 'No se pudo obtener la URL del archivo' }
    }

    const fileRes = await fetch(metaData.url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!fileRes.ok) return { ok: false, error: `HTTP ${fileRes.status} descargando el archivo` }

    const buffer = Buffer.from(await fileRes.arrayBuffer())
    return {
      ok:       true,
      buffer,
      mimetype: metaData.mime_type || fileRes.headers.get('content-type') || 'application/octet-stream',
    }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

// ─── Parsear mensaje entrante de Meta ─────────────────────────────────────────

const TIPOS_CON_MEDIA = ['image', 'audio', 'video', 'document', 'sticker']

function parseIncomingWebhook(body) {
  try {
    const entry   = body?.entry?.[0]
    const change  = entry?.changes?.[0]
    const value   = change?.value

    if (!value?.messages?.length) return null

    const msg     = value.messages[0]
    const contact = value.contacts?.[0]
    const phone   = msg.from

    let text = ''
    let type = msg.type

    if (type === 'text')      text = msg.text?.body || ''
    if (type === 'button')    text = msg.button?.text || ''
    if (type === 'interactive') {
      const ir = msg.interactive
      if (ir?.type === 'button_reply') text = ir.button_reply?.title || ''
      if (ir?.type === 'list_reply')   text = ir.list_reply?.title   || ''
    }
    if (type === 'audio')    text = '[audio]'
    if (type === 'image')    text = '[imagen]'
    if (type === 'video')    text = '[video]'
    if (type === 'document') text = '[documento]'
    if (type === 'sticker')  text = '[sticker]'

    const mediaId      = TIPOS_CON_MEDIA.includes(type) ? msg[type]?.id : null
    const mediaCaption = TIPOS_CON_MEDIA.includes(type) ? (msg[type]?.caption || '') : ''

    return {
      phone,
      text,
      type,
      messageId:   msg.id,
      timestamp:   new Date(parseInt(msg.timestamp) * 1000),
      contactName: contact?.profile?.name || '',
      mediaId,
      mediaCaption,
      raw:         msg,
    }
  } catch {
    return null
  }
}

module.exports = {
  sendText,
  sendImage,
  sendDocument,
  sendVideo,
  sendAudio,
  sendButtons,
  sendList,
  sendTemplate,
  parseIncomingWebhook,
  downloadMedia,
}
