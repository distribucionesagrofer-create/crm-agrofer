const mongoose = require('mongoose')

const schema = new mongoose.Schema({
  nombre:       { type: String, required: true, trim: true },
  marca:        { type: String, trim: true, default: '' },
  proveedor:    { type: String, trim: true, default: '' },
  categoria:    { type: String, trim: true, default: 'otro' },
  subcategoria: { type: String, trim: true, default: '' },
  talla:        { type: String, trim: true, default: '' },
  color:        { type: String, trim: true, default: '' },
  cantidad:     { type: Number, default: 1, min: 0 },
  costo:        { type: Number, default: 0 },
  imagenUrl:    { type: String, default: '' },
  imagenes: [{
    url:      { type: String },
    nota:     { type: String, default: '' },
    subidaEn: { type: Date, default: Date.now },
  }],
  descripcion:  { type: String, trim: true, default: '' },
  esFamilia:    { type: Boolean, default: false },
  activo:       { type: Boolean, default: true },
}, { timestamps: true })

schema.index({ marca: 1 })
schema.index({ categoria: 1 })

module.exports = mongoose.model('MerchandisingItem', schema)
