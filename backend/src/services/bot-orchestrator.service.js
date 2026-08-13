/**
 * Bot Orchestrator — Director de operaciones del bot
 *
 * Recibe cada mensaje entrante y decide qué hacer:
 *   1. Detecta intención del cliente
 *   2. Verifica reglas de escalación inmediata
 *   3. Construye contexto rico para la IA (en capas)
 *   4. Llama a la IA con instrucción de respuesta estructurada
 *   5. Ejecuta la acción CRM que la IA decidió
 *   6. Actualiza el estado de la conversación
 */

const Conversation = require('../models/Conversation')
const Customer     = require('../models/Customer')
const Lead         = require('../models/Lead')
const Tenant       = require('../models/Tenant')
const Task         = require('../models/Task')
const { buildFAQContext } = require('./knowledge.service')
const { getOpenAIClient } = require('./ai.service')

// ─── Intenciones del cliente ──────────────────────────────────────────────────

const INTENTS = {
  saludo:               ['hola', 'buenos dias', 'buenos días', 'buenas tardes', 'buenas noches', 'buenas', 'hey', 'saludos', 'buen dia'],
  precio:               ['precio', 'costo', 'cuánto vale', 'cuanto vale', 'cuánto cuesta', 'cuanto cuesta', 'valor', 'cotiz', 'cotización', 'cotizacion', 'presupuesto'],
  catalogo:             ['catálogo', 'catalogo', 'qué tienen', 'que tienen', 'qué venden', 'que venden', 'lista de productos', 'portafolio'],
  compra:               ['quiero comprar', 'quiero pedir', 'quiero llevar', 'necesito comprar', 'voy a llevar', 'me da', 'me vende', 'quiero adquirir'],
  disponibilidad:       ['hay stock', 'tienen disponible', 'está disponible', 'esta disponible', 'hay disponibilidad', 'queda', 'agotado', 'lo tienen'],
  ubicacion:            ['dónde están', 'donde están', 'donde quedan', 'dirección', 'direccion', 'cómo llegar', 'como llegar', 'ubicación', 'ubicacion', 'sede', 'local'],
  horario:              ['horario', 'atienden', 'qué hora', 'que hora', 'abren', 'cierran', 'horarios de atención', 'horario de atencion'],
  reclamo:              ['reclamo', 'queja', 'molesto', 'furioso', 'enojado', 'problema con', 'defectuoso', 'dañado', 'roto', 'no sirve', 'no funciona', 'mal producto'],
  asesor:               ['hablar con', 'quiero un asesor', 'necesito un asesor', 'vendedor', 'persona', 'humano', 'representante', 'asesor', 'alguien que me ayude'],
  credito:              ['crédito', 'credito', 'fiado', 'plazo', 'cuotas', 'pagar después', 'pagar despues', 'financiamiento'],
  envio:                ['envío', 'envio', 'despacho', 'domicilio', 'delivery', 'entregan', 'llega hasta', 'costo de envío'],
  mayorista:            ['mayorista', 'por mayor', 'al por mayor', 'volumen', 'grandes cantidades', 'distribución', 'distribuidor'],
  seguimiento_pedido:   ['estado de mi pedido', 'mi pedido', 'dónde está mi pedido', 'donde esta mi pedido', 'cuándo llega', 'cuando llega', 'no ha llegado', 'seguimiento', 'rastrear', 'número de guía', 'numero de guia', 'pedido demorado', 'entrega pendiente'],
  garantia:             ['garantía', 'garantia', 'devolución', 'devolucion', 'devolver', 'reembolso', 'cambio de producto', 'producto defectuoso', 'producto dañado', 'llegó mal', 'llego mal', 'pedido incompleto', 'producto equivocado'],
  proveedor:            ['soy proveedor', 'quiero ser proveedor', 'ofrecer productos', 'ofrecer servicios', 'proveedor', 'distribuidora', 'contacto de compras', 'área de compras', 'area de compras'],
  empleo:               ['empleo', 'trabajo', 'hoja de vida', 'vacante', 'quiero trabajar', 'oferta de trabajo', 'plaza', 'reclutamiento', 'me gustaría trabajar'],
  visita:               ['visita', 'visitar', 'ir a verlos', 'quiero que vengan', 'necesito una visita', 'visita comercial', 'asesor que visite', 'visita técnica'],
  campana:              ['promoción', 'promocion', 'oferta', 'descuento', 'campaña', 'campaña activa', 'tienen promociones', 'hay descuentos', 'precio especial'],
  cliente_existente:    ['ya soy cliente', 'soy cliente', 'tengo cuenta', 'mi cuenta', 'número de cliente', 'codigo de cliente', 'cliente registrado', 'compré antes', 'compre antes'],
  producto_desconocido: ['no sé qué producto', 'no se que producto', 'no sé el nombre', 'busco algo para', 'necesito algo para', 'qué me recomiendan', 'que me recomiendan'],
}

