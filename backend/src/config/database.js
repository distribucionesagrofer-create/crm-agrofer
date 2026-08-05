const mongoose = require('mongoose')

const connect = async () => {
  const uri = process.env.MONGO_URI
  await mongoose.connect(uri)
  console.log('MongoDB conectado')
}

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB desconectado — reintentando...')
})

mongoose.connection.on('error', (err) => {
  console.error('MongoDB error:', err.message)
})

module.exports = { connect }
