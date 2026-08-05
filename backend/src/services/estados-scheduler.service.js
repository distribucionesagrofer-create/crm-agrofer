const Tenant                 = require('../models/Tenant')
const PublicidadProgramacion = require('../models/PublicidadProgramacion')
const EstadoPublicado        = require('../models/EstadoPublicado')
const path = require('path')
const fs   = require('fs')

let schedulerStarted = false
let rotacionEnCurso         = false // evita que se solapen dos rondas completas de rotación (publicar)
let rotacionEliminarEnCurso = false // evita que se solapen dos rondas completas de rotación (eliminar)
let _io = null
const publicandoEnLinea = new Set() // evita publicaciones simultáneas en la misma línea

// Con 3 líneas a la vez, cada Chromium compite por el mismo CPU compartido de esta máquina
// (confirmado hoy: incluso UNA sola línea sube a ~100% de un núcleo mientras carga) — bajado
// a 1 (estrictamente secuencial: conecta, publica, verifica, desconecta, y solo ENTONCES pasa
// a la siguiente) para no saturar el sistema, a costa de que una rotación con muchas líneas
// tome más tiempo total.
const CONCURRENCIA_ROTACION = 1 // cuántas líneas de rotación se conectan a la vez
const PAUSA_ENTRE_LOTES_MS = 5000 // margen para que el CPU/Chromium se libere antes de la siguiente

function normFecha(d) { const f = new Date(d); f.setUTCHours(0, 0, 0, 0); return f }

// Líneas recién vinculadas (sesión nueva, sin historial) muestran un modal de bienvenida
// "Novedades en WhatsApp Web" que tapa toda la interfaz — hay que cerrarlo antes de
// intentar hacer clic en cualquier botón de la UI, si no, ningún selector se encuentra.
async function _cerrarModalBienvenida(page) {
  try {
    const cerrado = await page.evaluate(() => {
      const continuar = Array.from(document.querySelectorAll('div[role="button"], button'))
        .find(el => el.textContent.trim() === 'Continuar')
      if (continuar) { continuar.click(); return true }
      return false
    })
    if (cerrado) {
      console.log('[Estados] Modal de bienvenida cerrado (sesión nueva)')
      await new Promise(r => setTimeout(r, 800))
    }
  } catch (_) {}
}

async function publicarEstadoEnLinea(tenantId, contenidos, caption = '', programacionId = null) {
  const key = tenantId.toString()
  if (publicandoEnLinea.has(key)) {
    console.log(`[Estados] ⚠️ Ya hay una publicación en curso para ${key}, ignorando`)
    return { ok: false, error: 'Publicación ya en curso' }
  }
  publicandoEnLinea.add(key)
  try {
    return await _publicarEstadoEnLinea(tenantId, contenidos, caption, programacionId)
  } finally {
    publicandoEnLinea.delete(key)
  }
}

// Espera a que aparezca el botón "Enviar" del editor de estado (o timeout)
async function _esperarBotonEnviar(page, timeoutMs = 12000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const ready = await page.evaluate(() => !!document.querySelector('[aria-label^="Enviar"]')).catch(() => false)
    if (ready) return true
    await new Promise(r => setTimeout(r, 400))
  }
  return false
}

// IDs de los mensajes de "Mi estado" en este momento — se captura ANTES de hacer clic en
// "Enviar" para que la verificación de abajo pueda distinguir un mensaje nuevo de uno viejo.
async function _obtenerIdsEstadoActual(page) {
  return await page.evaluate(() => {
    const status = window.require('WAWebCollections').Status.getMyStatus()
    if (!status) return []
    const msgsCollection = status._msgs || status.msgs
    const msgs = msgsCollection?.getModelsArray ? msgsCollection.getModelsArray() : []
    return msgs.map(m => m.id?._serialized || m.id).filter(Boolean)
  }).catch(() => [])
}

