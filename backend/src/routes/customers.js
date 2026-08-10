const router = require('express').Router()
const Customer = require('../models/Customer')
const Tenant   = require('../models/Tenant')
const https    = require('https')
const { authenticate } = require('../middleware/auth')

router.use(authenticate)

// ── SINCRONIZACIÓN CON SISTEMA PRINCIPAL ─────────────────────────────────────
const SP_API_KEY = process.env.SP_API_KEY
if (!SP_API_KEY) throw new Error('SP_API_KEY no configurada en el entorno')

function spPost(body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body)
    const opts = {
      hostname: 'agrofer.link',
      path:     '/sistemas/ajax/api_mobile.php',
      method:   'POST',
      headers:  {
        'Authorization':  `Bearer ${SP_API_KEY}`,
        'X-Year':         String(new Date().getFullYear()),
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }
    const req = https.request(opts, (res) => {
      let raw = ''
      res.on('data', d => { raw += d })
      res.on('end', () => {
        try { resolve(JSON.parse(raw.replace(/^﻿/, ''))) }
        catch (e) { reject(new Error('JSON parse error: ' + raw.slice(0, 100))) }
      })
    })
    req.on('error', reject)
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')) })
    req.write(payload)
    req.end()
  })
}

// Devuelve {numero, pais} o null — Colombia (móviles empiezan en 3) y Venezuela (móviles
// empiezan en 4, formato local con 0 inicial ej. "0414...", o ya con código de país "58").
// Se necesita saber el país para: (1) etiquetar clientes venezolanos — muchos son de zona
// fronteriza con Cúcuta —, y (2) dejar el número en formato internacional completo, porque un
// "04143904292" sin código de país no sirve para enviarle una campaña de WhatsApp real.
function normalizarUnNumero(raw) {
  const digits = String(raw).replace(/\D/g, '')
  if (digits.length < 7) return null
  if (digits.startsWith('57') && digits.length === 12) return { numero: digits, pais: 'CO' }
  if (digits.length === 10 && digits.startsWith('3')) return { numero: `57${digits}`, pais: 'CO' }
  if (digits.startsWith('58') && digits.length === 12) return { numero: digits, pais: 'VE' }
  if (digits.length === 11 && digits.startsWith('04')) return { numero: `58${digits.slice(1)}`, pais: 'VE' }
  if (digits.length === 10 && digits.startsWith('4')) return { numero: `58${digits}`, pais: 'VE' }
  if (digits.length === 7) return null
  return { numero: digits, pais: 'otro' }
}

// El campo TELEFONO del sistema externo puede traer varios números en un mismo texto,
// separados por guion (confirmado contra la API real, ej. "3106952361-3202858334 - 3118921495")
// — separar ANTES de limpiar dígitos es lo que evita que se peguen entre sí. El fallback sin
// guion cubre el caso de un solo número.
function normalizarTelefonos(raw) {
  if (!raw) return []
  const partes = String(raw).split('-').map(p => p.trim()).filter(Boolean)
  const numeros = partes.map(normalizarUnNumero).filter(Boolean)
  const vistos = new Set()
  return numeros.filter(n => vistos.has(n.numero) ? false : (vistos.add(n.numero), true))
}

function parseCoordenadas(raw) {
  if (!raw || !raw.trim()) return { lat: null, lng: null }
  const parts = raw.trim().split(',')
  if (parts.length !== 2) return { lat: null, lng: null }
  const lat = parseFloat(parts[0])
  const lng = parseFloat(parts[1])
  if (isNaN(lat) || isNaN(lng)) return { lat: null, lng: null }
  return { lat, lng }
}

