const { RateLimiterMemory } = require('rate-limiter-flexible')

const loginLimiter = new RateLimiterMemory({ points: 5, duration: 60 })
const apiLimiter = new RateLimiterMemory({ points: 100, duration: 60 })

const limitLogin = async (req, res, next) => {
  try {
    await loginLimiter.consume(req.ip)
    next()
  } catch {
    res.status(429).json({ error: 'Demasiados intentos de login. Espera 1 minuto.' })
  }
}

const limitApi = async (req, res, next) => {
  try {
    await apiLimiter.consume(req.ip)
    next()
  } catch {
    res.status(429).json({ error: 'Límite de solicitudes alcanzado.' })
  }
}

module.exports = { limitLogin, limitApi }