/**
 * Detecta si hay una negación (ej. "no quiero", "no necesito") justo antes de
 * la palabra clave encontrada — evita que "no quiero hablar con un asesor"
 * dispare lo contrario de lo que el cliente pidió.
 */
function tieneNegacionCerca(lower, keyword, ventana = 20) {
  const idx = lower.indexOf(keyword)
  if (idx === -1) return false
  const antes = lower.slice(Math.max(0, idx - ventana), idx)
  return /\bno\b/.test(antes)
}

function keywordsSinNegar(lower, keywords) {
  return keywords.filter(kw => lower.includes(kw) && !tieneNegacionCerca(lower, kw))
}

/**
 * Detecta la intención principal del mensaje (capa 1 — solo keywords, sin API)
 */
function detectIntent(text) {
  if (!text) return 'desconocido'
  const lower = text.toLowerCase()

  let best = { intent: 'desconocido', hits: 0 }

  for (const [intent, keywords] of Object.entries(INTENTS)) {
    const hits = keywordsSinNegar(lower, keywords).length
    if (hits > best.hits) best = { intent, hits }
  }

  return best.intent
}

// ─── Reglas de escalación inmediata ──────────────────────────────────────────

/**
 * Revisa si el mensaje o el estado actual fuerzan escalar SIN pasar por la IA
 */
function checkImmediateEscalation(text, botState, tenant) {
  const lower = (text || '').toLowerCase()

  // 1. Keywords de escalación configuradas por el tenant
  const escKeywords = tenant?.assistant?.escalationKeywords || []
  if (keywordsSinNegar(lower, escKeywords.map(kw => kw.toLowerCase())).length) {
    return { escalar: true, razon: 'keyword_escalacion', urgencia: 'alta' }
  }

  // 2. Cliente pide hablar con persona explícitamente (respeta negaciones: "no quiero hablar con un asesor")
  const pedirHumano = keywordsSinNegar(lower, INTENTS.asesor).length > 0
  if (pedirHumano) {
    return { escalar: true, razon: 'solicitud_humano', urgencia: 'alta' }
  }

  // 3. Reclamo detectado
  const esReclamo = keywordsSinNegar(lower, INTENTS.reclamo).length > 0
  if (esReclamo) {
    return { escalar: true, razon: 'reclamo_detectado', urgencia: 'alta' }
  }

  // 4. Demasiados intentos de IA sin resolver
  const maxIntentos = tenant?.assistant?.maxIntentos || 5
  if ((botState?.intentos || 0) >= maxIntentos) {
    return { escalar: true, razon: 'max_intentos_ia', urgencia: 'media' }
  }

  return { escalar: false }
}

// ─── Contexto rico para la IA (en capas) ─────────────────────────────────────

