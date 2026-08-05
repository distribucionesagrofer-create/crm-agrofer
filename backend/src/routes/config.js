const express = require('express')
const router  = express.Router()
const { authenticate } = require('../middleware/auth')
const SystemConfig = require('../models/SystemConfig')
const OpenAI = require('openai')

function maskKey(key) {
  if (!key || key.length < 8) return key ? '●●●●●●●●' : ''
  return key.substring(0, 7) + '●'.repeat(Math.min(key.length - 7, 30))
}

// GET /api/config — devuelve config sin exponer el token completo
router.get('/', authenticate, async (req, res) => {
  const cfg = await SystemConfig.findById('system').lean()
  const effectiveKey = cfg?.openaiKey || process.env.OPENAI_API_KEY || ''
  const fromEnv      = !cfg?.openaiKey && !!process.env.OPENAI_API_KEY
  res.json({
    openaiKeySet:    !!effectiveKey,
    openaiKeyMasked: maskKey(effectiveKey),
    openaiModel:     cfg?.openaiModel || 'gpt-4o-mini',
    ttsVoice:        cfg?.ttsVoice    || 'nova',
    updatedAt:       cfg?.updatedAt   || null,
    fromEnv,
  })
})

// PATCH /api/config — actualiza token, modelo y/o voz TTS
router.patch('/', authenticate, async (req, res) => {
  const { openaiKey, openaiModel, ttsVoice } = req.body
  const VALID_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']
  const update = { updatedAt: new Date() }
  if (openaiKey   !== undefined) update.openaiKey   = openaiKey.trim()
  if (openaiModel !== undefined) update.openaiModel = openaiModel.trim()
  if (ttsVoice    !== undefined && VALID_VOICES.includes(ttsVoice)) update.ttsVoice = ttsVoice

  await SystemConfig.findByIdAndUpdate('system', { $set: update }, { upsert: true, new: true })
  res.json({ ok: true })
})

// POST /api/config/test-openai — prueba el token actual
router.post('/test-openai', authenticate, async (req, res) => {
  const cfg = await SystemConfig.findById('system').lean()
  const key = cfg?.openaiKey || process.env.OPENAI_API_KEY
  if (!key) return res.status(400).json({ error: 'No hay token configurado' })

  try {
    const client = new OpenAI({ apiKey: key })
    const resp = await client.chat.completions.create({
      model: cfg?.openaiModel || 'gpt-4o-mini',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'di OK' }],
    })
    const reply = resp.choices[0]?.message?.content || 'OK'
    res.json({ ok: true, reply, model: cfg?.openaiModel || 'gpt-4o-mini' })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// POST /api/config/tts-preview — genera audio de prueba para previsualizar una voz
router.post('/tts-preview', authenticate, async (req, res) => {
  const { voice = 'nova' } = req.body
  const VALID_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']
  if (!VALID_VOICES.includes(voice)) return res.status(400).json({ error: 'Voz inválida' })

  const cfg = await SystemConfig.findById('system').lean()
  const key = cfg?.openaiKey || process.env.OPENAI_API_KEY
  if (!key) return res.status(400).json({ error: 'No hay token de OpenAI configurado' })

  try {
    const client = new OpenAI({ apiKey: key })
    const response = await client.audio.speech.create({
      model:           'tts-1',
      voice,
      input:           'Hola, soy el asistente virtual de AGROFER. ¿En qué te puedo ayudar hoy?',
      response_format: 'mp3',
    })
    const buffer = Buffer.from(await response.arrayBuffer())
    res.json({ audio: buffer.toString('base64'), mimetype: 'audio/mpeg' })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

module.exports = router
