const mongoose = require('mongoose')

const campanaDestinatarioSchema = new mongoose.Schema({
  campanaId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Campana', required: true, index: true },
  customerId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  phone:        { type: String, required: true },
  nombre:       { type: String },
  estado:       { type: String, enum: ['pendiente', 'enviado', 'fallido'], default: 'pendiente' },
  errorMsg:     { type: String },
  enviadoAt:    { type: Date },
  whatsappMsgId:{ type: String },
  leyo:         { type: Boolean, default: false },
  leyoAt:       { type: Date },
  respondio:    { type: Boolean, default: false },
  respondioAt:  { type: Date },
}, { timestamps: true })

campanaDestinatarioSchema.index({ campanaId: 1, phone: 1 })

module.exports = mongoose.model('CampanaDestinatario', campanaDestinatarioSchema)
