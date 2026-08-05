/**
 * Seed de Base de Conocimiento — AGROFER
 * Ejecutar: node src/scripts/seed-knowledge.js
 */
require('dotenv').config()
const mongoose = require('mongoose')
const KnowledgeBase = require('../models/KnowledgeBase')

const FAQS = [
  {
    question: '¿Dónde están ubicados? ¿Cuál es la dirección?',
    answer:
      'Estamos ubicados en Calle 6 # 7-61, Barrio Centro, Cúcuta, Norte de Santander, Colombia. 📍 Puedes encontrarnos aquí: https://maps.app.goo.gl/L2VNMUbZdY8Q3bN9A',
  },
  {
    question: '¿Cuál es el horario de atención?',
    answer:
      'Nuestro horario de atención es:\n• Lunes a viernes: 8:00 a.m. a 12:00 m. y 2:00 p.m. a 5:30 p.m.\n• Sábados: 8:00 a.m. a 12:00 m.\n• Domingos y festivos: cerrado.',
  },
  {
    question: '¿Tienen catálogo de productos? ¿Qué productos venden?',
    answer:
      '¡Claro que sí! Manejamos más de 1.700 referencias en ferretería, construcción, pinturas, herramientas, eléctricos, fontanería, carpintería y seguridad industrial — mayor y detal. 👇\nhttps://drive.google.com/file/d/1gM97woPL_-sufaKsaFkeo9lr_KX4JhwY/view?usp=sharing',
  },
  {
    question: '¿Qué líneas de productos manejan?',
    answer:
      'AGROFER maneja más de 640 familias de productos en estas líneas: ferretería, construcción, agro, campo, herramientas, materiales de construcción, suministros industriales, pinturas, eléctricos, fontanería, carpintería y seguridad industrial.',
  },
  {
    question: '¿Hacen envíos? ¿A qué zonas llegan? ¿Tienen cobertura?',
    answer:
      'Atendemos principalmente Cúcuta y zonas de Norte de Santander. Para validar cobertura, entrega o asesor asignado, cuéntame en qué ciudad o barrio estás y te conecto con un asesor.',
  },
  {
    question: '¿Cuáles son las formas de pago?',
    answer:
      'Para confirmarte las formas de pago disponibles según tu compra, te conecto con un asesor que te orienta de inmediato.',
  },
  {
    question: '¿Cuál es el número de teléfono o contacto?',
    answer:
      'Para contacto directo con un asesor, déjame tu número o cuéntame qué necesitas y te conecto de inmediato.',
  },
  {
    question: '¿Quiénes son? ¿Qué es AGROFER?',
    answer:
      'AGROFER (Distribuciones Agrofer Al S.A.S.) es una empresa distribuidora con más de 23 años de experiencia, ubicada en Cúcuta, Norte de Santander. Nos especializamos en ferretería, construcción, agro y suministros industriales con más de 1.700 referencias. Atendemos ferreterías, agropecuarias, fincas, empresas y clientes particulares — mayor y detal.',
  },
  {
    question: '¿Venden al por mayor? ¿Tienen precio mayorista?',
    answer:
      'Sí, en AGROFER vendemos al mayor y al detal. Si tienes un pedido de volumen, con gusto te asigno un asesor para cotizarte según tu necesidad.',
  },
  {
    question: '¿Tienen precios? ¿Pueden hacer una cotización?',
    answer:
      'Para darte precios y una cotización exacta necesito conectarte con un asesor. ¿Me indicas qué producto o línea te interesa y en qué cantidad aproximada?',
  },
  {
    question: '¿Tienen productos de ferretería?',
    answer:
      'Sí, ferretería es una de nuestras líneas principales. Manejamos herramientas, materiales de construcción, eléctricos, fontanería, carpintería, pinturas y más. ¿Te interesa algo específico? Puedes ver nuestro catálogo aquí: https://drive.google.com/file/d/1gM97woPL_-sufaKsaFkeo9lr_KX4JhwY/view?usp=sharing',
  },
  {
    question: '¿Tienen productos agropecuarios? ¿Tienen insumos para el campo?',
    answer:
      'Sí, manejamos productos para agro y campo dentro de nuestro portafolio. Para ver disponibilidad y precios exactos, te conecto con un asesor.',
  },
  {
    question: '¿Tienen seguridad industrial? ¿Equipos de protección personal?',
    answer:
      'Sí, manejamos línea de seguridad industrial. Para disponibilidad y precios te conecto con un asesor o puedes explorar nuestro catálogo: https://drive.google.com/file/d/1gM97woPL_-sufaKsaFkeo9lr_KX4JhwY/view?usp=sharing',
  },
]

async function seed() {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI)
  console.log('Conectado a MongoDB')

  let creados = 0
  let omitidos = 0

  for (const faq of FAQS) {
    const exists = await KnowledgeBase.findOne({ question: faq.question })
    if (exists) {
      console.log(`  ↩ Ya existe: "${faq.question.slice(0, 50)}..."`)
      omitidos++
      continue
    }
    const keywords = faq.question
      .toLowerCase()
      .replace(/[¿?¡!.,;:]/g, '')
      .split(/\s+/)
      .filter(w => w.length >= 4)
    await KnowledgeBase.create({ ...faq, keywords })
    console.log(`  ✓ Creado: "${faq.question.slice(0, 50)}..."`)
    creados++
  }

  console.log(`\nSeed completado: ${creados} creados, ${omitidos} omitidos.`)
  await mongoose.disconnect()
}

seed().catch(err => { console.error(err); process.exit(1) })
