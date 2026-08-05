const Flow         = require('../models/Flow')
const Lead         = require('../models/Lead')
const Conversation = require('../models/Conversation')
const Message      = require('../models/Message')

/**
 * Busca y ejecuta el flujo que aplique para este mensaje.
 * Retorna: { ejecutado, acciones[] }
 *   ejecutado: true si algún flujo manejó el mensaje
 *   acciones:  array de acciones a ejecutar en orden
 */
// Elimina prefijos conversacionales antes de guardar un nombre
function limpiarNombre(raw) {
  return (raw || '')
    .trim()
    .replace(/^(con gusto[,\s]*soy|con gusto[,\s]*|hola[,\s]*soy|hola[,\s]*me llamo|hola[,\s]*|buenos\s+d[ií]as[,\s]*soy|buenas[,\s]*soy|soy\s+el\s+|soy\s+la\s+|soy|me llamo|mi nombre es|mi nombre:|nombre:|es)\s*/i, '')
    .replace(/^con\s+/i, '')
    .trim()
}

async function ejecutarFlujo({ tenantId, phone, texto, esPrimerMensaje, esLead, conversacionId }) {
  // ── Verificar si hay captura pendiente ────────────────────────────────────
  if (conversacionId) {
    const conv = await Conversation.findById(conversacionId).lean()
    if (conv?.pendingCaptura?.variable) {
      const varName        = conv.pendingCaptura.variable
      const pasosRestantes = conv.pendingCaptura.pasosRestantes || []
      const valor          = varName === 'nombre' ? limpiarNombre(texto) : texto.trim()
      await Conversation.findByIdAndUpdate(conversacionId, {
        $set: { [`variables.${varName}`]: valor, 'pendingCaptura': {} },
      })
      console.log(`Dato capturado: ${varName} = "${valor}"`)
      if (pasosRestantes.length > 0) {
        const acciones = await ejecutarPasos(pasosRestantes, texto, conversacionId)
        return { ejecutado: true, acciones: acciones || [] }
      }
      return { ejecutado: true, acciones: [] }
    }
  }

  const flujos = await Flow.find({
    activo: true,
    $or: [{ lineas: { $size: 0 } }, { lineas: tenantId }],
  })
    .populate('pasos.ramas.accion.vendedorId', '_id nombre')
    .sort({ orden: 1 })
    .lean()

  for (const flujo of flujos) {
    // Filtrar por línea
    if (flujo.lineas?.length > 0) {
      const aplica = flujo.lineas.some(l =>
        (l._id || l).toString() === tenantId.toString()
      )
      if (!aplica) continue
    }

    // Filtrar por tipo de contacto
    if (flujo.disparador?.soloLeads    && !esLead) continue
    if (flujo.disparador?.soloClientes && esLead)  continue

    // Evaluar disparador
    const tipo = flujo.disparador?.tipo || 'primer_mensaje'
    let disparado = false
    if (tipo === 'primer_mensaje'    && esPrimerMensaje)  disparado = true
    if (tipo === 'cualquier_mensaje')                     disparado = true
    if (tipo === 'keyword') {
      const kws = (flujo.disparador?.keywords || []).map(k => k.toLowerCase())
      disparado = kws.some(k => texto.toLowerCase().includes(k))
    }
    if (tipo === 'exacto') {
      // Respuesta exacta: el mensaje del cliente debe ser EXACTAMENTE la keyword (trim, case insensitive)
      const kws = (flujo.disparador?.keywords || []).map(k => k.toLowerCase().trim())
      disparado = kws.some(k => texto.toLowerCase().trim() === k)
    }

    if (!disparado) continue

    // Ejecutar pasos
    const acciones = await ejecutarPasos(flujo.pasos, texto, conversacionId)
    if (acciones !== null) {
      await Flow.findByIdAndUpdate(flujo._id, { $inc: { usos: 1 } })
      return { ejecutado: true, acciones }
    }
  }

  return { ejecutado: false, acciones: [] }
}