router.post('/sync-sistema-principal', async (req, res) => {
  try {
    // Construir mapa terid → vendedorId (MongoDB _id)
    const tenants = await Tenant.find({ activo: true, teridSistemaPrincipal: { $exists: true, $ne: null } })
      .select('_id teridSistemaPrincipal nombre').lean()
    const teridMap = {}
    for (const t of tenants) teridMap[t.teridSistemaPrincipal] = t._id

    // Traer todos los clientes del sistema principal con paginación
    let offset = 0, todos = [], cont = true
    while (cont) {
      const resp = await spPost({ action: 'get_clientes', vendedor_id: '61132', usuario_id: '3', perfil: 'Administrador', offset })
      const items = resp?.data || []
      todos = todos.concat(items)
      cont = items.length === 100
      offset += 100
    }

    let creados = 0, actualizados = 0, sinPhone = 0

    for (const c of todos) {
      const telefonos = normalizarTelefonos(c.TELEFONO)
      const phone = telefonos[0]?.numero || null
      const pais  = telefonos[0]?.pais || 'CO'
      const { lat, lng } = parseCoordenadas(c.COORDENADAS)
      const vendedorId = c.VENDEDOR ? (teridMap[c.VENDEDOR] || null) : null

      const update = {
        name:               (c.NOMBRE || '').trim(),
        empresa:            (c.ESTABLECIMIENTO || '').trim(),
        nit:                (c.NIT || '').trim(),
        email:              (c.EMAIL || '').toLowerCase().trim(),
        ciudad:             (c.CIUDAD || '').trim(),
        barrio:             (c.BARRIO || '').trim(),
        direccion:          (c.DIRECCION || '').trim(),
        cupoCredito:        parseFloat(c.CUPO_CREDITO) || 0,
        plazo:              parseInt(c.PLAZO) || 0,
        teridVendedor:      c.VENDEDOR || null,
        departamento:       (c.DEPARTAMENTO || '').trim(),
        representanteLegal: (c.REPRESENTANTE_LEGAL || '').trim(),
        idSistemaPrincipal: c.ID,
        importado:          true,
        active:             true,
        telefonosAdicionales: telefonos.slice(1).map(t => t.numero),
        pais:               pais,
        ...(phone     && { phone }),
        ...(vendedorId && { vendedorId }),
        ...(lat !== null && { lat, lng }),
      }

      const existing = await Customer.findOne({ idSistemaPrincipal: c.ID })
      if (existing) {
        // No sobreescribir campos CRM-propios: temperatura, potencial, sector, notes
        await Customer.findByIdAndUpdate(existing._id, { $set: update })
        actualizados++
      } else {
        await Customer.create({ ...update, temperatura: 'tibio', potencial: 'medio' })
        creados++
        if (!phone) sinPhone++
      }
    }

    res.json({ ok: true, total: todos.length, creados, actualizados, sinPhone })
  } catch (e) {
    console.error('[Sync SP]', e.message)
    res.status(500).json({ error: e.message })
  }
})

