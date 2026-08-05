// Actualiza fotoUrl en los productos ya sincronizados usando la URL HTTP real del
// sistema principal (agrofer.link) en vez de la ruta local de Windows que manda la API.
// Uso: docker exec agrofer_crm-backend-1 node src/scripts/backfill-fotos-productos.js
const mongoose = require('mongoose')
const Producto = require('../models/ProductoCatalogo')
const { spPost } = require('../services/sistema-principal.service')

const IMG_BASE = 'https://agrofer.link/sistemas/vistas/img/productos/'

function resolveFotoUrl(fotoUrlRaw) {
  const raw = (fotoUrlRaw || '').trim()
  if (!raw) return ''
  if (raw.startsWith('http')) return raw
  const idx = raw.indexOf('productosImagenes')
  if (idx === -1) return ''
  return IMG_BASE + raw.slice(idx).replace(/\\/g, '/')
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI)

  let offset = 0, todos = [], cont = true
  while (cont) {
    const resp = await spPost({ action: 'get_productos', vendedor_id: '61132', usuario_id: '3', perfil: 'Administrador', offset })
    const items = resp?.data || []
    todos = todos.concat(items)
    cont  = items.length === 100
    offset += 100
  }

  let ops = [], conFoto = 0, sinMatch = 0
  for (const p of todos) {
    const fotoUrl = resolveFotoUrl(p.FOTO_URL)
    if (fotoUrl) conFoto++
    ops.push({ updateOne: { filter: { idSistemaPrincipal: p.ID }, update: { $set: { fotoUrl } } } })
  }

  if (ops.length) await Producto.bulkWrite(ops)
  console.log(`Revisados ${todos.length} productos del sistema principal — ${conFoto} con foto, ${todos.length - conFoto} sin FOTO_URL`)
  await mongoose.disconnect()
}

run().catch(e => { console.error(e); process.exit(1) })
