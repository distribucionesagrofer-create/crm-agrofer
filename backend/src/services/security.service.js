// Filtro de prompt injection para mensajes de WhatsApp antes de enviarlos a la IA
const INJECTION_PATTERNS = [
  /ignore (previous|all) instructions/i,
  /system prompt/i,
  /you are now/i,
  /forget (your|all)/i,
  /jailbreak/i,
  /act as (an?|if)/i,
  /\[INST\]/i,
  /<\|system\|>/i,
]

function detectPromptInjection(text) {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(text))
}

// Firmas base64 de formatos de imagen — msg.body en grupos puede contener el thumbnail crudo
const BASE64_IMG_PREFIXES = ['/9j/', 'iVBOR', 'R0lGOD', 'UklGR', 'PHN2Zy']

function sanitizeInput(text) {
  if (typeof text !== 'string') return ''
  const t = text.trim()
  // Si el body es un thumbnail base64 de imagen, descartarlo — no es texto real
  if (BASE64_IMG_PREFIXES.some(p => t.startsWith(p))) return ''
  return t.slice(0, 2000)
}

module.exports = { detectPromptInjection, sanitizeInput }
