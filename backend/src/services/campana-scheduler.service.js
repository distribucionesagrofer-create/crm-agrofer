const Campana             = require('../models/Campana')
const CampanaDestinatario = require('../models/CampanaDestinatario')

let io = null
let schedulerStarted = false

function setIO(socketIo) { io = socketIo }

function startCampanaScheduler(socketIo) {
  if (schedulerStarted) return
  schedulerStarted = true
  io = socketIo

  // Check every 60s for scheduled campaigns that are due
  setInterval(async () => {
    try {
      const pendientes = await Campana.find({
        estado: 'programada',
        scheduledAt: { $lte: new Date() },
      }).lean()
      for (const c of pendientes) {
        ejecutarCampana(c._id.toString()).catch(e =>
          console.error(`Scheduler error campana ${c._id}:`, e.message)
        )
      }
    } catch (e) {
      console.error('Campana scheduler error:', e.message)
    }
  }, 60_000)
}

async function ejecutarCampana(campanaId) {
  // Filtrar por estado 'programada' para evitar doble ejecución si el scheduler solapa
  const campana = await Campana.findOneAndUpdate(
    { _id: campanaId, estado: { $in: ['programada', 'pendiente'] } },
    { $set: { estado: 'enviando', iniciadaAt: new Date() } },
    { new: true }
  ).lean()
  if (!campana) return

  const { getClient } = require('./whatsapp.service')
  const client = getClient(campana.vendedorId.toString())
  if (!client) {
    await Campana.findByIdAndUpdate(campanaId, { estado: 'error' })
    return
  }

  const destinatarios = await CampanaDestinatario.find({
    campanaId,
    estado: 'pendiente',
  }).lean()

  if (!destinatarios.length) {
    await Campana.findByIdAndUpdate(campanaId, { estado: 'completada', completadaAt: new Date() })
    return
  }

  const batchSize    = campana.batchSize              || 50
  const delayMsg     = (campana.delayBetweenMessages  || 60)   * 1000
  const delayBatch   = (campana.delayBetweenBatches   || 1800) * 1000

  let enviados = 0
  let fallidos = 0

  for (let i = 0; i < destinatarios.length; i++) {
    const dest = destinatarios[i]

    // Wait between individual messages (skip wait before first in a batch)
    if (i > 0 && i % batchSize !== 0) {
      await sleep(delayMsg)
    }
    // Extra batch gap after completing a full batch
    if (i > 0 && i % batchSize === 0) {
      console.log(`Campaña ${campanaId}: pausa entre lotes (${delayBatch / 1000}s)…`)
      await sleep(delayBatch)
    }

    try {
      const chatId = dest.phone.includes('@') ? dest.phone : `${dest.phone}@c.us`
      let sentMsg

      if (campana.imageUrl) {
        const { MessageMedia } = require('whatsapp-web.js')
        let media
        try {
          media = await MessageMedia.fromUrl(campana.imageUrl, { unsafeMime: true })
        } catch {
          // Fallback: send text only if image fails
          sentMsg = await client.sendMessage(chatId, campana.mensaje || '')
        }
        if (media) {
          sentMsg = await client.sendMessage(chatId, media, { caption: campana.mensaje || '' })
        }
      } else {
        sentMsg = await client.sendMessage(chatId, campana.mensaje)
      }

      enviados++
      await CampanaDestinatario.findByIdAndUpdate(dest._id, {
        estado:        'enviado',
        enviadoAt:     new Date(),
        whatsappMsgId: sentMsg?.id?.id || '',
      })
      await Campana.findByIdAndUpdate(campanaId, { enviados })

      emitProgress(campana.vendedorId.toString(), campanaId, { enviados, destinatarios: destinatarios.length })
    } catch (e) {
      fallidos++
      await CampanaDestinatario.findByIdAndUpdate(dest._id, {
        estado:   'fallido',
        errorMsg: e.message,
      })
      console.error(`Campaña ${campanaId} → ${dest.phone}: ${e.message}`)
    }
  }

  await Campana.findByIdAndUpdate(campanaId, {
    enviados,
    fallidos,
    estado:       'completada',
    completadaAt: new Date(),
  })

  emitProgress(campana.vendedorId.toString(), campanaId, {
    enviados,
    fallidos,
    estado: 'completada',
    destinatarios: destinatarios.length,
  })
  console.log(`Campaña ${campanaId} completada: ${enviados} enviados, ${fallidos} fallidos`)
}

function emitProgress(vendedorId, campanaId, data) {
  if (io) {
    io.to(`vendedor:${vendedorId}`).emit('campana:progress', { campanaId, ...data })
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

module.exports = { startCampanaScheduler, ejecutarCampana, setIO }
