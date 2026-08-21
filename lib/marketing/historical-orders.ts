import historicalOrders from '@/data/marketing-historical-orders.json'
import type { DatePeriod, PeriodMetrics } from '@/lib/marketing/metrics'

interface HistoricalOrderRow {
  date: string
  orders: number | null
}

const rows = historicalOrders.rows as HistoricalOrderRow[]
const ordersByDate = new Map(rows.map(row => [row.date, row.orders]))

export const HISTORICAL_ORDERS_SOURCE = historicalOrders.source
export const HISTORICAL_ORDERS_CUTOFF = historicalOrders.cutoff
export const HISTORICAL_ORDERS_FROM = rows.at(0)?.date || null
export const HISTORICAL_ORDERS_TO = rows.at(-1)?.date || null
export const HISTORICAL_ORDER_MISSING_DATES = rows
  .filter(row => row.orders === null)
  .map(row => row.date)

function eachDate(start: string, end: string): string[] {
  const dates: string[] = []
  for (
    let cursor = new Date(`${start}T12:00:00Z`);
    cursor <= new Date(`${end}T12:00:00Z`);
    cursor = new Date(cursor.getTime() + 86400000)
  ) {
    dates.push(cursor.toISOString().slice(0, 10))
  }
  return dates
}

export function replaceOnlineOrders(
  metrics: PeriodMetrics,
  unfilteredShopifyMetrics: PeriodMetrics,
  period: DatePeriod,
): PeriodMetrics {
  const daily = new Map(metrics.daily.map(day => [day.date, { ...day, orders: 0 }]))
  let onlineOrders = 0

  for (const date of eachDate(period.start, period.end)) {
    const orders = date < HISTORICAL_ORDERS_CUTOFF
      ? ordersByDate.get(date)
      : unfilteredShopifyMetrics.daily.find(day => day.date === date)?.orders
    const knownOrders = orders ?? 0
    onlineOrders += knownOrders
    if (knownOrders > 0 || daily.has(date)) {
      const day = daily.get(date) || { date, sales: 0, orders: 0, units: 0 }
      day.orders = knownOrders
      daily.set(date, day)
    }
  }

  return {
    ...metrics,
    onlineOrders,
    daily: Array.from(daily.values()).sort((a, b) => a.date.localeCompare(b.date)),
  }
}

export function missingHistoricalOrderDates(period: DatePeriod): string[] {
  if (period.start >= HISTORICAL_ORDERS_CUTOFF) return []
  const historicalEnd = period.end < HISTORICAL_ORDERS_CUTOFF
    ? period.end
    : new Date(new Date(`${HISTORICAL_ORDERS_CUTOFF}T12:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10)
  return eachDate(period.start, historicalEnd).filter(date => !ordersByDate.has(date) || ordersByDate.get(date) === null)
}

export function hasCompleteOnlineOrderCoverage(
  period: DatePeriod,
  shopifyFrom: string | null,
  shopifyTo: string | null,
): boolean {
  if (period.start < HISTORICAL_ORDERS_CUTOFF) {
    const historicalEnd = period.end < HISTORICAL_ORDERS_CUTOFF
      ? period.end
      : new Date(new Date(`${HISTORICAL_ORDERS_CUTOFF}T12:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10)
    if (!HISTORICAL_ORDERS_FROM || !HISTORICAL_ORDERS_TO) return false
    if (period.start < HISTORICAL_ORDERS_FROM || historicalEnd > HISTORICAL_ORDERS_TO) return false
    if (missingHistoricalOrderDates(period).length > 0) return false
  }

  if (period.end < HISTORICAL_ORDERS_CUTOFF) return true
  const requiredShopifyFrom = period.start < HISTORICAL_ORDERS_CUTOFF ? HISTORICAL_ORDERS_CUTOFF : period.start
  return Boolean(shopifyFrom && shopifyTo && shopifyFrom <= requiredShopifyFrom && shopifyTo >= period.end)
}
