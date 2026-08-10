const { Client, LocalAuth } = require('whatsapp-web.js')
const qrcode = require('qrcode')
const Customer = require('../models/Customer')
const Lead = require('../models/Lead')
const Conversation = require('../models/Conversation')
const Message = require('../models/Message')
const Tenant = require('../models/Tenant')
const { orchestrate }        = require('./bot-orchestrator.service')
const { detectPromptInjection, sanitizeInput } = require('./security.service')
const { WHATSAPP_STATUS, MESSAGE_DIRECTION } = require('../config/constants')
const { ejecutarFlujo } = require('./flow.service')
const audit    = require('./audit.service')
const provider = require('./message-provider.service')

// ── Monitor de estados de vendedores ─────────────────────────────────────────
async function _registrarEstadoVendedor(phone, tenantOrigenId) {
  try {
    const EstadoMonitoreo = require('../models/EstadoMonitoreo')

    // Buscar vendedor por teléfono (con o sin código de país 57)
    const sin57 = phone.replace(/^57/, '')
    const con57 = phone.startsWith('57') ? phone : `57${phone}`

    let vendedor = await Tenant.findOne({
      tipo:   'vendedor',
      activo: true,
      $or: [
        { 'whatsapp.phone': phone },
        { 'whatsapp.phone': con57 },
        { 'whatsapp.phone': sin57 },
      ],
    }).lean()

    // Si no encontró por teléfono, intentar por contacto de la línea receptora
    if (!vendedor && tenantOrigenId) {
      const sess = sessions.get(tenantOrigenId.toString())
      if (sess?.client) {
        try {
          const contact = await sess.client.getContactById(`${phone}@c.us`)
          const nombreContacto = contact?.name || contact?.pushname || ''
          if (nombreContacto && /^vendedor/i.test(nombreContacto)) {
            // Buscar tenant por nombre similar
            const todos = await Tenant.find({ tipo: 'vendedor', activo: true }).lean()
            const normNombre = nombreContacto.replace(/^vendedor[\s-]*/i, '').toLowerCase()
            vendedor = todos.find(t => t.nombre.toLowerCase().includes(normNombre) || normNombre.includes(t.nombre.toLowerCase()))
          }
        } catch (_) {}
      }
    }

    if (!vendedor) {
      console.log(`[EstadoMonitoreo] Sin vendedor para teléfono ${phone}`)
      return
    }

    const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
    await EstadoMonitoreo.findOneAndUpdate(
      { fecha: hoy, tenantId: vendedor._id },
      { $set: { subioEstado: true, horaEstado: new Date() } },
      { upsert: true }
    )
    console.log(`[EstadoMonitoreo] ✅ ${vendedor.nombre} subió estado`)
  } catch (e) {
    console.error('[EstadoMonitoreo] Error:', e.message)
  }
}

// ── Bot de publicidad por marca (línea comunicación) ─────────────────────────
function _extraerMarcaPublicidad(text) {
  const norm = (text || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()

  // Patrones aceptados (de más específico a más general):
  // "mandame/dame/quiero/enviame la publicidad de X"
  // "publicidad de X"
  // "publicidad X"
  // "pub X" / "pub de X"
  const patrones = [
    /(?:m[aá]ndame|dame|quiero|env[ií]ame|manda)\s+(?:la\s+)?(?:publicidad|pub(?:li)?)\s+(?:de\s+)?(.+)/,
    /publicidad\s+(?:de\s+)?(.+)/,
    /pub\s+(?:de\s+)?(.+)/,
  ]
  for (const pat of patrones) {
    const m = norm.match(pat)
    if (m) {
      const marca = m[1].replace(/[?!.,]+$/, '').trim()
      if (marca.length >= 2) return marca
    }
  }
  return null
}

async function _enviarPublicidadMarca(sess, from, marcaBuscada) {
  const PublicidadContenido = require('../models/PublicidadContenido')
  const { MessageMedia } = require('whatsapp-web.js')
  const path = require('path')
  const fs   = require('fs')

  if (!sess || sess.status !== 'connected') return

  // Búsqueda flexible por marca
  const contenidos = await PublicidadContenido.find({
    activo: true,
    marca:  new RegExp(marcaBuscada.split(/\s+/).join('.*'), 'i'),
  }).limit(10).lean()

  if (!contenidos.length) {
    // Sugerir marcas disponibles
    const marcasDisp = await PublicidadContenido.distinct('marca', { activo: true, marca: { $ne: '' } })
    const sugerencia = marcasDisp.length
      ? `\n\nMarcas disponibles: ${marcasDisp.map(m => `*${m}*`).join(', ')}`
      : ''
    await sess.client.sendMessage(from,
      `📭 No encontré contenido de *${marcaBuscada}*.${sugerencia}\n\n_Escribe, por ejemplo: publicidad Yale_`)
    return
  }

  const marcaReal = contenidos[0].marca || marcaBuscada
  await sess.client.sendMessage(from,
    `📦 *${contenidos.length} archivo${contenidos.length !== 1 ? 's' : ''}* de *${marcaReal}* — enviando...`)

  const uploadsDir = path.join(__dirname, '../../uploads')
  let enviados = 0
  for (const c of contenidos) {
    try {
      const fileName = path.basename(c.mediaUrl)
      const filePath = path.join(uploadsDir, fileName)
      if (!fs.existsSync(filePath)) continue
      const media   = MessageMedia.fromFilePath(filePath)
      const caption = c.descripcion
        ? `*${c.titulo}*\n${c.descripcion}`
        : `*${c.titulo}*${c.marca ? `\n🏷 ${c.marca}` : ''}`
      await sess.client.sendMessage(from, media, { caption })
      enviados++
      await new Promise(r => setTimeout(r, 1200))
    } catch (e) {
      console.error(`[PublicidadBot] Error enviando ${c.titulo}:`, e.message)
    }
  }

  if (enviados === 0) {
    await sess.client.sendMessage(from,
      `⚠️ Los archivos de *${marcaReal}* existen en el sistema pero no se encontraron en el servidor. Avisa al administrador.`)
  }
}

// ── Helpers de matching contacto→cliente ─────────────────────────────────────
function normStr(s) {
  return (s || '').toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9 ]/g, '')
    .replace(/\s+/g, ' ').trim()
}

function wordScore(keywords, target) {
  const t = normStr(target)
  const contactJoined = keywords.join('')   // "EMMANUELPUERTO" (sin espacios)
  const targetWords = t.split(' ').filter(w => w.length > 2)

  // Check 1: palabras del contacto aparecen en el target (ej: "EMMANUEL" en "EMMANUEL PUERTO")
  const hits1 = keywords.filter(k => k.length > 2 && t.includes(k)).length
  const score1 = keywords.length > 0 ? hits1 / keywords.length : 0

  // Check 2: palabras del target aparecen en la cadena concatenada del contacto
  // (ej: "EMMANUEL" y "PUERTO" están dentro de "EMMANUELPUERTO")
  const hits2 = targetWords.filter(w => contactJoined.includes(w)).length
  const score2 = targetWords.length > 0 ? hits2 / targetWords.length : 0

  return Math.max(score1, score2)
}

// Parsea "NOMBRE - EMPRESA" o "NOMBRE / EMPRESA" o solo "NOMBRE"
// Devuelve { cliente, puntaje } o null
function matchContactToCustomer(notifyName, candidatos) {
  if (!notifyName || notifyName.length < 3 || candidatos.length === 0) return null
  const partes       = notifyName.split(/\s*[-\/]\s*/, 2)
  const nombreWords  = normStr(partes[0]).split(' ').filter(w => w.length > 2)
  const empresaWords = partes[1] ? normStr(partes[1]).split(' ').filter(w => w.length > 2) : []
  if (nombreWords.length === 0) return null

  const tieneEmpresa = empresaWords.length > 0
  let mejor = null, mejorPuntaje = 0

  for (const c of candidatos) {
    const sNombre = wordScore(nombreWords, c.name)
    const puntaje = (tieneEmpresa && c.empresa)
      ? sNombre * 0.5 + wordScore(empresaWords, c.empresa) * 0.5
      : sNombre
    if (puntaje > mejorPuntaje && puntaje >= 0.6) {
      mejorPuntaje = puntaje
      mejor = { cliente: c, puntaje }
    }
  }
  return mejor
}

// Map: tenantId (string) -> { client, status, io }
const sessions    = new Map()
const botDebounce  = new Map() // key: `${tenantId}:${phone}` — evita doble respuesta por mensajes rápidos
const aiProcessing = new Set() // key: `${tenantId}:${phone}` — lock mientras IA genera respuesta

// Evita que dos llamadas a createSession para el mismo tenant construyan cada una su propio
// Client/Chromium apuntando a la misma carpeta de sesión (LocalAuth) antes de que la primera
// alcance a registrarse en `sessions` — puede pasar con la auto-reconexión al arrancar el
// servidor coincidiendo con un clic manual, o un doble clic en "Conectar".
const connectingLock = new Set()

// 3 min se quedaba corto: si el admin escanea justo antes de que este timer cumpla, pero
// Chromium tarda en renderizar el primer 'loading_screen' (CPU compartida — mismo patrón
// visto en toda la conexión/publicación de Estados hoy), el timer expira igual, destruye
// la sesión y genera un QR nuevo — aunque el teléfono ya había confirmado el escaneo real.
const QR_TIMEOUT_MS = 6 * 60 * 1000 // 6 minutos sin escanear → desactivar

