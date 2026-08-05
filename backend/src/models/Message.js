const mongoose = require('mongoose')
const { MESSAGE_DIRECTION } = require('../config/constants')

const messageSchema = new mongoose.Schema({
  tenantId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  direction:    { type: String, enum: Object.values(MESSAGE_DIRECTION), required: true },
  content:      { type: String, default: '' },
  type:         { type: String, enum: ['text', 'image', 'video', 'audio', 'document', 'sticker'], default: 'text' },
  mediaUrl:     { type: String },
  mediaType:    { type: String },   // MIME type: "image/jpeg", "video/mp4", "audio/ogg"
  fileName:     { type: String },   // Nombre original del archivo
  fileSize:     { type: Number },   // Tamaño en bytes
  duration:     { type: Number },   // Duración en segundos (audio/video)
  // Reply/quote
  replyTo: {
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    content:   { type: String },
    type:      { type: String },
  },
  // Grupos
  senderPhone: { type: String },   // Remitente en grupos
  senderName:  { type: String },   // Nombre del remitente en grupos
  sentBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  aiGenerated: { type: Boolean, default: false },
  whatsappMsgId: { type: String, index: true, sparse: true },
  status:      { type: String, enum: ['sent', 'delivered', 'read', 'failed'], default: 'sent' },
  timestamp:   { type: Date, default: Date.now },
}, { timestamps: true })

messageSchema.index({ conversation: 1, timestamp: -1 })

module.exports = mongoose.model('Message', messageSchema)
