const mongoose = require('mongoose')

const campanaSchema = new mongoose.Schema({
  vendedorId:             { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  nombre:                 { type: String, default: 'Campaña' },
  mensaje:                { type: String, default: '' },
  imageUrl:               { type: String, default: '' },
  zona:                   { type: String, default: '' },
  scheduledAt:            { type: Date },
  batchSize:              { type: Number, default: 50 },
  delayBetweenMessages:   { type: Number, default: 60 },   // seconds
  delayBetweenBatches:    { type: Number, default: 1800 },  // seconds
  destinatarios:          { type: Number, default: 0 },
  enviados:               { type: Number, default: 0 },
  fallidos:               { type: Number, default: 0 },
  leyeron:                { type: Number, default: 0 },
  respondieron:           { type: Number, default: 0 },
  estado: {
    type: String,
    enum: ['pendiente', 'programada', 'enviando', 'completada', 'error'],
    default: 'pendiente',
  },
  iniciadaAt:   { type: Date },
  completadaAt: { type: Date },
}, { timestamps: true })

module.exports = mongoose.model('Campana', campanaSchema)
