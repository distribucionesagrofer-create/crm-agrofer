import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Zap, Trash2, Edit2, X } from 'lucide-react'
import api from '../services/api'

function ReplyModal({ reply, onClose }) {
  const [form, setForm] = useState({
    title: reply?.title || '',
    content: reply?.content || '',
  })
  const [error, setError] = useState('')
  const queryClient = useQueryClient()

  const save = useMutation({
    mutationFn: () => reply
      ? api.patch(`/quick-replies/${reply._id}`, form)
      : api.post('/quick-replies', form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quick-replies'] })
      onClose()
    },
    onError: (err) => setError(err?.error || 'Error al guardar'),
  })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold">{reply ? 'Editar plantilla' : 'Nueva plantilla'}</h3>
          <button onClick={onClose}><X size={16} className="text-gray-400" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nombre de la plantilla *</label>
            <input
              className="input w-full"
              placeholder="Ej: Saludo inicial, Precio del producto..."
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Mensaje *</label>
            <textarea
              className="input w-full resize-none"
              rows={4}
              placeholder="Escribe el mensaje de la plantilla..."
              value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
            />
          </div>
        </div>
        <div className="flex gap-2 px-6 py-4 border-t border-gray-100">
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending || !form.title.trim() || !form.content.trim()}
            className="btn-primary flex-1"
          >
            {save.isPending ? 'Guardando...' : 'Guardar'}
          </button>
          <button onClick={onClose} className="btn-secondary px-4">Cancelar</button>
        </div>
      </div>
    </div>
  )
}

export default function QuickRepliesPage() {
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['quick-replies'],
    queryFn: () => api.get('/quick-replies'),
  })

  const remove = useMutation({
    mutationFn: (id) => api.delete(`/quick-replies/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quick-replies'] }),
  })

  return (
    <div className="p-6 max-w-2xl">
      {(showModal || editing) && (
        <ReplyModal
          reply={editing}
          onClose={() => { setShowModal(false); setEditing(null) }}
        />
      )}

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-brand/10 rounded-xl">
            <Zap size={20} className="text-brand" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Respuestas rápidas</h2>
            <p className="text-sm text-gray-400">Plantillas para responder más rápido</p>
          </div>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <Plus size={15} /> Nueva plantilla
        </button>
      </div>

      {isLoading && <p className="text-sm text-gray-400 text-center py-8">Cargando...</p>}

      {!isLoading && !data?.replies?.length && (
        <div className="card text-center py-12">
          <Zap size={32} className="mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 font-medium">No hay plantillas todavía</p>
          <p className="text-sm text-gray-400 mt-1">Crea plantillas para responder más rápido desde el chat</p>
          <button onClick={() => setShowModal(true)} className="btn-primary mt-4 inline-flex items-center gap-2">
            <Plus size={14} /> Crear primera plantilla
          </button>
        </div>
      )}

      <div className="space-y-3">
        {data?.replies?.map(r => (
          <div key={r._id} className="card p-4 flex items-start gap-3">
            <div className="p-2 bg-brand/10 rounded-lg flex-shrink-0">
              <Zap size={15} className="text-brand" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{r.title}</p>
              <p className="text-sm text-gray-500 mt-0.5 whitespace-pre-wrap">{r.content}</p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => setEditing(r)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <Edit2 size={14} />
              </button>
              <button
                onClick={() => confirm(`¿Eliminar "${r.title}"?`) && remove.mutate(r._id)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
