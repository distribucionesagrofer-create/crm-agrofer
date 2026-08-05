import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bell, BellOff, Volume2, VolumeX, Smartphone } from 'lucide-react'
import api from '../services/api'

const STORAGE_KEY = 'agrofer_notif_config'

function loadConfig() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }
  catch { return {} }
}
function saveConfig(cfg) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg))
}

// Sonido de notificación simple (sin librería externa)
function playNotifSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15)
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.3)
  } catch (_) {}
}

export default function NotificacionesPage() {
  const [config, setConfig] = useState(loadConfig)
  const [permiso, setPermiso] = useState(Notification?.permission || 'default')

  const { data: vData } = useQuery({
    queryKey: ['vendedores-lista'],
    queryFn: () => api.get('/vendedores'),
  })
  const vendedores = vData?.vendedores || []

  useEffect(() => { saveConfig(config) }, [config])

  const requestPermiso = async () => {
    const p = await Notification.requestPermission()
    setPermiso(p)
  }

  const toggle = (id, tipo) => {
    setConfig(prev => ({
      ...prev,
      [id]: { ...prev[id], [tipo]: !(prev[id]?.[tipo] ?? true) },
    }))
  }

  const isNotif = (id) => config[id]?.notif ?? true
  const isSonido = (id) => config[id]?.sonido ?? (id === 'linea-principal' || !id)

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-brand/10 rounded-xl"><Bell size={20} className="text-brand" /></div>
        <div>
          <h2 className="text-xl font-bold">Configuración de Notificaciones</h2>
          <p className="text-sm text-gray-400">Elige qué líneas generan alertas y sonido</p>
        </div>
      </div>

      {/* Estado del permiso */}
      <div className={`p-4 rounded-xl border flex items-center justify-between ${
        permiso === 'granted' ? 'bg-green-50 border-green-200' :
        permiso === 'denied'  ? 'bg-red-50 border-red-200' :
        'bg-amber-50 border-amber-200'
      }`}>
        <div>
          <p className="text-sm font-semibold">
            {permiso === 'granted' ? '✅ Notificaciones del navegador activadas' :
             permiso === 'denied'  ? '❌ Notificaciones bloqueadas en el navegador' :
             '⚠️ Permiso de notificaciones pendiente'}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {permiso === 'denied'
              ? 'Ve a Configuración del navegador → Privacidad → Notificaciones para habilitarlas'
              : 'Necesario para recibir alertas aunque no estés en esta pestaña'}
          </p>
        </div>
        {permiso !== 'granted' && permiso !== 'denied' && (
          <button onClick={requestPermiso} className="btn-primary text-sm shrink-0">
            Activar
          </button>
        )}
      </div>

      {/* Explicación */}
      <div className="bg-blue-50 rounded-xl p-4 text-xs text-blue-700 space-y-1">
        <p className="font-semibold">¿Cómo funciona?</p>
        <p>• <strong>Notificación</strong>: aparece un globo en la esquina del navegador con el mensaje</p>
        <p>• <strong>Sonido</strong>: suena una alerta corta cuando llega el mensaje</p>
        <p>• Ambas funcionan aunque no estés viendo el sistema (en otra pestaña)</p>
      </div>

      {/* Config por línea */}
      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">Por línea WhatsApp</p>
          <div className="flex gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-1"><Bell size={11} /> Notificación</span>
            <span className="flex items-center gap-1"><Volume2 size={11} /> Sonido</span>
          </div>
        </div>
        <div className="divide-y divide-gray-50">
          {vendedores.map(v => {
            const notif  = isNotif(v._id)
            const sonido = isSonido(v._id)
            const conn   = v.whatsapp?.status === 'connected'
            const esPrincipal = v.slug === 'linea-principal'
            return (
              <div key={v._id} className="flex items-center gap-4 px-5 py-3">
                <div className={`w-2 h-2 rounded-full shrink-0 ${conn ? 'bg-green-500' : 'bg-gray-300'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{v.nombre}</p>
                  <p className="text-xs text-gray-400">{v.zona || 'Sin zona'}{esPrincipal && <span className="ml-2 text-brand font-medium">Principal</span>}</p>
                </div>
                {/* Toggle Notificación */}
                <button onClick={() => toggle(v._id, 'notif')}
                  className={`p-2 rounded-lg transition-colors ${notif ? 'bg-brand/10 text-brand' : 'bg-gray-100 text-gray-400'}`}
                  title={notif ? 'Desactivar notificación' : 'Activar notificación'}>
                  {notif ? <Bell size={16} /> : <BellOff size={16} />}
                </button>
                {/* Toggle Sonido */}
                <button onClick={() => { toggle(v._id, 'sonido'); if (!sonido) playNotifSound() }}
                  className={`p-2 rounded-lg transition-colors ${sonido ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}
                  title={sonido ? 'Desactivar sonido' : 'Activar sonido (clic para probar)'}>
                  {sonido ? <Volume2 size={16} /> : <VolumeX size={16} />}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Botón probar sonido */}
      <button onClick={playNotifSound}
        className="btn-secondary flex items-center gap-2 text-sm">
        <Volume2 size={14} /> Probar sonido de notificación
      </button>
    </div>
  )
}
