import { withoutIva } from '@/lib/siigo-values'
import type { DatePeriod, PeriodMetrics } from '@/lib/marketing/metrics'

export interface CachedSiigoInvoice {
  marketingSource?: { channel: 'woocommerce' | 'whatsapp' | 'shopify' | 'pending'; city: string; reason: string; allowZeroValue: boolean; missingValue?: boolean }
  id: string
  name?: string
  date: string
  total: number
  credited_amount: number | null
  customer_identification: string | null
  assigned_feria_id: string | null
  observations: string | null
  items?: Array<{
    code?: string | null
    description?: string | null
    quantity?: number | null
    price?: number | null
    total?: number | null
  }>
  raw: {
    payments?: Array<{
      id?: number
      name?: string | null
    }>
  } | null
}

export const SHOPIFY_START_DATE = '2025-07-01'
const MERCADO_PAGO_PAYMENT_ID = 8362

export interface OnlineSalesClassificationContext {
  shopifyOrderNumbers: Set<number>
  tiendaNits: Set<string>
  feriaWindows: Array<{ start: string; end: string }>
}

export type OnlineMarketingChannel = 'web' | 'whatsapp'

function isMercadoPagoInvoice(invoice: CachedSiigoInvoice): boolean {
  return (invoice.raw?.payments || []).some(payment => {
    if (Number(payment.id) === MERCADO_PAGO_PAYMENT_ID) return true
    return /mercado\s*pago/i.test(payment.name || '')
  })
}

function shopifyOrderNumber(observations: string | null): number | null {
  const match = (observations || '').match(/#(\d+)/)
  return match ? Number(match[1]) : null
}

/** Return only evidenced sale dates; never silently substitute the invoice date. */
export function marketingSaleDate(invoice: CachedSiigoInvoice, orderDates: Map<number, string>): string | null {
  const orderNumber = shopifyOrderNumber(invoice.observations)
  if (orderNumber !== null && orderDates.has(orderNumber)) return orderDates.get(orderNumber)!
  const text = (invoice.observations || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/&amp;/g, '&').replace(/&#x2f;|&#47;/g, '/')
  const invoiceDate = invoice.date.slice(0, 10)
  const months: Record<string, number> = { ene: 1, enero: 1, feb: 2, febrero: 2, mar: 3, marzo: 3, abr: 4, abril: 4, may: 5, mayo: 5, jun: 6, junio: 6, jul: 7, julio: 7, ago: 8, agosto: 8, sep: 9, sept: 9, septiembre: 9, setiembre: 9, oct: 10, octubre: 10, nov: 11, noviembre: 11, dic: 12, diciembre: 12 }
  const dates = new Set<string>()
  let invalid = false
  function add(day: number, month: number, explicitYear?: string) {
    let year = explicitYear ? Number(explicitYear) : Number(invoiceDate.slice(0, 4))
    if (explicitYear?.length === 2) year += 2000
    const format = () => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    if (!explicitYear && format() > invoiceDate) year -= 1
    const date = format()
    const parsed = new Date(`${date}T12:00:00Z`)
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || date > invoiceDate || year < 2020) { invalid = true; return }
    dates.add(date)
  }
  for (const match of text.matchAll(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4}|\d{2})\b/g)) add(Number(match[1]), Number(match[2]), match[3])
  const monthPattern = Object.keys(months).sort((a, b) => b.length - a.length).join('|')
  for (const match of text.matchAll(new RegExp(`\\b(\\d{1,2})[ \t]+(?:de[ \t]+)?(${monthPattern})\\b\\.?[ \t]*(?:(?:de|del)[ \t]+)?(20\\d{2})?`, 'g'))) add(Number(match[1]), months[match[2]], match[3])
  for (const match of text.matchAll(new RegExp(`\\b(${monthPattern})\\b\\.?[ \t]+(\\d{1,2})\\b(?:[ \t]+(?:(?:de|del)[ \t]+)?(20\\d{2}))?`, 'g'))) add(Number(match[2]), months[match[1]], match[3])
  return !invalid && dates.size === 1 ? [...dates][0] : null
}

export function isOnlineMarketingInvoice(
  invoice: CachedSiigoInvoice,
  context: OnlineSalesClassificationContext,
): boolean {
  return onlineMarketingChannel(invoice, context) !== null
}

