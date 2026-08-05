require('dotenv').config({ path: require('path').join(__dirname, '../.env') })
const mongoose = require('mongoose')

async function stats() {
  await mongoose.connect(process.env.MONGO_URI)
  const db = mongoose.connection.db
  const dbStats = await db.stats()

  console.log('\n=== BASE DE DATOS: drakocrm ===')
  console.log(`Motor:        MongoDB 7`)
  console.log(`Datos:        ${(dbStats.dataSize / 1024 / 1024).toFixed(2)} MB`)
  console.log(`Almacenado:   ${(dbStats.storageSize / 1024 / 1024).toFixed(2)} MB`)
  console.log(`Índices:      ${(dbStats.indexSize / 1024 / 1024).toFixed(2)} MB`)
  console.log(`Colecciones:  ${dbStats.collections}`)

  console.log('\n=== COLECCIONES ===')
  const collections = await db.listCollections().toArray()
  for (const col of collections) {
    try {
      const s    = await db.collection(col.name).stats()
      const cnt  = await db.collection(col.name).countDocuments()
      const size = (s.size / 1024).toFixed(1)
      console.log(`  ${col.name.padEnd(25)} ${String(cnt).padStart(6)} docs   ${size} KB`)
    } catch(e) {}
  }

  console.log('\n=== ESPACIO DOCKER (volumen MongoDB) ===')
  await mongoose.disconnect()
}
stats().catch(console.error)
