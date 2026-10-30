import { reportingInvoices, type SalesSource } from './source'
import { classifyMarketingInvoice } from '@/lib/marketing/channel-reconciliation'
import { marketingProductItems } from '@/lib/marketing/siigo-sales'

export interface AccountingRow { row: number; document: string; date: string; channel: string; units: number; sales: number }
export interface AccountingMonth { month: string; modelUnits: number; modelSales: number; accountingSales: number; containsBudget: boolean }
export interface AccountingReview { months: AccountingMonth[]; detailPeriod: { start: string; end: string }; detail: AccountingRow[] }
const unitsOf = (row: { items?: Array<{ quantity?: number | null }> }) => (row.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0)

/** Compare safe document identifiers and commercial figures; never export customer data or notes. */
export function reconcileAccounting(source: SalesSource, book: AccountingReview) {
  const published = reportingInvoices(source)
  const inRange = (date: string, start: string, end: string) => date >= start && date <= end
  const monthly = book.months.map(month => {
    const selected = published.filter(row => row.date.startsWith(month.month))
    const units = selected.reduce((sum, row) => sum + unitsOf(row), 0)
    const sales = selected.reduce((sum, row) => sum + row.total, 0)
    return { ...month, publishedUnits: units, publishedSales: sales, unitDifference: units - month.modelUnits, salesDifference: sales - month.accountingSales }
  })
  const byName = new Map(source.invoices.map(row => [row.name, row]))
  const orderIdByNumber = new Map(source.orders.map(row => [Number(row.raw?.order_number), row.id]))
  const groups = new Map<string, { document: string; date: string; channel: string; units: number; sales: number; rows: number[] }>()
  for (const row of book.detail) {
    const group = groups.get(row.document) || { document: row.document, date: row.date, channel: row.channel, units: 0, sales: 0, rows: [] }
    group.units += row.units; group.sales += row.sales; group.rows.push(row.row)
    groups.set(row.document, group)
  }
  const matchedPublishedIds = new Set<string>()
  const documents = Array.from(groups.values()).map(group => {
    if (group.document.startsWith('NC-')) return { ...group, status: 'Nota crédito del informe: resta unidades e importe; vínculo con factura pendiente', publishedDocuments: '', publishedDate: '', publishedChannel: '', publishedUnits: 0, publishedSales: 0, cachedUnits: 0, creditedAmount: 0 }
    const raw = byName.get(group.document)
    const linkedNumbers = [...(raw?.observations || '').matchAll(/#\s*(\d+)/g)].map(match => Number(match[1]))
    const reviewedNumber = source.context.reconciledShopifyInvoiceNumbers.get(group.document)
    if (reviewedNumber) linkedNumbers.push(reviewedNumber)
    const linkedIds = new Set(linkedNumbers.map(number => orderIdByNumber.get(number)).filter(Boolean).map(id => `shopify:${id}`))
    const matches = published.filter(row => row.id === raw?.id || linkedIds.has(row.id) || row.marketingSource?.channel !== 'shopify' && row.name === group.document)
    const selected = matches.filter(row => inRange(row.date, book.detailPeriod.start, book.detailPeriod.end))
    for (const row of selected) matchedPublishedIds.add(row.id)
    const publishedUnits = selected.reduce((sum, row) => sum + unitsOf(row), 0)
    const publishedSales = selected.reduce((sum, row) => sum + row.total, 0)
    let status = 'Sin correspondencia confirmada'
    if (selected.length) status = Math.abs(publishedUnits - group.units) < 0.0001 && Math.abs(publishedSales - group.sales) <= 1 ? 'Coincide cantidad e importe' : 'Documento localizado: revisar diferencia de cantidad / importe'
    else if (matches.length) status = 'Fecha de venta fuera de agosto; la factura y la venta tienen distinto corte'
    else if (raw && Number(raw.credited_amount || 0) >= Number(raw.total)) status = 'Factura con nota crédito total en Siigo; excluida de Vercel'
    else if (raw && classifyMarketingInvoice(raw, source.context).channel === 'pending') status = 'Canal sin confirmar; excluida de ventas confirmadas'
    else if (raw && classifyMarketingInvoice(raw, source.context).channel === 'shopify') status = 'Referencia Shopify sin pedido válido coincidente en ventas confirmadas'
    else if (raw) status = 'Factura localizada; sin unidades de producto elegibles en el total confirmado'
    return { ...group, status, publishedDocuments: matches.map(row => row.name || row.id).join(' / '), publishedDate: matches.map(row => row.date).join(' / '), publishedChannel: matches.map(row => row.salesChannel).join(' / '), publishedUnits, publishedSales, cachedUnits: raw ? marketingProductItems(raw, source.nonRetail).reduce((sum, item) => sum + Number(item.quantity || 0), 0) : 0, creditedAmount: Number(raw?.credited_amount || 0) }
  })
  const selected = published.filter(row => inRange(row.date, book.detailPeriod.start, book.detailPeriod.end))
  const additional = selected.filter(row => !matchedPublishedIds.has(row.id)).map(row => ({ document: row.name || row.id, date: row.date, channel: row.salesChannel, units: unitsOf(row), sales: row.total }))
  const matched = selected.filter(row => matchedPublishedIds.has(row.id))
  const totals = {
    bookUnits: book.detail.reduce((sum, row) => sum + row.units, 0), bookSales: book.detail.reduce((sum, row) => sum + row.sales, 0),
    publishedUnits: selected.reduce((sum, row) => sum + unitsOf(row), 0), publishedSales: selected.reduce((sum, row) => sum + row.total, 0),
    matchedUnits: matched.reduce((sum, row) => sum + unitsOf(row), 0), additionalUnits: additional.reduce((sum, row) => sum + row.units, 0),
    additionalSales: additional.reduce((sum, row) => sum + row.sales, 0), matchedSales: matched.reduce((sum, row) => sum + row.total, 0),
  }
  // A canonical record can match several invoices; totals above deduplicate it.
  return { monthly, documents, additional, totals }
}
