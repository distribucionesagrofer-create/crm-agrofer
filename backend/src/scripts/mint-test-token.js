// Genera un JWT valido de un usuario admin existente, solo para pruebas puntuales por HTTP.
const jwt = require('jsonwebtoken')
const mongoose = require('mongoose')
const User = require('../models/User')

async function run() {
  await mongoose.connect(process.env.MONGO_URI)
  const user = await User.findOne({ active: true }).lean()
  if (!user) { console.error('Sin usuarios activos'); process.exit(1) }
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '10m' })
  console.log(token)
  await mongoose.disconnect()
}
run().catch(e => { console.error(e); process.exit(1) })
