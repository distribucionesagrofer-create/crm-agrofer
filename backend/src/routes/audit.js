const express = require('express')
const router  = express.Router()
const { authenticate } = require('../middleware/auth')
const Tenant  = require('../models/Tenant')
const audit   = require('../services/audit.service')
const { sessions } = require('../services/whatsapp.service')

// GET /api/audit — estado del sistema + logs recientes
router.get('/', authenticate, async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit) || 200, 500)
  const tenants = await Tenant.find({ activo: true }).lean()

  const lineStatus = tenants.map(t => {
    const sess = sessions.get(String(t._id))
    const metaActiva = !!(t.metaApi?.enabled && t.metaApi?.accessToken)
    return {
      tenantId:   String(t._id),
      nombre:     t.nombre,
      zona:       t.zona || null,
      esPrincipal: t.esPrincipal || t.slug === 'linea-principal',
      pausado:    t.pausado || false,
      status:     metaActiva ? 'connected' : (sess?.status || t.whatsapp?.status || 'disconnected'),
      canal:      metaActiva ? 'meta' : 'whatsapp-web',
      phone:      t.whatsapp?.phone || null,
      connectedAt: t.whatsapp?.connectedAt || null,
    }
  })

  res.json({
    lines:    lineStatus,
    logs:     audit.getLogs(limit),
    serverTs: new Date().toISOString(),
  })
})

module.exports = router
