const mongoose = require('mongoose')

const schema = new mongoose.Schema({
  tipo:         { type: String, enum: ['entrada','salida','kit_entregado','kit_devuelto'], required: true },
  itemId:       { type: mongoose.Schema.Types.ObjectId, ref: 'MerchandisingItem' },
  itemNombre:   { type: String, default: '' },
  kitId:        { type: mongoose.Schema.Types.ObjectId, ref: 'MerchandisingKit' },
  kitNombre:    { type: String, default: '' },
  kitItems:     [{ itemId: mongoose.Schema.Types.ObjectId, nombre: String, talla: String, color: String, marca: String, cantidad: Number }],
  cantidad:     { type: Number, default: 0 },
  destinatario: { type: String, default: '' },
  motivo:       { type: String, default: '' },
  costoUnit:    { type: Number, default: 0 },
  costoTotal:   { type: Number, default: 0 },
  evidencias:   [{ url: String, nota: { type: String, default: '' } }],
}, { timestamps: true })

module.exports = mongoose.model('MerchandisingMovimiento', schema)
