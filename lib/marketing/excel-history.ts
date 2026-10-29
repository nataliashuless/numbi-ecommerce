import { marketingProductItems, type CachedSiigoInvoice } from './siigo-sales'
import type { HistoryDecision } from './history-reconciliation'
import { classifyMarketingInvoice, type ReconciliationContext } from './channel-reconciliation'

export interface ExcelSaleRow {
  row: number; date: string; units: number; design: string; size: string; city: string
  amount: number | null; payment: string; status: string; invoice: string | null; webOrder: string; flags: string[]
}
export interface ExcelHistory { from: string; to: string; rows: ExcelSaleRow[] }

/** The owner's Excel replaces, rather than supplements, non-Shopify history in its coverage. */
export function applyExcelHistory(invoices: CachedSiigoInvoice[], context: ReconciliationContext, history: ExcelHistory, decisions: HistoryDecision[] = []) {
  const byName = new Map(invoices.map(invoice => [invoice.name, invoice]))
  const decisionByRow = new Map(decisions.map(decision => [decision.row, decision]))
  const coveredInvoiceNames = new Set(history.rows.map(row => decisionByRow.get(row.row)?.invoice || row.invoice).filter(Boolean))
  const retained = invoices.filter(invoice => classifyMarketingInvoice(invoice, context).channel === 'shopify' || !coveredInvoiceNames.has(invoice.name || '') && (invoice.date.slice(0, 10) < history.from || invoice.date.slice(0, 10) > history.to))
  const groups = new Map<string, CachedSiigoInvoice>()
  const excluded: Array<{ row: number; units: number; reason: string }> = []
  for (const row of history.rows) {
    const decision = decisionByRow.get(row.row)
    const reference = decision?.invoice || row.invoice
    const linked = reference ? byName.get(reference) : undefined
    const linkedShopify = linked && classifyMarketingInvoice(linked, context).channel === 'shopify'
    const webNumber = Number(row.webOrder.replace(/^#/, ''))
    const ownerStore = linked && classifyMarketingInvoice(linked, context).channel === 'tienda'
    const reason = decision?.decision === 'excluded' || decision?.decision === 'shopify' ? decision.reason : ownerStore ? 'Venta a tienda o Paraíso confirmada; excluida de online' : /shopify/i.test(row.payment) || linkedShopify || (webNumber > 0 && context.shopifyOrderNumbers.has(webNumber)) ? 'Shopify: ya se toma desde el canal Shopify' : row.flags.some(flag => ['gift', 'cancelled', 'unpaid', 'fair', 'store'].includes(flag)) ? 'Regalo, cancelación, pago pendiente o venta presencial identificada en Excel' : ''
    if (reason) { excluded.push({ row: row.row, units: row.units, reason }); continue }
    if (row.units <= 0 || !row.design || row.date < history.from || row.date > history.to) continue
    const channel = decision?.decision === 'pending' ? 'pending' as const : /mercad[o]?\s*pago/i.test(row.payment) ? 'woocommerce' as const : 'whatsapp' as const
    const key = `${row.date}:${reference || `fila-${row.row}`}`
    let invoice = groups.get(key)
    if (!invoice) {
      invoice = { id: `excel:${key}`, name: reference || `Excel fila ${row.row}`, date: row.date, total: 0, credited_amount: 0, customer_identification: null, assigned_feria_id: null, observations: null, raw: null, items: [], marketingSource: { channel, city: row.city, reason: `Excel Hoja 1, filas ${row.row}; ${decision?.reason || 'fecha real de venta y cantidad del Excel'}`, allowZeroValue: true } }
      groups.set(key, invoice)
    } else invoice.marketingSource!.reason += `, ${row.row}`
    const matchedItem = linked?.items?.find(item => (item.description || '').toLowerCase().includes(row.design.toLowerCase()) && new RegExp(`\\b${row.size}$`).test(item.description || ''))
    const documentedValue = linked && (linked.credited_amount || 0) < linked.total ? marketingProductItems(linked, new Set()).find(item => item === matchedItem)?.total : undefined
    const amount = Math.max(0, Number(row.amount) || Number(documentedValue) || 0)
    invoice.items!.push({ code: matchedItem?.code || `EXCEL-${row.design}-${row.size}`, description: `${row.design} - ${row.size}`, quantity: row.units, price: amount / row.units, total: amount })
    invoice.total += amount
    if (row.amount === null || row.amount <= 0) invoice.marketingSource!.missingValue = true
  }
  return { invoices: [...retained, ...groups.values()], excluded }
}
