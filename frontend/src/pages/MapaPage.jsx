import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MapContainer, TileLayer, Marker, Popup, Polygon, LayersControl, CircleMarker, useMap } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import { Map, Users, Search, X, ChevronRight, MapPin, Phone, Building2, Layers, Flame, Navigation } from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import L from 'leaflet'
import api from '../services/api'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// Un solo color para todos los vendedores — con paleta por vendedor, filtrar por uno
// específico podía tocarte un color poco visible en el mapa (ej. amarillo claro).
// Mono-color: se ve igual de bien sin importar a quién filtres.
const COLOR_UNICO = '#DC2626'

const ZONAS_COORDS = {
  'CENTRO CUCUTA':    [[7.9005,-72.5110],[7.9005,-72.4950],[7.8880,-72.4950],[7.8880,-72.5110]],
  'ATALAYA':          [[7.9160,-72.5310],[7.9160,-72.5080],[7.9020,-72.5080],[7.9020,-72.5310]],
  'AEROPUERTO':       [[7.9320,-72.5180],[7.9320,-72.4950],[7.9170,-72.4950],[7.9170,-72.5180]],
  'GUIMARAL':         [[7.8820,-72.5350],[7.8820,-72.5100],[7.8650,-72.5100],[7.8650,-72.5350]],
  'REGION NORTE':     [[7.9650,-72.5250],[7.9650,-72.4870],[7.9350,-72.4870],[7.9350,-72.5250]],
  'REGION ORIENTE':   [[7.8980,-72.4920],[7.8980,-72.4600],[7.8720,-72.4600],[7.8720,-72.4920]],
  'REGION OCCIDENTE': [[7.8980,-72.5450],[7.8980,-72.5130],[7.8720,-72.5130],[7.8720,-72.5450]],
  'PATIOS / VILLA DEL ROSARIO / LIBERTAD': [[7.8560,-72.4950],[7.8560,-72.4520],[7.8150,-72.4520],[7.8150,-72.4950]],
  'MOSTRADOR SEDE':   [[7.8960,-72.5090],[7.8960,-72.5000],[7.8880,-72.5000],[7.8880,-72.5090]],
}

// Pin estilo Google Maps (gota con punta abajo) en vez de un punto plano — mismo
// color para todos (ver COLOR_UNICO), solo cambia el tamaño y si está destacado.
function makeIcon(color, size, selected) {
  const w = size, h = Math.round(size * 1.35)
  const strokeW = selected ? 2.5 : 1.5
  // Destacado: pulso continuo desde la punta (el ancla real del pin), no desde el
  // centro del SVG, para que "lata" en su sitio en vez de flotar hacia un lado.
  const animStyle = selected ? 'animation:pin-pulse 1s ease-in-out infinite;transform-origin:bottom center;' : ''
  const html = `
    <svg width="${w}" height="${h}" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg"
      style="filter:drop-shadow(0 2px 4px rgba(0,0,0,.45));transition:width .2s,height .2s;${animStyle}">
      <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20c0-6.6-5.4-12-12-12z"
        fill="${color}" stroke="white" stroke-width="${strokeW}" />
      <circle cx="12" cy="12" r="4.5" fill="white" />
    </svg>`
  return L.divIcon({
    className: '',
    html,
    iconSize: [w, h],
    iconAnchor: [w / 2, h],
    popupAnchor: [0, -h + 4],
  })
}

// Encuadra TODOS los clientes del vendedor seleccionado — antes volaba a un punto fijo
// con zoom fijo (14), y si los clientes de ese vendedor están regados en un territorio
// grande, ese punto medio podía caer en tierra vacía sin ningún cliente cerca. Con
// fitBounds el mapa se ajusta solo (haciendo zoom out si hace falta) para que todos los
// puntos queden visibles a la vez.
function FlyToVendor({ clientes }) {
  const map = useMap()
  useEffect(() => {
    if (!clientes.length) return
    if (clientes.length === 1) {
      map.flyTo([clientes[0].lat, clientes[0].lng], 15, { duration: 1.2 })
      return
    }
    const bounds = L.latLngBounds(clientes.map(c => [c.lat, c.lng]))
    map.flyToBounds(bounds, { padding: [60, 60], duration: 1.2, maxZoom: 15 })
  }, [clientes])
  return null
}

