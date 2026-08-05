const mongoose = require('mongoose')

const EstadoPublicadoSchema = new mongoose.Schema({
  tenantId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  programacionId: { type: mongoose.Schema.Types.ObjectId, ref: 'PublicidadProgramacion', default: null },
  contenidos:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'PublicidadContenido' }],
  msgIds:         [{ type: String }],
  caption:        { type: String, default: '' },
  publicadoEn:    { type: Date, default: Date.now },
  expiraEn:       { type: Date },
  activo:         { type: Boolean, default: true },
  error:          { type: String, default: '' },
}, { timestamps: true })

module.exports = mongoose.model('EstadoPublicado', EstadoPublicadoSchema)
