const KnowledgeBase = require('../models/KnowledgeBase')

/**
 * Busca los FAQs más relevantes para un mensaje de cliente.
 * Devuelve hasta `limit` entradas ordenadas por coincidencia de palabras.
 */
async function findRelevantFAQ(tenantId, messageText, limit = 3) {
  const faqs = await KnowledgeBase.find({
    $or: [{ tenantId }, { tenantId: null }],
    active: true,
  }).lean()
  if (!faqs.length) return []

  // Tokenizar el mensaje entrante (palabras de 4+ letras)
  const msgWords = messageText
    .toLowerCase()
    .replace(/[¿?¡!.,;:]/g, '')
    .split(/\s+/)
    .filter(w => w.length >= 4)

  if (!msgWords.length) return []

  // Puntuar cada FAQ por número de keywords que coinciden con el mensaje
  const scored = faqs
    .map((faq) => {
      const kws = faq.keywords || []
      const score = msgWords.reduce((acc, word) => {
        return acc + (kws.some(k => k.includes(word) || word.includes(k)) ? 1 : 0)
      }, 0)
      return { faq, score }
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  return scored.map(({ faq }) => faq)
}

/**
 * Construye el bloque de contexto FAQ para inyectar en el system prompt.
 */
async function buildFAQContext(tenantId, messageText) {
  const relevant = await findRelevantFAQ(tenantId, messageText)
  if (!relevant.length) return ''

  const lines = relevant.map(f => `P: ${f.question}\nR: ${f.answer}`).join('\n\n')
  return `\n\nInformación verificada de la empresa (úsala si es relevante):\n${lines}`
}

module.exports = { findRelevantFAQ, buildFAQContext }
