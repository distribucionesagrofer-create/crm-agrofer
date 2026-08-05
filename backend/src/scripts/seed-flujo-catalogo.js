/**
 * Seed — Flujo de Catálogo AGROFER
 * Ejecutar: node src/scripts/seed-flujo-catalogo.js
 */
require('dotenv').config()
const mongoose = require('mongoose')
const Flow = require('../models/Flow')

const MSG_PRESENTACION = `¡Hola! 👋 Soy Emmanuel Puerto, encargado de la línea comercial de Distribuciones AGROFER.

Gracias por tu interés en nuestro portafolio 😊 Manejamos más de 1.700 referencias en ferretería, construcción, agro, herramientas y mucho más.

¿Con quién tengo el gusto?`

const MSG_CATALOGO = `¡Perfecto, {{nombre}}! 🎉

Aquí te comparto nuestro catálogo completo:
👉 https://drive.google.com/file/d/1gM97woPL_-sufaKsaFkeo9lr_KX4JhwY/view?usp=sharing

¿Hay alguna línea específica que te interese? (ferretería, construcción, agro, herramientas...) 😊`

const rfNodes = [
  { id: 'trigger',     type: 'trigger',  position: { x: 260, y: 40  }, data: { tipo: 'keyword', keywords: ['catalogo', 'catálogo', 'catalgo', 'ver catalogo', 'ver el catalogo'], soloLeads: false } },
  { id: 'typing_1',    type: 'typing',   position: { x: 260, y: 190 }, data: { duracion: 2 } },
  { id: 'mensaje_1',   type: 'mensaje',  position: { x: 260, y: 320 }, data: { contenido: MSG_PRESENTACION } },
  { id: 'capturar_1',  type: 'capturar', position: { x: 260, y: 530 }, data: { pregunta: '', variable: 'nombre' } },
  { id: 'typing_2',    type: 'typing',   position: { x: 260, y: 680 }, data: { duracion: 2 } },
  { id: 'mensaje_2',   type: 'mensaje',  position: { x: 260, y: 810 }, data: { contenido: MSG_CATALOGO } },
]

const rfEdges = [
  { id: 'e1', source: 'trigger',    target: 'typing_1',   type: 'deleteEdge', animated: true },
  { id: 'e2', source: 'typing_1',   target: 'mensaje_1',  type: 'deleteEdge', animated: true },
  { id: 'e3', source: 'mensaje_1',  target: 'capturar_1', type: 'deleteEdge', animated: true },
  { id: 'e4', source: 'capturar_1', target: 'typing_2',   type: 'deleteEdge', animated: true },
  { id: 'e5', source: 'typing_2',   target: 'mensaje_2',  type: 'deleteEdge', animated: true },
]

const pasos = [
  { id: 'typing_1',   tipo: 'typing',   duracion: 2 },
  { id: 'mensaje_1',  tipo: 'mensaje',  contenido: MSG_PRESENTACION },
  { id: 'capturar_1', tipo: 'capturar', pregunta: '', variable: 'nombre' },
  { id: 'typing_2',   tipo: 'typing',   duracion: 2 },
  { id: 'mensaje_2',  tipo: 'mensaje',  contenido: MSG_CATALOGO },
]

async function seed() {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI)
  console.log('Conectado a MongoDB')

  const existe = await Flow.findOne({ nombre: 'Catálogo AGROFER' })
  if (existe) {
    console.log('Ya existe el flujo "Catálogo AGROFER" — actualizando...')
    await Flow.findByIdAndUpdate(existe._id, {
      disparador: { tipo: 'keyword', keywords: ['catalogo', 'catálogo', 'catalgo', 'ver catalogo', 'ver el catalogo'], soloLeads: false },
      pasos,
      rfNodes,
      rfEdges,
      activo: true,
      orden: 1,
    })
    console.log('✓ Flujo actualizado.')
  } else {
    await Flow.create({
      nombre:      'Catálogo AGROFER',
      descripcion: 'Se activa cuando alguien escribe "catalogo". Presenta a Emmanuel Puerto, captura el nombre del cliente y envía el catálogo personalizado.',
      activo:      true,
      orden:       1,
      disparador:  { tipo: 'keyword', keywords: ['catalogo', 'catálogo', 'catalgo', 'ver catalogo', 'ver el catalogo'], soloLeads: false },
      pasos,
      rfNodes,
      rfEdges,
    })
    console.log('✓ Flujo "Catálogo AGROFER" creado.')
  }

  await mongoose.disconnect()
}

seed().catch(err => { console.error(err); process.exit(1) })
