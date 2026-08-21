import { withoutIva } from '@/lib/siigo-values'
import type { DatePeriod, PeriodMetrics } from '@/lib/marketing/metrics'

export interface CachedSiigoInvoice {
  id: string
  date: string
  total: number
  credited_amount: number | null
  observations: string | null
  raw: {
    payments?: Array<{
      id?: number
      name?: string | null
    }>
  } | null
}

export const SHOPIFY_START_DATE = '2025-07-01'
const MERCADO_PAGO_PAYMENT_ID = 8362

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

export function isOnlineMarketingInvoice(
  invoice: CachedSiigoInvoice,
  shopifyOrderNumbers: Set<number>,
): boolean {
  if (invoice.date.slice(0, 10) < SHOPIFY_START_DATE) {
    return isMercadoPagoInvoice(invoice)
  }

  const orderNumber = shopifyOrderNumber(invoice.observations)
  return orderNumber !== null && shopifyOrderNumbers.has(orderNumber)
}

export function replaceSalesWithSiigoOnline(
  metrics: PeriodMetrics,
  invoices: CachedSiigoInvoice[],
  period: DatePeriod,
  shopifyOrderNumbers: Set<number>,
): PeriodMetrics {
  const daily = new Map(metrics.daily.map(day => [day.date, { ...day, sales: 0 }]))
  let netSales = 0

  for (const invoice of invoices) {
    const date = invoice.date.slice(0, 10)
    if (date < period.start || date > period.end) continue
    if (!isOnlineMarketingInvoice(invoice, shopifyOrderNumbers)) continue

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