async function createSession(tenantId, io, opts = {}) {
  if (sessions.has(tenantId)) {
    const existing = sessions.get(tenantId)
    // Si ya está conectado o esperando QR — no hacer nada nuevo
    if (existing.status === WHATSAPP_STATUS.CONNECTED) {
      if (opts.manejadaPorRotativo) existing.manejadaPorRotativo = true
      return existing
    }
    if (existing.lastQr && existing.status === WHATSAPP_STATUS.QR_READY) {
      if (opts.manejadaPorRotativo) existing.manejadaPorRotativo = true
      io.to(`vendedor:${tenantId}`).emit('whatsapp:qr', existing.lastQr)
      return existing
    }
    // Otra llamada ya está conectando esta misma línea (todavía no llegó a QR ni a ready) —
    // no destruir SU sesión en progreso, solo avisar que esta llamada duplicada no hace nada.
    // Sin este chequeo aquí, dos createSession() casi simultáneos se destruyen uno al otro
    // antes de que ninguno alcance a ver el candado de abajo.
    if (connectingLock.has(tenantId)) {
      console.log(`[Lock] createSession ya en curso para ${tenantId} — se ignora esta llamada duplicada`)
      return null
    }
    // Si está atascado en CONNECTING (Chromium colgado), forzar destrucción y reiniciar
    if (existing.connectWatchdog) clearTimeout(existing.connectWatchdog)
    if (existing.qrTimer) clearTimeout(existing.qrTimer)
    try {
      await Promise.race([
        existing.client.destroy(),
        new Promise(r => setTimeout(r, 4000)),
      ])
    } catch (_) {}
    sessions.delete(tenantId)
  }

  if (connectingLock.has(tenantId)) {
    console.log(`[Lock] createSession ya en curso para ${tenantId} — se ignora esta llamada duplicada`)
    return null
  }
  connectingLock.add(tenantId)

  try {

  // Ruta a Chrome â€" en producción (Linux/Docker) usa Chromium del sistema
  const executablePath = process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : process.env.PUPPETEER_EXECUTABLE_PATH || undefined

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: tenantId, dataPath: './sessions' }),
    puppeteer: {
      headless: 'new',
      executablePath,
      protocolTimeout: 120000,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-extensions',
        '--disable-dbus',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--hide-scrollbars',
        '--mute-audio',
      ],
    },
  })

  const tenantInfo = await Tenant.findById(tenantId).lean().catch(() => null)
  const tenantName = tenantInfo?.nombre || tenantId

  // Limpiar SingletonLock de Chromium — son symlinks rotos en Linux; usar lstat+unlink, no existsSync
  try {
    const fs   = require('fs')
    const path = require('path')
    const sessDir = path.join(__dirname, '../../sessions', `session-${tenantId}`)
    for (const lock of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
      const f = path.join(sessDir, lock)
      try {
        fs.lstatSync(f)            // no sigue symlinks — detecta el archivo aunque el target esté roto
        fs.unlinkSync(f)
        console.log(`[Lock] Eliminado: ${lock} (${tenantName})`)
      } catch (_) {}
    }
  } catch (_) {}

  const CONNECT_TIMEOUT_MS = 5 * 60 * 1000  // 5 min sin QR ni conexión → reintentar

  const session = { client, status: WHATSAPP_STATUS.CONNECTING, io, qrTimer: null, manejadaPorRotativo: !!opts.manejadaPorRotativo }
  sessions.set(tenantId, session)

  // Watchdog: si en 5 min no hay QR ni ready → Chromium atascado → destruir y reintentar
  session.connectWatchdog = setTimeout(async () => {
    // `sessions.get(tenantId) === session` (no solo el status) — si para cuando este timer
    // dispara el Map ya apunta a OTRA sesión (reemplazada por disconnectSession, el otro
    // watchdog, o una reconexión normal), este objeto quedó obsoleto y no debe tocar nada.
    if (session.status === WHATSAPP_STATUS.CONNECTING && sessions.get(tenantId) === session) {
      audit.warn(tenantId, tenantName, `Chromium atascado (5 min sin respuesta) — reiniciando sesión`)
      console.log(`[Watchdog] ${tenantName}: Chromium atascado, reiniciando...`)
      // Si Chromium está tan atascado que ni siquiera responde a destroy(), esperar sin
      // límite dejaría al watchdog colgado para siempre — justo el escenario que existe
      // para arreglar. Con timeout, seguimos adelante igual (sessions.delete + reconectar)
      // aunque el proceso viejo quede huérfano; mejor eso que quedar sin ningún camino de recuperación.
      try {
        await Promise.race([client.destroy(), new Promise(r => setTimeout(r, 8000))])
      } catch (_) {}
      sessions.delete(tenantId)
      await Tenant.findByIdAndUpdate(tenantId, { 'whatsapp.status': WHATSAPP_STATUS.DISCONNECTED })
      // Reusar los mismos opts (ej. manejadaPorRotativo) — si no, una línea de rotación que
      // se reconecta sola aquí pierde esa bandera y el auto-desconecte de 20s la mata de
      // nuevo justo después de que el watchdog la revivió.
      setTimeout(() => createSession(tenantId, io, opts), 3000)
    }
  }, CONNECT_TIMEOUT_MS)

  audit.info(tenantId, tenantName, `Iniciando conexión WhatsApp`)

  client.on('qr', async (qr) => {
    if (session.connectWatchdog) { clearTimeout(session.connectWatchdog); session.connectWatchdog = null }
    session.status = WHATSAPP_STATUS.QR_READY
    const qrDataURL = await qrcode.toDataURL(qr)
    session.lastQr = qrDataURL
    io.to(`vendedor:${tenantId}`).emit('whatsapp:qr', qrDataURL)
    await Tenant.findByIdAndUpdate(tenantId, { 'whatsapp.status': WHATSAPP_STATUS.QR_READY }).catch(() => {})
    audit.warn(tenantId, tenantName, `QR generado — esperando escaneo (${QR_TIMEOUT_MS / 60000} min para expirar)`)
    console.log(`[QR] ${tenantName}: código generado, esperando escaneo`)

    // Auto-expirar si no se escanea en QR_TIMEOUT_MS
    if (session.qrTimer) clearTimeout(session.qrTimer)
    session.qrTimer = setTimeout(async () => {
      if (session.status === WHATSAPP_STATUS.QR_READY) {
        audit.warn(tenantId, tenantName, `QR expiró sin escanear — desactivando sesión`)
        console.log(`[QR] ${tenantName}: código expiró sin escanear`)
        session.manualDisconnect = true
        try { await client.destroy() } catch (_) {}
        sessions.delete(tenantId)
        await Tenant.findByIdAndUpdate(tenantId, { 'whatsapp.status': WHATSAPP_STATUS.DISCONNECTED }).catch(() => {})
        io.to(`vendedor:${tenantId}`).emit('whatsapp:disconnected')
      }
    }, QR_TIMEOUT_MS)
  })

  client.on('loading_screen', async (percent) => {
    // Cuando loading_screen dispara con percent > 0, el QR fue escaneado
    // Emitir estado "cargando" para que el frontend muestre "Conectando..." en vez de otro QR
    // Guard: whatsapp-web.js a veces reemite un loading_screen tardío/duplicado DESPUÉS de que
    // 'ready' ya disparó — sin este guard, pisa session.status de vuelta a 'connecting' aunque
    // la sesión ya esté conectada, dejando todo lo que espera status==='connected' colgado.
    if (percent > 0 && session.status !== WHATSAPP_STATUS.CONNECTED) {
      if (session.status !== WHATSAPP_STATUS.CONNECTING) console.log(`[QR] ${tenantName}: escaneado, cargando WhatsApp Web (${percent}%)`)
      session.status = WHATSAPP_STATUS.CONNECTING
      session.lastQr = null // invalidar QR anterior
      io.to(`vendedor:${tenantId}`).emit('whatsapp:loading', { percent })

      // El watchdog de 5 min (armado al crear la sesión) se limpia apenas aparece el
      // primer QR y nunca se vuelve a armar — si el usuario escanea y la carga se queda
      // pegada sin llegar nunca a 'ready', no quedaba ningún timeout de rescate para ese
      // caso específico. Se arma uno aparte aquí, una sola vez por sesión.
      if (!session.loadingWatchdog) {
        session.loadingWatchdog = setTimeout(async () => {
          // Mismo chequeo de identidad que connectWatchdog — ver comentario ahí.
          if (session.status === WHATSAPP_STATUS.CONNECTING && sessions.get(tenantId) === session) {
            audit.warn(tenantId, tenantName, `Carga atascada tras escanear QR (3 min) — reiniciando sesión`)
            console.log(`[Watchdog] ${tenantName}: carga atascada tras escanear, reiniciando...`)
            try {
              await Promise.race([client.destroy(), new Promise(r => setTimeout(r, 8000))])
            } catch (_) {}
            sessions.delete(tenantId)
            await Tenant.findByIdAndUpdate(tenantId, { 'whatsapp.status': WHATSAPP_STATUS.DISCONNECTED }).catch(() => {})
            setTimeout(() => createSession(tenantId, io, opts), 3000)
          }
        }, 3 * 60 * 1000)
      }
    }

    if (percent === 0 && session.pendingPhoneNumber) {
      try {
        const code = await client.requestPairingCode(session.pendingPhoneNumber)
        session.pairingCode = code
        io.to(`vendedor:${tenantId}`).emit('whatsapp:pairing_code', code)
        session.pendingPhoneNumber = null
      } catch (err) {
        console.error('Error solicitando código:', err.message)
        io.to(`vendedor:${tenantId}`).emit('whatsapp:pairing_error', err.message)
      }
    }
  })

  client.on('ready', async () => {
    const info = client.info
    if (session.connectWatchdog) { clearTimeout(session.connectWatchdog); session.connectWatchdog = null }
    if (session.qrTimer) { clearTimeout(session.qrTimer); session.qrTimer = null }
    if (session.loadingWatchdog) { clearTimeout(session.loadingWatchdog); session.loadingWatchdog = null }
    session.status = WHATSAPP_STATUS.CONNECTED
    io.to(`vendedor:${tenantId}`).emit('whatsapp:connected')
    // Sin .catch() acá, un blip transitorio de Mongo justo en este instante dejaba la
    // sesión en memoria como 'connected' para siempre pero la BD nunca se enteraba, sin
    // ningún mecanismo que lo corrigiera después — un reintento simple cubre el caso común.
    const datosConexion = {
      'whatsapp.status': WHATSAPP_STATUS.CONNECTED,
      'whatsapp.phone': info?.wid?.user || '',
      'whatsapp.connectedAt': new Date(),
    }
    await Tenant.findByIdAndUpdate(tenantId, datosConexion).catch(async (e) => {
      console.error(`[READY] Error guardando estado conectado en BD [${tenantId}], reintentando:`, e.message)
      await new Promise(r => setTimeout(r, 2000))
      await Tenant.findByIdAndUpdate(tenantId, datosConexion)
        .catch((e2) => console.error(`[READY] Reintento también falló [${tenantId}]:`, e2.message))
    })
    audit.success(tenantId, tenantName, `WhatsApp conectado`, { phone: info?.wid?.user })
    console.log(`WhatsApp conectado — tenant: ${tenantId}`)

    // Líneas de rotación (solo Estados): una vez la sesión queda guardada en disco,
    // no hace falta mantenerla conectada — se desconecta sola para no acumular
    // Chromium mientras se van vinculando muchas líneas seguidas por QR.
    // Si la sesión la maneja el propio scheduler de rotación (publicarEstadosRotativo),
    // ese flujo ya se encarga de desconectar cuando termine de publicar — no duplicar aquí,
    // porque si la publicación tarda más de 20s este timer la cortaría a mitad de camino.
    const freshTenant = await Tenant.findById(tenantId).select('rotarSoloEstados').lean().catch(() => null)
    if (freshTenant?.rotarSoloEstados && !session.manejadaPorRotativo) {
      setTimeout(async () => {
        const s = sessions.get(tenantId)
        if (s?.status === WHATSAPP_STATUS.CONNECTED) {
          audit.info(tenantId, tenantName, `Línea de rotación — desconectando tras vincular (sesión ya guardada)`)
          console.log(`[Rotación] ${tenantName}: sesión guardada, desconectando automáticamente`)
          await disconnectSession(tenantId).catch(() => {})
        }
      }, 20000) // 20s de margen para que la sesión termine de escribirse en disco
    }
  })

  client.on('disconnected', async (reason) => {
    // whatsapp-web.js puede emitir 'disconnected' más de una vez para el mismo cierre real
    // (ej. varias navegaciones con post_logout=1 seguidas) — si ya se procesó, no repetir.
    if (session.status === WHATSAPP_STATUS.DISCONNECTED) return

    if (session.qrTimer) { clearTimeout(session.qrTimer); session.qrTimer = null }
    if (session.connectWatchdog) { clearTimeout(session.connectWatchdog); session.connectWatchdog = null }
    if (session.loadingWatchdog) { clearTimeout(session.loadingWatchdog); session.loadingWatchdog = null }

    const wasManual    = session.manualDisconnect
    const wasConnected = session.status === WHATSAPP_STATUS.CONNECTED // solo alerta si estaba conectado
    session.status = WHATSAPP_STATUS.DISCONNECTED
    sessions.delete(tenantId)
    await Tenant.findByIdAndUpdate(tenantId, { 'whatsapp.status': WHATSAPP_STATUS.DISCONNECTED }).catch(() => {})
    audit.warn(tenantId, tenantName, `WhatsApp desconectado: ${reason}`)
    console.log(`WhatsApp desconectado [${tenantId}]: ${reason}`)

    if (wasManual || reason === 'LOGOUT') {
      io.to(`vendedor:${tenantId}`).emit('whatsapp:disconnected')
      // Alerta solo si estaba conectado previamente (no durante proceso de escaneo QR)
      if (reason === 'LOGOUT' && !wasManual && wasConnected) {
        io.to('admin:global').emit('whatsapp:logout_alert', {
          tenantId,
          nombre:  tenantName,
          hora:    new Date().toISOString(),
        })
        audit.warn(tenantId, tenantName, `⚠️ ${tenantName} desconectó su WhatsApp desde el celular`)
        console.log(`[ALERTA] ${tenantName} hizo LOGOUT desde su celular`)
      }
    } else {
      audit.info(tenantId, tenantName, `Reconectando en 5s...`)
      console.log(`Reconectando WhatsApp [${tenantId}] en 5s...`)
      // Mismo motivo que el fix ya aplicado al watchdog de 5 min: si no se reenvía `opts`,
      // una línea de rotación que sufre un corte transitorio de red pierde la bandera
      // `manejadaPorRotativo` al reconectarse sola, y el auto-desconecte de 20s (pensado
      // solo para conexiones manuales) la vuelve a cortar mientras el scheduler todavía
      // la está usando.
      const opts = { manejadaPorRotativo: !!session.manejadaPorRotativo }
      setTimeout(() => createSession(tenantId, io, opts), 5000)
    }
  })

  client.on('auth_failure', async (msg) => {
    console.error(`[AUTH_FAILURE] ${tenantName}:`, msg)
    audit.warn(tenantId, tenantName, `Fallo de autenticación — sesión inválida: ${msg}`)
    if (session.connectWatchdog) { clearTimeout(session.connectWatchdog); session.connectWatchdog = null }
    if (session.qrTimer) { clearTimeout(session.qrTimer); session.qrTimer = null }
    if (session.loadingWatchdog) { clearTimeout(session.loadingWatchdog); session.loadingWatchdog = null }
    sessions.delete(tenantId)
    await Tenant.findByIdAndUpdate(tenantId, { 'whatsapp.status': WHATSAPP_STATUS.DISCONNECTED }).catch(() => {})
    io.to(`vendedor:${tenantId}`).emit('whatsapp:disconnected')
  })

  client.on('message', (msg) => handleIncomingMessage(tenantId, msg, io))

  // Capturar mensajes enviados por el vendedor desde su celular
  client.on('message_create', (msg) => {
    if (!msg.fromMe) return // solo los que envía el vendedor
    if (msg.to === 'status@broadcast') return // ignorar estados
    if (msg.to?.endsWith('@g.us')) return // ignorar grupos por ahora
    handleOutgoingMessage(tenantId, msg, io).catch(() => {})
  })

  try {
    await client.initialize()
  } catch (err) {
    // initialize() puede fallar con errores transitorios de Chromium (frame too early, context destroyed)
    // Limpiamos la sesión del map y marcamos desconectado — el usuario puede reconectar manualmente
    console.error(`Error inicializando WhatsApp [${tenantName}]:`, err.message)
    if (session.connectWatchdog) { clearTimeout(session.connectWatchdog); session.connectWatchdog = null }
    if (session.qrTimer) { clearTimeout(session.qrTimer); session.qrTimer = null }
    sessions.delete(tenantId)
    try { await Promise.race([client.destroy(), new Promise(r => setTimeout(r, 3000))]) } catch (_) {}
    await Tenant.findByIdAndUpdate(tenantId, { 'whatsapp.status': WHATSAPP_STATUS.DISCONNECTED })
    io.to(`vendedor:${tenantId}`).emit('whatsapp:disconnected')
    throw err
  }
  return session

  } finally {
    connectingLock.delete(tenantId)
  }
}

