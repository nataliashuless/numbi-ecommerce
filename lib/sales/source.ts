import { getAdminClient } from '@/lib/auth-helpers'
import { canonicalInvoices } from '@/lib/marketing/canonical-source'
import { classifyMarketingInvoice, historicalStoreEvidence } from '@/lib/marketing/channel-reconciliation'
import { marketingBusinessChannelRules } from '@/lib/marketing/business-channel-rules'
import { buildMarketingLedger } from '@/lib/marketing/sales-ledger'
import { marketingProductItems, type CachedSiigoInvoice } from '@/lib/marketing/siigo-sales'
import { isoDateInTimeZone, type CachedShopifyOrder } from '@/lib/marketing/metrics'

export async function paged<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, table = 'histórico') {
  const rows: T[] = []
  const pageSize = ['shopify_orders', 'siigo_invoices'].includes(table) ? 100 : 1000
  for (let from = 0; from < 100000; from += pageSize) {
    const { data, error } = await query(from, from + pageSize - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    if (!data?.length) return rows
    rows.push(...data)
    if (data.length < pageSize) return rows
  }
  throw new Error('El histórico excede el límite de lectura; no se publican totales parciales')
}

/** All consumers use this same deduplication, channel evidence and product/date policy. */
async function readSnapshot() {
  const db = getAdminClient()
  return Promise.all([
    paged<CachedShopifyOrder>((a, b) => db.from('shopify_orders').select('id,order_number,name,created_at,total_price,currency,financial_status,fulfillment_status,customer_name,customer_email,raw').order('created_at').order('id').range(a, b), 'shopify_orders'),
    paged<CachedSiigoInvoice>((a, b) => db.from('siigo_invoices').select('id,name,date,total,credited_amount,customer_id,customer_identification,assigned_feria_id,observations,items,raw').lte('date', isoDateInTimeZone(new Date())).order('date').order('id').range(a, b), 'siigo_invoices'),
    paged<{ id: string; nombre: string; nombre_corto: string | null; siigo_customer_identification: string }>((a, b) => db.from('tiendas_terceros').select('id,nombre,nombre_corto,siigo_customer_identification').order('id').range(a, b), 'tiendas_terceros'),
    paged<{ fecha_inicio: string; fecha_fin: string }>((a, b) => db.from('ferias').select('id,fecha_inicio,fecha_fin').eq('activa', true).order('id').range(a, b), 'ferias'),
    paged<{ siigo_invoice_id: string | null }>((a, b) => db.from('ventas_whatsapp').select('id,siigo_invoice_id').not('siigo_invoice_id', 'is', null).order('id').range(a, b), 'ventas_whatsapp'),
    paged<{ product_code: string | null; account_group_id: number | null }>((a, b) => db.from('siigo_product_stock').select('product_code,account_group_id').order('product_id').order('warehouse_id').range(a, b), 'siigo_product_stock'),
  ])
}

// Concurrent report requests share a short server-memory snapshot. No raw
// customer data is placed in a public or persistent response cache.
let snapshot: { expires: number; value: Awaited<ReturnType<typeof readSnapshot>> } | undefined
let inFlight: ReturnType<typeof readSnapshot> | undefined
async function loadSnapshot() {
  const cacheEnabled = typeof process !== 'undefined' && process.env.NODE_ENV === 'production'
  if (!cacheEnabled) return readSnapshot()
  if (snapshot && snapshot.expires > Date.now()) return snapshot.value
  if (!inFlight) inFlight = readSnapshot().then(value => {
    snapshot = { value, expires: Date.now() + 30_000 }
    return value
  }).finally(() => { inFlight = undefined })
  return inFlight
}

export async function loadSalesSource() {
  const [orders, invoices, stores, fairs, links, stock] = await loadSnapshot()
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
