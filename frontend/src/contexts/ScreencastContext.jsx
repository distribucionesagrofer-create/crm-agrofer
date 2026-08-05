import { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react'
import api from '../services/api'
import { socket } from '../services/socket'

// Vive en Layout (nunca se desmonta al navegar entre módulos) para que "Ver en vivo"
// siga transmitiendo aunque el admin se vaya a otra página — solo se corta con "Finalizar"
// o si arranca una vista en vivo de OTRA línea (una a la vez).
const ScreencastContext = createContext(null)

export function ScreencastProvider({ children }) {
  const [vendedorId, setVendedorId]         = useState(null)
  const [vendedorNombre, setVendedorNombre] = useState('')
  const [activo, setActivo]                 = useState(false)
  const [frame, setFrame]                   = useState(null)

  const activoRef = useRef(false)
  const vendedorIdRef = useRef(null)
  useEffect(() => { activoRef.current = activo; vendedorIdRef.current = vendedorId }, [activo, vendedorId])

  useEffect(() => {
    // El socket puede seguir siendo miembro de la sala `vendedor:X` de una línea que ya no
    // se está viendo (join:vendedor también lo usa el inbox, y nunca se hace leave al
    // cambiar) — sin este filtro por tenantId, un frame tardío de otra línea podía mezclarse
    // con lo que el admin está viendo ahora mismo.
    const onFrame = (data) => {
      if (data.tenantId && data.tenantId !== vendedorIdRef.current) return
      setFrame(`data:image/jpeg;base64,${data.data}`)
    }
    socket.on('screencast:frame', onFrame)
    return () => socket.off('screencast:frame', onFrame)
  }, [])

  useEffect(() => {
    if (vendedorId) socket.emit('join:vendedor', vendedorId)
  }, [vendedorId])

  const iniciar = useCallback(async (id, nombre) => {
    // Solo una línea a la vez — si ya había otra activa, se corta antes de arrancar la nueva.
    if (activoRef.current && vendedorIdRef.current && vendedorIdRef.current !== id) {
      await api.post(`/vendedores/${vendedorIdRef.current}/screencast/detener`).catch(() => {})
    }
    setFrame(null)
    setVendedorId(id)
    setVendedorNombre(nombre)
    const r = await api.post(`/vendedores/${id}/screencast/iniciar`)
    if (r.ok) setActivo(true)
    return r
  }, [])

  const finalizar = useCallback(async () => {
    const id = vendedorIdRef.current
    setActivo(false)
    setFrame(null)
    if (id) await api.post(`/vendedores/${id}/screencast/detener`).catch(() => {})
  }, [])

  return (
    <ScreencastContext.Provider value={{ vendedorId, vendedorNombre, activo, frame, iniciar, finalizar }}>
      {children}
    </ScreencastContext.Provider>
  )
}

export function useScreencast() {
  return useContext(ScreencastContext)
}
