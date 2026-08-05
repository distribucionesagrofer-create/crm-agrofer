const express  = require('express')
const path     = require('path')
const fs       = require('fs')
const router   = express.Router()
const { authenticate } = require('../middleware/auth')

const PublicidadContenido    = require('../models/PublicidadContenido')
const PublicidadProgramacion = require('../models/PublicidadProgramacion')
const EstadoMonitoreo        = require('../models/EstadoMonitoreo')
const EstadoPublicado        = require('../models/EstadoPublicado')
const Tenant                 = require('../models/Tenant')

router.use(authenticate)

function normalizarFecha(fecha) {
  const d = new Date(fecha)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

// ── CONTENIDO ──────────────────────────────────────────────────────────────────

router.get('/contenidos', async (req, res) => {
  const { marca, tipo } = req.query
  const filtro = { activo: true }
  if (marca) filtro.marca = new RegExp(marca, 'i')
  if (tipo)  filtro.tipo  = tipo
  const contenidos = await PublicidadContenido.find(filtro).sort({ createdAt: -1 })
  res.json({ contenidos })
})

const MIME_PERMITIDOS = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp',
]

router.post('/contenidos', async (req, res) => {
  const { titulo, marca, descripcion, tags, base64, mimetype, filename } = req.body
  if (!titulo?.trim() || !base64 || !mimetype) {
    return res.status(400).json({ error: 'titulo, base64 y mimetype son requeridos' })
  }
  if (!MIME_PERMITIDOS.includes(mimetype)) {
    return res.status(400).json({ error: `Tipo de archivo no soportado: ${mimetype}. Solo imágenes (jpg/png/webp/gif) o videos (mp4/mov/webm)` })
  }

  const uploadsDir = path.join(__dirname, '../../uploads')
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

  const ext      = mimetype.split('/')[1]?.split(';')[0] || 'jpg'
  const safeName = `pub_${Date.now()}_${(filename || 'media').replace(/[^a-zA-Z0-9._-]/g, '_')}`
  const filePath = path.join(uploadsDir, safeName)
  fs.writeFileSync(filePath, Buffer.from(base64, 'base64'))

  const tipo = mimetype.startsWith('video/') ? 'video' : 'imagen'

  const contenido = await PublicidadContenido.create({
    titulo:      titulo.trim(),
    marca:       (marca || '').trim(),
    descripcion: (descripcion || '').trim(),
    tags:        Array.isArray(tags) ? tags : (tags ? [tags] : []),
    tipo,
    mediaUrl:    `/media/${safeName}`,
    mediaType:   mimetype,
  })

  res.json({ contenido })
})

router.delete('/contenidos/:id', async (req, res) => {
  const contenido = await PublicidadContenido.findById(req.params.id)
  if (!contenido) return res.status(404).json({ error: 'No encontrado' })

  // Eliminar archivo físico
  const filePath = path.join(__dirname, '../../uploads', path.basename(contenido.mediaUrl))
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)

  await PublicidadContenido.findByIdAndDelete(req.params.id)
  res.json({ ok: true })
})

// ── MARCAS disponibles ─────────────────────────────────────────────────────────

router.get('/marcas', async (req, res) => {
  const marcas = await PublicidadContenido.distinct('marca', { activo: true, marca: { $ne: '' } })
  res.json({ marcas: marcas.sort() })
})

