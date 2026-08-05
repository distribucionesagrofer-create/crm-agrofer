const mongoose = require('mongoose')

const schema = new mongoose.Schema({
  _id:          { type: String, default: 'cache' }, // singleton
  fechaDesde:   String,
  fechaHasta:   String,
  vendedores:   [mongoose.Schema.Types.Mixed],
  topProductos: [mongoose.Schema.Types.Mixed],
  evolucion:    [mongoose.Schema.Types.Mixed],
  totalPedidos: Number,
  valorPedidos: Number,
  totalRecibos: Number,
  valorRecibos: Number,
  tasaCobro:    Number,
  syncAt:       { type: Date, default: null },
  syncStatus:   { type: String, enum: ['idle', 'syncing', 'done', 'error'], default: 'idle' },
  syncError:    { type: String, default: '' },
}, { timestamps: false })

module.exports = mongoose.model('AnalisisComercialCache', schema)
