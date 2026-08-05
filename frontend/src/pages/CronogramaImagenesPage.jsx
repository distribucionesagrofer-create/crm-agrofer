import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Plus, X, Trash2, Printer, CheckCircle, Clock, Circle, Pencil } from 'lucide-react'
import api from '../services/api'

const MESES   = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const DIAS    = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
const COLORES = ['bg-blue-500','bg-purple-500','bg-green-500','bg-orange-500','bg-rose-500','bg-cyan-500','bg-amber-500','bg-indigo-500']

const ESTADOS = {
  pendiente:  { label: 'Pendiente',  icon: Circle,       tw: 'bg-gray-100 text-gray-500' },
  en_proceso: { label: 'En proceso', icon: Clock,        tw: 'bg-amber-100 text-amber-700' },
  entregado:  { label: 'Entregado',  icon: CheckCircle,  tw: 'bg-green-100 text-green-700' },
}
const NEXT_ESTADO = { pendiente: 'en_proceso', en_proceso: 'entregado', entregado: 'pendiente' }

// Asigna color consistente por marca
const colorCache = {}
let colorIdx = 0
function colorDeMarca(marca) {
  if (!colorCache[marca]) colorCache[marca] = COLORES[colorIdx++ % COLORES.length]
  return colorCache[marca]
}

function diasDelMes(año, mes) {
  const primer = new Date(año, mes - 1, 1)
  const ultimo = new Date(año, mes, 0)
  const dias = []
  // Relleno al inicio (domingo = 0)
  for (let i = 0; i < primer.getDay(); i++) dias.push(null)
  for (let d = 1; d <= ultimo.getDate(); d++) dias.push(new Date(año, mes - 1, d))
  // Relleno al final
  while (dias.length % 7 !== 0) dias.push(null)
  return dias
}

function semanaIndex(fecha, año, mes) {
  const dias = diasDelMes(año, mes)
  for (let s = 0; s < Math.ceil(dias.length / 7); s++) {
    const semDias = dias.slice(s * 7, s * 7 + 7).filter(Boolean)
    if (semDias.some(d => d && d.getDate() === fecha.getDate())) return s + 1
  }
  return 1
}

