const mongoose = require('mongoose')

const tenantSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  slug:   { type: String, required: true, unique: true, lowercase: true, trim: true },
  zona:   { type: String, trim: true, default: '' },
  activo: { type: Boolean, default: true },
  esPrincipal: { type: Boolean, default: false }, // línea principal AGROFER
  tipo: { type: String, enum: ['vendedor', 'comunicacion'], default: 'vendedor' }, // vendedor = crea clientes/leads; comunicacion = solo conversaciones

  // Línea dedicada solo a publicar Estados por turnos (no se mantiene conectada 24h,
  // se conecta con la sesión guardada, publica, y se desconecta — para escalar a muchas
  // líneas sin mantener todos los Chromium prendidos al mismo tiempo)
  rotarSoloEstados: { type: Boolean, default: false },

  whatsapp: {
    status:      { type: String, enum: ['disconnected', 'connecting', 'qr_ready', 'connected'], default: 'disconnected' },
    phone:       { type: String },
    connectedAt: { type: Date },
  },

  ai: {
    enabled:      { type: Boolean, default: false },
    autoReply:    { type: Boolean, default: false },
    systemPrompt: { type: String, default: '' },
    model:        { type: String, default: 'gpt-4o-mini' },
  },

  // Personalidad y comportamiento comercial del asistente
  assistant: {
    nombre:   { type: String, default: 'Asistente AGROFER' },
    rol:      { type: String, default: 'Soy el asistente comercial de AGROFER; ayudo a orientar consultas, identificar que necesita el cliente y conectarlo con el asesor adecuado.' },
    tono:     { type: String, default: 'Amable, claro, directo y profesional, con estilo colombiano natural. Responde corto, sin sonar robotico, tutea al cliente cuando sea apropiado y mantiene una actitud servicial y comercial.' },
    objetivo: { type: String, default: 'Entender la necesidad del cliente, capturar los datos importantes y escalar la conversacion a un vendedor cuando exista intencion de compra, cotizacion, reclamo o consulta especifica.' },
    reglas: {
      type: [String],
      default: [
        'Nunca inventes precios, disponibilidad, tiempos de entrega ni condiciones comerciales.',
        'Si el cliente pregunta por precio, disponibilidad o quiere comprar, primero captura producto de interes y ciudad/barrio. Luego escala la conversacion al vendedor correspondiente.',
        'Haz maximo una pregunta por mensaje.',
        'Si el cliente esta molesto, menciona reclamo, garantia, devolucion, pedido incompleto o mala experiencia, no discutas ni intentes resolver solo. Escala inmediatamente a un asesor humano.',
        'No hables de temas ajenos a AGROFER, sus productos, atencion comercial, cobertura o procesos relacionados.',
        'Si no tienes informacion suficiente o segura, reconocelo de forma breve y ofrece validarlo con un asesor. Nunca inventes.',
        'Presentate como Asistente AGROFER solo en el primer contacto. No repitas tu nombre en cada mensaje.',
        'Si el cliente da su ciudad, barrio, municipio, producto de interes, tipo de negocio o necesidad, captura ese dato y usalo durante la conversacion.',
        'No confirmes tiempos exactos de entrega sin validacion de un asesor.',
        'No apruebes creditos, descuentos, precios especiales ni condiciones comerciales personalizadas.',
        'No des instrucciones tecnicas sobre uso de productos quimicos sin validacion de un asesor o informacion oficial.',
        'Responde de forma breve, clara y natural. Maximo 3 o 4 lineas por mensaje.',
        'Usa maximo un emoji cuando aporte cercania. No abuses de emojis.',
        'Si detectas intencion comercial fuerte, ayuda a capturar los datos minimos para crear o actualizar un lead: producto de interes, ciudad/barrio y tipo de cliente.',
        'Si el cliente pide hablar con una persona, pausa la IA y escala la conversacion a un asesor humano.',
      ],
    },
    escalationKeywords: {
      type: [String],
      default: [
        'reclamo', 'queja', 'pqr', 'devolucion', 'devolución', 'devolver', 'garantia', 'garantía',
        'reembolso', 'pedido incompleto', 'producto incompleto', 'mal producto', 'producto equivocado',
        'defectuoso', 'dañado', 'roto', 'mal estado', 'llego mal', 'llegó mal', 'no llego', 'no llegó',
        'nunca llego', 'nunca llegó', 'pedido perdido', 'demorado', 'urgente', 'mala experiencia',
        'inconforme', 'molesto', 'enojado', 'gerente', 'supervisor', 'jefe', 'administrador',
        'demanda', 'abogado', 'denunciar', 'denuncia', 'estafa', 'me estafaron',
        'no me responden', 'nadie responde', 'quiero hablar con alguien', 'quiero hablar con una persona',
        'quiero un asesor', 'asesor humano', 'atencion humana',
      ],
    },
    maxIntentos: { type: Number, default: 5 },
  },

  // Mapeo de intencion detectada → accion CRM override (ia = deja decidir a la IA)
  intentActions: {
    type: Object,
    default: {
      saludo:               'ia',
      precio:               'ia',
      catalogo:             'ia',
      compra:               'crear_lead',
      disponibilidad:       'ia',
      ubicacion:            'ia',
      horario:              'ia',
      reclamo:              'escalar_vendedor',
      asesor:               'escalar_vendedor',
      credito:              'escalar_vendedor',
      envio:                'ia',
      mayorista:            'escalar_vendedor',
      seguimiento_pedido:   'escalar_vendedor',
      garantia:             'escalar_vendedor',
      proveedor:            'escalar_vendedor',
      empleo:               'ia',
      visita:               'escalar_vendedor',
      campana:              'ia',
      cliente_existente:    'ia',
      producto_desconocido: 'ia',
    },
  },

  // Configuracion Meta WhatsApp Business API (oficial)
  // Cuando metaApi.enabled = true, el sistema usa la API de Meta en lugar de Baileys
  metaApi: {
    enabled:            { type: Boolean, default: false },
    phoneNumberId:      { type: String,  default: '' },   // ID del numero en Meta Business
    accessToken:        { type: String,  default: '' },   // Token permanente de la app de Meta
    webhookVerifyToken: { type: String,  default: '' },   // Token para verificar el webhook
    businessAccountId:  { type: String,  default: '' },   // WABA ID (WhatsApp Business Account)
    appId:              { type: String,  default: '' },   // App ID de Meta Developers
    appSecret:          { type: String,  default: '' },   // App Secret — valida la firma X-Hub-Signature-256 del webhook
  },

  botActivationKeyword: { type: String, default: 'activar bot' },
  teridSistemaPrincipal: { type: Number, default: null }, // terid en el sistema principal
  soloMonitoreo:    { type: Boolean, default: false },
  monitorearGrupos: { type: Boolean, default: false },
  pausado:          { type: Boolean, default: false },  // pausa procesamiento sin desconectar
  inboxActivo:      { type: Boolean, default: false },  // false = solo publica estados, true = monitorea inbox

  tts: {
    enabled: { type: Boolean, default: false },
    voice:   { type: String, default: 'nova', enum: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] },
  },

  automations: {
    welcomeMessage: {
      enabled: { type: Boolean, default: false },
      content: { type: String, default: '' },
    },
    followUp: {
      enabled:  { type: Boolean, default: false },
      hours:    { type: Number, default: 24 },
      content:  { type: String, default: '' },
      // Con Meta API, si ya pasaron +24h sin que el cliente escriba, la ventana de
      // mensajería libre se cierra y solo se puede enviar una plantilla aprobada —
      // nombre de la plantilla a usar en ese caso (vacío = no reintenta, solo lo registra).
      templateName: { type: String, default: '' },
    },
  },

  stats: {
    totalClientes:       { type: Number, default: 0 },
    totalConversaciones: { type: Number, default: 0 },
    mensajesMes:         { type: Number, default: 0 },
  },
}, { timestamps: true })

module.exports = mongoose.model('Tenant', tenantSchema)