// Confirma que el Estado quedó de verdad registrado en los servidores de WhatsApp — NO
// alcanza con que "Mi estado" muestre contenido (eso es solo un eco local/optimista: se ve
// igual en la sesión que acaba de publicar aunque la subida real nunca haya terminado, que
// es justo lo que pasaba antes — el mensaje "existía" localmente pero ningún otro celular
// lo veía). La señal confiable es el `ack` del mensaje: 0/pendiente = todavía local,
// -1 = error real, >=1 (ACK_SERVER) = WhatsApp ya lo recibió y lo está distribuyendo.
// `idsAntes` (capturados antes del clic en "Enviar") es igual de importante que el ack: si
// el clic falla en silencio (el .catch de abajo lo traga) y no filtramos por mensajes NUEVOS,
// esto podía leer el ack de una publicación de hace rato y confirmar como exitoso un envío
// que en realidad nunca ocurrió.
async function _verificarEstadoPublicado(page, idsAntes, timeoutMs = 90000) {
  const start = Date.now()
  let ultimoVisto = 'nunca apareció un mensaje nuevo' // diagnóstico para el log si termina fallando
  while (Date.now() - start < timeoutMs) {
    const ack = await page.evaluate((idsAntesArr) => {
      const idsAntesSet = new Set(idsAntesArr)
      const status = window.require('WAWebCollections').Status.getMyStatus()
      if (!status) return null
      const msgsCollection = status._msgs || status.msgs
      const msgs = msgsCollection?.getModelsArray ? msgsCollection.getModelsArray() : []
      const nuevos = msgs.filter(m => {
        const id = m.id?._serialized || m.id
        return id && !idsAntesSet.has(id)
      })
      if (!nuevos.length) return null
      const ultimo = nuevos.reduce((a, b) => (a.t || 0) > (b.t || 0) ? a : b)
      return typeof ultimo.ack === 'number' ? ultimo.ack : null
    }, idsAntes).catch(() => null)
    if (ack !== null && ack >= 1) return true
    if (ack === -1) { ultimoVisto = 'mensaje nuevo con ack=-1 (error real reportado por WhatsApp)'; break }
    if (ack !== null) ultimoVisto = `mensaje nuevo, ack=${ack} (todavía pendiente)`
    await new Promise(r => setTimeout(r, 700))
  }
  // Sin esto, un fallo por timeout no distinguía si el clic en "Enviar" nunca llegó a crear
  // un mensaje (posible fallo silencioso del clic) o si sí se creó pero el ack se quedó
  // pendiente/con error — dos causas muy distintas que antes se veían idénticas en el log.
  console.warn(`[Estados] Verificación de ack sin confirmar tras ${timeoutMs}ms — ${ultimoVisto}`)
  return false
}

/**
 * Publica un Estado usando la interfaz REAL de WhatsApp Web (clics reales, como una persona),
 * en vez de llamar funciones internas de window.Store — esas quedaron obsoletas por la migración
 * de identidades LID de Meta y nunca completaban el registro real en los servidores de WhatsApp
 * (el estado parecía "enviado" localmente pero desaparecía al resincronizar la sesión).
 */