function EntradaModal({ semana, semLabel, año, mes, entrada, marcas, onClose, onSave }) {
  const esEdit = !!entrada
  const [form, setForm] = useState(esEdit ? {
    marca: entrada.marca||'', productos: entrada.productos||'',
    descripcion: entrada.descripcion||'', cantidad: entrada.cantidad||1,
    estado: entrada.estado||'pendiente', notas: entrada.notas||'',
  } : { marca:'', productos:'', descripcion:'', cantidad:1, estado:'pendiente', notas:'' })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      if (esEdit) await api.patch(`/cronograma/${entrada._id}`, form)
      else await api.post('/cronograma', { ...form, año, mes, semana })
      onSave(); onClose()
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="font-bold text-gray-800">{esEdit ? 'Editar' : 'Nueva entrada'}</h2>
            <p className="text-xs text-gray-400">{semLabel}</p>
          </div>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Marca *</label>
            <input required list="ml" className="input text-sm" placeholder="Invesa, Algreco…"
              value={form.marca} onChange={e => set('marca', e.target.value)} />
            <datalist id="ml">{marcas.map(m => <option key={m} value={m} />)}</datalist>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Productos</label>
            <input className="input text-sm" placeholder="Camisas blancas M, espátulas…"
              value={form.productos} onChange={e => set('productos', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Descripción / Concepto</label>
            <textarea rows={2} className="input text-sm resize-none" placeholder="Tipo de imagen, mensaje…"
              value={form.descripcion} onChange={e => set('descripcion', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cantidad</label>
              <input type="number" min="1" className="input text-sm" value={form.cantidad}
                onChange={e => set('cantidad', parseInt(e.target.value)||1)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Estado</label>
              <select className="input text-sm" value={form.estado} onChange={e => set('estado', e.target.value)}>
                {Object.entries(ESTADOS).map(([v,s]) => <option key={v} value={v}>{s.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
            <input className="input text-sm" value={form.notas} onChange={e => set('notas', e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary text-sm">
              {saving ? 'Guardando…' : esEdit ? 'Guardar' : 'Agregar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function CronogramaImagenesPage() {
  const hoy = new Date()
  const [año, setAño] = useState(hoy.getFullYear())
  const [mes,  setMes]  = useState(hoy.getMonth() + 1)
  const [modal, setModal] = useState(null)
  const qc = useQueryClient()

  const { data: entradas = [] } = useQuery({
    queryKey: ['cronograma', año, mes],
    queryFn: () => api.get('/cronograma', { params: { año, mes } }),
  })
  const { data: itemsMerch = [] } = useQuery({
    queryKey: ['merchandising', {}],
    queryFn: () => api.get('/merchandising'),
  })
  const marcas = [...new Set(itemsMerch.map(i => i.marca).filter(Boolean))].sort()

  const mutDelete = useMutation({
    mutationFn: id => api.delete(`/cronograma/${id}`),
    onSuccess: () => qc.invalidateQueries(['cronograma']),
  })
  const mutEstado = useMutation({
    mutationFn: ({ id, estado }) => api.patch(`/cronograma/${id}`, { estado }),
    onSuccess: () => qc.invalidateQueries(['cronograma']),
  })

  const prev = () => { if (mes===1){setAño(a=>a-1);setMes(12)} else setMes(m=>m-1) }
  const next = () => { if (mes===12){setAño(a=>a+1);setMes(1)} else setMes(m=>m+1) }

  const dias = diasDelMes(año, mes)
  const semanas = Math.ceil(dias.length / 7)
  const totalImg = entradas.reduce((s,e)=>s+(e.cantidad||0),0)
  const entregadas = entradas.filter(e=>e.estado==='entregado').reduce((s,e)=>s+(e.cantidad||0),0)

  const entradasPorSemana = (s) => entradas.filter(e => e.semana === s)

  const semLabel = (s) => {
    const semDias = dias.slice((s-1)*7, s*7).filter(Boolean)
    if (!semDias.length) return `Semana ${s}`
    return `Semana ${s} · ${semDias[0].getDate()} - ${semDias[semDias.length-1].getDate()} ${MESES[mes-1]}`
  }

  return (
    <div className="flex flex-col h-full overflow-auto bg-gray-50">
      <style>{`@media print { .no-print{display:none!important} .print-show{display:block} }`}</style>

      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between shrink-0 no-print">
        <div>
          <h1 className="font-bold text-gray-800">Cronograma de Imágenes</h1>
          <p className="text-xs text-gray-400 mt-0.5">Planificación visual semanal por marca</p>
        </div>
        <button onClick={() => window.print()}
          className="flex items-center gap-2 text-sm px-4 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
          <Printer size={15} /> PDF
        </button>
      </div>

      <div className="p-6">
        {/* Navegación */}
        <div className="flex items-center justify-between mb-5">
          <button onClick={prev} className="no-print p-2 rounded-xl hover:bg-white hover:shadow-sm transition-all border border-transparent hover:border-gray-200">
            <ChevronLeft size={20} className="text-gray-500" />
          </button>
          <div className="text-center">
            <h2 className="text-3xl font-black text-gray-800 tracking-tight">{MESES[mes-1]} {año}</h2>
            <p className="text-xs text-gray-400 mt-1">
              {totalImg} imágenes planeadas &nbsp;·&nbsp; {entregadas} entregadas
            </p>
          </div>
          <button onClick={next} className="no-print p-2 rounded-xl hover:bg-white hover:shadow-sm transition-all border border-transparent hover:border-gray-200">
            <ChevronRight size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Calendario */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Cabecera días */}
          <div className="grid grid-cols-7 border-b border-gray-100">
            {DIAS.map(d => (
              <div key={d} className="text-center py-2.5 text-xs font-bold text-gray-400 uppercase tracking-wide">
                {d}
              </div>
            ))}
          </div>

          {/* Semanas */}
          {Array.from({ length: semanas }, (_, si) => {
            const semNum = si + 1
            const semDias = dias.slice(si * 7, si * 7 + 7)
            const ents = entradasPorSemana(semNum)
            const esHoy = semDias.some(d => d && d.toDateString() === hoy.toDateString())

            return (
              <div key={si} className={`border-b border-gray-50 last:border-0 ${esHoy ? 'bg-blue-50/30' : ''}`}>
                {/* Fila de números de día */}
                <div className="grid grid-cols-7">
                  {semDias.map((d, di) => (
                    <div key={di} className={`py-2 px-2 text-right ${!d ? 'opacity-0' : ''}`}>
                      <span className={`text-sm font-semibold inline-flex w-7 h-7 items-center justify-center rounded-full ${
                        d && d.toDateString() === hoy.toDateString()
                          ? 'bg-brand text-white'
                          : 'text-gray-500'
                      }`}>
                        {d?.getDate()}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Entradas de esta semana */}
                <div className="px-3 pb-3 space-y-1.5">
                  {ents.map(e => {
                    const color = colorDeMarca(e.marca)
                    const est   = ESTADOS[e.estado] || ESTADOS.pendiente
                    const EstIcon = est.icon
                    return (
                      <div key={e._id} className={`flex items-start gap-2 ${color} text-white rounded-xl px-3 py-2 group`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-xs">{e.marca}</span>
                            <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full">{e.cantidad} img</span>
                            <button onClick={() => mutEstado.mutate({ id: e._id, estado: NEXT_ESTADO[e.estado] })}
                              className={`no-print text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 ${est.tw}`}
                              title="Clic para cambiar estado">
                              <EstIcon size={9} /> {est.label}
                            </button>
                          </div>
                          {e.productos && <p className="text-[10px] text-white/80 mt-0.5 truncate">{e.productos}</p>}
                          {e.descripcion && <p className="text-[10px] text-white/70 italic truncate">{e.descripcion}</p>}
                        </div>
                        <div className="no-print flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button onClick={() => setModal({ semana: semNum, entrada: e })}
                            className="p-1 bg-white/20 hover:bg-white/40 rounded-lg transition-colors">
                            <Pencil size={10} />
                          </button>
                          <button onClick={() => { if(confirm('¿Eliminar?')) mutDelete.mutate(e._id) }}
                            className="p-1 bg-white/20 hover:bg-red-400 rounded-lg transition-colors">
                            <Trash2 size={10} />
                          </button>
                        </div>
                      </div>
                    )
                  })}

                  {/* Botón agregar */}
                  <button onClick={() => setModal({ semana: semNum })}
                    className="no-print w-full flex items-center gap-1.5 text-[10px] text-gray-300 hover:text-brand hover:bg-brand/5 py-1 px-2 rounded-lg transition-colors">
                    <Plus size={11} /> Agregar {MESES[mes-1].toLowerCase()} semana {semNum}
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Leyenda */}
        {entradas.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2 no-print">
            {[...new Set(entradas.map(e=>e.marca))].map(m => (
              <span key={m} className={`text-xs text-white px-2.5 py-1 rounded-full font-medium ${colorDeMarca(m)}`}>{m}</span>
            ))}
          </div>
        )}

        <p className="text-center text-xs text-gray-300 mt-6">
          AGROFER CRM · Cronograma de Imágenes · {MESES[mes-1]} {año}
        </p>
      </div>

      {modal && (
        <EntradaModal
          semana={modal.semana}
          semLabel={semLabel(modal.semana)}
          año={año} mes={mes}
          entrada={modal.entrada}
          marcas={marcas}
          onClose={() => setModal(null)}
          onSave={() => qc.invalidateQueries(['cronograma'])}
        />
      )}
    </div>
  )
}
