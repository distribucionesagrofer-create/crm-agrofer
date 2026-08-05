const helmet = require('helmet')
const cors = require('cors')
const { RateLimiterMemory } = require('rate-limiter-flexible')

const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", process.env.FRONTEND_URL],
    },
  },
})

const corsConfig = cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
})

const rateLimiter = new RateLimiterMemory({
  points: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  duration: parseInt(process.env.RATE_LIMIT_WINDOW) || 60,
})

const rateLimiterMiddleware = async (req, res, next) => {
  try {
    await rateLimiter.consume(req.ip)
    next()
  } catch {
    res.status(429).json({ error: 'Demasiadas solicitudes. Intenta más tarde.' })
  }
}

module.exports = { helmetConfig, corsConfig, rateLimiterMiddleware }
