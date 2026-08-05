const mongoose = require('mongoose')

const estadoMonitoreoSchema = new mongoose.Schema({
  fecha:        { type: Date, required: true },  // normalizada a medianoche
  tenantId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  subioEstado:  { type: Boolean, default: false },
  horaEstado:   { type: Date },
}, { timestamps: true })

estadoMonitoreoSchema.index({ fecha: 1, tenantId: 1 }, { unique: true })

module.exports = mongoose.model('EstadoMonitoreo', estadoMonitoreoSchema)
