const mongoose = require('mongoose')

const quickReplySchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  title: { type: String, required: true, trim: true },
  content: { type: String, default: '' },
  mediaUrl: { type: String },
  mediaType: { type: String, enum: ['image', 'video', null], default: null },
  active: { type: Boolean, default: true },
}, { timestamps: true })

module.exports = mongoose.model('QuickReply', quickReplySchema)
