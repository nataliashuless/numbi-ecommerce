import historicalSales from '@/data/marketing-historical-sales-2025.json'

import { addDays, type DatePeriod, type PeriodMetrics } from '@/lib/marketing/metrics'

interface HistoricalSalesRow {
  date: string
  netSales: number
  orders: number
}

const rows = historicalSales.rows as HistoricalSalesRow[]

export const HISTORICAL_SALES_COVERAGE = historicalSales.coverage
export const HISTORICAL_SALES_SOURCE = historicalSales.sourceFile

export function addHistoricalSales(
  metrics: PeriodMetrics,
  period: DatePeriod,
  enabled: boolean,
): PeriodMetrics {
  if (!enabled) return metrics

  const additions = rows.filter(row => row.date >= period.start && row.date <= period.end)
  if (additions.length === 0) return metrics

  const daily = new Map(metrics.daily.map(day => [day.date, { ...day }]))
  let addedSales = 0
  let addedOrders = 0

  for (const row of additions) {
    addedSales += row.netSales
    addedOrders += row.orders
    const day = daily.get(row.date) || { date: row.date, sales: 0, orders: 0, units: 0 }
    day.sales += row.netSales
    day.orders += row.orders
    daily.set(row.date, day)
  }

  const netSales = metrics.netSales + addedSales
  const orders = metrics.orders + addedOrders

  return {
    ...metrics,
    netSales,
    orders,
    aov: orders > 0 ? netSales / orders : 0,
    daily: Array.from(daily.values()).sort((a, b) => a.date.localeCompare(b.date)),
  }
}

export function hasCompleteSalesCoverage(
  period: DatePeriod,
  shopifyFrom: string | null,
  shopifyTo: string | null,
  historicalEnabled: boolean,
): boolean {
  if (!shopifyFrom || !shopifyTo || shopifyTo < period.end) return false
  if (period.start >= shopifyFrom) return true
  if (!historicalEnabled || period.start < HISTORICAL_SALES_COVERAGE.from) return false

  const historicalRequiredThrough = period.end < shopifyFrom ? period.end : addDays(shopifyFrom, -1)
  return HISTORICAL_SALES_COVERAGE.to >= historicalRequiredThrough
}

export function hasCompleteShopifyCoverage(
  period: DatePeriod,
  shopifyFrom: string | null,
  shopifyTo: string | null,
): boolean {
  return Boolean(shopifyFrom && shopifyTo && shopifyFrom <= period.start && shopifyTo >= period.end)
}
