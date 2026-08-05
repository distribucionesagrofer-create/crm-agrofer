require('dotenv').config({ path: require('path').join(__dirname, '../.env') })
const mongoose = require('mongoose')

async function run() {
  await mongoose.connect(process.env.MONGO_URI)
  const Tenant = require('../src/models/Tenant')
  const r = await Tenant.updateOne({ slug: 'linea-principal' }, { $set: { esPrincipal: true } })
  console.log('Linea principal marcada:', r.modifiedCount, 'doc')
  await mongoose.disconnect()
}
run().catch(console.error)
