import { useState, useEffect } from 'react'
import { socket } from '../services/socket'
import { WifiOff, X, AlertTriangle } from 'lucide-react'

export default function AlertasGlobales() {
  const [alertas, setAlertas] = useState([])

  useEffect(() => {
    // Unirse al room global de admin
    socket.emit('join:admin')

    const handleLogout = (data) => {
      const id = Date.now()
      setAlertas(prev => [...prev, { id, ...data }])
      // Auto-dismiss después de 30 segundos
      setTimeout(() => setAlertas(prev => prev.filter(a => a.id !== id)), 30_000)

      // Notificación del navegador si está permitida
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('⚠️ Línea desconectada', {
          body: `${data.nombre} desconectó su WhatsApp desde el celular`,
          icon: '/favicon.ico',
        })
      }
    }

    socket.on('whatsapp:logout_alert', handleLogout)
    return () => socket.off('whatsapp:logout_alert', handleLogout)
  }, [])

  if (!alertas.length) return null

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm">
      {alertas.map(a => (
        <div key={a.id}
          className="flex items-start gap-3 bg-white border border-red-200 rounded-2xl shadow-xl px-4 py-3 animate-in slide-in-from-right">
          <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
            <WifiOff size={16} className="text-red-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
              <AlertTriangle size={13} className="text-red-500 shrink-0" />
              Línea desconectada
            </p>
            <p className="text-xs text-gray-600 mt-0.5">
              <span className="font-semibold text-red-600">{a.nombre}</span> desconectó su WhatsApp desde el celular
            </p>
            <p className="text-[10px] text-gray-400 mt-1">
              {new Date(a.hora).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <button onClick={() => setAlertas(prev => prev.filter(x => x.id !== a.id))}
            className="text-gray-300 hover:text-gray-500 shrink-0 mt-0.5">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
