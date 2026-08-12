// Cartera (facturas pendientes) de un cliente, vía Sistema Principal — reutiliza el
// mismo `spPost`/lista de vendedores que ya usa Análisis Comercial.
const { spPost, VENDEDORES } = require('./sistema-principal.service')

// Trae las facturas pendientes de un cliente. Requiere idSistemaPrincipal (su id en el
// sistema externo). La API exige un vendedor_id/usuario_id en la petición, pero
// (confirmado en vivo) NO valida que ese vendedor sea realmente el asignado al cliente —
// cliente_id por sí solo determina de quién es la cartera que devuelve. Por eso, si el
// vendedor propio del cliente no está en nuestra lista (dato incompleto o vendedor que
// ya no está activo), usamos cualquiera de los que sí tenemos como "puerta de entrada"
// en vez de fallar — así no dependemos de tener las credenciales de cada vendedor real.
async function obtenerCartera(customer) {
  if (!customer.idSistemaPrincipal) {
    throw new Error('Este cliente no tiene id de Sistema Principal — no se puede consultar su cartera')
  }
  const vendedor = VENDEDORES.find(v => v.terid === customer.teridVendedor) || VENDEDORES[0]

  const resp = await spPost({
    action:      'get_cartera',
    vendedor_id: String(vendedor.terid),
    usuario_id:  String(vendedor.uid),
    perfil:      'Vendedor',
    ano:         new Date().getFullYear(),
    offset:      0,
    cliente_id:  customer.idSistemaPrincipal,
  })
  if (!resp?.ok) throw new Error(resp?.message || 'Error consultando cartera en Sistema Principal')

  const facturas = (resp.data || []).map(f => ({
    documento: f.DOCUMENTO || '',
    detalle:   f.DETALLE || '',
    fecha:     (f.FECHA || '').slice(0, 10),
    vence:     (f.FECVENCE || '').slice(0, 10),
    diasVcto:  Number(f.DIASVCTO) || 0,
    valor:     Number(f.VALOR) || 0,
    saldo:     Number(f.SALDO) || 0,
  }))
  const total = facturas.reduce((s, f) => s + f.saldo, 0)

  return { facturas, total }
}

// Genera el PDF, lo envía por WhatsApp y deja registro tanto en el chat (Message)
// como en el seguimiento de cartera (CarteraEnvio) — usado tanto por el botón manual
// del Inbox como por el módulo de Cartera (y, más adelante, el recordatorio automático).
async function enviarRecordatorioCartera(tenant, conversation, customer, motivo = 'manual', io = null) {
  const { generarCarteraPDF } = require('./cartera-pdf.service')
  const Message        = require('../models/Message')
  const CarteraEnvio   = require('../models/CarteraEnvio')
  const fs   = require('fs')
  const path = require('path')

  if (!process.env.PUBLIC_URL) throw new Error('PUBLIC_URL no configurado en el servidor')
  const usaMeta = tenant.metaApi?.enabled && tenant.metaApi?.accessToken
  if (!usaMeta) throw new Error('Esta línea no tiene Meta API habilitada')
  if (!conversation.phone) throw new Error('Conversación sin número de destino válido')

  const cartera = await obtenerCartera(customer)
  const pdfBuffer = await generarCarteraPDF(customer, cartera)

  const safeName = `cartera_${Date.now()}_${String(customer._id)}.pdf`
  const uploadDir = path.join(__dirname, '../../uploads')
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })
  fs.writeFileSync(path.join(uploadDir, safeName), pdfBuffer)
  const mediaUrl = `/media/${safeName}`
  const publicMediaUrl = `${process.env.PUBLIC_URL}${mediaUrl}`

  const caption = cartera.facturas.length
    ? `Hola ${customer.name || ''}, te recordamos que tienes un saldo pendiente de $${Math.round(cartera.total).toLocaleString('es-CO')} con AGROFER. Adjunto el detalle de tu cartera.`
    : `Hola ${customer.name || ''}, este es tu estado de cartera con AGROFER — no tienes saldos pendientes. ¡Gracias por tu confianza!`

  const provider = require('./message-provider.service')
  const vendedorId = tenant._id.toString()
  const metaResult = await provider.sendDocument(tenant, vendedorId, conversation.phone, publicMediaUrl, `Estado_Cartera_${(customer.name || 'cliente').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`, caption)

  const envio = await CarteraEnvio.create({
    tenantId: tenant._id,
    customerId: customer._id,
    facturas: cartera.facturas.map(f => ({ documento: f.documento, vence: f.vence, valor: f.valor, saldo: f.saldo })),
    totalEnviado: cartera.total,
    motivo,
    estado: metaResult?.ok === false ? 'fallido' : 'enviado',
    errorMsg: metaResult?.ok === false ? (metaResult.error || 'Error desconocido') : '',
    whatsappMsgId: metaResult?.messageId || undefined,
  })

  if (metaResult?.ok === false) {
    throw Object.assign(new Error(metaResult.error || 'Error enviando el PDF por Meta API'), { envio })
  }

  const message = await Message.create({
    tenantId: tenant._id,
    conversation: conversation._id,
    direction: 'outbound',
    content: caption,
    type: 'document',
    mediaUrl,
    mediaType: 'application/pdf',
    fileName: `Estado_Cartera_${(customer.name || 'cliente').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
    fileSize: pdfBuffer.length,
    aiGenerated: false,
    whatsappMsgId: metaResult?.messageId || undefined,
  })

  if (io) io.to(`vendedor:${vendedorId}`).emit('message:new', { conversation: conversation._id, message })

  return { message, cartera, envio }
}

module.exports = { obtenerCartera, enviarRecordatorioCartera }
