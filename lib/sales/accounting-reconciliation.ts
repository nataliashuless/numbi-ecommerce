import type { AccountingSiigoDocument } from '@/lib/siigo-client'
import { reportingInvoices, type SalesSource } from './source'
import { classifyMarketingInvoice } from '@/lib/marketing/channel-reconciliation'
import { marketingProductItems } from '@/lib/marketing/siigo-sales'

export interface AccountingRow { row: number; document: string; date: string; channel: string; units: number; sales: number }
export interface AccountingMonth { month: string; modelUnits: number; modelSales: number; accountingSales: number; containsBudget: boolean }
export interface AccountingReview { months: AccountingMonth[]; detailPeriod: { start: string; end: string }; detail: AccountingRow[] }
const unitsOf = (row: { items?: Array<{ quantity?: number | null }> }) => (row.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0)

/** Compare safe document identifiers and commercial figures; never export customer data or notes. */
export function reconcileAccounting(source: SalesSource, book: AccountingReview, live?: { invoices: AccountingSiigoDocument[]; credits: AccountingSiigoDocument[] }) {
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
    const credit = live?.credits.find(row => row.name === group.document)
    if (group.document.startsWith('NC-')) return { ...group, linkedInvoice: credit?.invoice?.name || '', status: credit?.invoice?.name ? `Nota crédito verificada en Siigo; afecta ${credit.invoice.name}` : 'Nota crédito del informe: resta unidades e importe; vínculo con factura pendiente', publishedDocuments: '', publishedDate: '', publishedChannel: '', publishedUnits: 0, publishedSales: 0, cachedUnits: 0, creditedAmount: 0 }
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
    return { ...group, linkedInvoice: '', status, publishedDocuments: matches.map(row => row.name || row.id).join(' / '), publishedDate: matches.map(row => row.date).join(' / '), publishedChannel: matches.map(row => row.salesChannel).join(' / '), publishedUnits, publishedSales, cachedUnits: raw ? marketingProductItems(raw, source.nonRetail).reduce((sum, item) => sum + Number(item.quantity || 0), 0) : 0, creditedAmount: Number(raw?.credited_amount || 0) }
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
  const accounting = live ? book.months.map(month => {
    const invoices = live.invoices.filter(row => row.date.startsWith(month.month))
    const credits = live.credits.filter(row => row.date.startsWith(month.month))
    const productTotals = (rows: AccountingSiigoDocument[]) => rows.reduce((sum, row) => {
      const items = marketingProductItems({ ...row, credited_amount: 0, customer_identification: null, assigned_feria_id: null, observations: null, raw: null }, source.nonRetail)
      const grossOf = (item: NonNullable<AccountingSiigoDocument['items']>[number]) => Math.max(0, Number(item.total) || Number(item.quantity) * Number(item.price) || 0)
      const allGross = (row.items || []).reduce((n, item) => n + grossOf(item), 0)
      const productGross = items.reduce((n, item) => n + grossOf(item), 0)
      return { units: sum.units + items.reduce((n, item) => n + Number(item.quantity || 0), 0), sales: sum.sales + Number(row.total || 0) / 1.19 * (allGross > 0 ? productGross / allGross : 0) }
    }, { units: 0, sales: 0 })
    const positive = productTotals(invoices), negative = productTotals(credits)
    return { month: month.month, invoices: invoices.length, credits: credits.length, invoiceUnits: positive.units, creditUnits: negative.units, netUnits: positive.units - negative.units, netSales: positive.sales - negative.sales, accountingSales: month.accountingSales, difference: positive.sales - negative.sales - month.accountingSales }
  }) : []
  const creditLinks = (live?.credits || []).map(row => ({ document: row.name, date: row.date, invoice: row.invoice?.name || '', invoiceIdPresent: Boolean(row.invoice?.id), grossAmount: row.total, units: (row.items || []).filter(item => !source.nonRetail.has(item.code || '') && item.code !== 'ENVIO').reduce((sum, item) => sum + Number(item.quantity || 0), 0) }))
  return { monthly, documents, additional, totals, accounting, creditLinks, liveReadError: null as string | null }
}
