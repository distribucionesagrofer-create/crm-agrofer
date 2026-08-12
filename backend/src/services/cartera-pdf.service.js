const PDFDocument = require('pdfkit')
const path = require('path')
const fs   = require('fs')

const LOGO_PATH = path.join(__dirname, '../assets/agrofer-logo.png')
const AZUL   = '#1e3a8a'
const AZUL2  = '#2563eb'
const GRIS   = '#6b7280'
const ROJO   = '#dc2626'

function fmtMoney(n) {
  return '$' + Math.round(n).toLocaleString('es-CO')
}
function fmtFecha(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// Genera el PDF de estado de cartera de un cliente — devuelve un Buffer.
function generarCarteraPDF(customer, { facturas, total }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 })
    const chunks = []
    doc.on('data', c => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    // Header
    if (fs.existsSync(LOGO_PATH)) {
      doc.image(LOGO_PATH, 50, 45, { width: 110 })
    }
    doc.fontSize(18).fillColor(AZUL).font('Helvetica-Bold')
      .text('Estado de Cartera', 0, 55, { align: 'right' })
    doc.fontSize(9).fillColor(GRIS).font('Helvetica')
      .text(`Generado el ${new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}`, { align: 'right' })

    doc.moveTo(50, 105).lineTo(545, 105).strokeColor('#e5e7eb').lineWidth(1).stroke()

    // Datos del cliente
    let y = 125
    doc.fontSize(11).fillColor('#111827').font('Helvetica-Bold').text(customer.name || 'Cliente', 50, y)
    y += 18
    doc.fontSize(9).fillColor(GRIS).font('Helvetica')
    const lineas = []
    if (customer.nit) lineas.push(`NIT: ${customer.nit}`)
    if (customer.phone) lineas.push(`Tel: ${customer.phone}`)
    if (customer.ciudad || customer.direccion) lineas.push([customer.direccion, customer.ciudad].filter(Boolean).join(', '))
    for (const l of lineas) { doc.text(l, 50, y); y += 14 }

    y += 10
    // Tabla — encabezado
    const colX = { doc: 50, fecha: 190, vence: 260, dias: 330, valor: 390, saldo: 470 }
    doc.rect(50, y, 495, 22).fill('#f3f4f6')
    doc.fontSize(8.5).fillColor('#374151').font('Helvetica-Bold')
    doc.text('DOCUMENTO', colX.doc + 6, y + 7)
    doc.text('FECHA', colX.fecha, y + 7)
    doc.text('VENCE', colX.vence, y + 7)
    doc.text('DÍAS', colX.dias, y + 7)
    doc.text('VALOR', colX.valor, y + 7, { width: 70, align: 'right' })
    doc.text('SALDO', colX.saldo, y + 7, { width: 65, align: 'right' })
    y += 22

    // Filas
    doc.font('Helvetica').fontSize(8.5)
    for (const f of facturas) {
      if (y > 740) { doc.addPage(); y = 50 }
      const vencida = f.diasVcto > 0
      doc.font('Helvetica').fillColor('#111827').text(f.documento, colX.doc + 6, y + 6, { width: 130 })
      doc.fillColor(GRIS).text(fmtFecha(f.fecha), colX.fecha, y + 6)
      doc.fillColor(GRIS).text(fmtFecha(f.vence), colX.vence, y + 6)
      doc.fillColor(vencida ? ROJO : GRIS).font(vencida ? 'Helvetica-Bold' : 'Helvetica')
        .text(vencida ? `${f.diasVcto}d vencida` : `${Math.abs(f.diasVcto)}d`, colX.dias, y + 6, { width: 55 })
      doc.font('Helvetica').fillColor('#111827')
        .text(fmtMoney(f.valor), colX.valor, y + 6, { width: 70, align: 'right' })
      doc.font('Helvetica-Bold').fillColor(AZUL2)
        .text(fmtMoney(f.saldo), colX.saldo, y + 6, { width: 65, align: 'right' })
      y += 24
      doc.moveTo(50, y).lineTo(545, y).strokeColor('#f0f0f0').lineWidth(0.5).stroke()
    }

    if (!facturas.length) {
      doc.fontSize(10).fillColor(GRIS).text('Este cliente no tiene facturas pendientes.', 50, y + 15)
      y += 40
    }

    // Total
    y += 15
    doc.rect(345, y, 200, 34).fill(AZUL)
    doc.fontSize(10).fillColor('white').font('Helvetica-Bold')
      .text('TOTAL PENDIENTE', 355, y + 7)
    doc.fontSize(13).text(fmtMoney(total), 345, y + 18, { width: 190, align: 'right' })

    // Footer
    doc.fontSize(8).fillColor(GRIS).font('Helvetica')
      .text('AGROFER — Calle 6 # 7-61, Barrio Centro, Cúcuta, Norte de Santander, Colombia', 50, 780, { align: 'center', width: 495 })

    doc.end()
  })
}

module.exports = { generarCarteraPDF }