function sustituirVariables(texto, variables) {
  if (!texto || !variables) return texto
  return texto.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || `{{${key}}}`)
}

function evaluarCondicion(condicion, texto) {
  if (!condicion) return false
  const val = (condicion.valor || '').toLowerCase()
  const txt = texto.toLowerCase()
  switch (condicion.tipo) {
    case 'contiene':      return txt.includes(val)
    case 'igual':         return txt.trim() === val.trim()
    case 'empieza':       return txt.startsWith(val)
    case 'primer_mensaje':
    case 'cualquiera':    return true
    default:              return false
  }
}

async function ejecutarPasos(pasos, texto, conversacionId) {
  const acciones = []

  for (let i = 0; i < pasos.length; i++) {
    const paso = pasos[i]

    if (paso.tipo === 'delay') {
      acciones.push({ tipo: 'delay', segundos: paso.segundos || 3 })
      continue
    }

    if (paso.tipo === 'typing') {
      acciones.push({ tipo: 'typing', duracion: paso.duracion || 2 })
      continue
    }

    if (paso.tipo === 'mensaje') {
      acciones.push({ tipo: 'mensaje', contenido: paso.contenido })
      if (!paso.esperarRespuesta) continue
      else return acciones  // esperar respuesta = parar aquí
    }

    if (paso.tipo === 'media') {
      acciones.push({ tipo: 'media', url: paso.mediaUrl, caption: paso.mediaCaption, mediaTipo: paso.mediaTipo })
      continue
    }

    if (paso.tipo === 'random') {
      const variantes = paso.variantes || []
      if (variantes.length > 0) {
        const elegida = variantes[Math.floor(Math.random() * variantes.length)]
        acciones.push({ tipo: 'mensaje', contenido: elegida })
      }
      continue
    }

    if (paso.tipo === 'capturar') {
      if (paso.pregunta) acciones.push({ tipo: 'mensaje', contenido: paso.pregunta })
      if (conversacionId && paso.variable) {
        await Conversation.findByIdAndUpdate(conversacionId, {
          'pendingCaptura.variable':       paso.variable,
          'pendingCaptura.etiqueta':       paso.variable,
          'pendingCaptura.pasosRestantes': pasos.slice(i + 1),
        })
      }
      return acciones  // parar y esperar respuesta del cliente
    }

    if (paso.tipo === 'etiqueta') {
      if (paso.etiqueta && conversacionId) {
        acciones.push({ tipo: 'etiqueta', etiqueta: paso.etiqueta })
      }
      continue
    }

    if (paso.tipo === 'ia') {
      acciones.push({ tipo: 'ia' })
      return acciones
    }

    if (paso.tipo === 'fin') {
      return acciones
    }

    if (paso.tipo === 'condicion') {
      const ramas = paso.ramas || []
      let ramaElegida = ramas.find(r => !r.esDefault && evaluarCondicion(r.condicion, texto))
      if (!ramaElegida) ramaElegida = ramas.find(r => r.esDefault)

      if (ramaElegida?.accion) {
        const accion = ramaElegida.accion
        if (accion.tipo === 'mensaje') {
          acciones.push({ tipo: 'mensaje', contenido: accion.contenido })
          return acciones
        }
        if (accion.tipo === 'ia')     { acciones.push({ tipo: 'ia' });     return acciones }
        if (accion.tipo === 'fin')    { return acciones.length ? acciones : null }
        if (accion.tipo === 'delegar') {
          acciones.push({ tipo: 'delegar', vendedorId: accion.vendedorId?._id || accion.vendedorId })
          return acciones
        }
        if (accion.tipo === 'cambiar_estado') {
          acciones.push({ tipo: 'cambiar_estado', estado: accion.estado })
          return acciones
        }
      }
    }
  }

  return acciones.length > 0 ? acciones : null
}

module.exports = { ejecutarFlujo, sustituirVariables }