async function buildRichContext(tenantId, conversationId, tenant, incomingText) {
  const conv = await Conversation.findById(conversationId)
    .populate('customer', 'name empresa phone zona ciudad')
    .populate('lead',     'name phone empresa status')
    .lean()

  const assistant = tenant?.assistant || {}

  // CAPA 1: Identidad y reglas del asistente
  const reglas = (assistant.reglas || []).map((r, i) => `${i + 1}. ${r}`).join('\n')
  const identidad = `Eres ${assistant.nombre || 'Asesor Virtual AGROFER'}.
Rol: ${assistant.rol || 'Ayudar a clientes y resolver dudas.'}
Tono: ${assistant.tono || 'Cercano, claro y profesional.'}
Objetivo: ${assistant.objetivo || 'Calificar clientes y conectarlos con vendedores.'}

REGLAS QUE DEBES SEGUIR:
${reglas}`

  // CAPA 2: systemPrompt personalizado del tenant (si lo tiene)
  const promptPersonal = tenant?.ai?.systemPrompt?.trim()
    ? `\nINSTRUCCIONES ADICIONALES DE LA LÍNEA:\n${tenant.ai.systemPrompt}`
    : ''

  // CAPA 3: Contexto del cliente
  // Si el "nombre" es en realidad un número de teléfono, no se muestra como nombre
  // Elimina caracteres Unicode invisibles (LTR/RTL marks que WhatsApp agrega a números)
  // antes de verificar si el "nombre" es en realidad un teléfono
  const esNumero = (s) => /^\+?[\d\s\-()+]+$/.test((s || '').replace(/[^\x20-\x7E]/g, '').trim())
  let clienteCtx = ''
  const contacto = conv?.customer || conv?.lead
  if (contacto) {
    const nombreMostrar = contacto.name && !esNumero(contacto.name) ? contacto.name : null
    clienteCtx = `
CLIENTE ACTUAL:
- Nombre: ${nombreMostrar || 'Desconocido'}
- Empresa: ${contacto.empresa || 'No indicada'}
- Ciudad: ${contacto.ciudad || contacto.zona || 'No indicada'}
- Tipo: ${conv?.customer ? 'Cliente registrado' : 'Lead / Prospecto'}`
  }

  // CAPA 4: Variables capturadas en la conversación
  // .lean() convierte el Map a objeto plano — no necesita Object.fromEntries
  const vars = (conv?.variables instanceof Map)
    ? Object.fromEntries(conv.variables)
    : (conv?.variables || {})
  const varsCtx = Object.keys(vars).length
    ? `\nDATOS YA CAPTURADOS EN ESTA CONVERSACIÓN:\n${Object.entries(vars).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`
    : ''

  // CAPA 5: FAQ relevante
  const faqCtx = await buildFAQContext(tenantId, incomingText) || ''

  // CAPA 6: Estado actual de la conversación
  const stage = conv?.botState?.stage || 'nuevo'
  const intentos = conv?.botState?.intentos || 0

  // CAPA 7: Instruccion de saludo personalizado (primer mensaje)
  const nombreReal = contacto?.name && !esNumero(contacto.name) ? contacto.name : null
  let saludoCtx = ''
  if (stage === 'nuevo') {
    if (nombreReal) {
      saludoCtx = `
INSTRUCCION DE SALUDO:
Es el PRIMER mensaje de este contacto. Su nombre es "${nombreReal}".
Salúdalo por su nombre de forma cálida (ej: "¡Hola ${nombreReal}! 👋 ¿Cómo estás? ¿En qué te puedo colaborar hoy?").
NO te presentes. NO menciones que eres el asistente. Solo saluda por nombre.`
    } else {
      saludoCtx = `
INSTRUCCION DE SALUDO:
Es el PRIMER mensaje de un contacto nuevo, sin nombre registrado aún.
Salúdalo con calidez y preséntate como asistente de Distribuciones AGROFER.
Usa este tono: "¡Hola! Buenos días 😊 Soy el asistente de Distribuciones AGROFER. ¡Qué gusto tenerte por acá! ¿En qué te puedo colaborar hoy?"
IMPORTANTE: NO uses números de teléfono como nombre. NO escribas ningún número en el saludo.`
    }
  }
  const estadoCtx = `
ESTADO DE CONVERSACIÓN: ${stage} (${intentos} respuestas dadas por IA)`

  return `${identidad}${promptPersonal}${clienteCtx}${varsCtx}${faqCtx}${estadoCtx}${saludoCtx}`
}

// ─── Herramientas (tool calling real de OpenAI) ───────────────────────────────
// Antes se le pedía a la IA que escribiera un JSON como texto (`{respuesta, accion,
// datos}`) y el backend intentaba parsearlo — frágil: un JSON mal formado, un campo
// faltante o texto alrededor del JSON rompía el parseo. Con `tools` de la API de
// OpenAI, el modelo pide ejecutar una función con argumentos ya validados por el
// SDK, nuestro backend la ejecuta de verdad, y el resultado real (ej. el precio
// exacto del catálogo) vuelve al modelo antes de que redacte la respuesta final.

