const PublicidadProgramacion = require('../models/PublicidadProgramacion')
const PublicidadContenido    = require('../models/PublicidadContenido')
const Tenant                 = require('../models/Tenant')
const path                   = require('path')
const fs                     = require('fs')

let schedulerStarted = false

function normalizarFecha(d) {
  const f = new Date(d)
  f.setHours(0, 0, 0, 0)
  return f
}

function startPublicidadScheduler() {
  if (schedulerStarted) return
  schedulerStarted = true

  // Revisar cada minuto si hay programación para hoy que se deba enviar
  setInterval(async () => {
    try {
      const ahora = new Date()
      const hora  = ahora.getHours()
      const min   = ahora.getMinutes()

      // Enviar entre 07:00 y 07:05 (solo una vez al día)
      if (hora !== 7 || min > 5) return

      const hoy  = normalizarFecha(ahora)
      const mana = new Date(hoy); mana.setDate(mana.getDate() + 1)

      const prog = await PublicidadProgramacion.findOne({
        fecha:   { $gte: hoy, $lt: mana },
        enviado: false,
      }).populate('contenidos')

      if (!prog || !prog.contenidos.length) return

      console.log(`[Publicidad] Enviando lote del día ${hoy.toLocaleDateString('es')}`)
      await enviarPublicidadHoy(prog)
    } catch (e) {
      console.error('[Publicidad Scheduler] Error:', e.message)
    }
  }, 60_000)

  console.log('Publicidad scheduler iniciado (revisa a las 07:00)')
}

async function enviarPublicidadHoy(prog) {
  const { sessions } = require('./whatsapp.service')

  // Línea de publicidad — el tenant marcado como comunicacion con nombre que incluya publicidad
  // O bien: buscar la sesión de publicidad por su slug
  const lineaPublicidad = await Tenant.findOne({
    tipo:   'comunicacion',
    nombre: new RegExp('publicidad', 'i'),
    activo: true,
  }).lean()

  // Si no hay línea de publicidad, usar la línea principal
  const tenantEnviador = lineaPublicidad || await Tenant.findOne({ esPrincipal: true, activo: true }).lean()
  if (!tenantEnviador) {
    return { error: 'No hay línea de publicidad configurada' }
  }

  const session = sessions.get(tenantEnviador._id.toString())
  if (!session || session.status !== 'connected') {
    return { error: `Línea de publicidad (${tenantEnviador.nombre}) no está conectada` }
  }

  // Vendedores activos con WhatsApp conectado
  const vendedores = await Tenant.find({
    activo:           true,
    tipo:             'vendedor',
    'whatsapp.status': 'connected',
    'whatsapp.phone':  { $exists: true, $ne: '' },
  }).lean()

  if (!vendedores.length) {
    return { error: 'No hay vendedores conectados para recibir el lote' }
  }

  const resultados  = []
  const uploadsDir  = path.join(__dirname, '../../uploads')

  for (const vendedor of vendedores) {
    const phone = vendedor.whatsapp.phone
    if (!phone) continue

    let exitoContenido = true
    for (const contenido of prog.contenidos) {
      try {
        const fileName = path.basename(contenido.mediaUrl)
        const filePath = path.join(uploadsDir, fileName)

        if (!fs.existsSync(filePath)) {
          console.warn(`[Publicidad] Archivo no encontrado: ${filePath}`)
          continue
        }

        const { MessageMedia } = require('whatsapp-web.js')
        const media   = MessageMedia.fromFilePath(filePath)
        const caption = prog.caption
          ? `${prog.caption}\n\n_${contenido.titulo}${contenido.marca ? ' — ' + contenido.marca : ''}_`
          : `📢 *${contenido.titulo}*${contenido.marca ? '\n🏷 ' + contenido.marca : ''}`

        await session.client.sendMessage(`${phone}@c.us`, media, { caption })
        await new Promise(r => setTimeout(r, 1500))  // delay entre envíos
      } catch (e) {
        console.error(`[Publicidad] Error enviando a ${vendedor.nombre}:`, e.message)
        exitoContenido = false
      }
    }

    resultados.push({
      tenantId: vendedor._id,
      nombre:   vendedor.nombre,
      success:  exitoContenido,
      error:    exitoContenido ? '' : 'Error al enviar uno o más archivos',
    })
  }

  await PublicidadProgramacion.findByIdAndUpdate(prog._id, {
    enviado:    true,
    enviadoAt:  new Date(),
    resultados,
  })

  console.log(`[Publicidad] Lote enviado a ${resultados.filter(r => r.success).length}/${vendedores.length} vendedores`)
  return { ok: true, enviados: resultados.filter(r => r.success).length, total: vendedores.length, resultados }
}

module.exports = { startPublicidadScheduler, enviarPublicidadHoy }
