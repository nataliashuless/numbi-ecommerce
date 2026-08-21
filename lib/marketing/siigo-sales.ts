import { withoutIva } from '@/lib/siigo-values'
import type { DatePeriod, PeriodMetrics } from '@/lib/marketing/metrics'

export interface CachedSiigoInvoice {
  id: string
  date: string
  total: number
  credited_amount: number | null
}

export function replaceSalesWithSiigo(
  metrics: PeriodMetrics,
  invoices: CachedSiigoInvoice[],
  period: DatePeriod,
): PeriodMetrics {
  const daily = new Map(metrics.daily.map(day => [day.date, { ...day, sales: 0 }]))
  let netSales = 0

  for (const invoice of invoices) {
    const date = invoice.date.slice(0, 10)
    if (date < period.start || date > period.end) continue

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
