const Joi = require('joi')

const validate = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.body, { abortEarly: false })
  if (error) {
    const messages = error.details.map((d) => d.message)
    return res.status(400).json({ error: 'Validación fallida', details: messages })
  }
  next()
}

const schemas = {
  // Login — único schema activo
  login: Joi.object({
    email:    Joi.string().email().required(),
    password: Joi.string().required(),
  }),

  // Cliente (importación y creación manual)
  cliente: Joi.object({
    name:       Joi.string().min(2).max(100).required(),
    phone:      Joi.string().required(),
    zona:       Joi.string().allow('', null),
    vendedorId: Joi.string().allow('', null),
    notes:      Joi.string().allow('', null),
  }),

  // Lead
  lead: Joi.object({
    name:   Joi.string().min(2).max(100),
    phone:  Joi.string().required(),
    status: Joi.string().valid('nuevo', 'contactado', 'interesado', 'convertido', 'descartado'),
    notes:  Joi.string().allow('', null),
  }),
}

module.exports = { validate, schemas }
