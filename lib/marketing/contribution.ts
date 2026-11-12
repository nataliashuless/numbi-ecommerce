import type { CachedShopifyOrder, DatePeriod, PeriodMetrics } from './metrics'
import type { CachedSiigoInvoice } from './siigo-sales'

export const COST_FIELDS = ['agencyFee', 'agencyVariable', 'natiFee', 'servers', 'unitCost'] as const
export type CostField = typeof COST_FIELDS[number]
export type MonthlyCosts = Record<string, Partial<Record<CostField, number>>>
export type MonthlyCostUpdates = Record<string, Partial<Record<CostField, number | null>>>

export function periodMonths(period: Pick<DatePeriod, 'start' | 'end'>): string[] {
  const result: string[] = []
  const date = new Date(`${period.start.slice(0, 7)}-01T12:00:00Z`)
  while (date.toISOString().slice(0, 7) <= period.end.slice(0, 7)) {
    result.push(date.toISOString().slice(0, 7))
    date.setUTCMonth(date.getUTCMonth() + 1)
  }
  return result
}

/** Fixed monthly fees accrue over selected days. Shoe cost follows sold units. */
export function contributionCosts(period: DatePeriod, metrics: PeriodMetrics, costs: MonthlyCosts) {
  const missing: string[] = []
  const result = { agencyFee: 0, agencyVariable: 0, natiFee: 0, servers: 0, shoes: 0 }
  for (const month of periodMonths(period)) {
    const days = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate()
    const first = period.start.startsWith(month) ? Number(period.start.slice(8, 10)) : 1
    const last = period.end.startsWith(month) ? Number(period.end.slice(8, 10)) : days
    const fraction = (last - first + 1) / days
    for (const field of ['agencyFee', 'agencyVariable', 'natiFee', 'servers'] as const) {
      const value = costs[month]?.[field]
      if (value === undefined) missing.push(`${month}:${field}`)
      else result[field] += value * fraction
    }
    const units = metrics.daily.filter(day => day.date.startsWith(month)).reduce((sum, day) => sum + day.units, 0)
    if (units > 0 && costs[month]?.unitCost === undefined) missing.push(`${month}:unitCost`)
    else result.shoes += units * (costs[month]?.unitCost ?? 0)
  }
  const known = (field: string) => !missing.some(key => key.endsWith(`:${field}`))
  return {
    agencyFee: known('agencyFee') ? result.agencyFee : null,
    agencyVariable: known('agencyVariable') ? result.agencyVariable : null,
    natiFee: known('natiFee') ? result.natiFee : null,
    servers: known('servers') ? result.servers : null,
    shoes: known('unitCost') ? result.shoes : null,
    missing,
  }
}

export function divide(numerator: number | null, denominator: number | null): number | null {
  return numerator !== null && denominator !== null && denominator > 0 ? numerator / denominator : null
}

export function sumKnown(values: Array<number | null>): number | null {
  return values.some(value => value === null) ? null : values.reduce<number>((sum, value) => sum + (value ?? 0), 0)
}

/** Net-only Excel/Siigo history cannot establish revenue before discounts. */
export function documentedGrossSales(records: Array<{ invoice: CachedSiigoInvoice }>, orders: CachedShopifyOrder[], period: DatePeriod): number | null {
  const byId = new Map(orders.map(order => [order.id, order]))
  let gross = 0
  for (const { invoice } of records) {
    if (invoice.date < period.start || invoice.date > period.end) continue
    if (!invoice.id.startsWith('shopify:')) return null
    const order = byId.get(Number(invoice.id.slice('shopify:'.length)))
    if (!order?.raw || typeof order.raw.taxes_included !== 'boolean') return null
    const eligibleCodes = new Set((invoice.items || []).map(item => item.code))
    const currentItems = (order.raw.line_items || []).filter(item => Number(item.current_quantity ?? item.quantity) > 0)
    for (const [index, item] of currentItems.entries()) {
      if (!eligibleCodes.has(item.sku || `SHOPIFY-${order.id}-${index}`)) continue
      const taxes = item.tax_lines || []
      if (order.raw.taxes_included && taxes.some(tax => !Number.isFinite(tax.rate))) return null
      const rate = order.raw.taxes_included ? taxes.reduce((sum, tax) => sum + (tax.rate || 0), 0) : 0
      const price = Number(item.price)
      if (!Number.isFinite(price) || price < 0) return null
      gross += Math.max(0, Number(item.quantity) || 0) * price / (1 + rate)
    }
  }
  return gross
}
