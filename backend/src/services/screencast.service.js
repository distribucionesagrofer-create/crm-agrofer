/**
 * Transmite en vivo la pantalla del Chromium real de una sesión de WhatsApp (vía CDP
 * Page.startScreencast) a la sala de socket del tenant, y permite navegarlo con clic/scroll
 * — muestra el WhatsApp Web real tal cual, con toda su funcionalidad nativa, para que un
 * admin pueda auditar con quién ha hablado un vendedor sin copiar nada a la base de datos.
 */
const activos = new Map() // tenantId -> { cdpSession, frameHandler, yaEstabaConectada }

const SCREENCAST_OPTS = {
  format: 'jpeg',
  quality: 55,
  maxWidth: 1280,
  maxHeight: 900,
  everyNthFrame: 2, // ~limita el framerate para no saturar CPU/red
}

// Cualquier llamada a Puppeteer/CDP puede quedarse colgada sin rechazar nunca (ej. si el
// browser está en un estado raro) — sin esto, un solo await colgado tumba toda la ruta HTTP
// para siempre (el usuario solo ve "cargando" eterno y nginx corta a los 60s sin explicación).
function conTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout: ${label}`)), ms)),
  ])
}

async function iniciarScreencast(tenantId, io) {
  const tId = tenantId.toString()
  if (activos.has(tId)) return { ok: true, yaActivo: true }

  const { createSession, sessions } = require('./whatsapp.service')

  const yaEstabaConectada = sessions.get(tId)?.status === 'connected'
  try {
    await createSession(tId, io, { manejadaPorRotativo: true })
  } catch (e) {
    // client.initialize() puede tirar errores internos de Puppeteer (ej. "Execution context
    // was destroyed" durante una navegación) — sin este catch, ese texto crudo se le mostraba
    // al usuario tal cual en vez del mensaje amigable de siempre.
    console.log(`[Screencast] Error conectando ${tId}: ${e.message}`)
    return { ok: false, error: 'No se pudo conectar la línea' }
  }

  // 90s se quedaba corto en esta máquina (CPU compartida) — mismo problema ya confirmado
  // hoy en _esperarConexion de estados-scheduler.service.js, subido ahí a 240s por la misma
  // razón: una sesión con historial cargado puede tardar más de 90s solo en el loading_screen.
  const start = Date.now()
  while (Date.now() - start < 240000) {
    if (sessions.get(tId)?.status === 'connected') break
    await new Promise(r => setTimeout(r, 1000))
  }
  const sess = sessions.get(tId)
  if (sess?.status !== 'connected' || !sess.client.pupPage) {
    // Si la conexión que nosotros mismos disparamos (línea 34) termina completándose DESPUÉS
    // de este timeout, nadie más la va a desconectar (nunca llegó a activos.set más abajo) —
    // para una línea de rotación eso es justo la fuga de Chromium que se quiere evitar.
    if (!yaEstabaConectada) {
      const { disconnectSession } = require('./whatsapp.service')
      await disconnectSession(tId).catch(() => {})
    }
    return { ok: false, error: 'No se pudo conectar la línea' }
  }

  const page = sess.client.pupPage
  // Puppeteer arranca con viewport chico por defecto (800x600) — el screencast captura el
  // render real de la página, así que sin esto los frames salían pequeños sin importar
  // maxWidth/maxHeight de SCREENCAST_OPTS (esos solo limitan hacia abajo, nunca agrandan).
  // No es crítico: si se cuelga o falla, seguimos igual con el viewport que haya.
  await conTimeout(
    page.setViewport({ width: SCREENCAST_OPTS.maxWidth, height: SCREENCAST_OPTS.maxHeight }),
    8000, 'setViewport'
  ).catch((e) => console.log(`[Screencast] setViewport omitido (${e.message})`))

  let cdpSession
  let frameHandler
  try {
    cdpSession = await conTimeout(page.createCDPSession(), 10000, 'createCDPSession')
    frameHandler = async (frame) => {
      // El socket del admin nunca "sale" de la sala de la línea anterior al cambiar a otra
      // (solo se suman salas con join:vendedor) — sin el tenantId acá, un frame de ESTA
      // línea le podía llegar mezclado a alguien que ya cambió a ver otra línea distinta.
      io.to(`vendedor:${tId}`).emit('screencast:frame', { tenantId: tId, data: frame.data })
      try {
        await cdpSession.send('Page.screencastFrameAck', { sessionId: frame.sessionId })
      } catch (_) {}
    }
    cdpSession.on('Page.screencastFrame', frameHandler)
    await conTimeout(cdpSession.send('Page.startScreencast', SCREENCAST_OPTS), 10000, 'startScreencast')
  } catch (e) {
    console.log(`[Screencast] Error iniciando CDP para ${tId}: ${e.message}`)
    if (cdpSession && frameHandler) cdpSession.off('Page.screencastFrame', frameHandler)
    return { ok: false, error: 'No se pudo iniciar la transmisión' }
  }

  activos.set(tId, { cdpSession, frameHandler, yaEstabaConectada })
  console.log(`[Screencast] Iniciado para ${tId}`)
  return { ok: true }
}

async function detenerScreencast(tenantId) {
  const tId = tenantId.toString()
  const activo = activos.get(tId)
  if (!activo) return { ok: true }

  try {
    await activo.cdpSession.send('Page.stopScreencast')
    activo.cdpSession.off('Page.screencastFrame', activo.frameHandler)
  } catch (_) {}
  activos.delete(tId)

  // Solo desconectar si nosotros iniciamos la conexión — si la línea ya estaba activa
  // de verdad (ej. un vendedor en uso), se deja como estaba.
  if (!activo.yaEstabaConectada) {
    const { disconnectSession } = require('./whatsapp.service')
    await disconnectSession(tId).catch(() => {})
  }
  console.log(`[Screencast] Detenido para ${tId}`)
  return { ok: true }
}

async function clickEnPantalla(tenantId, pctX, pctY) {
  const activo = activos.get(tenantId.toString())
  if (!activo) return
  const { sessions } = require('./whatsapp.service')
  const page = sessions.get(tenantId.toString())?.client?.pupPage
  if (!page) return
  const viewport = page.viewport() || { width: 1000, height: 700 }
  await page.mouse.click(viewport.width * pctX, viewport.height * pctY).catch(() => {})
}

async function scrollEnPantalla(tenantId, pctX, pctY, deltaY) {
  const activo = activos.get(tenantId.toString())
  if (!activo) return
  const { sessions } = require('./whatsapp.service')
  const page = sessions.get(tenantId.toString())?.client?.pupPage
  if (!page) return
  const viewport = page.viewport() || { width: 1000, height: 700 }
  await page.mouse.move(viewport.width * pctX, viewport.height * pctY).catch(() => {})
  await page.mouse.wheel({ deltaY }).catch(() => {})
}

const TECLAS_ESPECIALES = new Set([
  'Backspace', 'Delete', 'Enter', 'Escape', 'Tab',
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
])

// Reenvía tecleo real del admin a la página — pero SOLO si lo que está enfocado ahora
// mismo en la página real es el buscador del panel lateral (#side), nunca el cuadro de
// escribir mensaje (#main). Por diseño explícito, esta vista es de solo lectura/navegación:
// nunca debe poder enviarse un mensaje desde acá, así que cada tecla se valida antes de
// pasarla — si el admin hizo clic dentro de un chat abierto e intenta escribir, no pasa nada.
async function tecleaEnPantalla(tenantId, key) {
  const activo = activos.get(tenantId.toString())
  if (!activo) return
  const { sessions } = require('./whatsapp.service')
  const page = sessions.get(tenantId.toString())?.client?.pupPage
  if (!page) return

  try {
    const enBuscador = await conTimeout(page.evaluate(() => {
      const el = document.activeElement
      if (!el) return false
      const esEditable = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
      return !!(esEditable && el.closest('#side') && !el.closest('#main'))
    }), 3000, 'chequeo foco buscador')
    if (!enBuscador) return

    if (key.length === 1) {
      await page.keyboard.type(key)
    } else if (TECLAS_ESPECIALES.has(key)) {
      await page.keyboard.press(key)
    }
  } catch (_) {}
}

// Se llama cada vez que un socket se desconecta — si esa era la última pestaña viendo
// el "Ver en vivo" de una línea (nadie queda en su sala de socket.io), la apaga sola. Sin
// esto, cerrar la pestaña del navegador sin darle a "Finalizar" dejaba el Chromium corriendo
// para siempre — el watchdog de 20s que normalmente auto-apaga las líneas de rotación está
// desactivado a propósito mientras dura un "Ver en vivo" (`manejadaPorRotativo: true`).
async function limpiarHuerfanos(io) {
  for (const tId of [...activos.keys()]) {
    const sala = io.sockets.adapter.rooms.get(`vendedor:${tId}`)
    if (!sala || sala.size === 0) {
      console.log(`[Screencast] Sin nadie viendo ${tId} — deteniendo automáticamente`)
      await detenerScreencast(tId).catch(() => {})
    }
  }
}

// Para que otros consumidores de la misma sesión (ej. el scheduler de rotación de Estados)
// puedan revisar, justo antes de desconectar una sesión que ELLOS conectaron, si mientras
// tanto un admin abrió "Ver en vivo" en esa misma línea — y si es así, no cortársela.
function tieneScreencastActivo(tenantId) {
  return activos.has(tenantId.toString())
}

module.exports = {
  iniciarScreencast, detenerScreencast, clickEnPantalla, scrollEnPantalla, tecleaEnPantalla,
  limpiarHuerfanos, tieneScreencastActivo,
}
