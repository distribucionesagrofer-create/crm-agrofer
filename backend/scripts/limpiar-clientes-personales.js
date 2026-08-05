require('dotenv').config({ path: require('path').join(__dirname, '../.env') })
const mongoose = require('mongoose')

async function limpiar() {
  await mongoose.connect(process.env.MONGO_URI)
  const Customer = require('../src/models/Customer')
  const Tenant   = require('../src/models/Tenant')

  // Encontrar la línea personal de Emmanuel
  const linea = await Tenant.findOne({
    nombre: { $regex: 'EMMANUEL', $options: 'i' },
    slug:   { $ne: 'linea-principal' }
  }).lean()

  console.log('Línea encontrada:', linea?.nombre, linea?._id)

  let eliminados = 0

  if (linea) {
    // Eliminar todos los clientes de esta línea
    const r = await Customer.deleteMany({ vendedorId: linea._id })
    eliminados += r.deletedCount
    console.log(`Clientes de "${linea.nombre}" eliminados: ${r.deletedCount}`)
  }

  // También eliminar clientes con números inválidos (IDs de WhatsApp, muy largos, o vacíos)
  const invalidos = await Customer.deleteMany({
    $or: [
      { phone: '' },
      { phone: null },
      { phone: { $exists: false } },
      { phone: 'status@broadcast' },
      // Números más largos de 15 dígitos (IDs internos de WhatsApp)
      { $where: "this.phone && this.phone.replace(/\\D/g,'').length > 15" },
    ]
  })
  eliminados += invalidos.deletedCount
  console.log(`Clientes con números inválidos eliminados: ${invalidos.deletedCount}`)

  const total = await Customer.countDocuments({})
  console.log(`\nTotal restante: ${total} clientes`)
  await mongoose.disconnect()
}

limpiar().catch(console.error)