async function _publicarEstadoEnLinea(tenantId, contenidos, caption = '', programacionId = null) {
  const { sessions } = require('./whatsapp.service')

  const sess = sessions.get(tenantId.toString())
  console.log(`[Estados] Sesión para ${tenantId}: status=${sess?.status}, existe=${!!sess}`)
  if (!sess || sess.status !== 'connected' || !sess.client.pupPage) {
    console.warn(`[Estados] Línea ${tenantId} no conectada — abortando`)
    return { ok: false, error: 'Línea no conectada' }
  }

  const page       = sess.client.pupPage
  const uploadsDir = path.join(__dirname, '../../uploads')
  console.log(`[Estados] uploadsDir: ${uploadsDir}, contenidos: ${contenidos.length}`)

  // El evento 'ready' de whatsapp-web.js dispara en cuanto el Store interno carga, pero la
  // interfaz visual (React) puede seguir "acomodándose" unos segundos más — sobre todo justo
  // después de una reconexión en frío. Automatizar clics de inmediato es la causa más probable
  // de los fallos silenciosos donde todo parecía funcionar pero el estado nunca quedaba
  // confirmado en "Mi estado".
  await new Promise(r => setTimeout(r, 4000))

  let publicados = 0
  let errorMsg   = ''

  for (const c of contenidos) {
    // Reintento único: en pruebas reales, el primer envío de una sesión recién conectada
    // (recién vinculada por QR o recién reconectada) a veces se queda con el ack pegado en
    // 0 para siempre — sin ningún error explícito — mientras que un segundo intento en la
    // MISMA sesión, segundos después, se confirma sin problema. No se identificó una causa
    // de código (se probó manualmente el mismo flujo exacto, con y sin caption, y funcionó
    // ambas veces); esto asume que es WhatsApp tomándose un momento en "confiar" en la
    // sesión recién activa antes de aceptar una difusión de Estado.
    let exitoso = false
    let ultimoError = null
    for (let intento = 1; intento <= 2 && !exitoso; intento++) {
    try {
      const fileName = path.basename(c.mediaUrl)
      const filePath = path.join(uploadsDir, fileName)
      console.log(`[Estados] Intentando publicar: ${filePath}, existe=${fs.existsSync(filePath)}`)
      if (!fs.existsSync(filePath)) {
        console.warn(`[Estados] Archivo no encontrado: ${filePath}`)
        // No un `continue` (eso ahora reiniciaría el intento en vez de saltar al siguiente
        // contenido, tras envolver este bloque en el loop de reintento) — un archivo
        // faltante no se arregla reintentando, así que se sale del loop de intentos directo.
        ultimoError = new Error('Archivo no encontrado')
        break
      }

      // 1. Abrir la pestaña "Estados"
      await _cerrarModalBienvenida(page)
      // Tras un vínculo por QR recién hecho (no una reconexión desde sesión guardada), la
      // interfaz puede tardar unos segundos más en terminar de pintar — page.click() sin
      // esperar revienta con "No element found" si el botón aún no existe en el DOM.
      await page.waitForSelector('button[aria-label="Estados"]', { timeout: 15000 })
      await page.click('button[aria-label="Estados"]')
      await new Promise(r => setTimeout(r, 1000))

      // 2. Clic en "Agregar estado" (+ del encabezado) — mismo motivo que el waitForSelector
      // de arriba: este botón tampoco existe todavía en el instante justo después de abrir
      // la pestaña "Estados".
      await page.waitForSelector('button[aria-label="Add Status"]', { timeout: 15000 })
      await page.click('button[aria-label="Add Status"]')
      await new Promise(r => setTimeout(r, 1000))

      // 3. Clic en la opción "Fotos y videos" del menú
      const clickedFotos = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('li, div[role="button"], span, div'))
        const el = items.find(e => e.childElementCount === 0 && e.textContent.trim() === 'Fotos y videos')
        if (!el) return false
        const clickable = el.closest('li, div[role="button"]') || el
        clickable.click()
        return true
      })
      if (!clickedFotos) throw new Error('No se encontró la opción "Fotos y videos" en el menú')
      await new Promise(r => setTimeout(r, 800))

      // 4. Inyectar el archivo en el input real
      const fileInput = await page.$('input[type="file"]')
      if (!fileInput) throw new Error('No se encontró el input de archivo tras abrir "Fotos y videos"')
      await fileInput.uploadFile(filePath)

      // 5. Esperar a que cargue el editor (aparece el botón Enviar)
      const listo = await _esperarBotonEnviar(page)
      if (!listo) throw new Error('El editor de estado no cargó a tiempo (timeout esperando botón Enviar)')

      // 6. Escribir el pie de foto si hay
      const cap = caption || c.descripcion || c.titulo || ''
      if (cap) {
        const captionBox = await page.$('div[contenteditable="true"]')
        if (captionBox) {
          await captionBox.click()
          await page.keyboard.type(cap, { delay: 15 })
        }
      }
      await new Promise(r => setTimeout(r, 400))

      // 7. Clic real en "Enviar" — se capturan los IDs de "Mi estado" justo antes, para
      // que la verificación de abajo pueda distinguir un mensaje nuevo de uno viejo.
      const idsAntes = await _obtenerIdsEstadoActual(page)
      // Buscar el botón y hacerle clic en el MISMO evaluate (no en dos llamadas separadas)
      // — antes se leía el aria-label con un evaluate y se hacía clic con un page.click()
      // aparte, dejando una ventana real entre ambos donde el DOM podía cambiar (el botón
      // quedar "stale"). El .catch(()=>{}) que tragaba ese fallo hacía que WhatsApp Web
      // se quedara con el editor de estado abierto y un mensaje "borrador" local con
      // ack=0 — que nunca iba a confirmarse porque el clic real nunca ocurrió, y aun así
      // se esperaban 90s enteros de verificación antes de fallar.
      const clicOk = await page.evaluate(() => {
        const el = document.querySelector('[aria-label^="Enviar"]')
        if (!el) return false
        el.click()
        return true
      }).catch(() => 'contexto_destruido') // navegación interna en curso = el clic sí funcionó
      if (clicOk === false) throw new Error('El botón Enviar desapareció antes de poder hacer clic')

      // 8. Dar tiempo a que WhatsApp Web complete la navegación interna post-envío.
      // (el envío dispara una navegación interna del SPA; si otra evaluate() corre en medio,
      // whatsapp-web.js puede lanzar "Execution context was destroyed" — por eso no tocamos
      // la página aquí, solo esperamos)
      await new Promise(r => setTimeout(r, 4000))

      // 8b. Si el editor de estado SIGUE abierto tras la espera, el clic no navegó a ningún
      // lado — casi seguro no se envió nada real. Fallar rápido acá evita desperdiciar los
      // 90s completos de _verificarEstadoPublicado en un envío que ya sabemos que no ocurrió.
      if (clicOk === true) {
        const siguAbierto = await page.evaluate(() => !!document.querySelector('[aria-label^="Enviar"]')).catch(() => false)
        if (siguAbierto) throw new Error('El clic en Enviar no navegó — el editor de estado sigue abierto, el envío no ocurrió')
      }

      // 9. Confirmar que de verdad quedó publicado — clicar "Enviar" no lo garantiza (la
      // subida real a los servidores de WhatsApp puede fallar en silencio, sobre todo con
      // red lenta). Se verifica el ack del mensaje directo en el modelo interno, no la
      // interfaz visual (esa muestra un eco local optimista incluso si la subida real falla).
      const confirmado = await _verificarEstadoPublicado(page, idsAntes)
      if (!confirmado) throw new Error('El estado no se confirmó con el servidor (ack) tras el envío — pudo fallar en silencio')

      exitoso = true
    } catch (e) {
      ultimoError = e
      console.error(`[Estados] ❌ Intento ${intento}/2 falló en línea ${tenantId} (${c.titulo}):`, e?.message || e)
      if (intento === 1) {
        console.log(`[Estados] Reintentando ${c.titulo}...`)
        await new Promise(r => setTimeout(r, 2000))
      }
    }
    }
    if (exitoso) {
      publicados++
      console.log(`[Estados] ✅ ${c.titulo} publicado y confirmado con el servidor (ack)`)
      await new Promise(r => setTimeout(r, 1500))
    } else {
      errorMsg = ultimoError?.message || String(ultimoError)
    }
  }

  if (publicados === 0) {
    return { ok: false, error: errorMsg || 'Sin archivos publicados' }
  }

  const expiraEn = new Date(Date.now() + 24 * 60 * 60 * 1000)
  await EstadoPublicado.create({
    tenantId,
    programacionId,
    contenidos:  contenidos.map(c => c._id || c),
    msgIds:      [], // ya no se puede leer un msgId confiable desde la UI real
    caption:     caption || '',
    expiraEn,
    activo:      true,
    error:       errorMsg,
  })

  // Marcar la programación del día como enviada si viene asociada a una
  if (programacionId) {
    await PublicidadProgramacion.findByIdAndUpdate(programacionId, {
      $set: { enviado: true, enviadoAt: new Date() }
    }).catch(() => {})
  } else {
    // Sin programacionId: buscar si hay una programación para hoy y marcarla
    const hoy  = normFecha(new Date())
    const mana = new Date(hoy); mana.setUTCDate(hoy.getUTCDate() + 1)
    await PublicidadProgramacion.findOneAndUpdate(
      { fecha: { $gte: hoy, $lt: mana }, enviado: false },
      { $set: { enviado: true, enviadoAt: new Date() } }
    ).catch(() => {})
  }

  console.log(`[Estados] Publicados ${publicados} archivos en línea ${tenantId}, expira ${expiraEn.toLocaleTimeString('es')}`)
  return { ok: true, publicados, expiraEn }
}

