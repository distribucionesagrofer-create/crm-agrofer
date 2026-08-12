require('dotenv').config()
require('express-async-errors')

// whatsapp-web.js re-inyecta scripts en cada navegación interna de WhatsApp Web (Client.js:inject) —
// si dos navegaciones se solapan, esa reinyección lanza "Execution context was destroyed" sin que
// nada lo capture, y por defecto Node mata todo el proceso (todas las líneas, toda la API).
const audit = require('./services/audit.service')
process.on('unhandledRejection', (reason) => {
  console.error('[UnhandledRejection]', reason?.message || reason)
  audit.system(`Unhandled rejection: ${reason?.message || reason}`)
})
process.on('uncaughtException', (err) => {
  console.error('[UncaughtException]', err?.message || err)
  audit.system(`Uncaught exception: ${err?.message || err}`)
})

const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const morgan = require('morgan')

const { connect: connectDB } = require('./config/database')
const { helmetConfig, corsConfig, rateLimiterMiddleware } = require('./config/security')

const app = express()
// Corre siempre detrás de un proxy (nginx, y en el VPS tambien Traefik) — sin esto,
// Express ve todo el trafico como si viniera de una sola IP (la del proxy), y el rate
// limiter (mas abajo) bloquea a todos los usuarios reales de una sola vez con 429.
app.set('trust proxy', true)
const server = http.createServer(app)
const io = new Server(server, {
  cors: { origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true },
  maxHttpBufferSize: 5 * 1024 * 1024, // frames JPEG del screencast en vivo pueden superar el 1MB por defecto
})

app.use(helmetConfig)
app.use(corsConfig)
// Adjuntos del inbox (POST /api/conversations/:id/media) van en base64 dentro del JSON,
// y Meta permite documentos de hasta 100MB — eso son ~134MB ya codificados en base64, muy
// por encima del límite general de 25mb. Esta ruta necesita su propio parser con límite
// más alto; el resto de la API se queda con el límite chico (incluye rawBody para la firma
// del webhook de Meta, que esta ruta no usa).
const mediaJsonParser   = express.json({ limit: '140mb' })
const defaultJsonParser = express.json({ limit: '25mb', verify: (req, res, buf) => { req.rawBody = buf } })
app.use((req, res, next) => {
  if (/^\/api\/conversations\/[^/]+\/media$/.test(req.path)) return mediaJsonParser(req, res, next)
  return defaultJsonParser(req, res, next)
})
app.use(morgan('dev'))
app.set('io', io)

// Servir archivos de media (imágenes, videos, audios subidos por WhatsApp) — antes del
// rate limiter a propósito: una sola galería (ej. merchandising) puede pedir decenas de
// archivos de golpe, y no es abuso de API, es solo servir estáticos.
const path = require('path')
const fs   = require('fs')
const uploadsDir = path.join(__dirname, '../uploads')
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })
app.use('/media', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
  next()
}, require('express').static(uploadsDir, {
  setHeaders: (res, filePath) => {
    const ext = path.extname(filePath).toLowerCase()
    const mimes = {
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
      '.gif': 'image/gif', '.webp': 'image/webp',
      '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
      '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
      '.opus': 'audio/ogg; codecs=opus',
      '.pdf': 'application/pdf',
    }
    if (mimes[ext]) res.setHeader('Content-Type', mimes[ext])
    res.setHeader('Cache-Control', 'public, max-age=604800')
  },
}))

app.use(rateLimiterMiddleware)

app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date() }))
app.use('/api/auth',          require('./routes/auth'))
app.use('/api/vendedores',    require('./routes/tenants'))
app.use('/api/clientes',      require('./routes/customers'))
app.use('/api/conversations', require('./routes/conversations'))
app.use('/api/whatsapp',      require('./routes/whatsapp'))
app.use('/api/knowledge',     require('./routes/knowledge'))
app.use('/api/dashboard',     require('./routes/dashboard'))
app.use('/api/quick-replies', require('./routes/quick-replies'))
app.use('/api/broadcasts',    require('./routes/broadcasts'))
app.use('/api/cartera',       require('./routes/cartera'))
app.use('/api/leads',         require('./routes/leads'))
app.use('/api/flujos',        require('./routes/flujos'))
app.use('/api/importar-visitas', require('./routes/importar-visitas'))
app.use('/api/audit',        require('./routes/audit'))
app.use('/api/config',       require('./routes/config'))
app.use('/api/tareas',       require('./routes/tareas'))
app.use('/api/cotizaciones',    require('./routes/cotizaciones'))
app.use('/api/merchandising',  require('./routes/merchandising'))
app.use('/api/cronograma',     require('./routes/cronograma'))
app.use('/api/publicidad',     require('./routes/publicidad'))
app.use('/api/analisis-comercial',  require('./routes/analisis-comercial'))
app.use('/api/productos-catalogo',  require('./routes/productos-catalogo'))
app.use('/api/plantillas-whatsapp', require('./routes/plantillas-whatsapp'))
app.use('/webhook/meta',       require('./routes/webhook-meta'))
require('./models/Campana')
require('./models/CampanaDestinatario')
require('./models/Flow')

