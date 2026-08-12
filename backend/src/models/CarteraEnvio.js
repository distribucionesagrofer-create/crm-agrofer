const mongoose = require('mongoose')

// Registro de cada recordatorio de cartera enviado a un cliente — mismo patrón de
// seguimiento (enviado/entregado/leído/respondió) que ya existe para Broadcast.
const carteraEnvioSchema = new mongoose.Schema({
  tenantId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },

  // Snapshot de las facturas al momento de enviar — para saber exactamente qué se le mandó
  facturas: {
    type: [{
      documento: String, vence: String, valor: Number, saldo: Number, _id: false,
    }],
    default: [],
  },
  totalEnviado: { type: Number, default: 0 },

  motivo: { type: String, enum: ['manual', 'auto_15', 'auto_10', 'auto_5'], default: 'manual' },

  estado: {
    type: String,
    enum: ['enviado', 'entregado', 'leido', 'fallido'],
    default: 'enviado',
  },
  errorMsg: { type: String, default: '' },

  respondio:   { type: Boolean, default: false },
  respondioAt: { type: Date },

  whatsappMsgId: { type: String, index: true, sparse: true },
  entregadoAt:   { type: Date },
  leidoAt:       { type: Date },
}, { timestamps: true })

carteraEnvioSchema.index({ customerId: 1, createdAt: -1 })

module.exports = mongoose.model('CarteraEnvio', carteraEnvioSchema)
