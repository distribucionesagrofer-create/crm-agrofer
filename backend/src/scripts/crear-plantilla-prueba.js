// Crea una plantilla sencilla de prueba y la manda a Meta para aprobación,
// usando exactamente la misma lógica que usaría el botón "Enviar a Meta" del CRM.
const mongoose  = require('mongoose')
const Tenant     = require('../models/Tenant')
const Plantilla  = require('../models/PlantillaWhatsApp')
const { crearPlantillaEnMeta } = require('../services/meta-templates.service')

async function run() {
  await mongoose.connect(process.env.MONGO_URI)

  const tenant = await Tenant.findOne({ esPrincipal: true }).lean()
  if (!tenant?.metaApi?.accessToken) { console.error('Sin credenciales metaApi'); process.exit(1) }

  let plantilla = await Plantilla.findOne({ tenantId: tenant._id, nombre: 'prueba_agrofer' })
  if (!plantilla) {
    plantilla = await Plantilla.create({
      tenantId: tenant._id,
      nombre: 'prueba_agrofer',
      categoria: 'UTILITY',
      idioma: 'es',
      header: { tipo: 'ninguno' },
      cuerpo: 'Hola {{1}}, este es un mensaje de prueba desde el CRM de AGROFER.',
      footer: '',
      botones: [],
    })
    console.log('Plantilla creada localmente (borrador):', plantilla._id.toString())
  } else {
    console.log('Ya existía localmente, reusando:', plantilla._id.toString())
  }

  const result = await crearPlantillaEnMeta(tenant, plantilla)
  console.log('Resultado de Meta:', JSON.stringify(result, null, 2))

  if (result.ok) {
    plantilla.estado = 'enviada'
    plantilla.metaTemplateId = result.metaTemplateId
    await plantilla.save()
    console.log('Plantilla actualizada a estado "enviada" en el CRM.')
  }

  await mongoose.disconnect()
}

run().catch(e => { console.error(e); process.exit(1) })
