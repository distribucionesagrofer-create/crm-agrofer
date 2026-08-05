const mongoose = require('mongoose')

// Documento único — siempre el mismo _id 'system'
const schema = new mongoose.Schema({
  _id:          { type: String, default: 'system' },
  openaiKey:    { type: String, default: '' },
  openaiModel:  { type: String, default: 'gpt-4o-mini' },
  ttsVoice:     { type: String, default: 'nova', enum: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] },
  updatedAt:    { type: Date,   default: Date.now },
}, { _id: false })

module.exports = mongoose.model('SystemConfig', schema)
