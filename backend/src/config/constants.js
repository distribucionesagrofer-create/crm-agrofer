module.exports = {
  // Roles de usuario (actualmente solo admin)
  ROLES: {
    ADMIN: 'admin',
  },

  // Dirección de mensajes WhatsApp
  MESSAGE_DIRECTION: {
    INBOUND:  'inbound',
    OUTBOUND: 'outbound',
  },

  // Estados de conexión WhatsApp
  WHATSAPP_STATUS: {
    DISCONNECTED: 'disconnected',
    CONNECTING:   'connecting',
    CONNECTED:    'connected',
    QR_READY:     'qr_ready',
  },

  // Modelo de IA por defecto
  AI_MODEL: 'gpt-4o-mini',
}
