const mongoose = require('mongoose')

const schema = new mongoose.Schema({
  vendedor:      { type: String, required: true, trim: true },
  vendedorTerid: { type: Number, default: null },
  items: [{
    itemId:       { type: mongoose.Schema.Types.ObjectId, ref: 'MerchandisingItem' },
    nombre:       { type: String, default: '' },
    marca:        { type: String, default: '' },
    categoria:    { type: String, default: '' },
    subcategoria: { type: String, default: '' },
    talla:        { type: String, default: '' },
    color:        { type: String, default: '' },
    cantidad:     { type: Number, default: 1, min: 1 },
  }],
  estado:    { type: String, enum: ['pendiente', 'entregado', 'devuelto'], default: 'entregado' },
  notas:     { type: String, default: '' },
  evidencias: [{
    url:      { type: String },
    nota:     { type: String, default: '' },
    subidaEn: { type: Date, default: Date.now },
  }],
}, { timestamps: true })

schema.index({ vendedor: 1 })
schema.index({ createdAt: -1 })

module.exports = mongoose.model('MerchandisingEntrega', schema)
