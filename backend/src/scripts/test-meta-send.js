// Prueba puntual: enviar un mensaje real via Meta Cloud API usando las credenciales
// ya guardadas en la línea principal. Uso:
//   docker exec agrofer_crm-backend-1 node src/scripts/test-meta-send.js 3133273616
const mongoose = require('mongoose')
const Tenant = require('../models/Tenant')
const { sendText } = require('../services/meta-api.service')

async function run() {
  const destino = process.argv[2]
  if (!destino) { console.error('Uso: node test-meta-send.js <numero>'); process.exit(1) }

  await mongoose.connect(process.env.MONGO_URI)
  const tenant = await Tenant.findOne({ esPrincipal: true }).lean()
  if (!tenant?.metaApi?.accessToken) { console.error('Sin credenciales metaApi en el tenant principal'); process.exit(1) }

  const result = await sendText(tenant, destino, 'Prueba desde el CRM AGROFER ✅')
  console.log('Resultado:', JSON.stringify(result))
  await mongoose.disconnect()
}

run().catch(e => { console.error(e); process.exit(1) })