/**
 * Elimina TODOS los estados activos de "Mi estado" en una línea, vía la interfaz real
 * (igual que publicar: clics reales — Menú → Eliminar → confirmar — repetidos hasta que
 * no quede ninguno). No depende de msgIds porque la publicación por UI real ya no los captura.
 */
async function eliminarEstadosLinea(tenantId) {
  const key = tenantId.toString()
  if (publicandoEnLinea.has(key)) {
    console.log(`[Estados] ⚠️ Hay una publicación en curso para ${key}, no se puede eliminar ahora`)
    return { ok: false, error: 'Hay una publicación en curso en esta línea, intenta en unos segundos' }
  }
  publicandoEnLinea.add(key)
  try {
    return await _eliminarEstadosLinea(tenantId)
  } finally {
    publicandoEnLinea.delete(key)
  }
}

async function _eliminarEstadosLinea(tenantId) {
  const { sessions } = require('./whatsapp.service')
  const sess = sessions.get(tenantId.toString())
  if (!sess || sess.status !== 'connected' || !sess.client.pupPage) {
    return { ok: false, error: 'Línea no conectada' }
  }
  const page = sess.client.pupPage
  let eliminados = 0

  // Mismo motivo que en _publicarEstadoEnLinea: justo tras reconectar, la interfaz puede
  // seguir acomodándose aunque el botón ya "exista" — sin esta pausa, el chequeo de
  // "¿tiene estado activo?" de abajo puede leer la interfaz a medio cargar y reportar 0.
  await new Promise(r => setTimeout(r, 4000))

  try {
    // La eliminación por clics dependía de que la interfaz visual ("Mi estado" en la
    // pestaña Estados) ya hubiera sincronizado tras reconectar — confirmado con DOM real que
    // eso podía tardar mucho más que cualquier espera razonable, o directamente no reflejar
    // el estado real a tiempo. En vez de eso, usamos la API interna de whatsapp-web.js
    // (la misma que expone Client.revokeStatusMessage) para leer y borrar el modelo de datos
    // directo — no depende de que ningún componente visual se haya pintado.
    //
    // El colección `Status.getMyStatus()._msgs` puede seguir vacía varios segundos después
    // del evento 'ready' en esta máquina (mismo patrón de sincronización lenta visto en todo
    // el flujo de publicar) — un solo chequeo inmediato reportaba "0 eliminados" incluso
    // teniendo un Estado recién publicado y confirmado. Se reintenta leyendo la colección
    // hasta 20s antes de aceptar que de verdad no hay nada que borrar.
    const leerMsgs = () => page.evaluate(() => {
      const status = window.require('WAWebCollections').Status.getMyStatus()
      if (!status) return 0
      const msgsCollection = status._msgs || status.msgs
      return msgsCollection?.getModelsArray ? msgsCollection.getModelsArray().length : 0
    })
    const startLeer = Date.now()
    let cantidad = await leerMsgs()
    while (cantidad === 0 && Date.now() - startLeer < 20000) {
      await new Promise(r => setTimeout(r, 2000))
      cantidad = await leerMsgs()
    }
    console.log(`[Estados] Línea ${tenantId}: ${cantidad} mensaje(s) en Mi Estado tras ${Date.now() - startLeer}ms de polling`)

    // Sin este detalle, "0 eliminados" no distinguía si de verdad no había nada (cantidad=0
    // tras los 20s de polling) o si SÍ había mensajes pero cada intento de revocar falló en
    // silencio (el .catch(_=>{}) por mensaje se traga el motivo real).
    const detalle = await page.evaluate(async () => {
      const Collections = window.require('WAWebCollections')
      const status = Collections.Status.getMyStatus()
      if (!status) return { count: 0, encontrados: 0, errores: [] }
      const msgsCollection = status._msgs || status.msgs
      const msgs = msgsCollection?.getModelsArray ? msgsCollection.getModelsArray() : []
      let count = 0
      const errores = []
      for (const msg of msgs) {
        try {
          await window.require('WAWebRevokeStatusAction').sendStatusRevokeMsgAction(status, msg)
          count++
        } catch (e) {
          errores.push(e?.message || String(e))
        }
      }
      return { count, encontrados: msgs.length, errores }
    })
    eliminados = detalle.count
    if (detalle.encontrados > 0 && detalle.count === 0) {
      console.warn(`[Estados] ${detalle.encontrados} mensaje(s) encontrados en línea ${tenantId} pero NINGUNO se pudo revocar — errores: ${detalle.errores.slice(0, 3).join(' | ')}`)
    }
  } catch (e) {
    console.error(`[Estados] Error eliminando estados en línea ${tenantId}:`, e?.message || e)
    if (eliminados === 0) return { ok: false, error: e?.message || String(e) }
  }

  await EstadoPublicado.updateMany(
    { tenantId, activo: true },
    { $set: { activo: false, expiraEn: new Date() } }
  ).catch(() => {})

  console.log(`[Estados] Eliminados ${eliminados} estados de la línea ${tenantId}`)
  return { ok: true, eliminados }
}