// ── RENOMBRAR lote (tag) o marca ───────────────────────────────────────────────
router.put('/lotes/renombrar', async (req, res) => {
  const { tipo, valorActual, nuevoValor } = req.body
  if (!valorActual?.trim() || !nuevoValor?.trim()) return res.status(400).json({ error: 'Valores requeridos' })
  if (tipo === 'tag') {
    await PublicidadContenido.updateMany(
      { activo: true, tags: valorActual },
      [{ $set: { tags: { $map: { input: '$tags', as: 't', in: { $cond: [{ $eq: ['$$t', valorActual] }, nuevoValor, '$$t'] } } } } }]
    )
    // También actualizar descripcion si tiene "Lote: valorActual"
    await PublicidadContenido.updateMany(
      { activo: true, descripcion: `Lote: ${valorActual}` },
      { $set: { descripcion: `Lote: ${nuevoValor}` } }
    )
  } else if (tipo === 'marca') {
    await PublicidadContenido.updateMany(
      { activo: true, marca: new RegExp(`^${valorActual.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      { $set: { marca: nuevoValor } }
    )
  }
  res.json({ ok: true })
})

// ── PROGRAMACIÓN ───────────────────────────────────────────────────────────────

router.get('/programaciones', async (req, res) => {
  const { mes } = req.query  // formato "2026-06"
  let filtro = {}
  if (mes) {
    const [anio, m] = mes.split('-').map(Number)
    const inicio = new Date(anio, m - 1, 1)
    const fin    = new Date(anio, m, 1)
    filtro.fecha = { $gte: inicio, $lt: fin }
  }
  const programaciones = await PublicidadProgramacion.find(filtro)
    .populate('contenidos')
    .sort({ fecha: 1 })
  res.json({ programaciones })
})

router.post('/programaciones', async (req, res) => {
  const { fecha, contenidos, caption } = req.body
  if (!fecha) return res.status(400).json({ error: 'fecha requerida' })

  const fechaNorm = normalizarFecha(fecha)

  const prog = await PublicidadProgramacion.findOneAndUpdate(
    { fecha: fechaNorm },
    { $set: { contenidos: contenidos || [], caption: caption || '', enviado: false } },
    { upsert: true, new: true }
  ).populate('contenidos')

  res.json({ programacion: prog })
})

router.delete('/programaciones/:id', async (req, res) => {
  await PublicidadProgramacion.findByIdAndDelete(req.params.id)
  res.json({ ok: true })
})

// Programar una semana entera de golpe (lunes a domingo)
router.post('/programaciones/semana', async (req, res) => {
  const { lunesISO, contenidos, caption } = req.body
  if (!lunesISO || !contenidos?.length) return res.status(400).json({ error: 'lunesISO y contenidos requeridos' })

  const lunes = normalizarFecha(lunesISO)
  const dia   = lunes.getUTCDay()
  // Ajustar al lunes real por si acaso llega otro día de la semana
  const diff  = dia === 0 ? -6 : 1 - dia
  lunes.setUTCDate(lunes.getUTCDate() + diff)

  const ops = []
  for (let i = 0; i < 7; i++) {
    const fecha = new Date(lunes)
    fecha.setUTCDate(lunes.getUTCDate() + i)
    ops.push({
      updateOne: {
        filter: { fecha },
        update: { $set: { contenidos, caption: caption || '', enviado: false } },
        upsert: true,
      },
    })
  }
  await PublicidadProgramacion.bulkWrite(ops)

  const semanaProgs = await PublicidadProgramacion.find({
    fecha: { $gte: lunes, $lt: new Date(lunes.getTime() + 7 * 86400000) },
  }).populate('contenidos')

  res.json({ ok: true, dias: semanaProgs.length })
})

// ── ENVÍO MANUAL ───────────────────────────────────────────────────────────────

router.post('/programaciones/:id/enviar', async (req, res) => {
  const prog = await PublicidadProgramacion.findById(req.params.id).populate('contenidos')
  if (!prog) return res.status(404).json({ error: 'Programación no encontrada' })

  const { enviarPublicidadHoy } = require('../services/publicidad-scheduler.service')
  const resultado = await enviarPublicidadHoy(prog)
  res.json(resultado)
})

// ── MONITOR DE ESTADOS ─────────────────────────────────────────────────────────

router.get('/estados', async (req, res) => {
  const fechaParam = req.query.fecha || new Date().toISOString().slice(0, 10)
  const fecha = normalizarFecha(fechaParam)
  const fin   = new Date(fecha); fin.setDate(fin.getDate() + 1)

  // Todos los vendedores activos
  const vendedores = await Tenant.find({ activo: true, tipo: 'vendedor' })
    .select('nombre zona whatsapp.status whatsapp.phone')
    .sort({ nombre: 1 })
    .lean()

  // Estados registrados ese día
  const estados = await EstadoMonitoreo.find({
    fecha: { $gte: fecha, $lt: fin },
  }).lean()

  const estadoMap = {}
  for (const e of estados) estadoMap[e.tenantId.toString()] = e

  const resultado = vendedores.map(v => ({
    tenantId:    v._id,
    nombre:      v.nombre,
    zona:        v.zona,
    conectado:   v.whatsapp?.status === 'connected',
    subioEstado: !!estadoMap[v._id.toString()]?.subioEstado,
    horaEstado:  estadoMap[v._id.toString()]?.horaEstado || null,
  }))

  res.json({ fecha: fecha.toISOString(), vendedores: resultado })
})

// ── STATS RÁPIDAS ──────────────────────────────────────────────────────────────

router.get('/stats', async (req, res) => {
  const hoy   = normalizarFecha(new Date())
  const manana = new Date(hoy); manana.setDate(manana.getDate() + 1)

  const [totalContenido, progHoy, estadosHoy, totalVendedores] = await Promise.all([
    PublicidadContenido.countDocuments({ activo: true }),
    PublicidadProgramacion.findOne({ fecha: { $gte: hoy, $lt: manana } }).lean(),
    EstadoMonitoreo.countDocuments({ fecha: { $gte: hoy, $lt: manana }, subioEstado: true }),
    Tenant.countDocuments({ activo: true, tipo: 'vendedor' }),
  ])

  res.json({
    totalContenido,
    tieneProgHoy: !!progHoy,
    enviadoHoy:   progHoy?.enviado || false,
    estadosHoy,
    totalVendedores,
  })
})

// ── ESTADOS WHATSAPP ───────────────────────────────────────────────────────────

// GET /api/publicidad/estados/lineas — estado de cada línea (conectada + último estado publicado)
router.get('/estados/lineas', async (req, res) => {
  const { sessions } = require('../services/whatsapp.service')
  const tenants = await Tenant.find({ activo: true })
    .select('nombre zona tipo whatsapp rotarSoloEstados')
    .sort({ tipo: 1, nombre: 1 })
    .lean()

  const ahora = new Date()
  const lineas = await Promise.all(tenants.map(async t => {
    const sess     = sessions.get(t._id.toString())
    const conectada = sess?.status === 'connected'

    const ultimo = await EstadoPublicado.findOne({ tenantId: t._id, activo: true, expiraEn: { $gt: ahora } })
      .sort({ createdAt: -1 })
      .populate('contenidos', 'mediaUrl tipo titulo marca')
      .lean()

    return {
      tenantId:    t._id,
      nombre:      t.nombre,
      zona:        t.zona || '',
      tipo:        t.tipo || 'vendedor',
      conectada,
      // Línea de rotación: aunque salga "desconectada" ahora mismo, "Publicar Todos" la
      // puede usar igual — se reconecta sola con la sesión guardada (ver /estados/publicar-todos)
      rotarSoloEstados: !!t.rotarSoloEstados,
      // OJO: `whatsapp.phone` NO sirve para esto — varios tenants lo traen precargado como
      // dato de contacto sin haber conectado nunca por WhatsApp Web. `connectedAt` en cambio
      // SOLO lo escribe el handler 'ready' tras un enlace real y exitoso (whatsapp.service.js),
      // así que es la única señal confiable de "esta sesión va a reconectar sin pedir QR".
      vinculada: !!t.whatsapp?.connectedAt,
      ultimoEstado: ultimo ? {
        publicadoEn: ultimo.publicadoEn,
        expiraEn:    ultimo.expiraEn,
        activo:      true,
        contenidos:  ultimo.contenidos?.slice(0, 1) || [],
      } : null,
    }
  }))

  res.json({ lineas })
})

// GET /api/publicidad/estados/debug-screenshot/:tenantId — captura de pantalla real (temporal, diagnóstico)
router.get('/estados/debug-screenshot/:tenantId', async (req, res) => {
  const { sessions } = require('../services/whatsapp.service')
  const sess = sessions.get(req.params.tenantId)
  if (!sess?.client?.pupPage) return res.status(400).json({ error: 'Sin sesión' })
  try {
    const shot = await sess.client.pupPage.screenshot({ encoding: 'base64' })
    const bodyText = await sess.client.pupPage.evaluate(() => document.body.innerText.slice(0, 500))
    res.json({ shot, bodyText })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/publicidad/estados/debug-store/:tenantId — inspecciona Store para borrado y vistas
router.get('/estados/debug-store/:tenantId', async (req, res) => {
  const { sessions } = require('../services/whatsapp.service')
  const sess = sessions.get(req.params.tenantId)
  if (!sess?.client?.pupPage) return res.status(400).json({ error: 'Sin sesión' })

  const info = await sess.client.pupPage.evaluate(() => {
    const result = {
      storeKeys: Object.keys(window.Store || {}).filter(k => /status/i.test(k))
    }

    // Explorar Status store (donde están los estados enviados/recibidos)
    if (window.Store.Status) {
      const models = window.Store.Status.getModelsArray?.() || []
      result.Status_count = models.length
      result.Status = models.map(m => {
        const msgs = m.msgs?.getModelsArray?.() || m.msgs?.models || []
        return {
          id:       m.id?._serialized || String(m.id),
          type:     m.type,
          msgCount: msgs.length,
          msgs: msgs.slice(0, 10).map(msg => ({
            id:       msg.id?._serialized,
            shortId:  msg.id?.id,
            fromMe:   msg.id?.fromMe,
            viewed:   msg.viewed,
            viewedBy: msg.orderedViewedBy?.length || msg.viewedBy?.length || 0,
            type:        msg.type,
            ack:         msg.ack,
            mimetype:    msg.mimetype,
            size:        msg.size,
            caption:     msg.caption,
            mediaKey:    msg.mediaKey ? 'presente' : 'AUSENTE',
            filehash:    msg.filehash || msg.mediaData?.filehash || null,
            mediaStage:  msg.mediaData?.mediaStage || null,
            clientUrl:   msg.clientUrl || msg.deprecatedMms3Url || null,
            uploadError: msg.mediaData?.error || null,
          }))
        }
      })
    }

    // StatusUtils keys para borrar y vistas
    if (window.Store.StatusUtils) {
      result.StatusUtils_keys = Object.keys(window.Store.StatusUtils)
    }

    return result
  })

  res.json(info)
})

// DELETE /api/publicidad/estados/linea/:tenantId — borra TODOS los estados activos de la línea (UI real)
router.delete('/estados/linea/:tenantId', async (req, res) => {
  const { eliminarEstadosLinea } = require('../services/estados-scheduler.service')
  const result = await eliminarEstadosLinea(req.params.tenantId)
  if (!result.ok) return res.status(502).json(result)
  res.json(result)
})

// POST /api/publicidad/estados/publicar/:tenantId — publicar en línea específica (responde de inmediato)
// Sirve tanto para líneas normales ya conectadas como para líneas de rotación dormidas —
// a estas últimas las reconecta primero con la sesión guardada (sin QR), publica, y las
// desconecta de nuevo, igual que hace publicar-todos pero para una sola línea puntual
// (útil para probar/aislar una línea sin disparar la ronda completa).
router.post('/estados/publicar/:tenantId', async (req, res) => {
  const { contenidoIds, caption, programacionId } = req.body
  if (!contenidoIds?.length) return res.status(400).json({ error: 'contenidoIds requeridos' })

  const contenidos = await PublicidadContenido.find({ _id: { $in: contenidoIds }, activo: true }).lean()
  if (!contenidos.length) return res.status(400).json({ error: 'Sin contenidos válidos' })

  const tenant = await Tenant.findById(req.params.tenantId).lean()
  if (!tenant) return res.status(404).json({ error: 'Línea no encontrada' })

  // Responder inmediatamente para evitar timeout en conexiones lentas
  res.json({ ok: true, procesando: true, total: contenidos.length })

  const { publicarEstadoEnLinea, publicarLineaRotativaIndividual } = require('../services/estados-scheduler.service')
  if (tenant.rotarSoloEstados) {
    publicarLineaRotativaIndividual(tenant, contenidos, caption || '', programacionId || null)
      .catch(e => console.error('[Estados] Error publicando en línea rotativa:', e.message))
  } else {
    publicarEstadoEnLinea(tenant._id.toString(), contenidos, caption || '', programacionId || null)
      .catch(e => console.error('[Estados] Error publicando en línea:', e.message))
  }
})

// POST /api/publicidad/estados/publicar-todos — publica en TODAS las líneas: las que ya
// están conectadas ahora mismo (directo), y las de rotación (rotarSoloEstados) que estén
// dormidas — a esas las reconecta con la sesión guardada, publica, y las vuelve a
// desconectar, de a pocas a la vez (mismo patrón que ya usa DELETE /estados/todas, para
// que "Publicar" escale igual de bien que "Eliminar" sin quedar atado a líneas ya prendidas).
router.post('/estados/publicar-todos', async (req, res) => {
  const { contenidoIds, caption, programacionId } = req.body
  if (!contenidoIds?.length) return res.status(400).json({ error: 'contenidoIds requeridos' })

  const contenidos = await PublicidadContenido.find({ _id: { $in: contenidoIds }, activo: true }).lean()
  if (!contenidos.length) return res.status(400).json({ error: 'Sin contenidos válidos' })

  const { sessions } = require('../services/whatsapp.service')
  const { publicarEstadoEnLinea, publicarEstadosRotativo } = require('../services/estados-scheduler.service')
  const tenants = await Tenant.find({ activo: true }).lean()
  const conectadas = tenants.filter(t => !t.rotarSoloEstados && sessions.get(t._id.toString())?.status === 'connected')
  // Mismo filtro que usa `publicarEstadosRotativo` internamente (líneas nunca vinculadas
  // no se pueden despertar solas) — sin esto, el número de "líneas" que ve el admin en el
  // botón no coincidía con lo que de verdad se intentaba publicar.
  const rotativas  = tenants.filter(t => t.rotarSoloEstados && t.whatsapp?.connectedAt)

  if (!conectadas.length && !rotativas.length) {
    return res.status(400).json({ error: 'No hay líneas conectadas ni líneas de rotación con sesión vinculada' })
  }

  // Responder de inmediato — el envío puede tardar varios minutos con muchas líneas
  res.json({ ok: true, procesando: true, lineas: conectadas.length + rotativas.length, total: contenidos.length })

  // Líneas normales ya conectadas — publicar directo
  ;(async () => {
    for (const t of conectadas) {
      await publicarEstadoEnLinea(t._id.toString(), contenidos, caption || '', programacionId || null)
        .catch(e => console.error(`[Estados] Error en ${t.nombre}:`, e.message))
    }
    console.log(`[Estados] Publicación masiva completada en ${conectadas.length} líneas conectadas`)
  })()

  // Líneas de rotación dormidas — reconectar, publicar, desconectar, siguiente
  if (rotativas.length > 0) {
    publicarEstadosRotativo(contenidos, caption || '')
      .then(r => { if (!r.ok) console.warn('[Estados-Rotativo] Ronda no se ejecutó:', r.error) })
      .catch(e => console.error('[Estados-Rotativo] Error en la ronda:', e.message))
  }
})

// DELETE /api/publicidad/estados/todas — elimina los estados de TODAS las líneas:
// las que ya están conectadas ahora mismo (directo), y las de rotación (rotarSoloEstados)
// que estén dormidas — a esas las reconecta, elimina y vuelve a desconectar, igual que
// publicarEstadosRotativo. Así el botón "Eliminar" escala igual que "Publicar".
router.delete('/estados/todas', async (req, res) => {
  const { sessions }                                    = require('../services/whatsapp.service')
  const { eliminarEstadosLinea, eliminarEstadosRotativo } = require('../services/estados-scheduler.service')

  const tenants = await Tenant.find({ activo: true }).lean()
  const conectadas = tenants.filter(t => !t.rotarSoloEstados && sessions.get(t._id.toString())?.status === 'connected')

  const ahora = new Date()
  const rotativas = tenants.filter(t => t.rotarSoloEstados)
  let rotativasConEstado = 0
  for (const t of rotativas) {
    const vigente = await EstadoPublicado.findOne({ tenantId: t._id, activo: true, expiraEn: { $gt: ahora } }).lean()
    if (vigente) rotativasConEstado++
  }

  if (!conectadas.length && !rotativasConEstado) {
    return res.status(400).json({ error: 'No hay líneas conectadas ni líneas de rotación con estado activo' })
  }

  // Responder de inmediato — puede tardar varios minutos con muchas líneas
  res.json({ ok: true, procesando: true, lineas: conectadas.length + rotativasConEstado })

  // Líneas normales ya conectadas — eliminar directo
  ;(async () => {
    const resultados = []
    for (const t of conectadas) {
      const r = await eliminarEstadosLinea(t._id.toString()).catch(e => ({ ok: false, error: e.message }))
      resultados.push({ tenantId: t._id, nombre: t.nombre, ...r })
    }
    const totalEliminados = resultados.reduce((s, r) => s + (r.eliminados || 0), 0)
    console.log(`[Estados] Borrado masivo (líneas conectadas) completado en ${conectadas.length} líneas — ${totalEliminados} estados eliminados`)
  })()

  // Líneas de rotación dormidas — reconectar, eliminar, desconectar, siguiente
  if (rotativasConEstado > 0) {
    eliminarEstadosRotativo().catch(e => console.error('[Estados-Rotativo-Eliminar] Error en la ronda:', e.message))
  }
})

// POST /api/publicidad/estados/rotativo — publica en las líneas rotarSoloEstados
// (conecta con sesión guardada, publica, desconecta, siguiente — responde de inmediato)
router.post('/estados/rotativo', async (req, res) => {
  const { contenidoIds, caption } = req.body
  if (!contenidoIds?.length) return res.status(400).json({ error: 'contenidoIds requeridos' })

  const contenidos = await PublicidadContenido.find({ _id: { $in: contenidoIds }, activo: true }).lean()
  if (!contenidos.length) return res.status(400).json({ error: 'Sin contenidos válidos' })

  const totalLineas = await Tenant.countDocuments({ activo: true, rotarSoloEstados: true })
  if (!totalLineas) return res.status(400).json({ error: 'No hay líneas marcadas rotarSoloEstados' })

  res.json({ ok: true, procesando: true, lineas: totalLineas })

  const { publicarEstadosRotativo } = require('../services/estados-scheduler.service')
  publicarEstadosRotativo(contenidos, caption || '')
    .catch(e => console.error('[Estados-Rotativo] Error en la ronda:', e.message))
})

module.exports = router
