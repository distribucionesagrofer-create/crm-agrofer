const router = require('express').Router()
const jwt = require('jsonwebtoken')
const User = require('../models/User')
const { validate, schemas } = require('../middleware/validation')
const { limitLogin } = require('../middleware/rateLimiter')
const { authenticate } = require('../middleware/auth')

const signToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  })

router.post('/login', limitLogin, validate(schemas.login), async (req, res) => {
  const { email, password } = req.body
  const user = await User.findOne({ email, active: true })
  if (!user || !(await user.comparePassword(password))) {
    return res.status(401).json({ error: 'Credenciales incorrectas' })
  }
  const token = signToken(user._id)
  res.json({ token, user })
})

router.get('/me', authenticate, async (req, res) => {
  res.json({ user: req.user })
})

module.exports = router
