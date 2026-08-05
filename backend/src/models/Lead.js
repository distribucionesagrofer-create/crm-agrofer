const mongoose = require('mongoose')

const leadSchema = new mongoose.Schema({
  tenantId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  name:          { type: String, trim: true, default: '' },
  phone:         { type: String, trim: true, required: true },
  status: {
    type: String,
    enum: ['nuevo', 'contactado', 'interesado', 'convertido', 'descartado'],
    default: 'nuevo',
  },
  source:        { type: String, default: 'whatsapp' },
  notes:         { type: String, default: '' },
  lastMessageAt: { type: Date, default: Date.now },
  convertedAt:   { type: Date },
  customerId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
}, { timestamps: true })

leadSchema.index({ tenantId: 1, phone: 1 }, { unique: true, sparse: true })

module.exports = mongoose.model('Lead', leadSchema)
