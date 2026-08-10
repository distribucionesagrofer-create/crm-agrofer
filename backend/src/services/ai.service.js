const OpenAI = require('openai')
const SystemConfig = require('../models/SystemConfig')

// Carga el cliente OpenAI en caliente — usa el token de BD, con fallback al .env
async function getOpenAIClient() {
  const cfg = await SystemConfig.findById('system').lean().catch(() => null)
  const key = cfg?.openaiKey || process.env.OPENAI_API_KEY
  if (!key) throw new Error('Token de OpenAI no configurado')
  return { client: new OpenAI({ apiKey: key }), model: cfg?.openaiModel || 'gpt-4o-mini' }
}

async function analyzeMerchandisingImage(mediaUrl, caption = '') {
  const fs   = require('fs')
  const path = require('path')

  const fileName   = path.basename(mediaUrl.replace('/media/', ''))
  const uploadsDir = path.join(__dirname, '../../uploads')
  const filePath   = path.join(uploadsDir, fileName)

  // path.basename() ya descarta cualquier separador de ruta, pero se valida explícito
  // por si acaso — esto viene de input externo (WhatsApp o un endpoint HTTP autenticado)
  // y no debe poder salirse de uploads/ (lectura arbitraria de archivos del servidor).
  if (!filePath.startsWith(uploadsDir + path.sep)) throw new Error('Ruta de imagen inválida')
  if (!fs.existsSync(filePath)) throw new Error('Imagen no encontrada en disco')

  const buffer = fs.readFileSync(filePath)
  const base64 = buffer.toString('base64')
  const ext    = path.extname(filePath).toLowerCase()
  const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' }
  const mime   = mimeMap[ext] || 'image/jpeg'

  const { client: openai } = await getOpenAIClient()

  const captionNote = caption
    ? `El administrador describió el producto así: "${caption}". Usa esa descripción como fuente principal y la imagen para confirmar o completar lo que falta.`
    : `No hay descripción de texto. Extrae toda la información desde la imagen.`

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
        {
          type: 'text',
          text: `Eres un asistente de inventario de merchandising para AGROFER. ${captionNote}

REGLA IMPORTANTE SOBRE TALLAS: Si el mensaje menciona más de una talla con sus cantidades, devuelve un ARRAY con UN OBJETO POR TALLA. Acepta cualquier formato natural:
- "M:2, L:3, XL:6"
- "2 L y 3 XL"
- "talla L 2 unidades XL 3"
- "2 de la L y 3 de la XL"
- "L-2 XL-3"
Si NO hay desglose por tallas, devuelve un array con un solo objeto (talla vacía o la única talla mencionada).

Devuelve SOLO un array JSON (sin explicación extra):
[
  {
    "nombre": "nombre descriptivo del artículo",
    "marca": "marca/empresa proveedora (Alidal, Algreco, Macho, etc.) — cadena vacía si no se identifica",
    "categoria": "ropa | accesorio | papeleria | electronico | hogar | otro",
    "subcategoria": "tipo exacto: camiseta, gorra, bolígrafo, taza, llavero, etc.",
    "talla": "talla específica (S/M/L/XL/XXL) — cadena vacía si no aplica",
    "color": "color principal del artículo",
    "cantidad": <número entero de esa talla específica>,
    "precio": <precio unitario en pesos colombianos como número entero, 0 si no se menciona>,
    "descripcion": "resumen de máximo 10 palabras"
  }
]

Ejemplo: si el texto dice "Camisas Algreco — M:2, L:3, XL:6", devuelve 3 objetos, uno por talla.
Ejemplo: si el texto dice "Gorras Macho — 10 unidades", devuelve 1 objeto con talla vacía y cantidad 10.`,
        },
      ],
    }],
  })

  const content = response.choices[0].message.content || ''
  // Intentar parsear array primero, luego objeto simple
  const arrMatch = content.match(/\[[\s\S]*\]/)
  const objMatch = content.match(/\{[\s\S]*\}/)
  if (arrMatch) {
    const parsed = JSON.parse(arrMatch[0])
    return Array.isArray(parsed) ? parsed : [parsed]
  }
  if (objMatch) return [JSON.parse(objMatch[0])]
  throw new Error('La IA no devolvió JSON válido')
}

module.exports = { getOpenAIClient, analyzeMerchandisingImage }