export function onlineMarketingChannel(
  invoice: CachedSiigoInvoice,
  context: OnlineSalesClassificationContext,
): OnlineMarketingChannel | null {
  if (invoice.assigned_feria_id) return null
  if (invoice.customer_identification && context.tiendaNits.has(invoice.customer_identification)) return null

  const isFeriaDate = context.feriaWindows.some(window => {
    const date = invoice.date.slice(0, 10)
    return date >= window.start && date <= window.end
  })

  if (invoice.date.slice(0, 10) < SHOPIFY_START_DATE) {
    if (isMercadoPagoInvoice(invoice)) return 'web'
    return isFeriaDate ? null : 'whatsapp'
  }

  const orderNumber = shopifyOrderNumber(invoice.observations)
  if (orderNumber !== null && context.shopifyOrderNumbers.has(orderNumber)) return 'web'
  // Moship records the Shopify order explicitly, even if the order cache is incomplete.
  if (orderNumber !== null && /registro\s+autom[aá]tico\s+moship\s+api\s+para\s+el\s+pedido/i.test(invoice.observations || '')) return 'web'
  // Fair sales are often invoiced after the event and have no manual assignment yet.
  if (/\bferia\b|\bplaytime\b/i.test(invoice.observations || '')) return null
  return isFeriaDate ? null : 'whatsapp'
}

export function marketingProductItems(invoice: CachedSiigoInvoice, nonRetailProductCodes: Set<string>) {
  return (invoice.items || []).filter(item => {
    const code = (item.code || '').trim()
    const description = (item.description || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
    // WooCommerce-era invoices used code "2" for shipping, not the current ENVIO SKU.
    const shipping = code.toUpperCase() === 'ENVIO' || /^(?:(?:costo|coste|gastos?|servicio) de )?envio(?:s)?$|^fletes?$/.test(description)
    return code && !shipping && !nonRetailProductCodes.has(code) && (Number(item.quantity) || 0) > 0
  })
}

export function onlineInvoiceUnits(invoices: CachedSiigoInvoice[], period: DatePeriod, context: OnlineSalesClassificationContext, nonRetailProductCodes: Set<string>): number {
  return invoices.reduce((sum, invoice) => {
    const date = invoice.date.slice(0, 10)
    const total = Number(invoice.total) || 0
    if (date < period.start || date > period.end || total <= 0 || (Number(invoice.credited_amount) || 0) >= total || !isOnlineMarketingInvoice(invoice, context)) return sum
    return sum + marketingProductItems(invoice, nonRetailProductCodes).reduce((units, item) => units + Number(item.quantity), 0)
  }, 0)
}

export function replaceSalesWithSiigoOnline(
  metrics: PeriodMetrics,
  invoices: CachedSiigoInvoice[],
  period: DatePeriod,
  context: OnlineSalesClassificationContext,
): PeriodMetrics {
  const daily = new Map(metrics.daily.map(day => [day.date, { ...day, sales: 0 }]))
  let netSales = 0

  for (const invoice of invoices) {
    const date = invoice.date.slice(0, 10)
    if (date < period.start || date > period.end) continue
    if (!isOnlineMarketingInvoice(invoice, context)) continue

    const total = Number(invoice.total) || 0
    const credited = Number(invoice.credited_amount) || 0
    if (total <= 0 || credited >= total) continue

    const sale = withoutIva(Math.max(0, total - credited))
    netSales += sale
    const day = daily.get(date) || { date, sales: 0, orders: 0, units: 0 }
    day.sales += sale
    daily.set(date, day)
  }

  return {
    ...metrics,
    netSales,
    daily: Array.from(daily.values()).sort((a, b) => a.date.localeCompare(b.date)),
  }
}

export function hasCompleteOnlineSalesCoverage(
  period: DatePeriod,
  siigoFrom: string | null,
  siigoSyncedThrough: string | null,
  shopifyFrom: string | null,
  shopifyTo: string | null,
): boolean {
  if (!hasCompleteSiigoCoverage(period, siigoFrom, siigoSyncedThrough)) return false
  if (period.end < SHOPIFY_START_DATE) return true

  const requiredShopifyFrom = period.start < SHOPIFY_START_DATE ? SHOPIFY_START_DATE : period.start
  return Boolean(shopifyFrom && shopifyTo && shopifyFrom <= requiredShopifyFrom && shopifyTo >= period.end)
}

export function hasCompleteSiigoCoverage(
  period: DatePeriod,
  siigoFrom: string | null,
  siigoSyncedThrough: string | null,
): boolean {
  return Boolean(siigoFrom && siigoSyncedThrough && siigoFrom <= period.start && siigoSyncedThrough >= period.end)
}

export function hasCompleteShopifyCoverage(
  period: DatePeriod,
  shopifyFrom: string | null,
  shopifyTo: string | null,
): boolean {
  return Boolean(shopifyFrom && shopifyTo && shopifyFrom <= period.start && shopifyTo >= period.end)
}
