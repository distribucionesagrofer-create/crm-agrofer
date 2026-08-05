const mongoose = require('mongoose')
const { Schema } = mongoose

const taskSchema = new Schema({
  tenantId:       { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation' },
  customerId:     { type: Schema.Types.ObjectId, ref: 'Customer' },
  phone:          { type: String, default: '' },
  contactName:    { type: String, default: '' },
  descripcion:    { type: String, default: 'Llamar al cliente' },
  tipo:           { type: String, enum: ['llamar', 'seguimiento', 'cotizacion', 'otro'], default: 'llamar' },
  estado:         { type: String, enum: ['pendiente', 'completada', 'cancelada'], default: 'pendiente' },
  prioridad:      { type: String, enum: ['alta', 'media', 'baja'], default: 'media' },
  creadaPor:      { type: String, enum: ['bot', 'manual'], default: 'bot' },
  notas:          { type: String, default: '' },
}, { timestamps: true })

taskSchema.index({ tenantId: 1, estado: 1, createdAt: -1 })

module.exports = mongoose.model('Task', taskSchema)
