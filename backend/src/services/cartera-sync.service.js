// Sincroniza la caché de cartera (Customer.carteraFacturas/carteraTotal) contra
// Sistema Principal — se corre periódicamente en vez de en cada carga de página,
// porque son cientos de clientes con crédito y cada uno es una llamada externa aparte.
const Customer = require('../models/Customer')
const audit    = require('./audit.service')
const { obtenerCartera } = require('./cartera.service')

let sincronizando = false
let ultimaSync     = null

async function sincronizarCarteraTodos() {
  if (sincronizando) return { ok: false, error: 'Ya hay una sincronización en curso' }
  sincronizando = true
  const inicio = Date.now()

  try {
    const clientes = await Customer.find({
      active: true,
      idSistemaPrincipal: { $exists: true, $ne: null },
      cupoCredito: { $gt: 0 },
    }).select('_id name idSistemaPrincipal teridVendedor').lean()

    let actualizados = 0
    let fallidos = 0

    // Secuencial (no Promise.all) — son ~500+ llamadas externas, en paralelo
    // saturaría/rate-limitaría el API de Sistema Principal.
    for (const c of clientes) {
      try {
        const { facturas, total } = await obtenerCartera(c)
        await Customer.findByIdAndUpdate(c._id, {
          carteraFacturas: facturas,
          carteraTotal: total,
          carteraActualizadoAt: new Date(),
        })
        actualizados++
      } catch (e) {
        fallidos++
      }
    }

    ultimaSync = new Date()
    const segundos = Math.round((Date.now() - inicio) / 1000)
    audit.system(`Sincronización de cartera completada: ${actualizados} clientes actualizados, ${fallidos} fallidos (${segundos}s)`)
    return { ok: true, actualizados, fallidos, segundos }
  } finally {
    sincronizando = false
  }
}

function estadoSync() {
  return { sincronizando, ultimaSync }
}

module.exports = { sincronizarCarteraTodos, estadoSync }
