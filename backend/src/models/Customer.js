const mongoose = require('mongoose')

const customerSchema = new mongoose.Schema({
  // Relación con línea/vendedor (no requerido — los importados pueden quedar sin asignar)
  vendedorId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },

  // Datos de contacto
  name:          { type: String, trim: true, default: '' },
  phone:         { type: String, trim: true },
  email:         { type: String, lowercase: true, trim: true },
  telefono2:     { type: String, trim: true },  // teléfono secundario (legado, sin uso activo)
  // El sistema externo a veces trae varios números en un mismo campo (separados por guion) —
  // `phone` guarda el primero como principal (compatibilidad con todo el código existente),
  // el resto queda acá sin perderse.
  telefonosAdicionales: { type: [String], default: [] },
  // Detectado por el formato del número principal (móviles CO empiezan en 3, VE en 4/04) —
  // permite segmentar campañas de WhatsApp por país (ej. clientes de zona fronteriza VE).
  pais:          { type: String, enum: ['CO', 'VE', 'otro'], default: 'CO', index: true },

  // Ubicación
  zona:          { type: String, trim: true, default: '' },
  ciudad:        { type: String, trim: true, default: '' },
  barrio:        { type: String, trim: true, default: '' },
  direccion:     { type: String, trim: true, default: '' },
  lat:           { type: Number },  // coordenada para el mapa
  lng:           { type: Number },  // coordenada para el mapa

  // Info comercial
  empresa:       { type: String, trim: true, default: '' },
  sector:        { type: String, trim: true, default: '' },  // ferretería, tienda, etc.
  temperatura:   { type: String, enum: ['frio', 'tibio', 'caliente'], default: 'tibio' },
  potencial:     { type: String, enum: ['bajo', 'medio', 'alto'], default: 'medio' },

  // Datos del sistema principal (solo lectura — vienen del API)
  nit:                   { type: String, trim: true, default: '' },
  idSistemaPrincipal:    { type: Number, index: true },  // ID en sistema externo
  cupoCredito:           { type: Number, default: 0 },
  plazo:                 { type: Number, default: 0 },   // días de plazo
  teridVendedor:         { type: Number },               // terid del vendedor en sistema externo
  departamento:          { type: String, trim: true, default: '' },
  representanteLegal:    { type: String, trim: true, default: '' },

  // Estado y control
  active:        { type: Boolean, default: true },
  importado:     { type: Boolean, default: false },
  lastContactAt: { type: Date },
  notes:         { type: String },

}, { timestamps: true })

// Índice único solo cuando hay teléfono (sparse + partialFilter evita conflictos en imports sin teléfono)
customerSchema.index(
  { vendedorId: 1, phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $exists: true, $ne: '' } } }
)

module.exports = mongoose.model('Customer', customerSchema)
