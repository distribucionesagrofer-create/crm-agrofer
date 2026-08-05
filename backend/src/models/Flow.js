const mongoose = require('mongoose')

// Estructura de un paso del flujo
const pasoSchema = new mongoose.Schema({
  id:    { type: String, required: true }, // uuid local para referencias
  tipo:  {
    type: String,
    enum: ['mensaje', 'condicion', 'accion', 'ia', 'esperar', 'fin', 'delay', 'capturar', 'media', 'etiqueta', 'random', 'typing'],
    required: true,
  },

  // Para tipo "mensaje"
  contenido:        { type: String, default: '' },
  esperarRespuesta: { type: Boolean, default: false },

  // Para tipo "delay"
  segundos:         { type: Number, default: 3 },

  // Para tipo "capturar"
  pregunta:         { type: String, default: '' },  // mensaje que se envía al cliente
  variable:         { type: String, default: '' },  // nombre de la variable donde guardar

  // Para tipo "media"
  mediaUrl:         { type: String, default: '' },
  mediaCaption:     { type: String, default: '' },
  mediaTipo:        { type: String, enum: ['imagen', 'documento', 'video'], default: 'imagen' },

  // Para tipo "etiqueta"
  etiqueta:         { type: String, default: '' },

  // Para tipo "random" — mensajes alternativos (A/B)
  variantes:        [{ type: String }],

  // Para tipo "typing"
  duracion:         { type: Number, default: 2 },  // segundos de "escribiendo..."

  // Para tipo "condicion" — array de ramas
  ramas: [{
    id:        { type: String },
    condicion: {
      tipo:    { type: String, enum: ['contiene', 'igual', 'empieza', 'primer_mensaje', 'cualquiera'] },
      valor:   { type: String, default: '' },
    },
    // Acción de esta rama
    accion: {
      tipo:       { type: String, enum: ['mensaje', 'delegar', 'ia', 'cambiar_estado', 'fin'] },
      contenido:  { type: String, default: '' },  // si tipo=mensaje
      vendedorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' }, // si tipo=delegar
      estado:     { type: String }, // si tipo=cambiar_estado
    },
    esDefault: { type: Boolean, default: false }, // rama "else"
  }],

  // Para tipo "accion"
  accion: {
    tipo:       { type: String, enum: ['delegar', 'cambiar_estado', 'activar_ia', 'fin'] },
    vendedorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' },
    estado:     { type: String },
  },
}, { _id: false })

const flowSchema = new mongoose.Schema({
  nombre:      { type: String, required: true, trim: true },
  descripcion: { type: String, default: '' },
  activo:      { type: Boolean, default: true },

  // En qué líneas aplica este flujo
  lineas:      [{ type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' }], // vacío = todas

  // Qué dispara el flujo
  disparador: {
    tipo:     { type: String, enum: ['primer_mensaje', 'keyword', 'exacto', 'cualquier_mensaje'], default: 'primer_mensaje' },
    keywords: [{ type: String }], // si tipo=keyword
    soloLeads:    { type: Boolean, default: false },
    soloClientes: { type: Boolean, default: false },
  },

  pasos:    [pasoSchema],
  orden:    { type: Number, default: 0 }, // prioridad (menor número = mayor prioridad)
  usos:     { type: Number, default: 0 },
  rfNodes:  { type: Array, default: [] }, // nodos del canvas React Flow
  rfEdges:  { type: Array, default: [] }, // edges del canvas React Flow
}, { timestamps: true })

module.exports = mongoose.model('Flow', flowSchema)
