import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Pencil, Check, X, BookOpen, ToggleLeft, ToggleRight } from 'lucide-react'
import api from '../services/api'

function FAQRow({ faq, onDelete, onToggle }) {
  const [editing, setEditing] = useState(false)
  const [q, setQ] = useState(faq.question)
  const [a, setA] = useState(faq.answer)
  const queryClient = useQueryClient()

  const update = useMutation({
    mutationFn: (data) => api.patch(`/knowledge/${faq._id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['knowledge'] }); setEditing(false) },
  })

  if (editing) {
    return (
      <tr className="bg-blue-50/40">
        <td className="px-5 py-3" colSpan={3}>
          <div className="space-y-2">
            <input
              className="input w-full text-sm"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Pregunta del cliente"
            />
            <textarea
              className="input w-full text-sm resize-none"
              rows={3}
              value={a}
              onChange={(e) => setA(e.target.value)}
              placeholder="Respuesta del agente IA"
            />
          </div>
        </td>
        <td className="px-5 py-3 align-top">
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => update.mutate({ question: q, answer: a })}
              disabled={update.isPending}
              className="p-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
            >
              <Check size={14} />
            </button>
            <button
              onClick={() => { setQ(faq.question); setA(faq.answer); setEditing(false) }}
              className="p-1.5 rounded-lg bg-gray-50 text-gray-500 hover:bg-gray-100 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr className="hover:bg-gray-50/50">
      <td className="px-5 py-3.5 align-top">
        <p className="font-medium text-gray-800 text-sm">{faq.question}</p>
      </td>
      <td className="px-5 py-3.5 align-top">
        <p className="text-gray-600 text-sm whitespace-pre-wrap">{faq.answer}</p>
      </td>
      <td className="px-5 py-3.5 align-top">
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${faq.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {faq.active ? 'Activo' : 'Inactivo'}
          </span>
        </div>
      </td>
      <td className="px-5 py-3.5 align-top">
        <div className="flex items-center gap-1">
          <button
            onClick={() => onToggle(faq._id, !faq.active)}
            className="p-1.5 rounded-lg text-gray-300 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            title={faq.active ? 'Desactivar' : 'Activar'}
          >
            {faq.active ? <ToggleRight size={16} className="text-green-500" /> : <ToggleLeft size={16} />}
          </button>
          <button
            onClick={() => setEditing(true)}
            className="p-1.5 rounded-lg text-gray-300 hover:bg-blue-50 hover:text-blue-500 transition-colors"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => onDelete(faq._id)}
            className="p-1.5 rounded-lg text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </td>
    </tr>
  )
}

export default function KnowledgePage() {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [showForm, setShowForm] = useState(false)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['knowledge'],
    queryFn: () => api.get('/knowledge'),
  })

  const create = useMutation({
    mutationFn: () => api.post('/knowledge', { question, answer }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge'] })
      setQuestion('')
      setAnswer('')
      setShowForm(false)
    },
  })

  const deleteFAQ = useMutation({
    mutationFn: (id) => api.delete(`/knowledge/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['knowledge'] }),
  })

  const toggleFAQ = useMutation({
    mutationFn: ({ id, active }) => api.patch(`/knowledge/${id}`, { active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['knowledge'] }),
  })

  const faqs = data?.faqs || []

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <BookOpen size={20} className="text-brand" />
            Base de Conocimiento
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Preguntas y respuestas que la IA usará para responder con información real de tu empresa
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={16} /> Añadir FAQ
        </button>
      </div>

      {/* Formulario nuevo FAQ */}
      {showForm && (
        <div className="card mb-5 border border-blue-100 bg-blue-50/30">
          <h3 className="font-semibold text-sm mb-3">Nueva pregunta frecuente</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Pregunta del cliente
              </label>
              <input
                className="input w-full"
                placeholder="Ej: ¿Cuánto cuesta el servicio básico?"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Respuesta que dará la IA
              </label>
              <textarea
                className="input w-full resize-none"
                rows={3}
                placeholder="Ej: El servicio básico tiene un costo de $50 mensuales e incluye..."
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => create.mutate()}
                disabled={create.isPending || !question.trim() || !answer.trim()}
                className="btn-primary"
              >
                {create.isPending ? 'Guardando...' : 'Guardar FAQ'}
              </button>
              <button
                onClick={() => { setShowForm(false); setQuestion(''); setAnswer('') }}
                className="btn-secondary"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabla de FAQs */}
      {faqs.length === 0 && !isLoading ? (
        <div className="card text-center py-12 text-gray-400">
          <BookOpen size={36} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium text-gray-500">Sin FAQs aún</p>
          <p className="text-sm mt-1">Añade preguntas frecuentes para que la IA responda con datos reales de tu empresa</p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-500 w-2/5">Pregunta</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Respuesta</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500 w-24">Estado</th>
                <th className="px-5 py-3 w-28"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading && (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-400">Cargando...</td></tr>
              )}
              {faqs.map((faq) => (
                <FAQRow
                  key={faq._id}
                  faq={faq}
                  onDelete={(id) => {
                    if (confirm('¿Eliminar esta pregunta?')) deleteFAQ.mutate(id)
                  }}
                  onToggle={(id, active) => toggleFAQ.mutate({ id, active })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Info */}
      <div className="mt-4 p-4 bg-amber-50 border border-amber-100 rounded-xl text-sm text-amber-700">
        <strong>¿Cómo funciona?</strong> Cuando un cliente escribe un mensaje, el sistema busca automáticamente
        las preguntas más relacionadas y las inyecta en el contexto de la IA. Así responde con tus datos reales,
        sin inventar precios ni información.
      </div>
    </div>
  )
}
