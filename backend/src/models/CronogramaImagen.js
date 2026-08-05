const mongoose = require('mongoose')

const schema = new mongoose.Schema({
  año:        { type: Number, required: true },
  mes:        { type: Number, required: true }, // 1-12
  semana:     { type: Number, required: true }, // 1-5 semana del mes
  fechaInicio:{ type: Date },
  fechaFin:   { type: Date },
  marca:      { type: String, default: '' },
  productos:  { type: String, default: '' },
  descripcion:{ type: String, default: '' },
  cantidad:   { type: Number, default: 1 },
  estado:     { type: String, enum: ['pendiente','en_proceso','entregado'], default: 'pendiente' },
  notas:      { type: String, default: '' },
}, { timestamps: true })

module.exports = mongoose.model('CronogramaImagen', schema)