// Sala de socket por vendedor + sala de auditoría
io.on('connection', (socket) => {
  socket.on('join:vendedor', (vendedorId, cb) => {
    socket.join(`vendedor:${vendedorId}`)
    if (typeof cb === 'function') cb()
  })
  socket.on('join:audit', () => {
    socket.join('audit:room')
  })
  socket.on('join:admin', () => {
    socket.join('admin:global')
  })
  // Navegación en vivo del WhatsApp real (screencast) — clic/scroll llegan por socket
  // para menor latencia que HTTP normal
  socket.on('screencast:click', ({ tenantId, pctX, pctY }) => {
    require('./services/screencast.service').clickEnPantalla(tenantId, pctX, pctY).catch(() => {})
  })
  socket.on('screencast:scroll', ({ tenantId, pctX, pctY, deltaY }) => {
    require('./services/screencast.service').scrollEnPantalla(tenantId, pctX, pctY, deltaY).catch(() => {})
  })
  // Tecleo real en la vista en vivo — solo llega a la página si el foco actual es el
  // buscador de chats, nunca el cuadro de escribir mensaje (ver screencast.service.js:tecleaEnPantalla)
  socket.on('screencast:key', ({ tenantId, key }) => {
    require('./services/screencast.service').tecleaEnPantalla(tenantId, key).catch(() => {})
  })
  // Si el admin cierra la pestaña sin darle a "Finalizar" en Ver en vivo, no hay ningún
  // otro aviso al backend — sin esto, el Chromium real se queda corriendo para siempre
  // (el watchdog de 20s de líneas de rotación está desactivado a propósito mientras dura
  // un Ver en vivo). Se revisa si, tras irse este socket, ya no queda nadie viendo cada
  // transmisión activa, y si es así se apaga sola.
  socket.on('disconnect', () => {
    require('./services/screencast.service').limpiarHuerfanos(io).catch(() => {})
  })
})

app.use((err, req, res, next) => {
  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    return res.status(400).json({ error: 'ID inválido' })
  }
  console.error(err.message)
  audit.error(null, 'Sistema', `Error en ${req.method} ${req.originalUrl}: ${err.message}`)
  res.status(err.status || 500).json({ error: err.message || 'Error interno' })
})

async function autoReconnectWhatsApp() {
  const fs = require('fs')
  const path = require('path')
  const sessionsDir = path.join(__dirname, '../sessions')
  if (!fs.existsSync(sessionsDir)) return

  const { createSession } = require('./services/whatsapp.service')
  const Tenant = require('./models/Tenant')

  const sessionFolders = fs.readdirSync(sessionsDir)
    .filter(f => f.startsWith('session-') && fs.statSync(path.join(sessionsDir, f)).isDirectory())
    .map(f => f.replace('session-', ''))

  // Arranque secuencial con delay — varios Chromium simultáneos compiten por recursos y crashean
  for (const vendedorId of sessionFolders) {
    const vendedor = await Tenant.findById(vendedorId).catch(() => null)
    if (!vendedor || !vendedor.activo) continue
    // Las líneas de rotación solo-Estados las conecta/desconecta el scheduler de turnos,
    // no deben quedar conectadas permanentemente
    if (vendedor.rotarSoloEstados) continue
    if (vendedor.whatsapp?.status === 'disconnected') {
      console.log(`⏭️ Saltando reconexión (desconectado en BD): ${vendedor.nombre}`)
      continue
    }
    console.log(`🔄 Reconectando WhatsApp: ${vendedor.nombre}`)
    await createSession(vendedorId, io).catch(err =>
      console.error(`Error reconectando ${vendedorId}:`, err.message)
    )
    // Esperar antes del siguiente para que Chromium estabilice
    await new Promise(r => setTimeout(r, 12000))
  }
}

const start = async () => {
  await connectDB()
  require('./services/audit.service').setIO(io)
  require('./services/audit.service').system('Servidor iniciado')
  const PORT = process.env.PORT || 3000
  server.listen(PORT, () => {
    console.log(`Servidor en puerto ${PORT}`)
    autoReconnectWhatsApp()
    // Iniciar scheduler de broadcasts programados (plantillas de Meta)
    require('./services/broadcast-scheduler.service').startBroadcastScheduler(io)
    // Iniciar motor de follow-up (solo línea Meta — ver comentario en followup.service.js)
    setTimeout(() => {
      require('./services/followup.service').init()
    }, 5000)
    // Iniciar scheduler de publicidad diaria
    require('./services/publicidad-scheduler.service').startPublicidadScheduler()
    // Iniciar scheduler de estados WhatsApp (auto-publica en líneas conectadas cada 30 min)
    require('./services/estados-scheduler.service').startEstadosScheduler(io)
  })
}

start()