// Envía mensaje del bot, lo guarda en BD y emite al inbox
async function _merchSend(sess, from, texto, tenantId, conversationId, io) {
  if (sess?.client) await sess.client.sendMessage(from, texto)
  const savedMsg = await Message.create({
    tenantId,
    conversation: conversationId,
    direction: MESSAGE_DIRECTION.OUTBOUND,
    content: texto,
    type: 'text',
    aiGenerated: false,
  })
  if (io) io.to(`vendedor:${tenantId}`).emit('message:new', { conversation: conversationId, message: savedMsg })
}

function _buildMerchResumen(resultados) {
  let txt = `✅ *${resultados.length > 1 ? resultados.length + ' registros creados' : 'Registrado'}:*\n`
  txt += `📦 *${resultados[0].nombre}*\n`
  txt += `🏷️ Marca: *${resultados[0].marca || 'Sin marca'}*\n`
  if (resultados[0].color) txt += `🎨 ${resultados[0].color}\n`
  txt += '\n'
  if (resultados.length > 1) {
    txt += `📐 *Por talla:*\n`
    resultados.forEach(d => { txt += `  · ${d.talla || 'UNICA'} — *${d.cantidad} uds*\n` })
    txt += `📊 Total: *${resultados.reduce((s, d) => s + (Number(d.cantidad) || 0), 0)} unidades*\n`
  } else {
    txt += `🔢 Cantidad: *${resultados[0].cantidad} uds*\n`
  }
  txt += `\nEnvía otra foto o escribe *FIN MERCHANDISING* para terminar.`
  return txt
}