// Espera a que una sesión recién creada llegue a "connected" (o se rinde tras el timeout).
// 90s se quedaba corto: en pruebas reales, una sesión con historial cargado (perfil de
// ~200MB) todavía estaba en 75% de loading_screen a los 100s en esta máquina (CPU
// compartida entre Docker, el navegador y demás procesos) — con 90s, la rotación
// abortaba la conexión (y desperdiciaba todo el tiempo ya invertido) antes de que
// terminara de sincronizar, aunque la sesión guardada era perfectamente válida.
async function _esperarConexion(tenantId, timeoutMs = 240000) {
  const { sessions } = require('./whatsapp.service')
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const sess = sessions.get(tenantId.toString())
    if (sess?.status === 'connected') return true
    if (!sess) return false // la sesión se cayó/nunca se creó
    await new Promise(r => setTimeout(r, 1500))
  }
  return false
}

// Conecta UNA línea de rotación (sesión guardada, sin QR), publica, y la desconecta —
// pase lo que pase (éxito, timeout o error) siempre desconecta al final.
async function _publicarUnaLineaRotativa(tenant, contenidos, caption, programacionId) {
  const { createSession, disconnectSession, sessions } = require('./whatsapp.service')
  const tenantId = tenant._id.toString()
  // Si un admin tiene "Ver en vivo" abierto en esta línea, la sesión ya está conectada
  // antes de que nosotros la toquemos — no es nuestra para desconectar al terminar, o le
  // cortamos la vista en vivo al admin sin avisarle (mismo patrón que screencast.service.js).
  const yaEstabaConectada = sessions.get(tenantId)?.status === 'connected'

  try {
    console.log(`[Estados-Rotativo] Conectando ${tenant.nombre}...`)
    await createSession(tenantId, _io, { manejadaPorRotativo: true })

    const conectado = await _esperarConexion(tenantId)
    if (!conectado) {
      console.warn(`[Estados-Rotativo] ⚠️ ${tenant.nombre} no conectó a tiempo — se salta esta ronda`)
      return { tenantId, nombre: tenant.nombre, ok: false, error: 'Timeout de conexión' }
    }

    const result = await publicarEstadoEnLinea(tenantId, contenidos, caption, programacionId)
    return { tenantId, nombre: tenant.nombre, ...result }
  } catch (e) {
    console.error(`[Estados-Rotativo] Error en ${tenant.nombre}:`, e?.message || e)
    return { tenantId, nombre: tenant.nombre, ok: false, error: e?.message || String(e) }
  } finally {
    // `yaEstabaConectada` es solo una foto tomada AL INICIO — si un admin abrió "Ver en
    // vivo" en esta misma línea MIENTRAS publicábamos (empezó después de nosotros, así que
    // su propio yaEstabaConectada dio true y no la va a desconectar él), sin este segundo
    // chequeo la desconectábamos igual acá y le congelábamos la pantalla sin avisar.
    const { tieneScreencastActivo } = require('./screencast.service')
    if (!yaEstabaConectada && !tieneScreencastActivo(tenantId)) {
      await disconnectSession(tenantId).catch(() => {})
      console.log(`[Estados-Rotativo] ${tenant.nombre} desconectada`)
    }
  }
}

