/**
 * Meta WhatsApp Message Templates — gestión (crear/consultar/eliminar) de plantillas
 * en la WABA del tenant. Separado de meta-api.service.js, que solo ENVÍA mensajes.
 * Docs: https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates
 */

const META_API_VERSION = 'v19.0'
const META_BASE_URL    = `https://graph.facebook.com/${META_API_VERSION}`

const FORMATO_HEADER = { imagen: 'IMAGE', documento: 'DOCUMENT', video: 'VIDEO' }

function construirComponentsPayload(plantilla) {
  const components = []

  if (plantilla.header?.tipo && plantilla.header.tipo !== 'ninguno') {
    if (plantilla.header.tipo === 'texto') {
      components.push({ type: 'HEADER', format: 'TEXT', text: plantilla.header.contenido })
    } else {
      components.push({ type: 'HEADER', format: FORMATO_HEADER[plantilla.header.tipo] })
    }
  }

  // Meta exige un valor de ejemplo por cada variable {{n}} en el cuerpo — sin esto,
  // el revisor automático no puede evaluar el contenido y rechaza con INVALID_FORMAT.
  const variables = [...new Set((plantilla.cuerpo.match(/\{\{\d+\}\}/g) || []))]
  const EJEMPLOS = ['Juan Pérez', '12345', 'AGROFER', 'martes', '$50.000']
  const bodyComponent = { type: 'BODY', text: plantilla.cuerpo }
  if (variables.length) {
    bodyComponent.example = { body_text: [variables.map((_, i) => EJEMPLOS[i % EJEMPLOS.length])] }
  }
  components.push(bodyComponent)

  if (plantilla.footer) {
    components.push({ type: 'FOOTER', text: plantilla.footer })
  }

  if (plantilla.botones?.length) {
    components.push({
      type: 'BUTTONS',
      buttons: plantilla.botones.map(b => {
        if (b.tipo === 'URL')          return { type: 'URL', text: b.texto, url: b.valor }
        if (b.tipo === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: b.texto, phone_number: b.valor }
        return { type: 'QUICK_REPLY', text: b.texto }
      }),
    })
  }

  return components
}

async function crearPlantillaEnMeta(tenant, plantilla) {
  const { businessAccountId, accessToken } = tenant.metaApi
  const url = `${META_BASE_URL}/${businessAccountId}/message_templates`

  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:       plantilla.nombre,
        category:   plantilla.categoria,
        language:   plantilla.idioma,
        components: construirComponentsPayload(plantilla),
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      return { ok: false, error: data?.error?.error_user_msg || data?.error?.message || `HTTP ${res.status}` }
    }
    return { ok: true, metaTemplateId: data.id, status: data.status }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

async function consultarEstadoEnMeta(tenant, metaTemplateId) {
  const { accessToken } = tenant.metaApi
  const url = `${META_BASE_URL}/${metaTemplateId}?fields=status,rejected_reason,name`

  try {
    const res  = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    const data = await res.json()
    if (!res.ok) return { ok: false, error: data?.error?.message || `HTTP ${res.status}` }
    return { ok: true, status: data.status, rejectedReason: data.rejected_reason || '' }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

async function eliminarPlantillaEnMeta(tenant, nombre) {
  const { businessAccountId, accessToken } = tenant.metaApi
  const url = `${META_BASE_URL}/${businessAccountId}/message_templates?name=${encodeURIComponent(nombre)}`

  try {
    const res  = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } })
    const data = await res.json()
    if (!res.ok) return { ok: false, error: data?.error?.message || `HTTP ${res.status}` }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

module.exports = { crearPlantillaEnMeta, consultarEstadoEnMeta, eliminarPlantillaEnMeta, construirComponentsPayload }
