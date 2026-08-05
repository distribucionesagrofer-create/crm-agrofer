require('dotenv').config({ path: require('path').join(__dirname, '../.env') })
const mongoose = require('mongoose')

const VENDEDORES = [
  { nombre: 'WILMER MENDOZA',     zona: 'MOSTRADOR SEDE',                       slug: 'wilmer-mendoza' },
  { nombre: 'ROGER CASTRO',       zona: 'ATALAYA',                              slug: 'roger-castro' },
  { nombre: 'OSCAR PLATA',        zona: 'REGION ORIENTE',                       slug: 'oscar-plata' },
  { nombre: 'ANYELO BALLESTEROS', zona: 'REGION NORTE',                         slug: 'anyelo-ballesteros' },
  { nombre: 'OMAR BETANCOURT',    zona: 'CENTRO CUCUTA',                        slug: 'omar-betancourt' },
  { nombre: 'EDWIN NAVARRO',      zona: 'GUIMARAL',                             slug: 'edwin-navarro' },
  { nombre: 'ANDRES SUAREZ',      zona: 'AEROPUERTO',                           slug: 'andres-suarez' },
  { nombre: 'JORGE CARRILLO',     zona: 'PATIOS / VILLA DEL ROSARIO / LIBERTAD', slug: 'jorge-carrillo' },
  { nombre: 'ARNOLD GARAVITO',    zona: 'REGION OCCIDENTE',                     slug: 'arnold-garavito' },
  { nombre: 'ALIRIO SANDOVAL',    zona: 'MOSTRADOR SEDE',                       slug: 'alirio-sandoval' },
]

async function seed() {
  await mongoose.connect(process.env.MONGO_URI)
  console.log('MongoDB conectado\n')

  const User   = require('../src/models/User')
  const Tenant = require('../src/models/Tenant')

  const yaHayDatos = (await User.countDocuments({})) > 0 || (await Tenant.countDocuments({})) > 0
  if (yaHayDatos && process.env.ALLOW_SEED_RESET !== 'true') {
    console.log('Ya existen usuarios o vendedores en la base — no se borra nada.')
    console.log('Corre con ALLOW_SEED_RESET=true si de verdad quieres reiniciarlos (esto borra TODOS los usuarios y vendedores actuales).')
    await mongoose.disconnect()
    return
  }

  await User.deleteMany({})
  await Tenant.deleteMany({})

  // Admin único
  await new User({ name: 'Administrador AGROFER', email: 'admin@agrofer.com', password: 'Admin1234', role: 'admin' }).save()
  console.log('Admin: admin@agrofer.com / Admin1234')

  // Línea principal
  await Tenant.create({ nombre: 'Linea Principal AGROFER', zona: 'General', slug: 'linea-principal', activo: true, esPrincipal: true, ai: { enabled: true, autoReply: true } })
  console.log('Linea principal creada\n')

  // 10 vendedores reales
  console.log('Creando vendedores...')
  for (const v of VENDEDORES) {
    await Tenant.create({ nombre: v.nombre, zona: v.zona, slug: v.slug, activo: true, ai: { enabled: false, autoReply: false } })
    console.log(`  OK  ${v.nombre.padEnd(22)} ${v.zona}`)
  }

  await mongoose.disconnect()
  console.log('\n=== SEED COMPLETADO ===')
  console.log('Login: admin@agrofer.com / Admin1234')
}

seed().catch(err => { console.error(err); process.exit(1) })