/**
 * Publica Estados en todas las líneas marcadas `rotarSoloEstados` — de a
 * CONCURRENCIA_ROTACION a la vez, conectando con la sesión ya guardada (sin QR),
 * publicando, y desconectando antes de pasar al siguiente lote. Así se puede escalar
 * a decenas de líneas sin mantener todos los Chromium prendidos simultáneamente.
 */
async function publicarEstadosRotativo(contenidos, caption = '') {
  if (rotacionEnCurso || rotacionEliminarEnCurso) {
    console.log('[Estados-Rotativo] ⚠️ Ya hay una ronda de rotación en curso (publicar o eliminar), se ignora esta llamada')
    return { ok: false, error: 'Ya hay una rotación en curso (publicar o eliminar)' }
  }
  rotacionEnCurso = true

  try {
    // whatsapp.connectedAt solo lo escribe un enlace real y exitoso (evento 'ready') — sin
    // este filtro, una línea que nunca se ha vinculado por QR entra igual a la rotación,
    // arranca Chromium, genera un QR que nadie va a escanear, y desperdicia el ciclo entero
    // esperando antes de rendirse.
    const tenants = await Tenant.find({ activo: true, rotarSoloEstados: true, 'whatsapp.connectedAt': { $ne: null } }).lean()
    if (!tenants.length) return { ok: true, procesadas: 0, resultados: [] }

    const ahora = new Date()
    const pendientes = []
    for (const t of tenants) {
      const vigente = await EstadoPublicado.findOne({ tenantId: t._id, expiraEn: { $gt: ahora } }).lean()
      if (!vigente) pendientes.push(t)
    }

    console.log(`[Estados-Rotativo] ${pendientes.length}/${tenants.length} líneas necesitan publicar (resto ya vigente)`)

    const resultados = []
    for (let i = 0; i < pendientes.length; i += CONCURRENCIA_ROTACION) {
      const lote = pendientes.slice(i, i + CONCURRENCIA_ROTACION)
      console.log(`[Estados-Rotativo] Lote ${Math.floor(i / CONCURRENCIA_ROTACION) + 1}: ${lote.map(t => t.nombre).join(', ')}`)
      const res = await Promise.all(lote.map(t => _publicarUnaLineaRotativa(t, contenidos, caption, null)))
      resultados.push(...res)
      // Margen antes de la siguiente línea para que el CPU/Chromium se libere del todo —
      // sin esto, la próxima conexión arrancaba mientras el proceso anterior seguía
      // liberando memoria/procesos zombie, compitiendo por el mismo CPU compartido.
      if (i + CONCURRENCIA_ROTACION < pendientes.length) {
        await new Promise(r => setTimeout(r, PAUSA_ENTRE_LOTES_MS))
      }
    }

    const exitosas = resultados.filter(r => r.ok).length
    console.log(`[Estados-Rotativo] Ronda completada: ${exitosas}/${pendientes.length} líneas publicadas con éxito`)
    return { ok: true, procesadas: pendientes.length, exitosas, resultados }
  } finally {
    rotacionEnCurso = false
  }
}

