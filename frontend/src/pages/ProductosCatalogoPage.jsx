import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, RefreshCw, Loader2, Package, Tag, BarChart2, X, ChevronLeft, ChevronRight, Filter, ImageOff } from 'lucide-react'
import api from '../services/api'

const fmt = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0)
const fmtN = (n) => new Intl.NumberFormat('es-CO').format(n || 0)

function Badge({ children, color = 'gray' }) {
  const colors = {
    green:  'bg-green-100 text-green-700',
    red:    'bg-red-100 text-red-600',
    blue:   'bg-blue-100 text-blue-700',
    gray:   'bg-gray-100 text-gray-600',
    brand:  'bg-brand/10 text-brand',
  }
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${colors[color]}`}>{children}</span>
}

function FotoThumb({ p, onClick }) {
  const [error, setError] = useState(false)
  if (!p.fotoUrl || error) {
    return <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
      <ImageOff size={14} className="text-gray-200" />
    </div>
  }
  return (
    <img src={p.fotoUrl} alt={p.codigo} onClick={onClick} onError={() => setError(true)}
      className="w-10 h-10 rounded-lg object-cover border border-gray-100 shrink-0 cursor-zoom-in hover:ring-2 hover:ring-brand/30 transition-all" />
  )
}

export default function ProductosCatalogoPage() {
  const qc = useQueryClient()
  const [search,    setSearch]    = useState('')
  const [linea,     setLinea]     = useState('')
  const [conStock,  setConStock]  = useState(false)
  const [page,      setPage]      = useState(1)
  const [syncResult, setSyncResult] = useState(null)
  const [lightbox,  setLightbox]  = useState(null)
  const LIMIT = 50

  const { data: stats } = useQuery({
    queryKey: ['productos-stats'],
    queryFn:  () => api.get('/productos-catalogo/stats'),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['productos-catalogo', search, linea, conStock, page],
    queryFn:  () => api.get(`/productos-catalogo?search=${encodeURIComponent(search)}&linea=${encodeURIComponent(linea)}&conStock=${conStock}&page=${page}&limit=${LIMIT}`),
    keepPreviousData: true,
  })

  const sync = useMutation({
    mutationFn: () => api.post('/productos-catalogo/sync', {}),
    onSuccess: (r) => {
      setSyncResult(r)
      qc.invalidateQueries(['productos-catalogo'])
      qc.invalidateQueries(['productos-stats'])
    },
    onError: (e) => alert('Error: ' + (e?.error || e?.message)),
  })

  const productos = data?.productos || []
  const total     = data?.total || 0
  const lineas    = data?.lineas || []
  const totalPages = Math.ceil(total / LIMIT)

  const handleSearch = (v) => { setSearch(v); setPage(1) }
  const handleLinea  = (v) => { setLinea(v);  setPage(1) }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 shrink-0">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center">
              <Package size={20} className="text-brand" />
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900">Catálogo de Productos</h1>
              <p className="text-xs text-gray-400">Sistema principal · {fmtN(stats?.total || 0)} productos · {stats?.totalLineas || 0} líneas</p>
            </div>
          </div>
          <button
            onClick={() => { if (confirm('¿Sincronizar productos del sistema principal?')) sync.mutate() }}
            disabled={sync.isPending}
            className="flex items-center gap-2 text-sm px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 font-medium">
            {sync.isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {sync.isPending ? 'Sincronizando…' : 'Sincronizar sistema principal'}
          </button>
        </div>

        {/* Stats rápidas */}
        {stats && (
          <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
            <span className="flex items-center gap-1.5"><Package size={11} /><strong className="text-gray-800">{fmtN(stats.total)}</strong> productos</span>
            <span className="flex items-center gap-1.5"><BarChart2 size={11} /><strong className="text-green-600">{fmtN(stats.conStock)}</strong> con stock</span>
            <span className="flex items-center gap-1.5"><Tag size={11} /><strong className="text-gray-800">{stats.totalLineas}</strong> líneas de marca</span>
          </div>
        )}
      </div>

      {/* Resultado sync */}
      {syncResult && (
        <div className="bg-green-50 border-b border-green-200 px-6 py-2.5 flex items-center justify-between shrink-0">
          <p className="text-sm text-green-800">
            ✅ Sincronización completada — <strong>{fmtN(syncResult.total)}</strong> productos ·
            <strong> {syncResult.creados}</strong> nuevos · <strong>{syncResult.actualizados}</strong> actualizados
          </p>
          <button onClick={() => setSyncResult(null)} className="text-green-500 hover:text-green-700"><X size={14} /></button>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center gap-3 flex-wrap shrink-0">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
          <input value={search} onChange={e => handleSearch(e.target.value)}
            placeholder="Buscar por nombre, código o referencia…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-brand" />
        </div>

        <select value={linea} onChange={e => handleLinea(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-brand min-w-40">
          <option value="">Todas las líneas</option>
          {lineas.map(l => <option key={l} value={l}>{l}</option>)}
        </select>

        <button onClick={() => { setConStock(v => !v); setPage(1) }}
          className={`flex items-center gap-2 text-sm px-3 py-2 rounded-xl border font-medium transition-colors ${
            conStock ? 'bg-green-500 text-white border-green-500' : 'border-gray-200 text-gray-500 hover:border-green-300'
          }`}>
          <Filter size={13} /> Con stock
        </button>

        {(search || linea || conStock) && (
          <button onClick={() => { setSearch(''); setLinea(''); setConStock(false); setPage(1) }}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors">
            <X size={12} /> Limpiar
          </button>
        )}

        <p className="text-xs text-gray-400 ml-auto">{fmtN(total)} resultado{total !== 1 ? 's' : ''}</p>
      </div>

      {/* Tabla */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-gray-300" /></div>
        ) : !productos.length ? (
          <div className="flex flex-col items-center py-20 text-gray-400">
            <Package size={40} className="opacity-20 mb-3" />
            <p className="text-sm">{stats?.total ? 'Sin resultados para ese filtro' : 'Sin productos — sincroniza primero'}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 w-14">Foto</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 w-28">Código</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Descripción</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 hidden md:table-cell">Línea</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">Precio</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 hidden sm:table-cell">IVA</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">Stock</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 hidden lg:table-cell">Margen</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 hidden xl:table-cell">Unidad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {productos.map(p => (
                <tr key={p._id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <FotoThumb p={p} onClick={() => p.fotoUrl && setLightbox(p)} />
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-xs font-mono font-semibold text-gray-700">{p.codigo}</p>
                      {p.referencia !== p.codigo && <p className="text-[10px] text-gray-400">{p.referencia}</p>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800 leading-tight">{p.descripcion}</p>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <Badge color="blue">{p.linea}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <p className="font-bold text-gray-900">{fmt(p.precio)}</p>
                  </td>
                  <td className="px-4 py-3 text-center hidden sm:table-cell">
                    <span className="text-xs text-gray-500">{p.iva}%</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Badge color={p.existencia > 0 ? 'green' : 'red'}>
                      {fmtN(p.existencia)} {p.unidad}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-center hidden lg:table-cell">
                    <span className={`text-xs font-bold ${p.porcUtilidad >= 30 ? 'text-green-600' : p.porcUtilidad >= 15 ? 'text-amber-600' : 'text-red-500'}`}>
                      {p.porcUtilidad?.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden xl:table-cell">
                    <span className="text-xs text-gray-400">{p.unidad}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="bg-white border-t border-gray-100 px-6 py-3 flex items-center justify-between shrink-0">
          <p className="text-xs text-gray-400">Página {page} de {totalPages} · {fmtN(total)} productos</p>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
              className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:border-brand/40 disabled:opacity-30 transition-colors">
              <ChevronLeft size={14} />
            </button>
            <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
              className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:border-brand/40 disabled:opacity-30 transition-colors">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {lightbox && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setLightbox(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div>
                <p className="text-sm font-bold text-gray-800">{lightbox.codigo}</p>
                <p className="text-xs text-gray-400">{lightbox.descripcion}</p>
              </div>
              <button onClick={() => setLightbox(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <img src={lightbox.fotoUrl} alt={lightbox.codigo} className="w-full max-h-[70vh] object-contain bg-gray-50" />
          </div>
        </div>
      )}
    </div>
  )
}
