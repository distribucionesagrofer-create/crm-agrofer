import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bot, MessageSquare, Clock, Save, CheckCircle, ChevronDown } from 'lucide-react'
import api from '../services/api'

function Toggle({ value, onChange }) {
  return (
    <button onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${value ? 'bg-brand' : 'bg-gray-200'}`}>
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}

export default function AutomationsPage() {
  const [vendedorId, setVendedorId] = useState('')
  const [welcome,  setWelcome]  = useState({ enabled: false, content: '' })
  const [followUp, setFollowUp] = useState({ enabled: false, hours: 24, content: '' })
  const [saved, setSaved] = useState(false)
  const qc = useQueryClient()

  const { data: vData } = useQuery({
    queryKey: ['vendedores-lista'],
    queryFn: () => api.get('/vendedores'),
  })

  const { data: vDetalle } = useQuery({
    queryKey: ['vendedor-automations', vendedorId],
    queryFn: () => api.get(`/vendedores/${vendedorId}`),
    enabled: !!vendedorId,
  })

  // Cargar datos del vendedor seleccionado
  useEffect(() => {
    const v = vDetalle?.vendedor
    if (!v) return
    setWelcome(v.automations?.welcomeMessage || { enabled: false, content: '' })
    setFollowUp(v.automations?.followUp      || { enabled: false, hours: 24, content: '' })
  }, [vDetalle])

  const guardar = useMutation({
    mutationFn: () => api.patch(`/vendedores/${vendedorId}/automations`, { welcomeMessage: welcome, followUp }),
    onSuccess: () => {
      qc.invalidateQueries(['vendedor-automations', vendedorId])
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    },
  })

  const vendedores = vData?.vendedores || []
  const vendedorActual = vendedores.find(v => v._id === vendedorId)

  return (
    <div className="p-6 max-w-2xl space-y-5">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-brand/10 rounded-xl"><Bot size={20} className="text-brand" /></div>
        <div>
          <h2 className="text-xl font-bold">Automatizaciones</h2>
          <p className="text-sm text-gray-400">Mensajes automáticos por línea WhatsApp</p>
        </div>
      </div>

      {/* Selector de vendedor */}
      <div className="card p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Configurar para</label>
        <div className="relative">
          <select className="input w-full appearance-none pr-9" value={vendedorId}
            onChange={e => { setVendedorId(e.target.value); setSaved(false) }}>
            <option value="">Selecciona una línea WhatsApp…</option>
            {vendedores.map(v => (
              <option key={v._id} value={v._id}>
                {v.nombre} {v.zona ? `· ${v.zona}` : ''} {v.whatsapp?.status === 'connected' ? '🟢' : '⚪'}
              </option>
            ))}
          </select>
          <ChevronDown size={15} className="absolute right-3 top-2.5 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {!vendedorId && (
        <div className="text-center py-10 text-gray-400 text-sm">
          Selecciona una línea para configurar sus automatizaciones
        </div>
      )}

      {vendedorId && (
        <>
          {/* Mensaje de bienvenida */}
          <div className="card p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <MessageSquare size={16} className="text-green-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">Mensaje de bienvenida</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Se envía cuando un número escribe por primera vez</p>
                </div>
              </div>
              <Toggle value={welcome.enabled} onChange={v => setWelcome(w => ({ ...w, enabled: v }))} />
            </div>
            {welcome.enabled && (
              <textarea className="input w-full resize-none text-sm" rows={3}
                placeholder="Ej: ¡Hola! 👋 Gracias por escribirnos. En breve te atendemos..."
                value={welcome.content}
                onChange={e => setWelcome(w => ({ ...w, content: e.target.value }))} />
            )}
          </div>

          {/* Seguimiento automático */}
          <div className="card p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Clock size={16} className="text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">Seguimiento automático</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Envía un recordatorio si no hay respuesta después de X horas</p>
                </div>
              </div>
              <Toggle value={followUp.enabled} onChange={v => setFollowUp(f => ({ ...f, enabled: v }))} />
            </div>
            {followUp.enabled && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-600 whitespace-nowrap">Enviar después de</label>
                  <input type="number" min={1} max={168} className="input w-24 text-sm"
                    value={followUp.hours}
                    onChange={e => setFollowUp(f => ({ ...f, hours: parseInt(e.target.value) || 24 }))} />
                  <span className="text-sm text-gray-500">horas sin respuesta</span>
                </div>
                <textarea className="input w-full resize-none text-sm" rows={3}
                  placeholder="Ej: Hola! 👋 ¿Pudimos ayudarte? Si tienes dudas, escríbenos."
                  value={followUp.content}
                  onChange={e => setFollowUp(f => ({ ...f, content: e.target.value }))} />
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button onClick={() => guardar.mutate()} disabled={guardar.isPending}
              className="btn-primary flex items-center gap-2">
              {saved
                ? <><CheckCircle size={14} /> Guardado</>
                : <><Save size={14} /> {guardar.isPending ? 'Guardando...' : 'Guardar cambios'}</>}
            </button>
            {vendedorActual && (
              <span className="text-xs text-gray-400">
                {vendedorActual.whatsapp?.status === 'connected' ? '🟢 WhatsApp conectado' : '⚪ WhatsApp desconectado'}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
