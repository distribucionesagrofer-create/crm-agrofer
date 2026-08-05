const https = require('https')

const SP_API_KEY = process.env.SP_API_KEY || '03790f0b03256b17c29367cd32a2dfb4e2ea045678118aed'

// Credenciales de todos los vendedores
const VENDEDORES = [
  { nombre: 'ALIRIO SANDOVAL',    user: 'VENTAS01', pass: '88237650',   terid: 767,   uid: 27  },
  { nombre: 'OMAR BETANCOURT',    user: 'VENTAS02', pass: '1090398674', terid: 63376, uid: 14  },
  { nombre: 'WILMER MENDOZA',     user: 'VENTAS03', pass: '1092154521', terid: 1938,  uid: 28  },
  { nombre: 'ROGER CASTRO',       user: 'VENTAS04', pass: '1149463721', terid: 76854, uid: 205 },
  { nombre: 'ARNOLD GARAVITO',    user: 'VENTAS06', pass: '1149464165', terid: 65895, uid: 16  },
  { nombre: 'EDWIN NAVARRO',      user: 'VENTAS08', pass: '5408602',    terid: 59718, uid: 9   },
  { nombre: 'ANDRES SUAREZ',      user: 'VENTAS09', pass: '1193594537', terid: 93798, uid: 232 },
  { nombre: 'JORGE CARRILLO',     user: 'VENTAS11', pass: '88271732',   terid: 93732, uid: 243 },
  { nombre: 'ANYELO BALLESTEROS', user: 'VENTAS12', pass: '13276347',   terid: 72561, uid: 121 },
  { nombre: 'YEIMI DURAN',        user: 'VENTAS13', pass: 'vENTA1367',  terid: 98767, uid: 294 },
]

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
        catch (e) { reject(new Error('Parse error: ' + raw.slice(0, 80))) }
      })
    })
    req.on('error', reject)
    req.setTimeout(45000, () => { req.destroy(); reject(new Error('Timeout SP')) })
    req.write(payload); req.end()
  })
}

// Traer todos los registros de un endpoint con paginación automática
async function fetchAll(action, terid, uid, extra = {}) {
  let offset = 0, todos = [], cont = true
  while (cont) {
    const resp = await spPost({ action, vendedor_id: String(terid), usuario_id: String(uid), perfil: 'Vendedor', ano: new Date().getFullYear(), offset, ...extra })
    const items = resp?.data || []
    todos = todos.concat(items)
    cont = items.length === 100
    offset += 100
  }
  return todos
}

// Datos completos de un vendedor en un rango de fechas — `mapaLineas` (codigo→linea, cargado
// una sola vez desde ProductoCatalogo por getDatosComerciales) permite anotar cada producto
// vendido con su línea/marca sin llamar la API externa otra vez por vendedor.
async function getDatosVendedor(v, fechaDesde, fechaHasta, mapaLineas = {}) {
  const extra = { fecha_desde: fechaDesde, fecha_hasta: fechaHasta }

  const [pedidos, recibos] = await Promise.all([
    fetchAll('get_pedidos_usuario', v.terid, v.uid, extra),
    fetchAll('get_recibos_usuario', v.terid, v.uid, extra),
  ])

  const valorPedidos = pedidos.reduce((s, p) => s + (parseFloat(p.total) || 0), 0)
  const valorRecibos = recibos.reduce((s, r) => s + (parseFloat(r.total) || 0), 0)

  // Top productos del vendedor (para la vista SIN filtro — se recorta a 20 solo acá, el detalle
  // completo para poder filtrar por línea/artículo vive en `pedidosDetalle` más abajo).
  const productosMap = {}
  for (const p of pedidos) {
    for (const d of (p.detalle || [])) {
      const key = d.producto_codigo || d.producto_nombre
      if (!key) continue
      if (!productosMap[key]) productosMap[key] = { codigo: d.producto_codigo, nombre: d.producto_nombre, linea: mapaLineas[d.producto_codigo] || '', cantidad: 0, valor: 0 }
      productosMap[key].cantidad += parseFloat(d.cantidad) || 0
      productosMap[key].valor    += parseFloat(d.subtotal_linea) || 0
    }
  }

  // Evolución por fecha (agrupar pedidos por día)
  const evolucion = {}
  for (const p of pedidos) {
    const dia = (p.fecha || '').slice(0, 10)
    if (!dia) continue
    if (!evolucion[dia]) evolucion[dia] = { pedidos: 0, valor: 0 }
    evolucion[dia].pedidos++
    evolucion[dia].valor += parseFloat(p.total) || 0
  }

  // Detalle crudo por pedido (cliente + líneas con su marca) — es lo que permite recalcular
  // ventas por línea/artículo específico y contar clientes impactados sin volver a llamar la
  // API externa cada vez que se cambia un filtro en el módulo de Análisis Comercial.
  const pedidosDetalle = pedidos.map(p => ({
    clienteId:     p.cliente_id ?? null,
    clienteNombre: p.cliente_nombre || '',
    fecha:         (p.fecha || '').slice(0, 10),
    // Total real del pedido — necesario para la vista SIN filtro: algunos pedidos (ajustes,
    // notas) llegan con `detalle` vacío del sistema externo, y sin este campo desaparecían
    // por completo de los totales incluso sin ningún filtro de línea/artículo aplicado.
    total:         parseFloat(p.total) || 0,
    detalle: (p.detalle || []).map(d => ({
      codigo:  d.producto_codigo || '',
      nombre:  d.producto_nombre || '',
      linea:   mapaLineas[d.producto_codigo] || '',
      cantidad: parseFloat(d.cantidad) || 0,
      valor:    parseFloat(d.subtotal_linea) || 0,
    })),
  }))

  return {
    nombre:       v.nombre,
    terid:        v.terid,
    totalPedidos: pedidos.length,
    valorPedidos,
    totalRecibos: recibos.length,
    valorRecibos,
    tasaCobro:    valorPedidos > 0 ? Math.round((valorRecibos / valorPedidos) * 100) : 0,
    productos:    Object.values(productosMap).sort((a, b) => b.valor - a.valor).slice(0, 20),
    evolucion,
    pedidosDetalle,
  }
}

// Datos de TODOS los vendedores — secuencial para evitar timeout por conexiones simultáneas
async function getDatosComerciales(fechaDesde, fechaHasta) {
  const ProductoCatalogo = require('../models/ProductoCatalogo')
  const productos = await ProductoCatalogo.find({}, 'codigo linea').lean()
  const mapaLineas = {}
  for (const p of productos) { if (p.codigo) mapaLineas[p.codigo] = p.linea || '' }

  const resultados = []
  for (const v of VENDEDORES) {
    try {
      const datos = await getDatosVendedor(v, fechaDesde, fechaHasta, mapaLineas)
      resultados.push(datos)
      console.log(`[SP] ${v.nombre}: ${datos.totalPedidos} pedidos $${Math.round(datos.valorPedidos/1000000)}M`)
    } catch (e) {
      console.error(`[SP] ${v.nombre} ERROR:`, e.message)
      resultados.push({ nombre: v.nombre, terid: v.terid, error: e.message, totalPedidos: 0, valorPedidos: 0, totalRecibos: 0, valorRecibos: 0, tasaCobro: 0, productos: [], evolucion: {}, pedidosDetalle: [] })
    }
  }
  return resultados
}

module.exports = { getDatosComerciales, spPost, VENDEDORES }
