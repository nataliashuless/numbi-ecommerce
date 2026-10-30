import { getAdminClient } from '@/lib/auth-helpers'
import { canonicalInvoices } from '@/lib/marketing/canonical-source'
import { classifyMarketingInvoice, historicalStoreEvidence } from '@/lib/marketing/channel-reconciliation'
import { marketingBusinessChannelRules } from '@/lib/marketing/business-channel-rules'
import { buildMarketingLedger } from '@/lib/marketing/sales-ledger'
import { marketingProductItems, type CachedSiigoInvoice } from '@/lib/marketing/siigo-sales'
import { isoDateInTimeZone, type CachedShopifyOrder } from '@/lib/marketing/metrics'

export async function paged<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = []
  for (let from = 0; from < 100000; from += 1000) {
    const { data, error } = await query(from, from + 999)
    if (error) throw new Error(error.message)
    if (!data?.length) return rows
    rows.push(...data)
    if (data.length < 1000) return rows
  }
  throw new Error('El histórico excede el límite de lectura; no se publican totales parciales')
}

/** All consumers use this same deduplication, channel evidence and product/date policy. */
export async function loadSalesSource() {
  const db = getAdminClient()
  const [orders, invoices, stores, fairs, links, stock] = await Promise.all([
    paged<CachedShopifyOrder>((a, b) => db.from('shopify_orders').select('*').order('id').range(a, b)),
    paged<CachedSiigoInvoice>((a, b) => db.from('siigo_invoices').select('*').lte('date', isoDateInTimeZone(new Date())).order('id').range(a, b)),
    paged<{ id: string; nombre: string; nombre_corto: string | null; siigo_customer_identification: string }>((a, b) => db.from('tiendas_terceros').select('id,nombre,nombre_corto,siigo_customer_identification').order('id').range(a, b)),
    paged<{ fecha_inicio: string; fecha_fin: string }>((a, b) => db.from('ferias').select('id,fecha_inicio,fecha_fin').eq('activa', true).order('id').range(a, b)),
    paged<{ siigo_invoice_id: string | null }>((a, b) => db.from('ventas_whatsapp').select('id,siigo_invoice_id').not('siigo_invoice_id', 'is', null).order('id').range(a, b)),
    paged<{ product_code: string | null; account_group_id: number | null }>((a, b) => db.from('siigo_product_stock').select('product_code,account_group_id').order('product_code').order('warehouse_id').range(a, b)),
  ])
  const retail = new Set(stock.filter(row => row.account_group_id === 339).map(row => row.product_code?.trim()))
  const nonRetail = new Set(stock.filter(row => row.account_group_id !== null && row.account_group_id !== 339).map(row => row.product_code?.trim()).filter((code): code is string => Boolean(code) && !retail.has(code)))
  const context = {
    ...marketingBusinessChannelRules,
    shopifyOrderNumbers: new Set(orders.map(row => Number(row.raw?.order_number)).filter(Boolean)),
    tiendaNits: new Set(stores.map(row => row.siigo_customer_identification).filter(Boolean)),
    feriaWindows: fairs.map(row => ({ start: row.fecha_inicio, end: row.fecha_fin })),
    firstShopifyOrderDate: orders.map(row => row.created_at.slice(0, 10)).sort()[0] || null,
    whatsappInvoiceIds: new Set(links.map(row => row.siigo_invoice_id).filter((id): id is string => Boolean(id))),
    historicalStoreEvidence: historicalStoreEvidence(invoices),
  }
  const { unifiedInvoices, historyAudit } = canonicalInvoices(invoices, orders, context)
  const ledger = buildMarketingLedger(unifiedInvoices, orders, context, nonRetail, {}, 'invoice')
  const onlineById = new Map(ledger.records.map(row => [row.invoice.id, row.invoice]))
  const coveredOnlineNames = new Set([
    ...ledger.records.map(row => row.invoice.name || ''),
    ...historyAudit.fair.filter(row => row.online).map(row => row.invoice),
    ...historyAudit.decisions.filter(row => row.decision === 'online' || row.decision === 'shopify').map(row => row.invoice || ''),
  ])
  const existingIds = new Set(unifiedInvoices.map(row => row.id))
  const physicalHistory = invoices.filter(invoice => !existingIds.has(invoice.id) && !coveredOnlineNames.has(invoice.name || '') && ['tienda', 'feria'].includes(classifyMarketingInvoice(invoice, context).channel))
  const confirmed = [...unifiedInvoices, ...physicalHistory].flatMap(invoice => {
    const classification = classifyMarketingInvoice(invoice, context)
    if (classification.channel === 'pending') return []
    const online = onlineById.get(invoice.id)
    if (online) return [{ ...online, salesChannel: classification.channel }]
    if (!['tienda', 'feria'].includes(classification.channel) || Number(invoice.credited_amount) >= invoice.total) return []
    const items = marketingProductItems(invoice, nonRetail)
    if (!items.length) return []
    const originalGross = (invoice.items || []).reduce((sum, item) => sum + (Number(item.total) || Number(item.quantity) * Number(item.price) || 0), 0)
    const gross = items.reduce((sum, item) => sum + (Number(item.total) || Number(item.quantity) * Number(item.price) || 0), 0)
    return [{ ...invoice, total: Math.max(0, invoice.total - Number(invoice.credited_amount || 0)) * (originalGross > 0 ? gross / originalGross : 1), credited_amount: 0, items, salesChannel: classification.channel }]
  })
  return { orders, invoices, stores, context, nonRetail, ledger, confirmed, historyAudit }
}
export type SalesSource = Awaited<ReturnType<typeof loadSalesSource>>
export function salesInRange(source: SalesSource, start?: string | null, end?: string | null) {
  return source.confirmed.filter(row => (!start || row.date.slice(0, 10) >= start) && (!end || row.date.slice(0, 10) <= end))
}

/** Reporting amounts are product revenue before IVA, allocated once across product lines. */
export function reportingInvoices(source: SalesSource, start?: string | null, end?: string | null) {
  return salesInRange(source, start, end).map(invoice => {
    const total = invoice.total / 1.19
    const gross = (invoice.items || []).reduce((sum, item) => sum + (Number(item.total) || Number(item.quantity) * Number(item.price) || 0), 0)
    const units = (invoice.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0)
    const items = (invoice.items || []).map(item => {
      const quantity = Number(item.quantity) || 0
      const amount = total * (gross > 0 ? (Number(item.total) || quantity * Number(item.price) || 0) / gross : units > 0 ? quantity / units : 0)
      return { code: item.code || 'SIN-SKU', description: item.description || 'Sin diseño', quantity, total: amount, price: quantity > 0 ? amount / quantity : 0 }
    })
    return { ...invoice, date: invoice.date.slice(0, 10), total, credited_amount: 0, items }
  })
}