// Volar directo al cliente seleccionado en la lista — antes, hacer clic en un cliente
// solo abría su ficha, el mapa se quedaba en el centro de TODOS los clientes del
// vendedor (que puede caer lejos si están dispersos, dando la sensación de que
// "manda a cualquier lado").
function FlyToCliente({ cliente }) {
  const map = useMap()
  useEffect(() => {
    if (!cliente?.lat || !cliente?.lng) return
    map.flyTo([cliente.lat, cliente.lng], 17, { duration: 1 })
  }, [cliente?._id])
  return null
}

function HeatLayer({ clientes, coloresMap }) {
  return clientes.filter(c => c.lat && c.lng).map(c => {
    const color = coloresMap[c.vendedorId?._id || c.vendedorId] || '#6b7280'
    return <CircleMarker key={`h-${c._id}`} center={[c.lat, c.lng]} radius={22}
      pathOptions={{ color: 'none', fillColor: color, fillOpacity: 0.07 }} />
  })
}

export default function MapaPage() {
  const [vendedorActivo, setVendedorActivo] = useState(null)
  const [vista,          setVista]          = useState('mapa')
  const [mostrarZonas,   setMostrarZonas]   = useState(true)
  const [mostrarHeat,    setMostrarHeat]    = useState(false)
  const [busqueda,       setBusqueda]       = useState('')
  const [clienteDetalle, setClienteDetalle] = useState(null)

  const { data: vData } = useQuery({ queryKey: ['vendedores-lista'], queryFn: () => api.get('/vendedores') })
  const { data: cData } = useQuery({ queryKey: ['clientes-mapa'],    queryFn: () => api.get('/clientes?limit=5000'), staleTime: 60_000 })

  const vendedores  = (vData?.vendedores || []).filter(v => v.slug !== 'linea-principal' && v.slug !== 'mercadeo-y-publicidad' && v.activo !== false)
  const clientes    = cData?.customers || []
  // Memoizado — si no, es una referencia nueva en cada render y el fitBounds de
  // FlyToVendor (que depende de esta lista) se re-dispararía constantemente
  // (ej. al escribir en el buscador), moviendo el mapa solo sin que el usuario pida nada.
  const conCoords   = useMemo(() => clientes.filter(c => c.lat && c.lng), [clientes])

  // Mapa color por vendedor ID — todos el mismo color (ver COLOR_UNICO)
  const coloresMap = useMemo(() => {
    const m = {}
    vendedores.forEach(v => { m[v._id] = COLOR_UNICO })
    return m
  }, [vendedores])

  const statsPorVend = useMemo(() => vendedores.map(v => ({
    ...v,
    color:     coloresMap[v._id],
    cnt:       clientes.filter(c => (c.vendedorId?._id || c.vendedorId) === v._id).length,
    cntCoords: conCoords.filter(c => (c.vendedorId?._id || c.vendedorId) === v._id).length,
  })).sort((a, b) => b.cnt - a.cnt), [vendedores, clientes, conCoords, coloresMap])

  const vendedorInfo = vendedorActivo ? statsPorVend.find(v => v._id === vendedorActivo) : null

  const clientesFiltrados = useMemo(() => {
    const base = vendedorActivo
      ? conCoords.filter(c => (c.vendedorId?._id || c.vendedorId) === vendedorActivo)
      : conCoords
    if (!busqueda.trim()) return base
    const q = busqueda.toLowerCase()
    return base.filter(c => c.name?.toLowerCase().includes(q) || c.empresa?.toLowerCase().includes(q) || c.barrio?.toLowerCase().includes(q))
  }, [conCoords, vendedorActivo, busqueda])

  // Clientes del vendedor activo para la lista sidebar — busca por nombre, empresa,
  // barrio o teléfono (antes solo comparaba nombre/empresa, así que buscar por
  // cualquier otro dato no encontraba al cliente aunque sí estuviera en la lista).
  const clientesVendedor = useMemo(() => {
    if (!vendedorActivo) return []
    const q = busqueda.toLowerCase().trim()
    return clientes
      .filter(c => (c.vendedorId?._id || c.vendedorId) === vendedorActivo)
      .filter(c => !q
        || c.name?.toLowerCase().includes(q)
        || c.empresa?.toLowerCase().includes(q)
        || c.barrio?.toLowerCase().includes(q)
        || c.phone?.includes(q))
  }, [clientes, vendedorActivo, busqueda])

  const seleccionar = (id) => {
    setVendedorActivo(prev => prev === id ? null : id)
    setBusqueda('')
    setClienteDetalle(null)
  }

  return (
    <div className="flex flex-1 min-h-0">

      {/* ── Sidebar ── */}
      <div className="w-72 shrink-0 border-r border-gray-100 flex flex-col bg-white overflow-hidden">

        {/* Header */}
        <div className="px-4 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2 mb-0.5">
            <Map size={16} className="text-brand" />
            <h2 className="font-bold text-sm text-gray-900">Mapa de clientes</h2>
          </div>
          <p className="text-xs text-gray-400">Cúcuta · {conCoords.length} ubicados de {clientes.length}</p>

          {/* Tabs */}
          <div className="flex gap-1 mt-3">
            {[['mapa','🗺 Mapa'],['lista','📋 Por zona']].map(([v,l]) => (
              <button key={v} onClick={() => setVista(v)}
                className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition-colors ${vista === v ? 'bg-brand text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                {l}
              </button>
            ))}
          </div>

          {/* Controles de capas */}
          <div className="flex gap-1.5 mt-2">
            <button onClick={() => setMostrarZonas(v => !v)}
              className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg transition-colors ${mostrarZonas ? 'bg-brand/10 text-brand font-medium' : 'bg-gray-100 text-gray-400'}`}>
              <Layers size={10} /> Zonas
            </button>
            <button onClick={() => setMostrarHeat(v => !v)}
              className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg transition-colors ${mostrarHeat ? 'bg-orange-100 text-orange-600 font-medium' : 'bg-gray-100 text-gray-400'}`}>
              <Flame size={10} /> Calor
            </button>
          </div>
        </div>

        {/* Panel vendedor activo */}
        {vendedorInfo ? (
          <div className="shrink-0">
            {/* Header vendedor seleccionado */}
            <div className="px-4 py-3 border-b" style={{ borderLeftWidth: 4, borderLeftColor: vendedorInfo.color, background: `${vendedorInfo.color}0d` }}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-black text-gray-800">{vendedorInfo.nombre.split(' ').slice(0,2).join(' ')}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{vendedorInfo.zona || 'Sin zona'}</p>
                </div>
                <button onClick={() => seleccionar(vendedorInfo._id)} className="text-gray-300 hover:text-gray-500 mt-0.5">
                  <X size={14} />
                </button>
              </div>
              <div className="flex gap-3 mt-2">
                <div className="text-center">
                  <p className="text-lg font-black" style={{ color: vendedorInfo.color }}>{vendedorInfo.cnt}</p>
                  <p className="text-[9px] text-gray-400">clientes</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-black text-brand">{vendedorInfo.cntCoords}</p>
                  <p className="text-[9px] text-gray-400">ubicados</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-black text-gray-400">{vendedorInfo.cnt - vendedorInfo.cntCoords}</p>
                  <p className="text-[9px] text-gray-400">sin ubicar</p>
                </div>
              </div>
            </div>

            {/* Buscador dentro del vendedor */}
            <div className="px-3 py-2 border-b border-gray-100">
              <div className="relative">
                <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300" />
                <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                  placeholder="Buscar cliente…"
                  className="w-full pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:border-brand" />
                {busqueda && <button onClick={() => setBusqueda('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"><X size={11} /></button>}
              </div>
            </div>

            {/* Lista clientes del vendedor */}
            <div className="flex-1 overflow-y-auto" style={{ maxHeight: 320 }}>
              {clientesVendedor.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">Sin clientes</p>
              ) : clientesVendedor.map(c => (
                <button key={c._id} onClick={() => setClienteDetalle(c === clienteDetalle ? null : c)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left border-b border-gray-50 hover:bg-gray-50 transition-colors ${clienteDetalle?._id === c._id ? 'bg-brand/5' : ''}`}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                    style={{ background: vendedorInfo.color }}>
                    {c.name?.[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800 truncate">{c.name}</p>
                    {c.empresa && <p className="text-[10px] text-gray-400 truncate">{c.empresa}</p>}
                  </div>
                  {c.lat && c.lng
                    ? <MapPin size={11} className="shrink-0 text-brand" />
                    : <MapPin size={11} className="shrink-0 text-gray-200" />}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Lista todos los vendedores */
          <div className="flex-1 overflow-y-auto px-3 py-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide px-1 mb-2">Filtrar por vendedor</p>

            {/* Todos */}
            <button onClick={() => seleccionar(null)}
              className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center justify-between mb-1 bg-brand/10 text-brand">
              <span>Todos los vendedores</span>
              <span className="font-black">{conCoords.length}</span>
            </button>

            {statsPorVend.map(v => (
              <button key={v._id} onClick={() => seleccionar(v._id)}
                className="w-full text-left px-3 py-2.5 rounded-xl text-xs transition-all flex items-center gap-2.5 hover:bg-gray-50 mb-0.5 group">
                {/* Indicador color */}
                <div className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm" style={{ background: v.color }} />
                <span className="flex-1 font-semibold text-gray-700 truncate group-hover:text-gray-900">{v.nombre.split(' ')[0]}</span>
                {/* Barra proporcional */}
                <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden shrink-0">
                  <div className="h-full rounded-full" style={{ width: `${Math.round((v.cntCoords / Math.max(conCoords.length, 1)) * 100)}%`, background: v.color }} />
                </div>
                <span className="text-[11px] font-black text-gray-500 w-6 text-right shrink-0">{v.cntCoords}</span>
                {/* Estado WhatsApp */}
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${v.whatsapp?.status === 'connected' ? 'bg-green-500' : 'bg-gray-200'}`} />
                <ChevronRight size={11} className="text-gray-300 group-hover:text-brand shrink-0" />
              </button>
            ))}
          </div>
        )}

        {/* Footer stats */}
        <div className="px-4 py-3 border-t border-gray-100 shrink-0">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-sm font-black text-gray-800">{clientes.length}</p>
              <p className="text-[10px] text-gray-400">Total</p>
            </div>
            <div>
              <p className="text-sm font-black text-brand">{conCoords.length}</p>
              <p className="text-[10px] text-gray-400">Ubicados</p>
            </div>
            <div>
              <p className="text-sm font-black text-amber-500">{clientes.length - conCoords.length}</p>
              <p className="text-[10px] text-gray-400">Sin ubicar</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Mapa / Lista ── */}
      <div className="flex-1 relative overflow-hidden">
        {vista === 'mapa' && (
          <MapContainer center={[7.893, -72.505]} zoom={13} style={{ height: '100%', width: '100%' }}>
            <LayersControl position="topright">
              <LayersControl.BaseLayer checked name="Estándar">
                <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name="Satélite">
                <TileLayer attribution='&copy; Esri' url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
              </LayersControl.BaseLayer>
            </LayersControl>

            {/* Encuadre automático: todos los clientes del vendedor activo, o —al volver
                a "Todos los vendedores"— todos los clientes ubicados en general. Antes
                solo pasaba con un vendedor seleccionado; volver a "Todos" dejaba el mapa
                en el zoom/posición que hubiera quedado, sin regresar a la vista general. */}
            {!clienteDetalle && (vendedorActivo ? clientesFiltrados : conCoords).length > 0 && (
              <FlyToVendor clientes={vendedorActivo ? clientesFiltrados : conCoords} />
            )}

            {/* Fly directo al cliente que se clickeó en la lista */}
            {clienteDetalle && <FlyToCliente cliente={clienteDetalle} />}

            {/* Heat layer */}
            {mostrarHeat && <HeatLayer clientes={conCoords} coloresMap={coloresMap} />}

            {/* Polígonos de zonas */}
            {mostrarZonas && vendedores.map(v => {
              const coords = ZONAS_COORDS[v.zona]
              if (!coords) return null
              const color  = coloresMap[v._id]
              const activo = !vendedorActivo || vendedorActivo === v._id
              return (
                <Polygon key={v._id} positions={coords}
                  pathOptions={{ color, fillColor: color, fillOpacity: activo ? 0.14 : 0.02, opacity: activo ? 0.8 : 0.1, weight: activo ? 2 : 1 }}>
                  <Popup><div className="text-xs font-bold">{v.nombre}<br/><span className="font-normal text-gray-500">{v.zona}</span></div></Popup>
                </Polygon>
              )
            })}

            {/* Marcadores — agrupados (cluster) para no dibujar cientos de pines sueltos
                a la vez, que es lo que hacía lento el mapa con muchos clientes visibles. */}
            <MarkerClusterGroup chunkedLoading maxClusterRadius={60} spiderfyOnMaxZoom disableClusteringAtZoom={16}>
            {conCoords.map(c => {
              const vidStr  = c.vendedorId?._id || c.vendedorId
              const color   = coloresMap[vidStr] || '#9ca3af'
              const esActivo = !vendedorActivo || vidStr === vendedorActivo
              const esDestacado = clienteDetalle?._id === c._id

              // Ocultar completamente los no activos cuando hay filtro
              if (vendedorActivo && !esActivo) return null

              const size    = esDestacado ? 18 : esActivo ? 12 : 8
              const opacity = esActivo ? 1 : 0

              return (
                <Marker key={c._id} position={[c.lat, c.lng]}
                  icon={makeIcon(color, size, esDestacado)}
                  opacity={opacity}
                  zIndexOffset={esDestacado ? 1000 : esActivo ? 100 : 0}>
                  <Popup maxWidth={260} className="cliente-popup">
                    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '4px 0' }}>
                      {/* Header con color del vendedor */}
                      <div style={{ background: color, borderRadius: '8px 8px 0 0', margin: '-6px -12px 8px', padding: '10px 12px' }}>
                        <p style={{ color: 'white', fontWeight: 800, fontSize: 13, margin: 0 }}>{c.name}</p>
                        {c.empresa && <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, margin: '2px 0 0' }}>{c.empresa}</p>}
                      </div>
                      {/* Info */}
                      <div style={{ fontSize: 11, color: '#374151' }}>
                        {(c.barrio || c.ciudad) && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <span>📍</span>
                            <span>{[c.barrio, c.ciudad].filter(Boolean).join(', ')}</span>
                          </div>
                        )}
                        {c.phone && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <span>📱</span>
                            <span style={{ fontFamily: 'monospace' }}>{c.phone}</span>
                          </div>
                        )}
                        {c.sector && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span>🏪</span>
                            <span>{c.sector}</span>
                          </div>
                        )}
                      </div>
                      {/* Vendedor */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, paddingTop: 8, borderTop: '1px solid #f3f4f6' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                        <span style={{ fontSize: 10, color: '#6b7280' }}>
                          {vendedores.find(v => v._id === vidStr)?.nombre || '—'}
                        </span>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              )
            })}
            </MarkerClusterGroup>
          </MapContainer>
        )}

        {/* Vista lista por zona */}
        {vista === 'lista' && (
          <div className="h-full overflow-y-auto p-5 space-y-3 bg-gray-50">
            {statsPorVend.map(v => {
              const clis    = clientes.filter(c => (c.vendedorId?._id || c.vendedorId) === v._id)
              const ubicados = clis.filter(c => c.lat && c.lng).length
              return (
                <div key={v._id} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100">
                  <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderLeft: `5px solid ${v.color}` }}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-sm shrink-0"
                      style={{ background: v.color }}>
                      {v.nombre[0]}
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-sm text-gray-800">{v.nombre.split(' ').slice(0,2).join(' ')}</p>
                      <p className="text-xs text-gray-400">{v.zona || 'Sin zona asignada'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-black" style={{ color: v.color }}>{clis.length}</p>
                      <p className="text-[10px] text-gray-400">{ubicados} ubicados</p>
                    </div>
                    <div className={`w-2 h-2 rounded-full ${v.whatsapp?.status === 'connected' ? 'bg-green-500' : 'bg-gray-200'}`} />
                  </div>

                  {/* Barra de progreso ubicación */}
                  <div className="px-4 pb-2 pt-1">
                    <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${clis.length ? (ubicados/clis.length)*100 : 0}%`, background: v.color }} />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">{clis.length ? Math.round((ubicados/clis.length)*100) : 0}% ubicados</p>
                  </div>

                  {clis.length > 0 && (
                    <div className="divide-y divide-gray-50 border-t border-gray-100 max-h-52 overflow-y-auto">
                      {clis.slice(0, 25).map(c => (
                        <div key={c._id} className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 transition-colors">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                            style={{ background: v.color }}>
                            {c.name?.[0]?.toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-gray-700 truncate">{c.name}</p>
                            {c.empresa && <p className="text-[10px] text-gray-400 truncate">{c.empresa}</p>}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {c.phone && <span className="text-[9px] text-gray-400 font-mono hidden sm:block">{c.phone}</span>}
                            {c.lat && c.lng
                              ? <MapPin size={11} style={{ color: v.color }} />
                              : <MapPin size={11} className="text-gray-200" />}
                          </div>
                        </div>
                      ))}
                      {clis.length > 25 && (
                        <p className="text-xs text-gray-400 text-center py-2 bg-gray-50">
                          +{clis.length - 25} clientes más
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Badge info */}
        {vendedorActivo && vendedorInfo && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 bg-white/95 backdrop-blur border shadow-lg text-xs px-3 py-1.5 rounded-full pointer-events-none"
            style={{ borderColor: vendedorInfo.color }}>
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: vendedorInfo.color }} />
            <span className="font-bold text-gray-800">{vendedorInfo.nombre.split(' ')[0]}</span>
            <span className="text-gray-400">·</span>
            <span style={{ color: vendedorInfo.color }} className="font-bold">{clientesFiltrados.length} clientes</span>
          </div>
        )}
      </div>
    </div>
  )
}