async function handleIncomingMessage(tenantId, msg, io) {
  const tenantCheck = await Tenant.findById(tenantId).lean()
  if (!tenantCheck) return

  // Estados de contactos — siempre procesarlos sin importar el modo inbox
  if (msg.from === 'status@broadcast') {
    if (msg.author) {
      const autorPhone = msg.author.replace(/@c\.us$/, '').replace(/@s\.whatsapp\.net$/, '').replace(/@lid$/, '')
      _registrarEstadoVendedor(autorPhone, tenantId).catch(() => {})
    }
    return
  }

  // ── DEDUPLICACIÓN: evitar procesar el mismo mensaje dos veces ──────────────
  const msgIdSerialized = msg.id?._serialized
  if (msgIdSerialized) {
    const yaExiste = await Message.findOne({ whatsappMsgId: msgIdSerialized }).lean()
    if (yaExiste) {
      console.log(`[DEDUP] Mensaje ${msgIdSerialized} ya procesado — ignorando`)
      return
    }
  }

  // ── INBOX INACTIVO: solo sirve para publicar estados, ignorar todo lo demás ──
  // La línea principal (esPrincipal) y soloMonitoreo siempre procesan
  if (!tenantCheck.inboxActivo && !tenantCheck.esPrincipal) return

  // Manejar grupos: detectar por isGroupMsg O por sufijo @g.us en msg.from
  const esGrupo = msg.isGroupMsg || msg.from?.endsWith('@g.us')
  if (esGrupo) {
    if (!tenantCheck.monitorearGrupos) return
    return handleGroupMessage(tenantId, msg, io, tenantCheck)
  }

  // WhatsApp usa @c.us y @lid — limpiar ambos
  const phone = msg.from.replace(/@c\.us$/, '').replace(/@lid$/, '')
  const text = sanitizeInput(msg.body || '')

  console.log(`Mensaje recibido [${tenantId}] de ${phone}: "${text || '[media]'}"`)
  audit.msg(tenantId, null, `📩 Mensaje de ${phone}: "${(text || '[media]').substring(0, 80)}"`, { phone, type: msg.hasMedia ? 'media' : 'text' })

  if (!text && !msg.hasMedia) return

  const digitos = phone.replace(/\D/g, '')
  if (phone.includes('@') || digitos.length > 15 || digitos.length < 7) {
    console.log(`Número inválido ignorado: ${phone}`)
    audit.warn(tenantId, null, `Número inválido ignorado: ${phone}`)
    return
  }

  // Reusar el tenant ya cargado arriba (evita segunda query)
  const tenant = tenantCheck

  // ── DEBOUNCE GATE — solo para números válidos (evita entradas huérfanas) ──
  if (!msg.fromMe && (msg.body?.trim() || msg.hasMedia)) {
    const debKey = `${tenantId}:${phone}`
    if (!botDebounce.has(debKey)) {
      botDebounce.set(debKey, { pendingTexts: [], lastRawMsg: msg, timer: null, fire: null })
    } else {
      botDebounce.get(debKey).lastRawMsg = msg
    }
  }

  // ── MODO PAUSADO: recibe mensajes pero NO procesa nada ────────────────────
  if (tenant.pausado) {
    console.log(`[PAUSADO] Mensaje de ${phone} ignorado — línea ${tenant.nombre} está pausada`)
    audit.warn(tenantId, tenant.nombre, `[PAUSADO] Mensaje de ${phone} ignorado`)
    return
  }

  // ── MODO SOLO MONITOREO ───────────────────────────────────────────────────
  if (tenant.soloMonitoreo) {
    // Resolver nombre de contacto desde la agenda del vendedor
    let monNombre = msg._data?.notifyName || phone
    try {
      const sessMon = sessions.get(tenantId)
      if (sessMon?.client) {
        const contact = await sessMon.client.getContactById(msg.from)
        if (contact?.name)       monNombre = contact.name
        else if (contact?.pushname) monNombre = contact.pushname
      }
    } catch (_) {}

    // Intentar vincular a cliente existente (cualquier vendedor) por teléfono
    const clienteMon = await Customer.findOne({
      $or: [{ phone }, { phone: phone.replace(/^57/, '') }, { phone: `57${phone}` }],
    }).lean()

    const esDesconocido = !clienteMon

    const convUpdate = {
      lastMessageAt: new Date(),
      waJid:         msg.from,
      status:        'open',
      isMonitoreo:   true,
      contactoDesconocido: esDesconocido,
    }
    if (clienteMon) convUpdate.customer = clienteMon._id

    let convMon = await Conversation.findOneAndUpdate(
      { tenantId, phone, status: { $in: ['open', 'closed', 'pending'] } },
      { $set: convUpdate },
      { upsert: false, new: true, sort: { createdAt: -1 } }
    )
    if (!convMon) {
      convMon = await Conversation.create({
        tenantId, phone, waJid: msg.from,
        aiEnabled: false, isMonitoreo: true,
        contactoDesconocido: esDesconocido,
        customer: clienteMon?._id || null,
        lastMessageAt: new Date(),
      })
    }

    const monMsg = await Message.create({
      tenantId, conversation: convMon._id,
      direction: MESSAGE_DIRECTION.INBOUND,
      content: text || '', type: 'text',
      senderPhone: phone,
    })

    io.to(`vendedor:${tenantId}`).emit('message:new', { conversation: convMon._id, message: monMsg })

    if (esDesconocido) {
      io.to(`vendedor:${tenantId}`).emit('conversation:unknown-contact', {
        conversationId: convMon._id,
        phone,
        nombre: monNombre,
      })
      console.log(`[MON] Número desconocido en ${tenant.nombre}: ${phone} (${monNombre})`)
    }

    await Conversation.findByIdAndUpdate(convMon._id, {
      lastMessageAt: new Date(),
      $inc: { unreadCount: 1 },
    })

    // ── Comandos especiales en modo monitoreo (actualizar fotos de merchandising)
    const sessMonCmd  = sessions.get(tenantId)
    const textMonLow  = (text || '').toLowerCase().trim()
    const convMonFresh = await Conversation.findById(convMon._id).lean()
    const enModoFotosMon = convMonFresh?.botState?.stage === 'actualizando_fotos'

    if (textMonLow.includes('actualizar') && textMonLow.includes('foto') && !enModoFotosMon) {
      await Conversation.findByIdAndUpdate(convMon._id, { 'botState.stage': 'actualizando_fotos' })
      if (sessMonCmd?.client) await sessMonCmd.client.sendMessage(msg.from,
        `📸 *Modo actualizar fotos activado*\n\nEnvía cada imagen con el nombre del producto en el caption.\nVoy a buscar el producto y guardar la foto automáticamente.\n\n_Escribe *fin fotos* para terminar._`)
      return
    }

    if ((textMonLow.includes('fin') || textMonLow.includes('finalizar')) && textMonLow.includes('foto') && enModoFotosMon) {
      await Conversation.findByIdAndUpdate(convMon._id, { 'botState.stage': null })
      if (sessMonCmd?.client) await sessMonCmd.client.sendMessage(msg.from, `✅ Modo actualizar fotos finalizado.`)
      return
    }

    if (enModoFotosMon && msg.hasMedia && (msg.type === 'image' || msg._data?.type === 'image')) {
      const MerchandisingItem = require('../models/MerchandisingItem')
      const caption = (text || '').trim()

      if (!caption) {
        if (sessMonCmd?.client) await sessMonCmd.client.sendMessage(msg.from,
          `⚠️ Necesito el nombre del producto en el caption de la imagen.\nEnvía la foto *con el texto del producto debajo*.`)
        return
      }

      try {
        // Descargar y guardar la imagen aquí mismo
        const fs   = require('fs')
        const path = require('path')
        const media = await msg.downloadMedia()
        let monMediaUrl = null
        if (media) {
          const ext       = media.mimetype.split('/')[1]?.split(';')[0] || 'jpg'
          const safeName  = `${Date.now()}_merch_foto.${ext}`
          const uploadDir = path.join(__dirname, '../../uploads')
          if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })
          fs.writeFileSync(path.join(uploadDir, safeName), Buffer.from(media.data, 'base64'))
          monMediaUrl = `/media/${safeName}`
        }

        if (!monMediaUrl) {
          if (sessMonCmd?.client) await sessMonCmd.client.sendMessage(msg.from, `⚠️ No pude guardar la imagen. Intenta de nuevo.`)
          return
        }

        const todos    = await MerchandisingItem.find({ activo: true }).select('nombre marca color talla imagenUrl').lean()
        const capLower = caption.toLowerCase()
        let mejor = null, mejorScore = 0

        for (const p of todos) {
          const nomLow = p.nombre.toLowerCase()
          if (!capLower.includes(nomLow)) continue
          // Score base = longitud del nombre; bonus si también coincide color, marca o talla
          let score = nomLow.length
          if (p.color && capLower.includes(p.color.toLowerCase())) score += 10
          if (p.marca && capLower.includes(p.marca.toLowerCase())) score += 8
          if (p.talla && capLower.includes(p.talla.toLowerCase())) score += 6
          if (score > mejorScore) { mejor = p; mejorScore = score }
        }
        if (!mejor) {
          const palabras = capLower.split(/\s+/).filter(w => w.length > 3)
          for (const pal of palabras) {
            const f = todos.find(p => p.nombre.toLowerCase().includes(pal))
            if (f) { mejor = f; break }
          }
        }

        if (mejor) {
          await MerchandisingItem.findByIdAndUpdate(mejor._id, { $set: { imagenUrl: monMediaUrl } })
          console.log(`[ActualizarFotos] ✅ ${mejor.nombre}`)
          if (sessMonCmd?.client) await sessMonCmd.client.sendMessage(msg.from,
            `✅ *${mejor.nombre}*${mejor.marca ? ` (${mejor.marca})` : ''} — foto actualizada 📸`)
        } else {
          if (sessMonCmd?.client) await sessMonCmd.client.sendMessage(msg.from,
            `❌ No encontré ningún producto que coincida con:\n_"${caption}"_\n\nVerifica el nombre e intenta de nuevo.`)
        }
      } catch (e) {
        console.error('[ActualizarFotos/Mon]', e.message)
      }
      return
    }

    if (enModoFotosMon) {
      if (sessMonCmd?.client) await sessMonCmd.client.sendMessage(msg.from,
        `📸 Envía la imagen con el nombre del producto en el caption.\n_Escribe *fin fotos* para terminar._`)
      return
    }

    return  // terminar aqui — no crear lead, no flujos, no IA
  }

  // ── Comando de activación/desactivación del bot ──────────────────────────
  // El vendedor le escribe a su propio número: el msg.fromMe será true
  // O alguien escribe la keyword exacta al número del vendedor
  const keyword = (tenant.botActivationKeyword || 'activar bot').toLowerCase().trim()
  const textLower = text.toLowerCase().trim()

  if (textLower === keyword || textLower === 'desactivar bot') {
    const activar = textLower === keyword
    await Tenant.findByIdAndUpdate(tenantId, {
      'ai.autoReply': activar,
      'ai.enabled':   activar,
    })
    const session = sessions.get(tenantId)
    if (session?.client) {
      await session.client.sendMessage(msg.from,
        activar
          ? `✅ Bot activado. La IA responderá automáticamente.`
          : `⏸ Bot desactivado. Puedes atender manualmente.`
      )
    }
    console.log(`Bot ${activar ? 'ACTIVADO' : 'DESACTIVADO'} para ${tenant.nombre}`)
    return
  }

  // Obtener el nombre real del contacto — prioridad:
  // 1) Nombre guardado por el vendedor en su agenda del teléfono (contact.name)
  // 2) Nombre del perfil de WhatsApp del contacto (pushname / notifyName)
  // 3) Número como fallback
  let notifyName = msg._data?.notifyName || phone
  let realPhone  = phone  // puede actualizarse si el @lid tiene número real
  try {
    const session = sessions.get(tenantId)
    if (session?.client) {
      const contact = await session.client.getContactById(msg.from)
      if (contact?.name)     notifyName = contact.name      // nombre en agenda del vendedor ← prioridad
      else if (contact?.pushname) notifyName = contact.pushname
      if (contact?.number && contact.number.length >= 7) realPhone = contact.number
    }
  } catch (_) {}
  // Si obtuvimos un número real distinto al LID, usarlo
  const phoneToUse = realPhone !== phone ? realPhone : phone

  const existingCustomer = await Customer.findOne({
    vendedorId: tenantId,
    $or: [{ phone: phoneToUse }, { phone: phone }],
  })
  const esLineaPrincipal = tenant.esPrincipal === true || tenant.slug === 'linea-principal'

  let contactId   = null
  let contactType = 'customer'

  if (existingCustomer) {
    // Número conocido en BD de clientes → actualizar lastContactAt y nombre si cambió
    contactId   = existingCustomer._id
    contactType = 'customer'
    const updateCliente = { lastContactAt: new Date() }
    if (notifyName && notifyName !== existingCustomer.name) {
      updateCliente.name = notifyName
      audit.info(tenantId, tenant.nombre, `✏️ Nombre actualizado: "${existingCustomer.name}" → "${notifyName}" (${phoneToUse})`)
    }
    await Customer.findByIdAndUpdate(existingCustomer._id, updateCliente)

  } else if (esLineaPrincipal) {
    // Línea principal + número desconocido → Lead
    // Siempre actualizar nombre: el vendedor puede haberlo renombrado para hacer el cruce
    const lead = await Lead.findOneAndUpdate(
      { tenantId, phone: phoneToUse },
      {
        $set: { lastMessageAt: new Date(), name: notifyName },
        $setOnInsert: { tenantId, phone: phoneToUse, status: 'nuevo' },
      },
      { upsert: true, new: true }
    )
    contactId   = lead._id
    contactType = 'lead'
    audit.info(tenantId, tenant.nombre, `Lead: ${phoneToUse} — nombre en agenda: "${notifyName}"`)

    // Intentar vincular a cliente existente sin teléfono (cualquier vendedor)
    if (notifyName && notifyName.length > 3) {
      const candidatosGlobal = await Customer.find({
        $or: [{ phone: { $exists: false } }, { phone: '' }, { phone: null }],
      }).limit(300).lean()
      const matchGlobal = matchContactToCustomer(notifyName, candidatosGlobal)
      if (matchGlobal) {
        await Customer.findByIdAndUpdate(matchGlobal.cliente._id, {
          $set: { phone: phoneToUse, lastContactAt: new Date() }
        })
        audit.info(tenantId, tenant.nombre,
          `🔗 Vinculado desde LP: "${notifyName}" → "${matchGlobal.cliente.name}${matchGlobal.cliente.empresa ? ' / ' + matchGlobal.cliente.empresa : ''}" (confianza ${Math.round(matchGlobal.puntaje * 100)}%)`)
      }
    }

  } else {
    // Línea de vendedor o comunicación + número desconocido
    // Intentar cruzar con cliente importado por nombre/empresa (sin teléfono)
    let clienteVinculado = null
    if (notifyName && notifyName.length > 3) {
      const candidatos = await Customer.find({
        vendedorId: tenantId,
        $or: [{ phone: { $exists: false } }, { phone: '' }, { phone: null }],
      }).lean()

      const match = matchContactToCustomer(notifyName, candidatos)
      if (match) {
        clienteVinculado = match.cliente
        audit.info(tenantId, tenant.nombre,
          `🔗 Match por agenda: "${notifyName}" → "${match.cliente.name}${match.cliente.empresa ? ' / ' + match.cliente.empresa : ''}" (confianza ${Math.round(match.puntaje * 100)}%)`)
      }
    }

    if (clienteVinculado) {
      // Siempre vincular si hay coincidencia por nombre, sin importar el tipo de línea
      await Customer.findByIdAndUpdate(clienteVinculado._id, {
        $set: { phone: phoneToUse, lastContactAt: new Date() }
      })
      contactId   = clienteVinculado._id
      contactType = 'customer'
    } else if (tenant.tipo === 'comunicacion') {
      // Línea de comunicación + desconocido → solo conversación, sin lead ni cliente
      contactId   = null
      contactType = null
      audit.info(tenantId, tenant.nombre, `Contacto desconocido en línea comunicación: ${phoneToUse} — sin crear lead`)
    } else {
      // Línea vendedor + desconocido sin coincidencia → solo conversación, sin crear lead ni cliente
      // Los leads solo se crean desde la línea principal
      contactId   = null
      contactType = null
      audit.info(tenantId, tenant.nombre, `Contacto desconocido: ${phoneToUse} — "${notifyName}" (sin vincular)`)
    }
  }

  // Buscar o crear conversación abierta
  const convQuery = contactType === 'customer'
    ? { tenantId, customer: contactId, status: 'open' }
    : contactType === 'lead'
    ? { tenantId, lead: contactId, status: 'open' }
    : { tenantId, phone: phoneToUse, status: 'open' }

  // Buscar conversación existente (abierta O cerrada) — reusar en lugar de crear duplicado
  let conversation = await Conversation.findOne({
    ...convQuery,
    status: { $in: ['open', 'closed', 'pending'] },
  }).sort({ createdAt: -1 })

  if (!conversation) {
    const convData = {
      tenantId, phone: phoneToUse, waJid: msg.from,
      aiEnabled: tenant.ai?.autoReply ?? false,
      lastMessageAt: new Date(),
    }
    if (contactType === 'customer') convData.customer = contactId
    else if (contactType === 'lead') convData.lead = contactId
    conversation = await Conversation.create(convData)
    await Tenant.findByIdAndUpdate(tenantId, { $inc: { 'stats.totalConversaciones': 1 } })
  } else {
    // Reabrir conversación cerrada y actualizar timestamp
    await Conversation.findByIdAndUpdate(conversation._id, {
      status: 'open',
      lastMessageAt: new Date(),
      waJid: msg.from,
    })
    conversation.status = 'open'
  }

  // Descargar media si existe — guardar en disco, no en base64
  let mediaUrl       = null
  let mediaType      = null
  let fileName       = null
  let fileSize       = null
  let msgType        = 'text'
  let audioTranscript = null   // transcripción Whisper si es audio
  if (msg.hasMedia) {
    try {
      const media = await msg.downloadMedia()
      if (media) {
        mediaType = media.mimetype
        if (media.mimetype.startsWith('image/'))   msgType = 'image'
        else if (media.mimetype.startsWith('video/')) msgType = 'video'
        else if (media.mimetype.startsWith('audio/')) msgType = 'audio'
        else msgType = 'document'

        // Guardar en /uploads con nombre único
        const fs   = require('fs')
        const path = require('path')
        const ext  = media.mimetype.split('/')[1]?.split(';')[0] || 'bin'
        fileName   = media.filename || `${msgType}_${Date.now()}.${ext}`
        const safeName = `${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`
        const uploadDir = path.join(__dirname, '../../uploads')
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })
        const filePath = path.join(uploadDir, safeName)
        const buffer   = Buffer.from(media.data, 'base64')
        fs.writeFileSync(filePath, buffer)
        fileSize = buffer.length
        mediaUrl = `/media/${safeName}`

        // Transcribir audio con Whisper si es PTT (nota de voz) o audio
        if (msgType === 'audio' && (msg.type === 'ptt' || msg.type === 'audio')) {
          try {
            const SystemConfig = require('../models/SystemConfig')
            const OpenAI       = require('openai')
            const cfg = await SystemConfig.findById('system').lean().catch(() => null)
            const apiKey = cfg?.openaiKey || process.env.OPENAI_API_KEY
            if (apiKey) {
              const openai = new OpenAI({ apiKey })
              const { toFile } = require('openai')
              const audioFile = await toFile(buffer, safeName, { type: media.mimetype })
              const result = await openai.audio.transcriptions.create({
                file:  audioFile,
                model: 'whisper-1',
                language: 'es',
              })
              audioTranscript = result.text?.trim() || null
              if (audioTranscript) {
                audit.info(tenantId, null, `🎙 Transcripción Whisper: "${audioTranscript.substring(0, 80)}"`)
                console.log(`[Whisper] ${phone}: "${audioTranscript}"`)
              }
            }
          } catch (we) {
            console.error('[Whisper] Error transcribiendo:', we.message)
          }
        }
      }
    } catch (e) {
      console.error('Error descargando media:', e.message)
    }
  }

  // Texto efectivo = texto escrito OR transcripción de audio
  const effectiveText = text || audioTranscript || ''

  // Guardar mensaje entrante
  const inboundMsg = await Message.create({
    tenantId,
    conversation: conversation._id,
    direction: MESSAGE_DIRECTION.INBOUND,
    content: audioTranscript ? `🎙 ${audioTranscript}` : (text || ''),
    type: msgType,
    mediaUrl,
    mediaType,
    fileName,
    fileSize,
    senderPhone: phone,
    whatsappMsgId: msg.id._serialized,
  })

  await Tenant.findByIdAndUpdate(tenantId, { $inc: { 'stats.mensajesMes': 1 } })

  io.to(`vendedor:${tenantId}`).emit('message:new', {
    conversation: conversation._id,
    message: inboundMsg,
  })

  // isNew = es un contacto nuevo (no estaba en BD de clientes ni como lead previo)
  const isNew = !existingCustomer

  // ── BOT DE PUBLICIDAD (solo líneas tipo comunicación) ────────────────────────
  if (tenant.tipo === 'comunicacion') {
    const marcaSolicitada = _extraerMarcaPublicidad(effectiveText)
    if (marcaSolicitada) {
      console.log(`[PublicidadBot] Solicitud de marca "${marcaSolicitada}" desde ${phone}`)
      await _enviarPublicidadMarca(sessions.get(tenantId), msg.from, marcaSolicitada)
      return
    }
  }

  // ── MODO INVENTARIO MERCHANDISING ────────────────────────────────────────────
  const textLowerMerch = effectiveText.toLowerCase().trim()
  const convFreshMerch = await Conversation.findById(conversation._id).lean()
  const enModoMerch    = convFreshMerch?.botState?.stage === 'merchandising'

  // Detección flexible: "iniciar merch", "iniciar merchandising", "iniciar mechardising", etc.
  const esMerchStart = textLowerMerch.includes('iniciar') && textLowerMerch.includes('merch')
  const esMerchEnd   = (textLowerMerch.includes('fin') || textLowerMerch.includes('finalizar')) && textLowerMerch.includes('merch')
  const esConfirmar  = ['si', 'sí', 'confirmar', 'listo', 'listo producto', 'ok', 'correcto'].includes(textLowerMerch)
  const esModificar  = textLowerMerch.includes('modific') || textLowerMerch.includes('cambiar') || textLowerMerch === 'no'

  if (esMerchStart) {
    await Conversation.findByIdAndUpdate(conversation._id, {
      'botState.stage': 'merchandising',
      'botState.merchandisingCount': 0,
      'botState.pendingImageUrl': null,
      'botState.pendingProduct': null,
    })
    const sess = sessions.get(tenantId)
    await _merchSend(sess, msg.from, `✅ *Merchandising iniciado.*\n\nManda el primer producto 👇\n\n_(Foto + descripción juntos, o foto primero y luego el texto)_\n_Ej: "Camisas Algreco — M:2, L:3, XL:6"_`, tenantId, conversation._id, io)
    return
  }

  if (esMerchEnd && !enModoMerch) return  // "fin merch" fuera de modo merch — ignorar silenciosamente

  if (esMerchEnd && enModoMerch) {
    const count = convFreshMerch?.botState?.merchandisingCount || 0
    const log   = convFreshMerch?.botState?.merchandisingLog  || []

    await Conversation.findByIdAndUpdate(conversation._id, {
      'botState.stage': 'en_dialogo',
      'botState.merchandisingCount': 0,
      'botState.merchandisingLog':   [],
      'botState.pendingImageUrl':    null,
      'botState.pendingProduct':     null,
    })

    const sess = sessions.get(tenantId)

    let resumen = `🎉 *¡Sesión de merchandising finalizada!*\n`
    resumen += `━━━━━━━━━━━━━━━━━━━━\n`

    if (log.length === 0) {
      resumen += `No se registró ningún artículo en esta sesión.\n`
    } else {
      const nuevos    = log.filter(l => l.accion === 'nuevo')
      const sumados   = log.filter(l => l.accion === 'sumado')

      if (nuevos.length > 0) {
        resumen += `\n🆕 *Artículos nuevos agregados (${nuevos.length}):*\n`
        nuevos.forEach(l => {
          const tallaStr = l.talla ? ` — Talla *${l.talla}*` : ''
          resumen += `  • ${l.nombre}${tallaStr} — *${l.cantidad} uds*\n`
        })
      }

      if (sumados.length > 0) {
        resumen += `\n♻️ *Stock repuesto (${sumados.length}):*\n`
        sumados.forEach(l => {
          const tallaStr = l.talla ? ` — Talla *${l.talla}*` : ''
          resumen += `  • ${l.nombre}${tallaStr} — +*${l.cantidad} uds* _(total: ${l.total})_\n`
        })
      }

      const totalUds = log.reduce((s, l) => s + (Number(l.cantidad) || 0), 0)
      resumen += `\n━━━━━━━━━━━━━━━━━━━━\n`
      resumen += `📦 *${count} artículo(s)* · *${totalUds} unidades* registradas\n`
      resumen += `\n_El inventario AGROFER CRM ya está actualizado_ ✅`
    }

    await _merchSend(sess, msg.from, resumen, tenantId, conversation._id, io)
    return
  }

  // Confirmación del producto pendiente
  if (enModoMerch && convFreshMerch?.botState?.pendingProduct && esConfirmar) {
    try {
      const MerchandisingItem = require('../models/MerchandisingItem')
      const MerchandisingMovimiento = require('../models/MerchandisingMovimiento')
      const pendingData = convFreshMerch.botState.pendingProduct
      const resultados  = Array.isArray(pendingData) ? pendingData : [pendingData]

      const lineas = []
      for (const d of resultados) {
        // Buscar artículo existente por nombre + talla + marca (insensible a mayúsculas)
        const query = {
          activo: true,
          nombre: { $regex: `^${d.nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
          marca:  { $regex: `^${(d.marca || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
        }
        if (d.talla) query.talla = { $regex: `^${d.talla.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' }
        else query.$or = [{ talla: '' }, { talla: null }, { talla: { $exists: false } }]

        const existente = await MerchandisingItem.findOne(query)
        if (existente) {
          const nuevoTotal = existente.cantidad + (Number(d.cantidad) || 1)
          const updateFields = { $inc: { cantidad: Number(d.cantidad) || 1 } }
          // Si se envió foto nueva (o el producto no tenía imagen), actualizar imagenUrl
          if (d.imagenUrl && (!existente.imagenUrl || d.imagenUrl !== existente.imagenUrl)) {
            updateFields.$set = { imagenUrl: d.imagenUrl }
          }
          await MerchandisingItem.findByIdAndUpdate(existente._id, updateFields)
          await MerchandisingMovimiento.create({
            tipo: 'entrada', itemId: existente._id, itemNombre: existente.nombre,
            cantidad: Number(d.cantidad) || 1, motivo: 'Reposición vía WhatsApp',
            costoUnit: existente.costo || 0, costoTotal: (Number(d.cantidad) || 1) * (existente.costo || 0),
          })
          const imgActualizada = d.imagenUrl && (!existente.imagenUrl || d.imagenUrl !== existente.imagenUrl)
          lineas.push({ nombre: existente.nombre, talla: existente.talla, cantidad: d.cantidad, accion: 'sumado', total: nuevoTotal, imgActualizada })
        } else {
          const costo = Number(d.precio || d.costo || 0)
          await MerchandisingItem.create({ ...d, costo })
          await MerchandisingMovimiento.create({
            tipo: 'entrada', itemNombre: d.nombre,
            cantidad: Number(d.cantidad) || 1, motivo: 'Ingreso vía WhatsApp',
            costoUnit: costo, costoTotal: (Number(d.cantidad) || 1) * costo,
          })
          lineas.push({ nombre: d.nombre, talla: d.talla, cantidad: d.cantidad, precio: costo, accion: 'nuevo', total: d.cantidad })
        }
      }

      const logEntries = lineas.map(l => ({
        nombre:   l.nombre,
        talla:    l.talla    || '',
        cantidad: l.cantidad,
        accion:   l.accion,
        total:    l.total,
      }))
      await Conversation.findByIdAndUpdate(conversation._id, {
        $inc:  { 'botState.merchandisingCount': resultados.length },
        $push: { 'botState.merchandisingLog': { $each: logEntries } },
        'botState.pendingProduct':  null,
        'botState.pendingImageUrl': null,
      })

      const sess = sessions.get(tenantId)
      let respMsg = lineas.map(l => {
        const tallaStr  = l.talla  ? ` (${l.talla})`  : ''
        const precioStr = l.precio ? ` · $${Number(l.precio).toLocaleString('es')} c/u` : ''
        if (l.accion === 'sumado')
          return `✅ *${l.nombre}${tallaStr}* — se sumaron *${l.cantidad} uds* al stock existente _(total: ${l.total})_${l.imgActualizada ? ' 📸 _foto actualizada_' : ''}`
        else
          return `🆕 *${l.nombre}${tallaStr}* — agregado${precioStr} _(${l.cantidad} uds)_`
      }).join('\n')
      respMsg += `\n\nListo para el siguiente producto 👇\n_(o escribe *fin merch* para terminar)_`

      await _merchSend(sess, msg.from, respMsg, tenantId, conversation._id, io)
    } catch (e) {
      console.error('[Merchandising] Error guardando:', e.message)
    }
    return
  }

  // Usuario quiere modificar el producto pendiente
  if (enModoMerch && convFreshMerch?.botState?.pendingProduct && esModificar) {
    await Conversation.findByIdAndUpdate(conversation._id, { 'botState.pendingProduct': null })
    const sess = sessions.get(tenantId)
    const tieneImagen = !!convFreshMerch?.botState?.pendingImageUrl
    await _merchSend(sess, msg.from,
      `↩️ Entendido. Modifica la información y envíamela de nuevo.\n${tieneImagen ? '_(La foto ya está guardada, solo envía el texto corregido)_' : ''}`,
      tenantId, conversation._id, io)
    return
  }

  // Imagen SIN texto → guardar como foto pendiente
  if (enModoMerch && msgType === 'image' && mediaUrl && !text.trim()) {
    await Conversation.findByIdAndUpdate(conversation._id, { 'botState.pendingImageUrl': mediaUrl })
    const sess = sessions.get(tenantId)
    await _merchSend(sess, msg.from,
      `📸 Foto guardada. Ahora escribe los detalles:\n_Ej: "Camisas blancas Algreco — M:3, L:5, XL:2"_`,
      tenantId, conversation._id, io)
    return
  }

  // Texto o imagen+texto → analizar y pedir confirmación
  if (enModoMerch && (text.trim() || (msgType === 'image' && mediaUrl))) {
    const captionText  = text.trim()
    const imageToUse   = mediaUrl || convFreshMerch?.botState?.pendingImageUrl || null
    if (!captionText) {
      const sess = sessions.get(tenantId)
      if (mediaUrl) await Conversation.findByIdAndUpdate(conversation._id, { 'botState.pendingImageUrl': mediaUrl })
      await _merchSend(sess, msg.from, `📸 Foto guardada. Ahora escribe los detalles del producto.`, tenantId, conversation._id, io)
      return
    }
    try {
      const { analyzeMerchandisingImage } = require('./ai.service')
      let resultados
      if (imageToUse) {
        resultados = await analyzeMerchandisingImage(imageToUse, captionText)
      } else {
        resultados = [{ nombre: captionText, marca: '', categoria: 'otro', subcategoria: '', talla: '', color: '', cantidad: 1, descripcion: '', imagenUrl: '' }]
      }
      const normMarca = s => {
        if (!s || !s.trim()) return s || ''
        const t = s.trim()
        if (t === t.toUpperCase() && t.length > 1) return t.charAt(0) + t.slice(1).toLowerCase()
        return t.charAt(0).toUpperCase() + t.slice(1)
      }
      const resultadosConImg = resultados.map(d => ({ ...d, marca: normMarca(d.marca), imagenUrl: imageToUse || '' }))
      await Conversation.findByIdAndUpdate(conversation._id, {
        'botState.pendingProduct': resultadosConImg,
        'botState.pendingImageUrl': imageToUse || null,
      })
      const sess = sessions.get(tenantId)
      const precioBase = Number(resultadosConImg[0].precio || 0)
      let preview = `📋 *Información extraída:*\n\n`
      preview += `📦 *Nombre:* ${resultadosConImg[0].nombre}\n`
      preview += `🏷️ *Marca:* ${resultadosConImg[0].marca || 'Sin marca'}\n`
      preview += `📂 *Categoría:* ${resultadosConImg[0].categoria} / ${resultadosConImg[0].subcategoria}\n`
      if (resultadosConImg[0].color) preview += `🎨 *Color:* ${resultadosConImg[0].color}\n`
      if (precioBase > 0) preview += `💵 *Precio unitario:* $${precioBase.toLocaleString('es')}\n`
      if (resultadosConImg.length > 1) {
        preview += `\n📐 *Por talla:*\n`
        resultadosConImg.forEach(d => { preview += `  · ${d.talla || 'UNICA'} — ${d.cantidad} uds\n` })
        const totalUds = resultadosConImg.reduce((s, d) => s + (Number(d.cantidad) || 0), 0)
        preview += `📊 *Total:* ${totalUds} unidades`
        if (precioBase > 0) preview += ` · 💰 *$${(totalUds * precioBase).toLocaleString('es')} en inventario*`
        preview += '\n'
      } else {
        const cant = Number(resultadosConImg[0].cantidad) || 1
        preview += `🔢 *Cantidad:* ${cant} uds`
        if (precioBase > 0) preview += ` · 💰 *$${(cant * precioBase).toLocaleString('es')} en inventario*`
        preview += '\n'
      }
      preview += `\n¿Confirmar o modificar?`
      await _merchSend(sess, msg.from, preview, tenantId, conversation._id, io)
    } catch (e) {
      console.error('[Merchandising] Error analizando:', e.message)
      const sess = sessions.get(tenantId)
      await _merchSend(sess, msg.from, `⚠️ No pude analizar eso. Intenta de nuevo con más detalle.`, tenantId, conversation._id, io)
    }
    return
  }

  if (enModoMerch) {
    const sess = sessions.get(tenantId)
    await _merchSend(sess, msg.from, `📷 Envía la foto del producto con los detalles, o escribe *fin merch* para terminar.`, tenantId, conversation._id, io)
    return
  }

  // ── MODO ACTUALIZAR FOTOS ────────────────────────────────────────────────────
  const enModoFotos   = convFreshMerch?.botState?.stage === 'actualizando_fotos'
  const esFotosStart  = textLowerMerch.includes('actualizar') && textLowerMerch.includes('foto')
  const esFotosEnd    = (textLowerMerch.includes('fin') || textLowerMerch.includes('finalizar')) && textLowerMerch.includes('foto')

  if (esFotosStart && !enModoFotos) {
    await Conversation.findByIdAndUpdate(conversation._id, { 'botState.stage': 'actualizando_fotos' })
    const sess = sessions.get(tenantId)
    await _merchSend(sess, msg.from,
      `📸 *Modo actualizar fotos activado*\n\nEnvía cada imagen con el nombre del producto en el caption.\nVoy a buscar el producto y guardar la foto automáticamente.\n\n_Escribe *fin fotos* para terminar._`,
      tenantId, conversation._id, io)
    return
  }

  if (esFotosEnd && enModoFotos) {
    await Conversation.findByIdAndUpdate(conversation._id, { 'botState.stage': 'en_dialogo' })
    const sess = sessions.get(tenantId)
    await _merchSend(sess, msg.from, `✅ Modo actualizar fotos finalizado.`, tenantId, conversation._id, io)
    return
  }

  if (enModoFotos && msgType === 'image' && mediaUrl) {
    const MerchandisingItem = require('../models/MerchandisingItem')
    const caption = text?.trim() || ''
    const sess    = sessions.get(tenantId)

    if (!caption) {
      await _merchSend(sess, msg.from,
        `⚠️ Necesito el nombre del producto en el caption de la imagen.\nEnvía la foto *con el texto del producto debajo*.`,
        tenantId, conversation._id, io)
      return
    }

    try {
      // Buscar producto cuyo nombre esté contenido en el caption o viceversa
      const todos = await MerchandisingItem.find({ activo: true }).select('nombre marca color talla imagenUrl').lean()
      let mejor = null
      let mejorScore = 0
      const capLower = caption.toLowerCase()

      for (const p of todos) {
        const nomLower = p.nombre.toLowerCase()
        if (!capLower.includes(nomLower)) continue
        let score = nomLower.length
        if (p.color && capLower.includes(p.color.toLowerCase())) score += 10
        if (p.marca && capLower.includes(p.marca.toLowerCase())) score += 8
        if (p.talla && capLower.includes(p.talla.toLowerCase())) score += 6
        if (score > mejorScore) { mejor = p; mejorScore = score }
      }

      // Fallback: buscar con regex por palabras clave del caption
      if (!mejor) {
        const palabras = capLower.split(/\s+/).filter(w => w.length > 3)
        for (const palabra of palabras) {
          const encontrado = todos.find(p => p.nombre.toLowerCase().includes(palabra))
          if (encontrado) { mejor = encontrado; break }
        }
      }

      if (mejor) {
        await MerchandisingItem.findByIdAndUpdate(mejor._id, { $set: { imagenUrl: mediaUrl } })
        console.log(`[ActualizarFotos] ✅ Foto actualizada para: ${mejor.nombre}`)
        await _merchSend(sess, msg.from,
          `✅ *${mejor.nombre}*${mejor.marca ? ` (${mejor.marca})` : ''} — foto actualizada 📸`,
          tenantId, conversation._id, io)
      } else {
        // Último recurso: usar IA para extraer nombre del caption
        try {
          const { getOpenAIClient } = require('./ai.service')
          const openai = getOpenAIClient()
          const resp = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            max_tokens: 100,
            messages: [{ role: 'user', content: `Del siguiente texto extrae SOLO el nombre del producto de merchandising, sin explicación:\n"${caption}"` }],
          })
          const nombreIA = resp.choices[0]?.message?.content?.trim()
          if (nombreIA) {
            const porIA = todos.find(p => p.nombre.toLowerCase().includes(nombreIA.toLowerCase()) || nombreIA.toLowerCase().includes(p.nombre.toLowerCase()))
            if (porIA) {
              await MerchandisingItem.findByIdAndUpdate(porIA._id, { $set: { imagenUrl: mediaUrl } })
              await _merchSend(sess, msg.from, `✅ *${porIA.nombre}* — foto actualizada 📸`, tenantId, conversation._id, io)
              return
            }
          }
        } catch (_) {}
        await _merchSend(sess, msg.from,
          `❌ No encontré ningún producto que coincida con:\n_"${caption}"_\n\nVerifica el nombre e intenta de nuevo.`,
          tenantId, conversation._id, io)
      }
    } catch (e) {
      console.error('[ActualizarFotos] Error:', e.message)
    }
    return
  }

  if (enModoFotos) {
    const sess = sessions.get(tenantId)
    await _merchSend(sess, msg.from, `📸 Envía la imagen con el nombre del producto en el caption.\n_Escribe *fin fotos* para terminar._`, tenantId, conversation._id, io)
    return
  }
  // ─────────────────────────────────────────────────────────────────────────────

  // Ejecutar flujos de trabajo
  if (effectiveText) {
    try {
      const { sustituirVariables } = require('./flow.service')

      const resultadoFlujo = await ejecutarFlujo({
        tenantId,
        phone,
        texto:           effectiveText,
        esPrimerMensaje: isNew,
        esLead:          contactType === 'lead',
        conversacionId:  conversation._id,
      })

      if (resultadoFlujo.ejecutado) {
        const { ejecutarAccionesFlujo } = require('./flow-actions.service')
        const chat = await msg.getChat().catch(() => null)
        const { pasarAIA } = await ejecutarAccionesFlujo({
          tenant, tenantId, phone, waJid: msg.from,
          acciones: resultadoFlujo.acciones, conversacionId: conversation._id,
          contactType, contactId, io, chat,
        })

        if (!pasarAIA) return
      }
    } catch (err) {
      console.error('Error ejecutando flujo:', err.message)
    }
  }

  // Mensaje de bienvenida por automatización (si no hubo flujo)
  if (isNew && tenant.automations?.welcomeMessage?.enabled && tenant.automations.welcomeMessage.content) {
    try {
      await new Promise(res => setTimeout(res, 1500))
      await sessions.get(tenantId)?.client.sendMessage(msg.from, tenant.automations.welcomeMessage.content)
      await Message.create({
        tenantId, conversation: conversation._id,
        direction: MESSAGE_DIRECTION.OUTBOUND,
        content: tenant.automations.welcomeMessage.content, aiGenerated: false,
      })
    } catch (err) {
      console.error('Error enviando bienvenida:', err.message)
    }
  }

  // Respuesta IA via Orchestrator
  const aiBlocked = !tenant.ai?.enabled || !tenant.ai?.autoReply || !conversation.aiEnabled || !effectiveText
  const injectionDetected = detectPromptInjection(effectiveText)

  console.log(`[BOT] IA: enabled=${tenant.ai?.enabled} autoReply=${tenant.ai?.autoReply} convAI=${conversation.aiEnabled} injection=${injectionDetected}`)

  if (!aiBlocked && !injectionDetected) {
    const debounceKey = `${tenantId}:${phone}`
    const entry = botDebounce.get(debounceKey)
    if (!entry) return

    // Si ya hay un fire activo (otro mensaje ya arrancó el timer), solo acumula y resetea
    if (entry.fire) {
      entry.pendingTexts.push(effectiveText)
      entry.lastRawMsg = msg
      clearTimeout(entry.timer)
      entry.timer = setTimeout(entry.fire, 8000)
      return
    }

    const convId = conversation._id

    entry.fire = async () => {
      botDebounce.delete(debounceKey)

      // Lock: si ya hay una respuesta IA en proceso para este contacto, saltar
      const aiLockKey = debounceKey
      if (aiProcessing.has(aiLockKey)) {
        console.log(`[BOT] Saltando — IA ya en proceso para ${phone}`)
        return
      }
      aiProcessing.add(aiLockKey)

      const allTexts    = [effectiveText, ...entry.pendingTexts].filter(Boolean)
      const combinedText = allTexts.join('\n')
      const lastMsg      = entry.lastRawMsg

      try {
        console.log(`[BOT] Orchestrator procesando (${allTexts.length} msg): "${combinedText.substring(0, 80)}"`)
        const chat = await lastMsg.getChat()

        // Delay humano variable — 10 a 40 segundos
        const rand = Math.random()
        let readDelay
        if (rand < 0.40)      readDelay = Math.floor(Math.random() * 7000)  + 10000  // 40%: 10-17s
        else if (rand < 0.75) readDelay = Math.floor(Math.random() * 12000) + 18000  // 35%: 18-30s
        else                  readDelay = Math.floor(Math.random() * 13000) + 27000  // 25%: 27-40s

        await new Promise(res => setTimeout(res, readDelay))

        // Recargar tenant y conversacion por si cambiaron durante el delay
        const tenantFresh = await Tenant.findById(tenantId).lean()
        const convFresh   = await Conversation.findById(convId).lean()
        if (!tenantFresh || !convFresh || !convFresh.aiEnabled) return

        await provider.markAsRead(tenantFresh, tenantId, chat, lastMsg.id?._serialized)
        await new Promise(res => setTimeout(res, Math.floor(Math.random() * 2000) + 1000))

        // Cargar historial para el orchestrator — el/los mensaje(s) entrantes que componen
        // `combinedText` ya se guardaron en BD antes de este punto, así que sin filtrarlos
        // acá le llegaban a la IA duplicados: una vez dentro de `historial` y otra vez como
        // el turno "user" actual (`orchestrate` agrega `incomingText` aparte). Se descartan
        // los inbound consecutivos del final (los de esta tanda, sin respuesta todavía).
        let historial = await Message.find({ conversation: convId })
          .sort({ timestamp: -1 }).limit(8 + allTexts.length).lean()
        historial.reverse()
        while (historial.length && historial[historial.length - 1].direction === MESSAGE_DIRECTION.INBOUND) {
          historial.pop()
        }
        historial = historial.slice(-8)
        const historialFormateado = historial.map(m => ({
          role:    m.direction === MESSAGE_DIRECTION.INBOUND ? 'user' : 'assistant',
          content: m.content || '',
        }))

        // Llamar al orchestrator
        await provider.sendTyping(tenantFresh, tenantId, chat)
        const resultado = await orchestrate({
          tenantId,
          conversationId: convId,
          phone,
          incomingText:   combinedText,
          tenant:         tenantFresh,
          historial:      historialFormateado,
          io,
        })

        const reply = resultado?.respuesta || ''
        if (!reply) {
          await Conversation.findByIdAndUpdate(convId, { needsAttention: true })
          io.to(`vendedor:${tenantId}`).emit('conversation:needs-attention', { conversationId: convId })
          console.warn(`[BOT] Sin respuesta generada — marcando conversación para atención humana`)
          return
        }
        // Si llegó hasta aquí y respondió bien, limpiar cualquier alerta previa
        await Conversation.findByIdAndUpdate(convId, { needsAttention: false })
        console.log(`[BOT] Respuesta: "${reply}" | accion: ${resultado.accion}`)

        const typingDelay = Math.min(Math.max(reply.length * 30, 1500), 6000)
        await new Promise(res => setTimeout(res, typingDelay))
        await chat.clearState()

        let respondioConAudio = false
        let ttsMediaUrl = null
        if (tenantFresh.tts && tenantFresh.tts.enabled && (lastMsg.type === 'ptt' || lastMsg.type === 'audio')) {
          try {
            const SystemConfig = require('../models/SystemConfig')
            const OpenAI       = require('openai')
            const cfg = await SystemConfig.findById('system').lean().catch(() => null)
            const apiKey = cfg && cfg.openaiKey ? cfg.openaiKey : process.env.OPENAI_API_KEY
            if (apiKey) {
              const openai = new OpenAI({ apiKey })
              const voice  = (tenantFresh.tts && tenantFresh.tts.voice) || (cfg && cfg.ttsVoice) || 'nova'
              const ttsResp = await openai.audio.speech.create({ model: 'tts-1', voice, input: reply, response_format: 'mp3' })
              const ttsBuffer = Buffer.from(await ttsResp.arrayBuffer())
              const fs   = require('fs')
              const path = require('path')
              const uploadDir = path.join(__dirname, '../../uploads')
              if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })
              const ttsFileName = `tts_${Date.now()}.mp3`
              fs.writeFileSync(path.join(uploadDir, ttsFileName), ttsBuffer)
              ttsMediaUrl = `/media/${ttsFileName}`
              const { MessageMedia } = require('whatsapp-web.js')
              const ttsMedia = new MessageMedia('audio/mpeg', ttsBuffer.toString('base64'), ttsFileName)
              const sessTTS = sessions.get(tenantId)
              if (sessTTS) await sessTTS.client.sendMessage(lastMsg.from, ttsMedia, { sendAudioAsVoice: true })
              respondioConAudio = true
              audit.info(tenantId, null, `TTS enviado a ${phone}`)
            }
          } catch (ttsErr) {
            console.error('[TTS] Error generando audio:', ttsErr.message)
          }
        }

        if (!respondioConAudio) {
          await provider.sendText(tenantFresh, tenantId, phone, reply)
        }

        const outboundMsg = await Message.create({
          tenantId,
          conversation: convId,
          direction: MESSAGE_DIRECTION.OUTBOUND,
          content: reply,
          type:     respondioConAudio ? 'audio' : 'text',
          mediaUrl: ttsMediaUrl || undefined,
          mediaType: respondioConAudio ? 'audio/mpeg' : undefined,
          aiGenerated: true,
        })

        await Tenant.findByIdAndUpdate(tenantId, { $inc: { 'stats.mensajesMes': 1 } })

        io.to(`vendedor:${tenantId}`).emit('message:new', {
          conversation: convId,
          message: outboundMsg,
        })
      } catch (err) {
        console.error(`[BOT] Error IA [${tenantId}]:`, err.message)
        await Conversation.findByIdAndUpdate(convId, { needsAttention: true }).catch(() => {})
        io.to(`vendedor:${tenantId}`).emit('conversation:needs-attention', { conversationId: convId })
      } finally {
        aiProcessing.delete(aiLockKey)
      }
    }

    // Arrancar el timer — 8 segundos de ventana para acumular mensajes
    entry.timer = setTimeout(entry.fire, 8000)
  }

  await Conversation.findByIdAndUpdate(conversation._id, {
    lastMessageAt: new Date(),
    $inc: { unreadCount: 1 },
  })
}

async function disconnectSession(tenantId) {
  const session = sessions.get(tenantId)
  if (session) {
    session.manualDisconnect = true
    // Sin esto, un watchdog armado antes de esta desconexión (5 min sin respuesta, o 3 min
    // de carga atascada) seguía vivo por closure sobre ESTE objeto `session` — minutos
    // después de que la línea ya se dio por desconectada correctamente, el timer disparaba
    // igual, borraba del Map la entrada que para ese momento podía pertenecer a una sesión
    // NUEVA y sana, y la reconectaba sola — justo lo que la regla de "las líneas de
    // vendedor nunca quedan conectadas fuera de su ciclo" prohíbe.
    if (session.connectWatchdog) { clearTimeout(session.connectWatchdog); session.connectWatchdog = null }
    if (session.loadingWatchdog) { clearTimeout(session.loadingWatchdog); session.loadingWatchdog = null }
    // client.destroy() es un cierre local/programático — a diferencia de un logout real
    // desde WhatsApp, NO dispara el evento 'disconnected' del cliente, así que hay que
    // actualizar la BD y avisar al frontend aquí mismo (si no, quedan desincronizados:
    // la sesión ya no existe en memoria pero la BD sigue diciendo "connected").
    try { await session.client.destroy() } catch (_) {}
    sessions.delete(tenantId)
  }
  await Tenant.findByIdAndUpdate(tenantId, { 'whatsapp.status': WHATSAPP_STATUS.DISCONNECTED }).catch(() => {})
  session?.io?.to(`vendedor:${tenantId}`).emit('whatsapp:disconnected')
}

function getStatus(tenantId) {
  return sessions.get(tenantId)?.status ?? WHATSAPP_STATUS.DISCONNECTED
}

// Vinculación por número de teléfono (código de 8 dígitos)
async function requestPairingCode(tenantId, phoneNumber, io) {
  // Limpiar número: solo dígitos, sin +, sin espacios
  const cleanPhone = phoneNumber.replace(/\D/g, '')

  let session = sessions.get(tenantId)

  if (!session) {
    // Iniciar sesión nueva marcando que usará pairing code
    session = await createSession(tenantId, io)
    // createSession puede devolver null si ya había otra conexión en curso para este
    // tenant (candado anti-duplicado) — en ese caso, usar la que ya está en marcha.
    if (!session) session = sessions.get(tenantId)
    if (!session) throw new Error('No se pudo iniciar la sesión de WhatsApp')
  }

  session.pendingPhoneNumber = cleanPhone

  // Si el cliente ya está en loading_screen, solicitamos directamente
  try {
    const code = await session.client.requestPairingCode(cleanPhone)
    session.pairingCode = code
    io.to(`vendedor:${tenantId}`).emit('whatsapp:pairing_code', code)
    return code
  } catch (err) {
    // Si falla es porque aún no está listo â€" pendingPhoneNumber lo reintentará en loading_screen
    console.log(`Código pendiente para ${cleanPhone}, esperando loading_screen...`)
    return null
  }
}

async function handleGroupMessage(tenantId, msg, io, tenant) {
  const groupId = msg.from
  const text    = sanitizeInput(msg.body || '')
  const sender  = msg.author?.replace(/@c\.us$/, '') || 'desconocido'

  if (!text && !msg.hasMedia) return

  // Obtener info del grupo
  let groupName = groupId, groupImage = null
  try {
    const chat = await msg.getChat()
    groupName  = chat.name || groupId
    try { groupImage = await chat.getProfilePicUrl() } catch (_) {}
  } catch (_) {}

  // Nombre del remitente
  let senderName = sender
  try {
    const contact = await msg.getContact()
    senderName = contact.pushname || contact.name || sender
  } catch (_) {}

  // Conversación del grupo
  let conv = await Conversation.findOneAndUpdate(
    { tenantId, waJid: groupId },
    { $set: { lastMessageAt: new Date(), status: 'open', isGroup: true, groupName, groupImage } },
    { upsert: false, new: true }
  )
  if (!conv) {
    conv = await Conversation.create({
      tenantId, phone: groupName, waJid: groupId,
      lastMessageAt: new Date(), aiEnabled: false,
      isGroup: true, groupName, groupImage,
    })
  }

  // Guardar mensaje con senderPhone y senderName separados
  const inbMsg = await Message.create({
    tenantId, conversation: conv._id,
    direction: MESSAGE_DIRECTION.INBOUND,
    content: text || '',
    senderPhone: sender,
    senderName,
  })

  io.to(`vendedor:${tenantId}`).emit('message:new', { conversation: conv._id, message: inbMsg })
  console.log(`Grupo [${groupName}] - ${sender}: "${text}"`)
}

// Captura mensajes que el vendedor envía desde su propio celular
async function handleOutgoingMessage(tenantId, msg, io) {
  const phone = msg.to?.replace(/@c\.us$/, '').replace(/@lid$/, '')
  if (!phone) return

  const text = sanitizeInput(msg.body || '')

  // Buscar conversación existente por teléfono o waJid
  let conv = await Conversation.findOne({
    tenantId,
    $or: [{ waJid: msg.to }, { phone }],
  }).lean()

  if (!conv) {
    // Crear conversación si no existe (el vendedor escribió primero)
    let nombre = phone
    try {
      const contact = await sessions.get(tenantId)?.client?.getContactById(msg.to)
      if (contact?.name || contact?.pushname) nombre = contact.name || contact.pushname
    } catch (_) {}

    conv = await Conversation.create({
      tenantId,
      phone,
      waJid:         msg.to,
      lastMessageAt: new Date(),
      status:        'open',
      aiEnabled:     false,
    })
  } else {
    await Conversation.findByIdAndUpdate(conv._id, { lastMessageAt: new Date() })
  }

  // Guardar media si la hay
  let mediaUrl = null, mediaType = null, msgType = 'text'
  if (msg.hasMedia) {
    try {
      const media = await msg.downloadMedia()
      if (media) {
        const fs = require('fs'), path = require('path')
        const ext      = media.mimetype?.split('/')[1]?.split(';')[0] || 'bin'
        const safeName = `${Date.now()}_out_${phone}.${ext}`
        const filePath = path.join(__dirname, '../../uploads', safeName)
        fs.writeFileSync(filePath, Buffer.from(media.data, 'base64'))
        mediaUrl  = `/media/${safeName}`
        mediaType = media.mimetype
        msgType   = media.mimetype?.startsWith('image/') ? 'image'
                  : media.mimetype?.startsWith('video/') ? 'video'
                  : media.mimetype?.startsWith('audio/') ? 'audio'
                  : 'document'
      }
    } catch (_) {}
  }

  const savedMsg = await Message.create({
    tenantId,
    conversation: conv._id,
    direction:    MESSAGE_DIRECTION.OUTBOUND,
    content:      text || (mediaUrl ? '' : '[mensaje]'),
    type:         msgType,
    mediaUrl,
    mediaType,
    aiGenerated:  false,
    sentBy:       null, // enviado desde el celular, no desde el CRM
  })

  io.to(`vendedor:${tenantId}`).emit('message:new', { conversation: conv._id, message: savedMsg })
}

function getClient(vendedorId) {
  return sessions.get(vendedorId)?.client || null
}

// ─── Handler para mensajes entrantes via Meta API ─────────────────────────────
// Reutiliza la misma logica de buscar/crear conversacion y ejecutar el orquestador

async function handleIncomingMetaMessage(tenant, parsed, io) {
  const { sendText, downloadMedia } = require('./meta-api.service')
  const tenantId = tenant._id.toString()
  const { phone, text, contactName, messageId, mediaId, mediaCaption, type } = parsed
  // Declarada aquí (no dentro del try) para que el catch de abajo pueda marcar
  // needsAttention si el error ocurre después de haber identificado la conversación.
  let conversation = null

  try {
    // Buscar cliente o lead por telefono
    let contactId   = null
    let contactType = 'desconocido'

    const customer = await Customer.findOne({ phone, vendedorId: tenantId })
    if (customer) {
      contactId   = customer._id
      contactType = 'customer'
      await Customer.findByIdAndUpdate(customer._id, { lastContactAt: new Date() })
    } else {
      const lead = await Lead.findOne({ phone, tenantId })
      if (lead) {
        contactId   = lead._id
        contactType = 'lead'
      }
    }

    // Buscar o crear conversacion
    const convQuery = contactType === 'customer'
      ? { tenantId, customer: contactId, status: { $in: ['open', 'closed', 'pending'] } }
      : contactType === 'lead'
        ? { tenantId, lead: contactId, status: { $in: ['open', 'closed', 'pending'] } }
        : { tenantId, phone, status: { $in: ['open', 'closed', 'pending'] } }

    conversation = await Conversation.findOne(convQuery).sort({ createdAt: -1 })

    if (!conversation) {
      const convData = { tenantId, phone, aiEnabled: tenant.ai?.autoReply ?? false, lastMessageAt: new Date() }
      if (contactType === 'customer') convData.customer = contactId
      else if (contactType === 'lead') convData.lead    = contactId
      conversation = await Conversation.create(convData)
    } else {
      await Conversation.findByIdAndUpdate(conversation._id, { status: 'open', lastMessageAt: new Date() })
    }

    // Descargar el archivo real si el mensaje trae media (Meta solo manda un media_id
    // en el webhook, no el archivo — hay que pedirlo aparte a la Graph API)
    let mediaUrl  = null
    let mediaType = null
    let fileName  = null
    let fileSize  = null
    let msgType   = 'text'
    if (mediaId) {
      const media = await downloadMedia(tenant, mediaId)
      if (media.ok) {
        const fs   = require('fs')
        const path = require('path')
        mediaType  = media.mimetype
        if (mediaType.startsWith('image/'))      msgType = 'image'
        else if (mediaType.startsWith('video/'))  msgType = 'video'
        else if (mediaType.startsWith('audio/'))  msgType = 'audio'
        else                                      msgType = 'document'

        const ext       = mediaType.split('/')[1]?.split(';')[0] || 'bin'
        const safeName  = `${Date.now()}_meta_${msgType}.${ext}`
        const uploadDir = path.join(__dirname, '../../uploads')
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })
        fs.writeFileSync(path.join(uploadDir, safeName), media.buffer)
        fileName = safeName
        fileSize = media.buffer.length
        mediaUrl = `/media/${safeName}`
      } else {
        console.error(`[META-HANDLER] No se pudo descargar media (${type}) de ${phone}:`, media.error)
      }
    }

    // Guardar mensaje entrante
    const inbMsg = await Message.create({
      tenantId,
      conversation:  conversation._id,
      direction:     MESSAGE_DIRECTION.INBOUND,
      content:       mediaCaption || text,
      type:          msgType,
      mediaUrl,
      mediaType,
      fileName,
      fileSize,
      whatsappMsgId: messageId,
    })

    io?.to(`vendedor:${tenantId}`).emit('message:new', { conversation: conversation._id, message: inbMsg })

    // Ejecutar orquestador si IA esta activa
    const aiBlocked = !tenant.ai?.enabled || !tenant.ai?.autoReply || !conversation.aiEnabled
    if (aiBlocked || !text) return

    const contacto = contactType === 'customer'
      ? await Customer.findById(contactId).lean()
      : contactType === 'lead'
        ? await Lead.findById(contactId).lean()
        : null

    // `inbMsg` (el mensaje que se acaba de guardar arriba) ya quedaría incluido en este
    // query — sin excluirlo, `orchestrate` se lo pasa a la IA dos veces: una dentro de
    // `historial` y otra como `incomingText` (el turno "user" actual).
    const historial = await Message.find({ conversation: conversation._id, _id: { $ne: inbMsg._id } })
      .sort({ createdAt: -1 }).limit(10).lean()
    const histFormatted = historial.reverse().map(m => ({
      role: m.direction === MESSAGE_DIRECTION.INBOUND ? 'user' : 'assistant',
      content: m.content || '',
    }))

    const result = await orchestrate({
      tenantId, conversationId: conversation._id.toString(),
      phone, incomingText: text, tenant, historial: histFormatted, io,
    })

    if (result?.respuesta) {
      const sendResult = await sendText(tenant, phone, result.respuesta)
      await Message.create({
        tenantId, conversation: conversation._id,
        direction: MESSAGE_DIRECTION.OUTBOUND,
        content:   result.respuesta,
        aiGenerated: true,
        whatsappMsgId: sendResult?.messageId || undefined,
      })
      io?.to(`vendedor:${tenantId}`).emit('message:new', {
        conversation: conversation._id,
        message: { direction: 'outbound', content: result.respuesta },
      })
      // Si llegó hasta aquí y respondió bien, limpiar cualquier alerta previa
      await Conversation.findByIdAndUpdate(conversation._id, { needsAttention: false })
    } else if (!aiBlocked) {
      // El bot estaba activo pero no generó respuesta — a diferencia del flujo de
      // whatsapp-web.js, este camino no marcaba nada, así que un fallo silencioso de
      // la IA en la línea principal (Meta) nunca aparecía como alerta para el vendedor.
      await Conversation.findByIdAndUpdate(conversation._id, { needsAttention: true })
      io?.to(`vendedor:${tenantId}`).emit('conversation:needs-attention', { conversationId: conversation._id })
      console.warn(`[META-HANDLER] Sin respuesta generada — marcando conversación para atención humana`)
    }
  } catch (err) {
    console.error('[META-HANDLER] Error procesando mensaje:', err.message)
    if (conversation) {
      await Conversation.findByIdAndUpdate(conversation._id, { needsAttention: true }).catch(() => {})
      io?.to(`vendedor:${tenantId}`).emit('conversation:needs-attention', { conversationId: conversation._id })
    }
  }
}

// Inyectar sessions en el provider para que pueda enviar por WhatsApp Web
provider.setSessions(sessions)

module.exports = { createSession, disconnectSession, getStatus, requestPairingCode, getClient, sessions, handleIncomingMetaMessage }


