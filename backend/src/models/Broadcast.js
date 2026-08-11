const mongoose = require('mongoose')

const personalizacionSchema = new mongoose.Schema({
  variable: { type: Number, required: true }, // 1, 2, 3... (posición de {{n}} en el cuerpo)
  tipo:     { type: String, enum: ['fijo', 'campo'], required: true },
  valor:    { type: String, required: true }, // texto fijo, o nombre de campo de Customer (name/empresa/zona/ciudad)
}, { _id: false })

const broadcastSchema = new mongoose.Schema({
  tenantId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true }, // línea que envía (Meta API)

  nombre:     { type: String, default: 'Broadcast' },

  plantillaId:     { type: mongoose.Schema.Types.ObjectId, ref: 'PlantillaWhatsApp', required: true },
  plantillaNombre: { type: String, required: true }, // copia al momento de enviar
  idioma:          { type: String, default: 'es' },
  categoria:       { type: String, default: '' },

  // Filtros de audiencia usados para armar los destinatarios (todos opcionales)
  segmento: {
    zona:        { type: String, default: '' },
    temperatura: { type: String, default: '' },
    potencial:   { type: String, default: '' },
    sector:      { type: String, default: '' },
    pais:        { type: String, default: '' },
    vendedorId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null },
  },

  personalizacion: [personalizacionSchema],

  scheduledAt:  { type: Date },

  destinatarios: { type: Number, default: 0 },
  enviados:      { type: Number, default: 0 },
  entregados:    { type: Number, default: 0 },
  leidos:        { type: Number, default: 0 },
  respondieron:  { type: Number, default: 0 },
  fallidos:      { type: Number, default: 0 },

  estado: {
    type: String,
    enum: ['borrador', 'pendiente', 'programada', 'enviando', 'completada', 'error'],
    default: 'borrador',
  },

  iniciadaAt:   { type: Date },
  completadaAt: { type: Date },
}, { timestamps: true })

module.exports = mongoose.model('Broadcast', broadcastSchema)