const ACCION_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'escalar_vendedor',
      description: 'Transfiere la conversación a un vendedor humano y desactiva la IA para este chat. Úsala cuando el cliente pida precio exacto/cotización formal, crédito, esté molesto, o pida explícitamente hablar con una persona.',
      parameters: {
        type: 'object',
        properties: {
          razon:    { type: 'string', description: 'Por qué se escala' },
          urgencia: { type: 'string', enum: ['alta', 'media', 'baja'] },
        },
        required: ['razon', 'urgencia'],
        additionalProperties: false,
      },
      strict: true,
    },
  },
  {
    type: 'function',
    function: {
      name: 'crear_lead',
      description: 'Registra al cliente como lead calificado cuando mostró intención clara de compra (preguntó por un producto específico junto con cantidad y/o ciudad).',
      parameters: {
        type: 'object',
        properties: {
          razon: { type: 'string', description: 'Qué mostró interés de compra' },
        },
        required: ['razon'],
        additionalProperties: false,
      },
      strict: true,
    },
  },
  {
    type: 'function',
    function: {
      name: 'crear_tarea',
      description: 'Crea una tarea de seguimiento (ej. "llamar al cliente") cuando el cliente pide que lo llamen o requiere seguimiento posterior.',
      parameters: {
        type: 'object',
        properties: {
          razon:    { type: 'string', description: 'Qué hay que hacer' },
          urgencia: { type: 'string', enum: ['alta', 'media', 'baja'] },
        },
        required: ['razon', 'urgencia'],
        additionalProperties: false,
      },
      strict: true,
    },
  },
  {
    type: 'function',
    function: {
      name: 'pausar_ia',
      description: 'Desactiva la IA para esta conversación sin marcarla como escalación urgente — úsala cuando el cliente prefiere hablar solo con el vendedor, sin presión ni urgencia.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      strict: true,
    },
  },
]

const NOMBRES_ACCIONES = ACCION_TOOLS.map(t => t.function.name)
const MAX_RONDAS_HERRAMIENTAS = 4

async function callAIWithTools(systemPrompt, historial, incomingText, tenant, contextoAccion) {
  const { client: openai, model: defaultModel } = await getOpenAIClient()
  const { TOOLS: queryTools } = require('./bot-tools.service')

  const toolDefs = [...Object.values(queryTools).map(t => t.definition), ...ACCION_TOOLS]
  const instruccion = `
Tienes herramientas disponibles (consultar_producto y acciones del CRM). Cuando el
cliente pregunte por precio, disponibilidad o características de un producto,
SIEMPRE usa consultar_producto en vez de inventar o adivinar el dato — si no lo
encuentra, dilo con honestidad. Usa las acciones (escalar_vendedor, crear_lead,
crear_tarea, pausar_ia) solo cuando correspondan; si no aplica ninguna, simplemente
responde en texto normal.`

  const messages = [
    { role: 'system', content: systemPrompt + instruccion },
    ...historial,
    { role: 'user', content: incomingText },
  ]

  // Si el modelo pide MÁS de una acción CRM en la misma conversación (ej. cliente molesto
  // que también mostró intención de compra clara → escalar_vendedor Y crear_lead), las dos
  // se ejecutan de verdad, pero acá se acumulan todas para poder elegir cuál queda reflejada
  // en botState.stage al final — "gana la última" pisaba un escalado real con
  // 'lead_calificado', escondiendo de la vista "Escalado" del vendedor una conversación
  // donde la IA ya se había desactivado.
  const accionesEjecutadas = []

  for (let ronda = 0; ronda < MAX_RONDAS_HERRAMIENTAS; ronda++) {
    const response = await openai.chat.completions.create({
      model: tenant?.ai?.model || defaultModel,
      max_tokens: 600,
      temperature: 0.4,
      messages,
      tools: toolDefs,
    })

    const msg = response.choices[0].message
    messages.push(msg)

    if (!msg.tool_calls?.length) {
      const elegida = _elegirAccionPrioritaria(accionesEjecutadas)
      return { respuesta: msg.content?.trim() || '', accion: elegida?.nombre || 'ninguna', datos: elegida?.datos || {} }
    }

    for (const call of msg.tool_calls) {
      let args = {}
      try { args = JSON.parse(call.function.arguments || '{}') } catch (_) {}

      let resultado
      if (queryTools[call.function.name]) {
        resultado = await queryTools[call.function.name].handler(args)
      } else if (NOMBRES_ACCIONES.includes(call.function.name)) {
        // Las acciones CRM se ejecutan de una vez (efecto real), no solo se "planean"
        // para ejecutar después — así el modelo recibe confirmación real si algo falla.
        await executeCRMAction(call.function.name, args, contextoAccion)
        accionesEjecutadas.push({ nombre: call.function.name, datos: args })
        resultado = { ok: true }
      } else {
        resultado = { error: `Herramienta desconocida: ${call.function.name}` }
      }

      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(resultado) })
    }
  }

  // Se agotaron las rondas de herramientas sin una respuesta final en texto —
  // pasa muy raro, pero mejor devolver vacío (needsAttention se encarga) que colgarse.
  console.warn('[ORCHESTRATOR] Se agotaron las rondas de herramientas sin respuesta final')
  const elegida = _elegirAccionPrioritaria(accionesEjecutadas)
  return { respuesta: '', accion: elegida?.nombre || 'ninguna', datos: elegida?.datos || {} }
}

