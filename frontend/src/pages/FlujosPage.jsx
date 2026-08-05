import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, Zap, ToggleLeft, ToggleRight, Pencil, Trash2, Play, GitBranch } from 'lucide-react'
import api from '../services/api'

const DISPARADOR_LABEL = {
  primer_mensaje:    { label: 'Primer mensaje',     color: 'bg-blue-100 text-blue-700',   icon: '👋' },
  keyword:           { label: 'Palabra clave',       color: 'bg-purple-100 text-purple-700', icon: '🔑' },
  cualquier_mensaje: { label: 'Cualquier mensaje',   color: 'bg-gray-100 text-gray-600',   icon: '💬' },
}

const TIPO_PASO_LABEL = {
  mensaje:   { icon: '💬', label: 'Mensaje' },
  condicion: { icon: '🔀', label: 'Condición' },
  accion:    { icon: '⚡', label: 'Acción' },
  ia:        { icon: '🤖', label: 'IA' },
  esperar:   { icon: '⏳', label: 'Esperar' },
}

export default function FlujosPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['flujos'],
    queryFn: () => api.get('/flujos'),
  })

  const toggle = useMutation({
    mutationFn: (id) => api.patch(`/flujos/${id}/toggle`),
    onSuccess: () => qc.invalidateQueries(['flujos']),
  })

  const eliminar = useMutation({
    mutationFn: (id) => api.delete(`/flujos/${id}`),
    onSuccess: () => qc.invalidateQueries(['flujos']),
  })

  const flujos = data?.flujos || []
  const activos = flujos.filter(f => f.activo).length

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Flujos de trabajo</h2>
          <p className="text-sm text-gray-400">
            {flujos.length} flujos · {activos} activos — se ejecutan antes que la IA
          </p>
        </div>
        <button onClick={() => navigate('/flujos/nuevo')} className="btn-primary flex items-center gap-2">
          <Plus size={15} /> Nuevo flujo
        </button>
      </div>

      {/* Info de cómo funcionan */}
      <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700 space-y-1">
        <p className="font-semibold flex items-center gap-1.5"><GitBranch size={13} /> ¿Cómo funcionan los flujos?</p>
        <p>Cuando llega un mensaje, el sistema revisa los flujos activos <strong>en orden de prioridad</strong> antes de llamar a la IA.</p>
        <p>Si un flujo coincide → ejecuta la respuesta/acción definida. Si ninguno coincide → pasa a la IA.</p>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="card h-24 animate-pulse bg-gray-50" />)}
        </div>
      )}

      {!isLoading && !flujos.length && (
        <div className="card p-10 text-center space-y-3">
          <Zap size={36} className="text-gray-200 mx-auto" />
          <p className="text-gray-500 font-medium">Sin flujos aún</p>
          <p className="text-sm text-gray-400">Crea tu primer flujo para automatizar las respuestas del bot</p>
          <button onClick={() => navigate('/flujos/nuevo')} className="btn-primary mx-auto flex items-center gap-2">
            <Plus size={14} /> Crear primer flujo
          </button>
        </div>
      )}

      <div className="space-y-3">
        {flujos.map((f, idx) => {
          const disp = DISPARADOR_LABEL[f.disparador?.tipo] || DISPARADOR_LABEL.primer_mensaje
          return (
            <div key={f._id} className={`card p-0 overflow-hidden transition-opacity ${!f.activo ? 'opacity-60' : ''}`}>
              <div className="flex items-center gap-4 px-5 py-4">
                {/* Prioridad */}
                <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">
                  {idx + 1}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold text-sm">{f.nombre}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${disp.color}`}>
                      {disp.icon} {disp.label}
                      {f.disparador?.tipo === 'keyword' && f.disparador?.keywords?.length > 0 && (
                        <span className="ml-1 opacity-70">({f.disparador.keywords.slice(0, 3).join(', ')})</span>
                      )}
                    </span>
                    {f.activo
                      ? <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full font-medium">Activo</span>
                      : <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">Inactivo</span>}
                  </div>
                  <p className="text-xs text-gray-400">{f.descripcion || 'Sin descripción'}</p>

                  {/* Resumen de pasos */}
                  {f.pasos?.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      {f.pasos.map((p, i) => {
                        const t = TIPO_PASO_LABEL[p.tipo] || { icon: '●', label: p.tipo }
                        return (
                          <span key={i} className="text-xs bg-gray-50 text-gray-500 px-2 py-0.5 rounded-full flex items-center gap-1">
                            {t.icon} {t.label}
                          </span>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Stats */}
                <div className="text-center shrink-0 hidden sm:block">
                  <p className="text-lg font-bold text-gray-700">{f.usos || 0}</p>
                  <p className="text-xs text-gray-400">ejecuciones</p>
                </div>

                {/* Acciones */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => toggle.mutate(f._id)}
                    className={`p-2 rounded-lg transition-colors ${f.activo ? 'text-green-500 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'}`}
                    title={f.activo ? 'Desactivar' : 'Activar'}>
                    {f.activo ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                  </button>
                  <button onClick={() => navigate(`/flujos/${f._id}`)}
                    className="p-2 rounded-lg text-gray-400 hover:text-brand hover:bg-brand/10 transition-colors"
                    title="Editar">
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => { if (confirm('¿Eliminar este flujo?')) eliminar.mutate(f._id) }}
                    className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    title="Eliminar">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
