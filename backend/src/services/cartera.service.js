// Cartera (facturas pendientes) de un cliente, vía Sistema Principal — reutiliza el
// mismo `spPost`/lista de vendedores que ya usa Análisis Comercial.
const { spPost, VENDEDORES } = require('./sistema-principal.service')

// Trae las facturas pendientes de un cliente. Requiere que el Customer tenga
// idSistemaPrincipal (su id en el sistema externo) y teridVendedor (para resolver
// las credenciales vendedor_id/usuario_id que exige la API — la cartera se consulta
// "a través" del vendedor asignado al cliente, no hay una vía cliente-directo).
async function obtenerCartera(customer) {
  if (!customer.idSistemaPrincipal) {
    throw new Error('Este cliente no tiene id de Sistema Principal — no se puede consultar su cartera')
  }
  const vendedor = VENDEDORES.find(v => v.terid === customer.teridVendedor)
  if (!vendedor) {
    throw new Error('No se encontró el vendedor de Sistema Principal asociado a este cliente')
  }

  const resp = await spPost({
    action:      'get_cartera',
    vendedor_id: String(vendedor.terid),
    usuario_id:  String(vendedor.uid),
    perfil:      'Vendedor',
    ano:         new Date().getFullYear(),
    offset:      0,
    cliente_id:  customer.idSistemaPrincipal,
  })
  if (!resp?.ok) throw new Error(resp?.message || 'Error consultando cartera en Sistema Principal')

  const facturas = (resp.data || []).map(f => ({
    documento: f.DOCUMENTO || '',
    detalle:   f.DETALLE || '',
    fecha:     (f.FECHA || '').slice(0, 10),
    vence:     (f.FECVENCE || '').slice(0, 10),
    diasVcto:  Number(f.DIASVCTO) || 0,
    valor:     Number(f.VALOR) || 0,
    saldo:     Number(f.SALDO) || 0,
  }))
  const total = facturas.reduce((s, f) => s + f.saldo, 0)

  return { facturas, total }
}

module.exports = { obtenerCartera }