// Si el modelo ejecutó varias acciones CRM en la misma conversación, solo una puede quedar
// reflejada en botState.stage — escalar_vendedor/pausar_ia (apagan la IA de verdad) siempre
// deben ganar sobre crear_lead/crear_tarea (que no la apagan), sin importar el orden en que
// el modelo las haya pedido.
const PRIORIDAD_ACCIONES = ['escalar_vendedor', 'pausar_ia', 'crear_lead', 'crear_tarea']
function _elegirAccionPrioritaria(acciones) {
  if (!acciones.length) return null
  for (const nombre of PRIORIDAD_ACCIONES) {
    const encontrada = acciones.find(a => a.nombre === nombre)
    if (encontrada) return encontrada
  }
  return acciones[acciones.length - 1]
}

// ─── Ejecutar acciones CRM ────────────────────────────────────────────────────

async function executeCRMAction(accion, datos, { tenantId, conversationId, phone, contacto, io }) {
  if (!accion || accion === 'ninguna') return

  try {
    if (accion === 'escalar_vendedor') {
      await Conversation.findByIdAndUpdate(conversationId, {
        aiEnabled: false,
        'botState.stage': 'escalado',
        escaladoAt:    new Date(),
        escalacionRazon: datos?.razon || 'decision_ia',
      })
      // Notificar en tiempo real al vendedor
      if (io) {
        io.to(`vendedor:${tenantId}`).emit('bot:escalacion', {
          conversationId,
          phone,
          contactoNombre: contacto?.name || phone,
          razon:    datos?.razon    || 'decision_ia',
          urgencia: datos?.urgencia || 'media',
        })
      }
      console.log(`[ORCHESTRATOR] Conversación ${conversationId} escalada al vendedor. Razón: ${datos?.razon}`)
    }

    if (accion === 'crear_lead') {
      const yaEsLead = await Lead.findOne({ phone, tenantId })
      if (!yaEsLead) {
        await Lead.create({
          tenantId,
          name:    contacto?.name || phone,
          phone,
          empresa: contacto?.empresa || '',
          status:  'interesado',
          source:  'bot_whatsapp',
          notes:   datos?.razon || 'Lead calificado por bot',
        })
        console.log(`[ORCHESTRATOR] Lead creado para ${phone}`)
      }
      await Conversation.findByIdAndUpdate(conversationId, {
        'botState.stage': 'lead_calificado',
      })
    }

    if (accion === 'crear_tarea') {
      await Task.create({
        tenantId:       tenantId,
        conversationId: conversationId,
        phone:          phone,
        contactName:    contacto?.name || phone,
        descripcion:    datos?.razon || 'Llamar al cliente',
        tipo:           'llamar',
        prioridad:      datos?.urgencia === 'alta' ? 'alta' : 'media',
        creadaPor:      'bot',
      })
      console.log(`[ORCHESTRATOR] Tarea creada para ${phone}`)
    }

    if (accion === 'pausar_ia') {
      await Conversation.findByIdAndUpdate(conversationId, {
        aiEnabled: false,
        'botState.stage': 'escalado',
      })
      console.log(`[ORCHESTRATOR] IA pausada en conversación ${conversationId}`)
    }
  } catch (err) {
    console.error('[ORCHESTRATOR] Error ejecutando acción CRM:', err.message)
  }
}