// Conecta UNA línea de rotación (sesión guardada, sin QR), elimina su estado activo,
// y la desconecta — pase lo que pase (éxito, timeout o error) siempre desconecta al final.
// Es el espejo exacto de _publicarUnaLineaRotativa, pero para borrar.
async function _eliminarUnaLineaRotativa(tenant) {
  const { createSession, disconnectSession, sessions } = require('./whatsapp.service')
  const tenantId = tenant._id.toString()
  // Ver comentario equivalente en _publicarUnaLineaRotativa — no cortar un "Ver en vivo"
  // que un admin ya tenía abierto en esta línea.
  const yaEstabaConectada = sessions.get(tenantId)?.status === 'connected'

  try {
    console.log(`[Estados-Rotativo-Eliminar] Conectando ${tenant.nombre}...`)
    await createSession(tenantId, _io, { manejadaPorRotativo: true })

    const conectado = await _esperarConexion(tenantId)
    if (!conectado) {
      console.warn(`[Estados-Rotativo-Eliminar] ⚠️ ${tenant.nombre} no conectó a tiempo — se salta esta ronda`)
      return { tenantId, nombre: tenant.nombre, ok: false, error: 'Timeout de conexión' }
    }

    const result = await eliminarEstadosLinea(tenantId)
    return { tenantId, nombre: tenant.nombre, ...result }
  } catch (e) {
    console.error(`[Estados-Rotativo-Eliminar] Error en ${tenant.nombre}:`, e?.message || e)
    return { tenantId, nombre: tenant.nombre, ok: false, error: e?.message || String(e) }
  } finally {
    const { tieneScreencastActivo } = require('./screencast.service')
    if (!yaEstabaConectada && !tieneScreencastActivo(tenantId)) {
      await disconnectSession(tenantId).catch(() => {})
      console.log(`[Estados-Rotativo-Eliminar] ${tenant.nombre} desconectada`)
    }
  }
}

/**
 * Elimina el estado activo en todas las líneas marcadas `rotarSoloEstados` — de a
 * CONCURRENCIA_ROTACION a la vez, conectando con la sesión ya guardada (sin QR),
 * eliminando, y desconectando antes de pasar al siguiente lote. Espejo exacto de
 * publicarEstadosRotativo, para que el borrado masivo escale igual de bien que la
 * publicación cuando haya decenas de líneas.
 */
