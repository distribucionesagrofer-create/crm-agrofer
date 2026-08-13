/**
 * Herramientas reales que el bot puede pedir ejecutar vía tool calling de OpenAI.
 * El modelo NUNCA toca la base de datos directo — pide una herramienta con
 * parámetros estructurados, este archivo la ejecuta contra los datos reales, y
 * el resultado vuelve al modelo para que redacte la respuesta. Así se evita que
 * la IA invente precios, productos o disponibilidad que no existen.
 */
const ProductoCatalogo = require('../models/ProductoCatalogo')

// Un cliente real escribe "manguera 1/2 pulg (rollo)" o "desbrozadora fs 220" sin pensarlo
// dos veces — mandar esos caracteres tal cual dentro de un $regex de Mongo revienta con
// "Regular expression is invalid" en vez de buscar el texto literal.
function escaparRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function consultarProducto({ consulta }) {
  if (!consulta?.trim()) return { encontrado: false, error: 'Falta la consulta' }

  try {
    // Búsqueda por palabras, no por frase exacta — "pala bellota" debe encontrar
    // "PALA CARBONERA BELLOTA 5503SC" aunque "bellota" no esté pegado a "pala" (un
    // regex de la frase completa fallaba ahí). También busca en `linea` (la marca),
    // que antes ni se revisaba.
    const palabras = consulta.trim().split(/\s+/).filter(Boolean)
    const condiciones = palabras.map(palabra => {
      const re = { $regex: escaparRegex(palabra), $options: 'i' }
      return { $or: [{ descripcion: re }, { codigo: re }, { referencia: re }, { linea: re }] }
    })

    const productos = await ProductoCatalogo.find({
      activo: true,
      $and: condiciones,
    }).limit(8).lean()

    if (!productos.length) return { encontrado: false }

    return {
      encontrado: true,
      resultados: productos.map(p => ({
        codigo:     p.codigo,
        nombre:     p.descripcion,
        marca:      p.linea,
        precio:     p.precio,
        disponible: p.existencia > 0,
        existencia: p.existencia,
        unidad:     p.unidad,
        // El nombre trae texto tipo "INVECRYL 500 X 750 GRS BOLSA" donde el 500 es parte
        // del código comercial y el 750 es el peso real — sin este campo aparte, el
        // modelo confundía cuál número era el peso (ej. respondía "500 gramos").
        pesoGramos: p.peso || null,
      })),
    }
  } catch (e) {
    console.error('[bot-tools] Error en consultar_producto:', e.message)
    return { encontrado: false, error: 'Error consultando el catálogo' }
  }
}

// Cada entrada: `definition` es el schema que se le manda a OpenAI (formato tools de
// la API de Chat Completions), `handler` es la función real que se ejecuta cuando el
// modelo pide usar esa herramienta.
const TOOLS = {
  consultar_producto: {
    definition: {
      type: 'function',
      function: {
        name: 'consultar_producto',
        description: 'Busca productos reales en el catálogo de AGROFER por nombre, código o referencia — precio, disponibilidad, marca, unidad de venta y peso en gramos (pesoGramos). El nombre del producto puede incluir números que NO son el peso (ej. "INVECRYL 500 X 750 GRS BOLSA" — el 500 es parte del código comercial, el peso real está en pesoGramos: 750). Usa siempre pesoGramos si el cliente pregunta por el tamaño/peso, nunca lo adivines del nombre. Úsala SIEMPRE que el cliente pregunte por precio, disponibilidad o características de un producto; nunca inventes esos datos.',
        parameters: {
          type: 'object',
          properties: {
            consulta: {
              type: 'string',
              description: 'Nombre, código o palabra clave del producto que busca el cliente (ej. "picador", "fertilizante triple 15")',
            },
          },
          required: ['consulta'],
          additionalProperties: false,
        },
        strict: true,
      },
    },
    handler: consultarProducto,
  },
}

module.exports = { TOOLS, consultarProducto }
