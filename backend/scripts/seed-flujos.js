require('dotenv').config({ path: require('path').join(__dirname, '../.env') })
const mongoose = require('mongoose')

const POS = {
  trigger:   { x: 260, y: 40 },
  msg1:      { x: 260, y: 180 },
  cond1:     { x: 260, y: 340 },
  ia:        { x: 500, y: 480 },
  fin:       { x: 20,  y: 480 },
  msg2:      { x: 500, y: 340 },
  msg3:      { x: 20,  y: 340 },
}

const edge = (id, src, tgt) => ({ id, source: src, target: tgt, type: 'deleteEdge', animated: true })

async function seedFlujos() {
  await mongoose.connect(process.env.MONGO_URI)
  const Flow   = require('../src/models/Flow')
  const Tenant = require('../src/models/Tenant')

  if (process.env.ALLOW_SEED_RESET === 'true') {
    await Flow.deleteMany({})
    console.log('Flujos anteriores eliminados (ALLOW_SEED_RESET=true)\n')
  } else {
    const existentes = await Flow.countDocuments({})
    if (existentes > 0) {
      console.log(`Ya existen ${existentes} flujos en la base — no se borra nada.`)
      console.log('Corre con ALLOW_SEED_RESET=true si de verdad quieres reiniciarlos.')
      await mongoose.disconnect()
      return
    }
  }

  // Obtener vendedores para referencias de zona
  const vendedores = await Tenant.find({ slug: { $ne: 'linea-principal' } }).lean()
  const byZona = {}
  vendedores.forEach(v => { byZona[v.zona] = v._id })

  // ── FLUJO 1: Bienvenida y calificacion ────────────────────────────────────
  await Flow.create({
    nombre: 'Bienvenida y calificacion de lead',
    descripcion: 'Saluda a cada nuevo lead y detecta su interes',
    activo: true, orden: 1,
    disparador: { tipo: 'primer_mensaje', soloLeads: true },
    pasos: [
      { id: 'p1', tipo: 'mensaje', contenido: 'Hola! Bienvenido a AGROFER Distribuciones.\nSoy tu asistente virtual. Como puedo ayudarte hoy?' },
      {
        id: 'p2', tipo: 'condicion',
        ramas: [
          { id: 'r1', esDefault: false, condicion: { tipo: 'contiene', valor: 'precio' }, accion: { tipo: 'mensaje', contenido: 'Nuestros precios son competitivos y varian segun el producto y zona de entrega. Dime que producto te interesa y te doy informacion detallada.' } },
          { id: 'r2', esDefault: false, condicion: { tipo: 'contiene', valor: 'catalogo' }, accion: { tipo: 'mensaje', contenido: 'Tenemos una amplia linea de productos para tu zona. Un asesor te enviara el catalogo completo en breve.' } },
          { id: 'r3', esDefault: false, condicion: { tipo: 'contiene', valor: 'donde' }, accion: { tipo: 'mensaje', contenido: 'Tenemos cobertura en toda el area metropolitana de Cucuta: Atalaya, Guimaral, Centro, Aeropuerto, Patios, Villa del Rosario, Libertad, Oriente y Occidente. Cual es tu zona?' } },
          { id: 'r4', esDefault: true, accion: { tipo: 'ia' } },
        ],
      },
    ],
    rfNodes: [
      { id: 'trigger', type: 'trigger', position: POS.trigger, data: { tipo: 'primer_mensaje', label: 'Primer mensaje', soloLeads: true } },
      { id: 'p1', type: 'mensaje', position: POS.msg1, data: { label: 'Mensaje', contenido: 'Hola! Bienvenido a AGROFER Distribuciones.\nSoy tu asistente virtual. Como puedo ayudarte hoy?' } },
      { id: 'p2', type: 'condicion', position: POS.cond1, data: { label: 'Condicion', ramas: [
        { id: 'r1', esDefault: false, condicion: { tipo: 'contiene', valor: 'precio' }, accion: { tipo: 'mensaje', contenido: 'Nuestros precios son competitivos...' } },
        { id: 'r2', esDefault: false, condicion: { tipo: 'contiene', valor: 'catalogo' }, accion: { tipo: 'mensaje', contenido: 'Tenemos amplia linea...' } },
        { id: 'r3', esDefault: false, condicion: { tipo: 'contiene', valor: 'donde' }, accion: { tipo: 'mensaje', contenido: 'Tenemos cobertura en...' } },
        { id: 'r4', esDefault: true, accion: { tipo: 'ia' } },
      ]}},
    ],
    rfEdges: [edge('e1','trigger','p1'), edge('e2','p1','p2')],
  })
  console.log('OK Flujo 1: Bienvenida y calificacion')

  // ── FLUJO 2: Consulta de precios ──────────────────────────────────────────
  await Flow.create({
    nombre: 'Consulta de precios',
    descripcion: 'Cuando alguien pregunta por precios o costos',
    activo: true, orden: 2,
    disparador: { tipo: 'keyword', keywords: ['precio', 'costo', 'cuanto vale', 'cuanto cuesta', 'valor'] },
    pasos: [
      { id: 'p1', tipo: 'mensaje', contenido: 'Los precios en AGROFER varian segun:\n\n• El producto o linea de distribucion\n• Tu zona de entrega\n• El volumen del pedido\n\nPara darte un precio exacto, necesito saber:\n1. Que producto te interesa?\n2. Cual es tu ciudad o zona?' },
      { id: 'p2', tipo: 'ia' },
    ],
    rfNodes: [
      { id: 'trigger', type: 'trigger', position: POS.trigger, data: { tipo: 'keyword', label: 'Palabra clave', keywords: ['precio', 'costo', 'cuanto vale'] } },
      { id: 'p1', type: 'mensaje', position: POS.msg1, data: { label: 'Mensaje', contenido: 'Los precios en AGROFER varian segun...' } },
      { id: 'p2', type: 'ia', position: { x: 260, y: 320 }, data: { label: 'IA' } },
    ],
    rfEdges: [edge('e1','trigger','p1'), edge('e2','p1','p2')],
  })
  console.log('OK Flujo 2: Consulta de precios')

  // ── FLUJO 3: Delegacion por zona ──────────────────────────────────────────
  const ramasZona = [
    { zona: 'ATALAYA',                              kw: 'atalaya',       vendedor: 'ROGER CASTRO' },
    { zona: 'GUIMARAL',                             kw: 'guimaral',      vendedor: 'EDWIN NAVARRO' },
    { zona: 'CENTRO CUCUTA',                        kw: 'centro',        vendedor: 'OMAR BETANCOURT' },
    { zona: 'AEROPUERTO',                           kw: 'aeropuerto',    vendedor: 'ANDRES SUAREZ' },
    { zona: 'PATIOS / VILLA DEL ROSARIO / LIBERTAD',kw: 'patios',        vendedor: 'JORGE CARRILLO' },
    { zona: 'REGION ORIENTE',                       kw: 'oriente',       vendedor: 'OSCAR PLATA' },
    { zona: 'REGION OCCIDENTE',                     kw: 'occidente',     vendedor: 'ARNOLD GARAVITO' },
    { zona: 'REGION NORTE',                         kw: 'norte',         vendedor: 'ANYELO BALLESTEROS' },
    { zona: 'MOSTRADOR SEDE',                       kw: 'mostrador',     vendedor: 'WILMER MENDOZA' },
  ]

  const ramasFlujo3 = ramasZona.map((z, i) => ({
    id: `r${i}`, esDefault: false,
    condicion: { tipo: 'contiene', valor: z.kw },
    accion: { tipo: 'delegar', vendedorId: byZona[z.zona] || null },
  }))
  ramasFlujo3.push({ id: 'rdef', esDefault: true, accion: { tipo: 'mensaje', contenido: 'Contamos con vendedores en toda el area metropolitana de Cucuta. Dinos en que barrio o zona estas para asignarte el asesor mas cercano.' } })

  await Flow.create({
    nombre: 'Delegacion por zona de Cucuta',
    descripcion: 'Detecta la zona del cliente y delega al vendedor correcto',
    activo: true, orden: 3,
    disparador: { tipo: 'keyword', keywords: ['atalaya', 'guimaral', 'centro', 'aeropuerto', 'patios', 'oriente', 'occidente', 'norte', 'mostrador', 'zona', 'barrio', 'ubicacion'] },
    pasos: [{ id: 'p1', tipo: 'condicion', ramas: ramasFlujo3 }],
    rfNodes: [
      { id: 'trigger', type: 'trigger', position: POS.trigger, data: { tipo: 'keyword', label: 'Palabra clave', keywords: ['zona', 'barrio', 'atalaya', 'centro'] } },
      { id: 'p1', type: 'condicion', position: POS.msg1, data: { label: 'Condicion', ramas: ramasFlujo3 } },
    ],
    rfEdges: [edge('e1','trigger','p1')],
  })
  console.log('OK Flujo 3: Delegacion por zona')

  // ── FLUJO 4: Horarios y ubicacion ─────────────────────────────────────────
  await Flow.create({
    nombre: 'Horarios y ubicacion AGROFER',
    descripcion: 'Responde preguntas sobre horarios, direccion y contacto',
    activo: true, orden: 4,
    disparador: { tipo: 'keyword', keywords: ['horario', 'hora', 'abierto', 'direccion', 'donde estan', 'como llegar', 'telefono', 'contacto'] },
    pasos: [
      {
        id: 'p1', tipo: 'condicion',
        ramas: [
          { id: 'r1', esDefault: false, condicion: { tipo: 'contiene', valor: 'horario' }, accion: { tipo: 'mensaje', contenido: 'Nuestro horario de atencion es:\nLunes a Viernes: 8:00am - 12:00m y 2:00pm - 5:30pm\nSabados: 8:00am - 12:00m\nDomingos: Cerrado\n\nFuera de este horario puedes escribirnos y te responderemos el siguiente dia habil.' } },
          { id: 'r2', esDefault: false, condicion: { tipo: 'contiene', valor: 'direccion' }, accion: { tipo: 'mensaje', contenido: 'Estamos ubicados en Calle 6 # 7-61, Barrio Centro, Cucuta, Norte de Santander. Aqui puedes ubicarnos: https://maps.app.goo.gl/L2VNMUbZdY8Q3bN9A' } },
          { id: 'r3', esDefault: true, accion: { tipo: 'ia' } },
        ],
      },
    ],
    rfNodes: [
      { id: 'trigger', type: 'trigger', position: POS.trigger, data: { tipo: 'keyword', label: 'Palabra clave', keywords: ['horario', 'direccion', 'contacto'] } },
      { id: 'p1', type: 'condicion', position: POS.msg1, data: { label: 'Condicion', ramas: [] } },
    ],
    rfEdges: [edge('e1','trigger','p1')],
  })
  console.log('OK Flujo 4: Horarios y ubicacion')

  // ── FLUJO 5: Seguimiento de pedido ────────────────────────────────────────
  await Flow.create({
    nombre: 'Seguimiento de pedido',
    descripcion: 'Atiende consultas sobre estado de pedidos',
    activo: true, orden: 5,
    disparador: { tipo: 'keyword', keywords: ['pedido', 'envio', 'domicilio', 'llego', 'cuando llega', 'tracking', 'guia'] },
    pasos: [
      { id: 'p1', tipo: 'mensaje', contenido: 'Para consultarte el estado de tu pedido necesito:\n\n📋 Tu numero de pedido o\n📱 El numero de celular con el que realizaste la compra\n\nPor favor comparteme uno de estos datos.' },
      { id: 'p2', tipo: 'ia' },
    ],
    rfNodes: [
      { id: 'trigger', type: 'trigger', position: POS.trigger, data: { tipo: 'keyword', label: 'Palabra clave', keywords: ['pedido', 'envio', 'domicilio'] } },
      { id: 'p1', type: 'mensaje', position: POS.msg1, data: { label: 'Mensaje', contenido: 'Para consultarte el estado de tu pedido...' } },
      { id: 'p2', type: 'ia', position: { x: 260, y: 320 }, data: { label: 'IA' } },
    ],
    rfEdges: [edge('e1','trigger','p1'), edge('e2','p1','p2')],
  })
  console.log('OK Flujo 5: Seguimiento de pedido')

  // ── FLUJO 6: Quejas y reclamos ────────────────────────────────────────────
  await Flow.create({
    nombre: 'Quejas y reclamos',
    descripcion: 'Atiende insatisfacciones y las escala al asesor',
    activo: true, orden: 6,
    disparador: { tipo: 'keyword', keywords: ['queja', 'reclamo', 'problema', 'malo', 'dano', 'roto', 'incompleto', 'fallo', 'molesto', 'pesimo'] },
    pasos: [
      { id: 'p1', tipo: 'mensaje', contenido: 'Lamentamos mucho los inconvenientes que has tenido. En AGROFER nos importa tu satisfaccion.\n\nCuentame que paso para ayudarte lo mas rapido posible.' },
      { id: 'p2', tipo: 'condicion', ramas: [
        { id: 'r1', esDefault: false, condicion: { tipo: 'contiene', valor: 'producto' }, accion: { tipo: 'ia' } },
        { id: 'r2', esDefault: false, condicion: { tipo: 'contiene', valor: 'entrega' }, accion: { tipo: 'ia' } },
        { id: 'r3', esDefault: true, accion: { tipo: 'ia' } },
      ]},
    ],
    rfNodes: [
      { id: 'trigger', type: 'trigger', position: POS.trigger, data: { tipo: 'keyword', label: 'Palabra clave', keywords: ['queja', 'reclamo', 'problema'] } },
      { id: 'p1', type: 'mensaje', position: POS.msg1, data: { label: 'Mensaje', contenido: 'Lamentamos mucho los inconvenientes...' } },
      { id: 'p2', type: 'condicion', position: POS.cond1, data: { label: 'Condicion', ramas: [] } },
    ],
    rfEdges: [edge('e1','trigger','p1'), edge('e2','p1','p2')],
  })
  console.log('OK Flujo 6: Quejas y reclamos')

  const total = await Flow.countDocuments({})
  console.log(`\n=== ${total} FLUJOS BASE CREADOS ===`)
  console.log('Accede: Ajustes > Flujos de trabajo')

  await mongoose.disconnect()
}

seedFlujos().catch(console.error)