// GET /api/clientes
router.get('/', async (req, res) => {
  const { vendedorId, zona, search, sinContactar, pais, page = 1, limit = 50 } = req.query
  const query = { active: true }

  if (pais) query.pais = pais

  // "sin-asignar" = clientes finales sin vendedor asignado (no recurrentes de Distribuciones
  // Agrofer) — se identifican con un filtro, no se excluyen ni se borran del sistema.
  if (vendedorId === 'sin-asignar') query.vendedorId = null
  else if (vendedorId) query.vendedorId = vendedorId
  if (zona)       query.zona = zona
  const andConditions = []
  if (sinContactar === 'true') {
    const hace30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    andConditions.push({ $or: [{ lastContactAt: null }, { lastContactAt: { $lt: hace30 } }] })
  }

  if (search) {
    andConditions.push({ $or: [
      { name:  { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
    ]})
  }
  if (andConditions.length === 1) Object.assign(query, andConditions[0])
  else if (andConditions.length > 1) query.$and = andConditions

  const skip = (parseInt(page) - 1) * parseInt(limit)
  const [customers, total] = await Promise.all([
    Customer.find(query)
      .populate('vendedorId', 'nombre zona')
      .sort({ lastContactAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Customer.countDocuments(query),
  ])
  res.json({ customers, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) })
})

// POST /api/clientes
router.post('/', async (req, res) => {
  const { name, phone, zona, ciudad, barrio, direccion, empresa, sector, temperatura, potencial, vendedorId, notes, email } = req.body
  if (!name)       return res.status(400).json({ error: 'El nombre es requerido' })
  if (!vendedorId) return res.status(400).json({ error: 'vendedorId es requerido' })

  const customer = await Customer.create({
    name,
    ...(phone     ? { phone }     : {}),
    ...(email     ? { email }     : {}),
    ...(zona      ? { zona }      : {}),
    ...(ciudad    ? { ciudad }    : {}),
    ...(barrio    ? { barrio }    : {}),
    ...(direccion ? { direccion } : {}),
    ...(empresa   ? { empresa }   : {}),
    ...(sector    ? { sector }    : {}),
    temperatura: temperatura || 'tibio',
    potencial:   potencial   || 'medio',
    vendedorId,
    ...(notes ? { notes } : {}),
    importado: false,
  })
  res.status(201).json({ customer })
})

// POST /api/clientes/importar — recibe array JSON desde frontend
router.post('/importar', async (req, res) => {
  const { clientes } = req.body
  if (!Array.isArray(clientes) || clientes.length === 0) {
    return res.status(400).json({ error: 'Array de clientes requerido' })
  }

  const vendedores = await Tenant.find({}).lean()
  const slugMap = {}
  vendedores.forEach(v => {
    slugMap[v.slug]  = v._id
    slugMap[v.nombre?.toLowerCase()] = v._id
  })

  let importados = 0, duplicados = 0, errores = 0

  for (const c of clientes) {
    if (!c.phone) { errores++; continue }

    let phone = String(c.phone).replace(/\D/g, '')
    if (phone.length === 10 && phone.startsWith('3')) phone = '57' + phone
    if (!phone.startsWith('57') || phone.length !== 12) { errores++; continue }

    const vendedorId = slugMap[c.vendedorSlug?.toLowerCase()] ||
                       slugMap[c.vendedor?.toLowerCase()] || null

    try {
      const existe = await Customer.findOne({ phone })
      if (existe) {
        await Customer.findByIdAndUpdate(existe._id, {
          zona:      c.zona      || existe.zona,
          vendedorId: vendedorId || existe.vendedorId,
          empresa:   c.empresa   || existe.empresa,
          sector:    c.sector    || existe.sector,
        })
        duplicados++
      } else {
        await Customer.create({
          name:      c.name || c.nombre || phone,
          phone,
          zona:      c.zona     || '',
          ciudad:    c.ciudad   || '',
          empresa:   c.empresa  || '',
          sector:    c.sector   || '',
          vendedorId,
          importado: true,
        })
        importados++
      }
    } catch (e) {
      errores++
    }
  }

  res.json({ ok: true, importados, duplicados, errores, total: clientes.length })
})

// PATCH /api/clientes/:id
router.patch('/:id', async (req, res) => {
  const { name, phone, zona, ciudad, empresa, sector, temperatura, potencial, vendedorId, notes, email, lastContactAt } = req.body
  const update = {}
  if (name          !== undefined) update.name          = name
  if (phone         !== undefined) update.phone         = phone
  if (zona          !== undefined) update.zona          = zona
  if (ciudad        !== undefined) update.ciudad        = ciudad
  if (empresa       !== undefined) update.empresa       = empresa
  if (sector        !== undefined) update.sector        = sector
  if (temperatura   !== undefined) update.temperatura   = temperatura
  if (potencial     !== undefined) update.potencial     = potencial
  if (vendedorId    !== undefined) update.vendedorId    = vendedorId
  if (notes         !== undefined) update.notes         = notes
  if (email         !== undefined) update.email         = email
  if (lastContactAt !== undefined) update.lastContactAt = lastContactAt

  const customer = await Customer.findByIdAndUpdate(req.params.id, update, { new: true })
  if (!customer) return res.status(404).json({ error: 'Cliente no encontrado' })
  res.json({ customer })
})

// GET /api/clientes/:id/historial — conversaciones + tareas del cliente
router.get('/:id/historial', async (req, res) => {
  const Conversation = require('../models/Conversation')
  const Message      = require('../models/Message')
  const Task         = require('../models/Task')

  const customer = await Customer.findById(req.params.id).lean()
  if (!customer) return res.status(404).json({ error: 'Cliente no encontrado' })

  const [convs, tareas] = await Promise.all([
    Conversation.find({ customer: customer._id })
      .sort({ lastMessageAt: -1 })
      .limit(10)
      .lean(),
    Task.find({ customerId: customer._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean(),
  ])

  // Último mensaje por conversación
  const convIds = convs.map(c => c._id)
  const lastMsgs = await Message.aggregate([
    { $match: { conversation: { $in: convIds } } },
    { $sort: { timestamp: -1 } },
    { $group: {
      _id: '$conversation',
      content:   { $first: '$content' },
      type:      { $first: '$type' },
      direction: { $first: '$direction' },
      createdAt: { $first: '$createdAt' },
    }},
  ])
  const lastMsgMap = {}
  lastMsgs.forEach(m => { lastMsgMap[m._id.toString()] = m })

  const totalMsgs = await Message.countDocuments({
    conversation: { $in: convIds }
  })

  res.json({
    customer,
    conversaciones: convs.map(c => ({ ...c, lastMessage: lastMsgMap[c._id.toString()] || null })),
    tareas,
    stats: {
      totalConvs: convs.length,
      totalMsgs,
      tareasAbiertas: tareas.filter(t => t.estado === 'pendiente').length,
    },
  })
})

// DELETE /api/clientes/limpiar/todos — eliminar todos (solo con confirmación)
router.delete('/limpiar/todos', async (req, res) => {
  const { confirmar } = req.body
  if (confirmar !== 'ELIMINAR_TODO') {
    return res.status(400).json({ error: 'Envía { confirmar: "ELIMINAR_TODO" } para confirmar' })
  }
  const result = await Customer.deleteMany({})
  res.json({ ok: true, eliminados: result.deletedCount })
})

// DELETE /api/clientes/limpiar/sin-telefono — eliminar clientes sin teléfono (test/grupo)
router.delete('/limpiar/sin-telefono', async (req, res) => {
  const result = await Customer.deleteMany({
    $or: [{ phone: '' }, { phone: null }, { phone: { $exists: false } }]
  })
  res.json({ ok: true, eliminados: result.deletedCount })
})

// DELETE /api/clientes/:id
router.delete('/:id', async (req, res) => {
  await Customer.findByIdAndDelete(req.params.id)
  res.json({ ok: true })
})

// POST /api/clientes/eliminar-masivo — eliminar lista de IDs
router.post('/eliminar-masivo', async (req, res) => {
  const { ids } = req.body
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids requeridos' })
  const result = await Customer.deleteMany({ _id: { $in: ids } })
  res.json({ ok: true, eliminados: result.deletedCount })
})

module.exports = router
