const mongoose = require('mongoose')

const knowledgeBaseSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  question: { type: String, required: true, trim: true },
  answer: { type: String, required: true, trim: true },
  keywords: [{ type: String }],   // auto-generadas al guardar
  active: { type: Boolean, default: true },
}, { timestamps: true })

// Auto-generar keywords desde la pregunta (palabras de 4+ letras)
knowledgeBaseSchema.pre('save', function () {
  if (this.isModified('question')) {
    this.keywords = this.question
      .toLowerCase()
      .replace(/[¿?¡!.,;:]/g, '')
      .split(/\s+/)
      .filter(w => w.length >= 4)
  }
})

module.exports = mongoose.model('KnowledgeBase', knowledgeBaseSchema)
