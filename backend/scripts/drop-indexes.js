require('dotenv').config({ path: require('path').join(__dirname, '../.env') })
const mongoose = require('mongoose')

async function run() {
  await mongoose.connect(process.env.MONGO_URI)
  await mongoose.connection.db.collection('customers').dropIndexes()
  console.log('Índices de customers eliminados — Mongoose los recreará al arrancar')
  await mongoose.disconnect()
}
run().catch(console.error)
