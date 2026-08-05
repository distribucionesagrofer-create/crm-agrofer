const router = require('express').Router()
const { authenticate } = require('../middleware/auth')
const { createSession, disconnectSession, getStatus, requestPairingCode } = require('../services/whatsapp.service')

router.use(authenticate)

router.post('/connect', async (req, res) => {
  const { vendedorId } = req.body
  if (!vendedorId) return res.status(400).json({ error: 'vendedorId requerido' })
  const io = req.app.get('io')
  createSession(vendedorId, io).catch(err => {
    console.error(`Error iniciando WhatsApp [${vendedorId}]:`, err.message)
    io.to(`vendedor:${vendedorId}`).emit('whatsapp:error', err.message)
  })
  res.json({ message: 'Iniciando WhatsApp. Escanea el QR.' })
})

router.post('/disconnect', async (req, res) => {
  const { vendedorId } = req.body
  if (!vendedorId) return res.status(400).json({ error: 'vendedorId requerido' })

  try {
    await disconnectSession(vendedorId)
  } catch (e) {
    console.error('Error al desconectar session:', e.message)
  }

  // Forzar update en BD independientemente de si el evento fired
  const Tenant = require('../models/Tenant')
  await Tenant.findByIdAndUpdate(vendedorId, { 'whatsapp.status': 'disconnected', 'whatsapp.phone': null })

  res.json({ message: 'WhatsApp desconectado.' })
})

router.get('/status', (req, res) => {
  const { vendedorId } = req.query
  if (!vendedorId) return res.json({ status: 'disconnected' })
  res.json({ status: getStatus(vendedorId) })
})

// Borrar sesión de WhatsApp del disco — libera espacio y elimina datos de Chrome
// Solo aplica a líneas desconectadas/abandonadas. No borra el vendedor de la BD.
router.post('/clear-session', async (req, res) => {
  const { vendedorId } = req.body
  if (!vendedorId) return res.status(400).json({ error: 'vendedorId requerido' })

  const { sessions } = require('../services/whatsapp.service')
  const fs   = require('fs')
  const path = require('path')

  // Destruir sesión activa si existe
  const sess = sessions.get(vendedorId)
  if (sess) {
    if (sess.connectWatchdog) clearTimeout(sess.connectWatchdog)
    if (sess.qrTimer) clearTimeout(sess.qrTimer)
    if (sess.client) {
      try {
        await Promise.race([
          sess.client.destroy(),
          new Promise(r => setTimeout(r, 5000)),
        ])
      } catch (_) {}
    }
    sessions.delete(vendedorId)
  }

  // Borrar carpeta de sesión del disco. Chromium a veces tarda un instante en soltar sus
  // propios archivos de bloqueo tras destroy() — sin espera/reintentos, rmSync puede fallar
  // con ENOTEMPTY justo después de cerrar el navegador.
  const sessDir = path.join(__dirname, '../../sessions', `session-${vendedorId}`)
  if (fs.existsSync(sessDir)) {
    await new Promise(r => setTimeout(r, 800))
    try {
      fs.rmSync(sessDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
    } catch (e) {
      console.error(`[clear-session] No se pudo borrar ${sessDir} de una:`, e.message)
      await new Promise(r => setTimeout(r, 1500))
      fs.rmSync(sessDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
    }
  }

  // Actualizar estado en BD
  const Tenant = require('../models/Tenant')
  await Tenant.findByIdAndUpdate(vendedorId, {
    'whatsapp.status': 'disconnected',
    'whatsapp.phone': null,
    'whatsapp.connectedAt': null,
  })

  const audit = require('../services/audit.service')
  audit.warn(vendedorId, null, `Sesión limpiada manualmente — datos de WhatsApp eliminados del disco`)

  res.json({ ok: true, message: 'Sesión eliminada del disco. Para reconectar escanea el QR.' })
})

router.post('/pairing-code', async (req, res) => {
  const { vendedorId, phoneNumber } = req.body
  if (!vendedorId || !phoneNumber) {
    return res.status(400).json({ error: 'vendedorId y phoneNumber requeridos' })
  }
  const io = req.app.get('io')
  await requestPairingCode(vendedorId, phoneNumber, io)
  res.json({ message: 'Código de vinculación solicitado' })
})

module.exports = router
