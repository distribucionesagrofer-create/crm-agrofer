const mongoose = require('mongoose')

const productoCatalogoSchema = new mongoose.Schema({
  // Identificadores del sistema principal
  idSistemaPrincipal: { type: Number, unique: true, index: true },
  codigo:             { type: String, trim: true, index: true },
  referencia:         { type: String, trim: true },

  // Descripción
  descripcion:        { type: String, trim: true, default: '' },
  linea:              { type: String, trim: true, default: '' }, // marca/línea

  // Precio y costos
  precio:             { type: Number, default: 0 },  // precio de venta
  iva:                { type: Number, default: 0 },  // % IVA
  ultCosto:           { type: Number, default: 0 },
  promCosto:          { type: Number, default: 0 },
  porcUtilidad:       { type: Number, default: 0 },  // % margen

  // Inventario
  existencia:         { type: Number, default: 0 },  // stock actual
  unidad:             { type: String, trim: true, default: 'UND' },
  peso:               { type: Number, default: 0 },
  factor:             { type: Number, default: 0 },

  // Imagen (URL local en servidor — no accesible via HTTP por ahora)
  fotoUrl:            { type: String, default: '' },

  activo:             { type: Boolean, default: true },
}, { timestamps: true })

module.exports = mongoose.model('ProductoCatalogo', productoCatalogoSchema)
