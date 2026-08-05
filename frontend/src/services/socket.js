import { io } from 'socket.io-client'

export const socket = io({ autoConnect: true })

export function joinVendedor(vendedorId) {
  socket.emit('join:vendedor', vendedorId)
}
