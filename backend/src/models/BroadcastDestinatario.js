const mongoose = require('mongoose')

const broadcastDestinatarioSchema = new mongoose.Schema({
  broadcastId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Broadcast', required: true, index: true },
  customerId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  phone:        { type: String, required: true },
  nombre:       { type: String },
  estado:       { type: String, enum: ['pendiente', 'enviado', 'fallido'], default: 'pendiente' },
  errorMsg:     { type: String },
  enviadoAt:    { type: Date },
  whatsappMsgId:{ type: String },
}, { timestamps: true })

broadcastDestinatarioSchema.index({ broadcastId: 1, phone: 1 })

module.exports = mongoose.model('BroadcastDestinatario', broadcastDestinatarioSchema)
