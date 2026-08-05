const mongoose = require('mongoose')

const resultadoSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' },
  nombre:   { type: String },
  success:  { type: Boolean, default: false },
  error:    { type: String, default: '' },
}, { _id: false })

const publicidadProgramacionSchema = new mongoose.Schema({
  fecha:      { type: Date, required: true },   // normalizada a medianoche
  contenidos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'PublicidadContenido' }],
  caption:    { type: String, default: '' },
  enviado:    { type: Boolean, default: false },
  enviadoAt:  { type: Date },
  resultados: { type: [resultadoSchema], default: [] },
}, { timestamps: true })

publicidadProgramacionSchema.index({ fecha: 1 }, { unique: true })

module.exports = mongoose.model('PublicidadProgramacion', publicidadProgramacionSchema)
