import { useLocation, useNavigate } from 'react-router-dom'
import { Loader2, Square, Maximize2 } from 'lucide-react'
import { useScreencast } from '../contexts/ScreencastContext'

// Miniatura de solo-lectura (sin clic/scroll) que sigue visible mientras el admin navega
// a otro módulo — la vista completa e interactiva vive en VendedorDetailPage ("Ver en vivo").
export default function FloatingScreencast() {
  const { vendedorId, vendedorNombre, activo, frame, finalizar } = useScreencast()
  const location = useLocation()
  const navigate = useNavigate()

  if (!activo) return null
  // Ya se está mostrando en grande en la pestaña "Ver en vivo" de esa misma línea — no duplicar.
  if (location.pathname === `/vendedores/${vendedorId}`) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 w-64 bg-gray-900 rounded-xl shadow-2xl border border-gray-700 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800">
        <span className="text-[11px] text-gray-300 flex items-center gap-1.5 truncate">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
          <span className="truncate">{vendedorNombre || 'En vivo'}</span>
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => navigate(`/vendedores/${vendedorId}`, { state: { tab: 'vivo' } })}
            title="Ver completo" className="p-1 text-gray-300 hover:text-white transition-colors">
            <Maximize2 size={12} />
          </button>
          <button onClick={finalizar} title="Finalizar" className="p-1 text-gray-300 hover:text-red-400 transition-colors">
            <Square size={12} />
          </button>
        </div>
      </div>
      <div className="aspect-video flex items-center justify-center bg-black">
        {frame ? (
          <img src={frame} alt="WhatsApp en vivo" className="w-full h-full object-contain" />
        ) : (
          <Loader2 size={18} className="animate-spin text-gray-500" />
        )}
      </div>
    </div>
  )
}