async function eliminarEstadosRotativo() {
  if (rotacionEnCurso || rotacionEliminarEnCurso) {
    console.log('[Estados-Rotativo-Eliminar] ⚠️ Ya hay una ronda de rotación en curso (publicar o eliminar), se ignora esta llamada')
    return { ok: false, error: 'Ya hay una rotación en curso (publicar o eliminar)' }
  }
  rotacionEliminarEnCurso = true

  try {
    const tenants = await Tenant.find({ activo: true, rotarSoloEstados: true }).lean()
    if (!tenants.length) return { ok: true, procesadas: 0, resultados: [] }

    const ahora = new Date()
    const pendientes = []
    for (const t of tenants) {
      const vigente = await EstadoPublicado.findOne({ tenantId: t._id, activo: true, expiraEn: { $gt: ahora } }).lean()
      if (vigente) pendientes.push(t)
    }

    console.log(`[Estados-Rotativo-Eliminar] ${pendientes.length}/${tenants.length} líneas tienen estado activo para eliminar`)

    const resultados = []
    for (let i = 0; i < pendientes.length; i += CONCURRENCIA_ROTACION) {
      const lote = pendientes.slice(i, i + CONCURRENCIA_ROTACION)
      console.log(`[Estados-Rotativo-Eliminar] Lote ${Math.floor(i / CONCURRENCIA_ROTACION) + 1}: ${lote.map(t => t.nombre).join(', ')}`)
      const res = await Promise.all(lote.map(t => _eliminarUnaLineaRotativa(t)))
      resultados.push(...res)
      if (i + CONCURRENCIA_ROTACION < pendientes.length) {
        await new Promise(r => setTimeout(r, PAUSA_ENTRE_LOTES_MS))
      }
    }

    const exitosas = resultados.filter(r => r.ok).length
    console.log(`[Estados-Rotativo-Eliminar] Ronda completada: ${exitosas}/${pendientes.length} líneas con estado eliminado`)
    return { ok: true, procesadas: pendientes.length, exitosas, resultados }
  } finally {
    rotacionEliminarEnCurso = false
  }
}

/**
 * Scheduler: cada 30 min revisa líneas conectadas sin estado vigente y republica.
 */
function startEstadosScheduler(socketIo) {
  if (schedulerStarted) return
  schedulerStarted = true
  _io = socketIo || null

  setInterval(async () => {
    try {
      const { sessions } = require('./whatsapp.service')

      const hoy  = normFecha(new Date())
      const mana = new Date(hoy); mana.setDate(mana.getDate() + 1)

      const prog = await PublicidadProgramacion.findOne({ fecha: { $gte: hoy, $lt: mana } })
        .populate('contenidos').lean()

      if (!prog?.contenidos?.length) return

      const ahora = new Date()

      for (const [tenantId, sess] of sessions.entries()) {
        if (sess.status !== 'connected') continue

        const vigente = await EstadoPublicado.findOne({
          tenantId,
          expiraEn: { $gt: ahora },
        }).lean()

        if (vigente) continue

        console.log(`[Estados Scheduler] Auto-publicando en línea ${tenantId}`)
        await publicarEstadoEnLinea(tenantId, prog.contenidos, prog.caption || '', prog._id)
      }

      // Líneas de rotación (solo-Estados): conectar, publicar, desconectar, una a una/en lotes
      publicarEstadosRotativo(prog.contenidos, prog.caption || '')
        .catch(e => console.error('[Estados-Rotativo] Error en la ronda:', e.message))
    } catch (e) {
      console.error('[Estados Scheduler]', e.message)
    }
  }, 30 * 60 * 1000)

  console.log('Estados scheduler iniciado (revisa cada 30 min)')
}

module.exports = {
  startEstadosScheduler, publicarEstadoEnLinea, eliminarEstadosLinea, publicarEstadosRotativo, eliminarEstadosRotativo,
  // Publicar en UNA sola línea de rotación (reconecta con sesión guardada, publica, desconecta)
  // — útil para probar una línea puntual sin disparar la ronda completa de todas las pendientes.
  publicarLineaRotativaIndividual: _publicarUnaLineaRotativa,
}