// ─── Función principal ────────────────────────────────────────────────────────

/**
 * Punto de entrada del orquestador.
 * Llámalo desde whatsapp.service.js en lugar de generateAIResponse directamente.
 *
 * @returns {{ respuesta: string, accion: string }}
 */
async function orchestrate({ tenantId, conversationId, phone, incomingText, tenant, historial, io }) {
  const conv = await Conversation.findById(conversationId)
    .populate('customer', 'name phone empresa zona ciudad')
    .populate('lead',     'name phone empresa status')
    .lean()
  const botState = conv?.botState || {}
  const contacto = conv?.customer || conv?.lead || null

  // 1. Detectar intención
  const intent = detectIntent(incomingText)

  // 2. Revisar escalación inmediata (sin pasar por IA)
  const escalacion = checkImmediateEscalation(incomingText, botState, tenant)
  if (escalacion.escalar) {
    await executeCRMAction('escalar_vendedor', { razon: escalacion.razon, urgencia: escalacion.urgencia }, { tenantId, conversationId, phone, contacto, io })
    await Conversation.findByIdAndUpdate(conversationId, {
      'botState.lastIntent':   intent,
      $push: { 'botState.intentHistory': intent },
    })

    const mensajeEscalacion = intent === 'reclamo'
      ? 'Entiendo tu situación, esto es importante para nosotros. Te voy a conectar con un asesor ahora mismo para darte la mejor atención. 🙏'
      : 'Claro, en un momento te conecto con uno de nuestros asesores para que te atienda personalmente. ✅'

    return { respuesta: mensajeEscalacion, accion: 'escalar_vendedor' }
  }

  // 2.5. Revisar si el tenant tiene una acción configurada para esta intención
  const intentActionOverride = tenant?.intentActions?.[intent]
  if (intentActionOverride && intentActionOverride !== 'ninguna') {
    await executeCRMAction(intentActionOverride, { razon: `intent_override:${intent}`, urgencia: 'media' }, { tenantId, conversationId, phone, contacto, io })
    await Conversation.findByIdAndUpdate(conversationId, {
      'botState.lastIntent':  intent,
      $push: { 'botState.intentHistory': intent },
    })
    const mensajeOverride = intentActionOverride === 'escalar_vendedor'
      ? 'Perfecto, voy a conectarte con un asesor para darte una atencion personalizada. En un momento te contacta. Gracias!'
      : 'Entendido, tomamos nota y te damos seguimiento muy pronto.'
    console.log(`[ORCHESTRATOR] Intent override: intent=${intent} accion=${intentActionOverride}`)
    return { respuesta: mensajeOverride, accion: intentActionOverride }
  }

  // 3. Construir contexto rico en capas
  const systemPrompt = await buildRichContext(tenantId, conversationId, tenant, incomingText)

  // 4. Llamar IA con tool calling real — las acciones CRM (si el modelo pide alguna)
  // ya se ejecutan DENTRO de este loop, no hace falta un paso 5 aparte.
  const aiResult = await callAIWithTools(systemPrompt, historial, incomingText, tenant, { tenantId, conversationId, phone, contacto, io })

  // 5. Actualizar estado del bot en la conversación
  const nuevoStage = aiResult.accion === 'escalar_vendedor' || aiResult.accion === 'pausar_ia'
    ? 'escalado'
    : aiResult.accion === 'crear_lead'
      ? 'lead_calificado'
      : botState.stage === 'nuevo' ? 'saludado' : 'en_dialogo'

  await Conversation.findByIdAndUpdate(conversationId, {
    'botState.stage':       nuevoStage,
    'botState.lastIntent':  intent,
    $inc: { 'botState.intentos': 1 },
    $push: { 'botState.intentHistory': intent },
  })

  console.log(`[ORCHESTRATOR] intent=${intent} accion=${aiResult.accion} stage=${nuevoStage}`)

  return aiResult
}

module.exports = { orchestrate, detectIntent, checkImmediateEscalation }
