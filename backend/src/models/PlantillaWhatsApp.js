const mongoose = require('mongoose')

const botonSchema = new mongoose.Schema({
  tipo:  { type: String, enum: ['QUICK_REPLY', 'URL', 'PHONE_NUMBER'], required: true },
  texto: { type: String, required: true, trim: true },
  valor: { type: String, default: '' }, // URL o número de teléfono (no aplica a QUICK_REPLY)
}, { _id: false })

const plantillaWhatsAppSchema = new mongoose.Schema({
  tenantId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },

  nombre:    { type: String, required: true, trim: true, lowercase: true }, // snake_case, único por tenant
  categoria: { type: String, enum: ['MARKETING', 'UTILITY', 'AUTHENTICATION'], required: true },
  idioma:    { type: String, default: 'es' }, // language code de Meta

  header: {
    tipo:      { type: String, enum: ['ninguno', 'texto', 'imagen', 'documento', 'video'], default: 'ninguno' },
    contenido: { type: String, default: '' },
  },
  cuerpo: { type: String, required: true },   // texto con variables {{1}}, {{2}}...
  footer: { type: String, default: '' },
  botones: [botonSchema],

  estado:         { type: String, enum: ['borrador', 'enviada', 'aprobada', 'rechazada', 'pausada'], default: 'borrador' },
  metaTemplateId: { type: String, default: '' },
  motivoRechazo:  { type: String, default: '' },
  ultimaConsulta: { type: Date },
}, { timestamps: true })

plantillaWhatsAppSchema.index({ tenantId: 1, nombre: 1 }, { unique: true })

module.exports = mongoose.model('PlantillaWhatsApp', plantillaWhatsAppSchema)
