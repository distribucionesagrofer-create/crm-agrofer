const mongoose = require('mongoose')

const itemSchema = new mongoose.Schema({
  descripcion: { type: String, required: true },
  cantidad:    { type: Number, required: true, min: 0 },
  precioUnit:  { type: Number, required: true, min: 0 },
  subtotal:    { type: Number, required: true, min: 0 },
}, { _id: false })

const cotizacionSchema = new mongoose.Schema({
  numero:         { type: Number, index: true },
  tenantId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  customerId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', default: null },
  contactName:    { type: String, default: '' },
  phone:          { type: String, default: '' },
  items:          [itemSchema],
  descuento:      { type: Number, default: 0, min: 0, max: 100 },
  subtotalBruto:  { type: Number, default: 0 },
  total:          { type: Number, default: 0 },
  estado:         { type: String, enum: ['borrador', 'enviada', 'aprobada', 'rechazada', 'vencida'], default: 'borrador' },
  notas:          { type: String, default: '' },
  validoHasta:    { type: Date, default: null },
  creadoPor:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true })

// Auto-increment numero
cotizacionSchema.pre('save', async function (next) {
  if (!this.numero) {
    const last = await this.constructor.findOne().sort({ numero: -1 }).lean()
    this.numero = (last?.numero || 0) + 1
  }
  next()
})

module.exports = mongoose.model('Cotizacion', cotizacionSchema)
