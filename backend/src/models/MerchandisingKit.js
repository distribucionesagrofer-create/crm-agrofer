const mongoose = require('mongoose')

const schema = new mongoose.Schema({
  nombre:      { type: String, required: true, trim: true },
  descripcion: { type: String, trim: true, default: '' },
  marca:       { type: String, trim: true, default: '' },
  items: [{
    item:     { type: mongoose.Schema.Types.ObjectId, ref: 'MerchandisingItem', required: true },
    cantidad: { type: Number, required: true, min: 1 },
  }],
  // Vendedor asignado para entregar
  vendedorId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null },
  vendedorNombre: { type: String, default: '' },
  // Cliente destino
  clienteId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
  clienteNombre: { type: String, default: '' },
  clientePhone:  { type: String, default: '' },
  notas:   { type: String, default: '' },
  activo:      { type: Boolean, default: true },
  entregado:   { type: Boolean, default: false },
  entregadoEn: { type: Date },
  evidencias: [{
    url:      { type: String },
    nota:     { type: String, default: '' },
    subidoEn: { type: Date, default: Date.now },
  }],
}, { timestamps: true })

schema.index({ marca: 1 })
schema.index({ vendedorId: 1 })
schema.index({ clienteId: 1 })
schema.index({ entregado: 1 })

module.exports = mongoose.model('MerchandisingKit', schema)
