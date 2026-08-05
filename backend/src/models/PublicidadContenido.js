const mongoose = require('mongoose')

const publicidadContenidoSchema = new mongoose.Schema({
  titulo:      { type: String, required: true, trim: true },
  marca:       { type: String, default: '', trim: true },
  tipo:        { type: String, enum: ['imagen', 'video'], default: 'imagen' },
  mediaUrl:    { type: String, required: true },
  mediaType:   { type: String, default: 'image/jpeg' },
  descripcion: { type: String, default: '' },
  tags:        { type: [String], default: [] },
  activo:      { type: Boolean, default: true },
}, { timestamps: true })

module.exports = mongoose.model('PublicidadContenido', publicidadContenidoSchema)
