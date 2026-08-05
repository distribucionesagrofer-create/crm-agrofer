const mongoose = require('mongoose')

const conversationSchema = new mongoose.Schema({
  tenantId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  customer:     { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
  lead:         { type: mongoose.Schema.Types.ObjectId, ref: 'Lead',     default: null },
  phone:        { type: String, required: true },
  waJid:        { type: String },
  status:       { type: String, enum: ['open', 'closed', 'pending'], default: 'open' },
  assignedTo:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  aiEnabled:    { type: Boolean, default: false },
  lastMessageAt:{ type: Date, default: Date.now },
  unreadCount:  { type: Number, default: 0 },
  profileImage: { type: String },  // Foto de perfil del contacto
  contactName:  { type: String },  // Nombre real de WhatsApp del contacto (cuando no hay Customer/Lead vinculado)
  // Grupos
  isGroup:      { type: Boolean, default: false },
  groupName:    { type: String },
  groupImage:   { type: String },
  // Para nodo "Capturar dato" — espera la siguiente respuesta del cliente
  pendingCaptura: {
    variable:       { type: String },
    flujoId:        { type: String },
    etiqueta:       { type: String },
    pasosRestantes: { type: Array, default: [] }, // pasos pendientes tras capturar
  },
  // Variables capturadas durante el flujo
  variables:    { type: Map, of: String, default: {} },
  // Etiquetas del lead/conversación
  etiquetas:    [{ type: String }],
  // Estado comercial del bot en esta conversación
  botState: {
    stage: {
      type: String,
      enum: ['nuevo', 'saludado', 'en_dialogo', 'esperando_dato', 'lead_calificado', 'escalado', 'cerrado', 'merchandising', 'actualizando_fotos'],
      default: 'nuevo',
    },
    lastIntent:          { type: String, default: '' },
    intentHistory:       [{ type: String }],
    intentos:            { type: Number, default: 0 },
    // Campos para flujo de inventario merchandising
    merchandisingCount:  { type: Number, default: 0 },
    merchandisingLog:    { type: mongoose.Schema.Types.Mixed, default: [] },
    pendingImageUrl:     { type: String, default: null },
    pendingProduct:      { type: mongoose.Schema.Types.Mixed, default: null },
  },
  needsAttention:       { type: Boolean, default: false }, // bot no pudo responder — requiere humano
  isMonitoreo:          { type: Boolean, default: false }, // línea en modo solo-monitoreo
  contactoDesconocido:  { type: Boolean, default: false }, // número no está en BD de clientes
  escalacionRazon: { type: String, default: null },
  escaladoAt:      { type: Date,   default: null },
  notes: [{
    content:   { type: String, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
  }],
}, { timestamps: true })

module.exports = mongoose.model('Conversation', conversationSchema)
