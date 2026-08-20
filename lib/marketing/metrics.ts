export const BUSINESS_TIME_ZONE = 'America/Bogota'
export const BUSINESS_CURRENCY = 'COP'

export type MarketingView = 'weekly' | 'monthly' | 'ytd'
export type CustomerType = 'new' | 'returning' | 'unknown'

export interface DatePeriod {
  start: string
  end: string
  label: string
  complete: boolean
}

export interface MarketingFilters {
  channel?: string
  product?: string
  size?: string
  customerType?: CustomerType | 'all'
}

export interface ShopifyLineItemRaw {
  sku?: string | null
  title?: string | null
  variant_title?: string | null
  quantity?: number
  current_quantity?: number
  price?: string
}

export interface ShopifyOrderRaw {
  created_at?: string
  processed_at?: string
  cancelled_at?: string | null
  test?: boolean
  source_name?: string | null
  current_subtotal_price?: string
  subtotal_price?: string
  current_total_discounts?: string
  total_discounts?: string
  financial_status?: string
  customer?: {
    id?: number
    email?: string | null
    created_at?: string
  } | null
  email?: string | null
  line_items?: ShopifyLineItemRaw[]
  refunds?: Array<{
    refund_line_items?: Array<{ subtotal?: number | string }>
    transactions?: Array<{ amount?: number | string; kind?: string; status?: string }>
  }>
}

export interface CachedShopifyOrder {
  id: number
  created_at: string
  financial_status: string | null
  total_price: number
  raw: ShopifyOrderRaw | null
}

export interface StockBySku {
  sku: string
  own: number
  total: number
}

export interface DailyMetric {
  date: string
  sales: number
  orders: number
  units: number
}

export interface SizeMetric {
  key: string
  reference: string
  size: string
  sku: string
  sales: number
  units: number
  orders: number
  stock: number | null
  totalStock: number | null
  variation: number | null
}

export interface ProductMetric {
  key: string
  reference: string
  sales: number
  share: number
  units: number
  orders: number
  aov: number
  stock: number | null
  totalStock: number | null
  variation: number | null
  sizes: SizeMetric[]
}

export interface PeriodMetrics {
  netSales: number
  orders: number
  units: number
  aov: number
  discounts: number
  refunds: number
  customers: {
    new: number
    returning: number
    unknown: number
    newSales: number
    returningSales: number
    newAov: number | null
    returningAov: number | null
    repeatPurchaseRate: number | null
  }
  daily: DailyMetric[]
  products: ProductMetric[]
  sizes: SizeMetric[]
  channels: Array<{ key: string; sales: number; orders: number }>
  concentration: { top5: number | null; top10: number | null }
}

export interface MetricComparison {
  current: number | null
  previous: number | null
  change: number | null
}

export interface MarketingExecutiveReport {
  source: string
  currency: string
  timeZone: string
  view: MarketingView
  periods: {
    current: DatePeriod
    previous: DatePeriod
    yearAgo: DatePeriod | null
  }
  dataCoverage: {
    shopifyFrom: string | null
    shopifyTo: string | null
    historicalSalesFrom: string | null
    historicalSalesTo: string | null
    historicalSalesSource: string | null
    stockAsOf: string | null
  }
  filters: {
    applied: MarketingFilters
    channels: string[]
    products: string[]
    sizes: string[]
  }
  current: PeriodMetrics
  previous: PeriodMetrics
  yearAgo: PeriodMetrics | null
  trend: Array<{ month: string; sales: number; orders: number; units: number; aov: number; newCustomers: number }>
  comparisons: Record<string, MetricComparison>
  comparability: {
    netSales: boolean
    orders: boolean
    aov: boolean
    units: boolean
    customers: boolean
  }
  availability: {
    shopify: boolean
    inventory: boolean
    meta: boolean
    ga4: boolean
    cogs: boolean
    historicalInventory: boolean
    exactNewCustomerAttribution: boolean
  }
  limitations: string[]
  formulas: Array<{ metric: string; formula: string; source: string }>
}

const paidStatuses = new Set(['paid', 'partially_refunded', 'refunded'])

export function isoDateInTimeZone(value: string | Date, timeZone = BUSINESS_TIME_ZONE): string {
  const date = typeof value === 'string' ? new Date(value) : value
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const year = parts.find(part => part.type === 'year')?.value
  const month = parts.find(part => part.type === 'month')?.value
  const day = parts.find(part => part.type === 'day')?.value
  return `${year}-${month}-${day}`
}

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export function addMonths(date: string, months: number): string {
  const value = new Date(`${date.slice(0, 7)}-01T12:00:00Z`)
  value.setUTCMonth(value.getUTCMonth() + months)
  return value.toISOString().slice(0, 10)
}

function shiftDateMonths(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number)
  const target = new Date(Date.UTC(year, month - 1 + months, 1, 12))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12)).getUTCDate()
  target.setUTCDate(Math.min(day, lastDay))
  return target.toISOString().slice(0, 10)
}

export function daysInclusive(start: string, end: string): number {
  const a = new Date(`${start}T12:00:00Z`).getTime()
  const b = new Date(`${end}T12:00:00Z`).getTime()
  return Math.floor((b - a) / 86400000) + 1
}

function monthPeriod(monthStart: string, label: string): DatePeriod {
  const nextMonth = addMonths(monthStart, 1)
  return { start: monthStart, end: addDays(nextMonth, -1), label, complete: true }
}

export function buildPeriods(
  view: MarketingView,
  customStart?: string | null,
  customEnd?: string | null,
  now = new Date(),
): MarketingExecutiveReport['periods'] {
  if (customStart && customEnd) {
    const previousYear = String(Number(customStart.slice(0, 4)) - 1)
    return {
      current: { start: customStart, end: customEnd, label: view === 'ytd' ? `Acumulado ${customStart.slice(0, 4)}` : 'Periodo seleccionado', complete: customEnd < isoDateInTimeZone(now) },
      previous: { start: shiftDateMonths(customStart, -12), end: shiftDateMonths(customEnd, -12), label: `Mismas fechas ${previousYear}`, complete: true },
      yearAgo: null,
    }
  }

  const today = isoDateInTimeZone(now)
  if (view === 'ytd') {
    const currentEnd = addDays(today, -1)
    const currentYear = currentEnd.slice(0, 4)
    const previousYear = String(Number(currentYear) - 1)
    return {
      current: { start: `${currentYear}-01-01`, end: currentEnd, label: `Acumulado ${currentYear}`, complete: true },
      previous: { start: `${previousYear}-01-01`, end: shiftDateMonths(currentEnd, -12), label: `Mismo rango ${previousYear}`, complete: true },
      yearAgo: null,
    }
  }
  if (view === 'weekly') {
    const currentEnd = addDays(today, -1)
    const currentStart = addDays(currentEnd, -6)
    return {
      current: { start: currentStart, end: currentEnd, label: 'Últimos 7 días completos', complete: true },
      previous: { start: shiftDateMonths(currentStart, -12), end: shiftDateMonths(currentEnd, -12), label: 'Mismos 7 días del año anterior', complete: true },
      yearAgo: null,
    }
  }

  const currentMonthStart = `${today.slice(0, 7)}-01`
  const lastClosedMonthStart = addMonths(currentMonthStart, -1)
  return {
    current: monthPeriod(lastClosedMonthStart, 'Último mes cerrado'),
    previous: monthPeriod(addMonths(lastClosedMonthStart, -12), 'Mismo mes del año anterior'),
    yearAgo: null,
  }
}

export function percentageChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null
  return (current - previous) / Math.abs(previous)
}

export function comparison(current: number | null, previous: number | null): MetricComparison {
  return { current, previous, change: percentageChange(current, previous) }
}

export function isValidSalesOrder(order: CachedShopifyOrder): boolean {
  const raw = order.raw || {}
  const status = (raw.financial_status || order.financial_status || '').toLowerCase()
  return !raw.test && !raw.cancelled_at && paidStatuses.has(status)
}

export function netSalesOf(order: CachedShopifyOrder): number {
  if (!isValidSalesOrder(order)) return 0
  const raw = order.raw || {}
  const value = Number(raw.current_subtotal_price)
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

export function unitsOf(order: CachedShopifyOrder): number {
  return (order.raw?.line_items || []).reduce((sum, item) => {
    const quantity = Number(item.current_quantity ?? item.quantity ?? 0)
    return sum + Math.max(0, quantity)
  }, 0)
}

export function customerKey(order: CachedShopifyOrder): string | null {
  const customer = order.raw?.customer
  if (customer?.id) return `id:${customer.id}`
  const email = customer?.email || order.raw?.email
  return email ? `email:${email.toLowerCase()}` : null
}

export function customerTypeForPeriod(order: CachedShopifyOrder, period: DatePeriod): CustomerType {
  const createdAt = order.raw?.customer?.created_at
  if (!createdAt) return 'unknown'
  const createdDate = isoDateInTimeZone(createdAt)
  return createdDate >= period.start && createdDate <= period.end ? 'new' : 'returning'
}

function refundAmount(order: CachedShopifyOrder): number {
  let total = 0
  for (const refund of order.raw?.refunds || []) {
    const successfulTransactions = (refund.transactions || []).filter(transaction => {
      const kind = (transaction.kind || '').toLowerCase()
      const status = (transaction.status || '').toLowerCase()
      return kind === 'refund' && (!status || status === 'success')
    })
    if (successfulTransactions.length > 0) {
      total += successfulTransactions.reduce((sum, transaction) => sum + (Number(transaction.amount) || 0), 0)
    } else {
      total += (refund.refund_line_items || []).reduce((sum, item) => sum + (Number(item.subtotal) || 0), 0)
    }
  }
  return total
}

function emptyPeriodMetrics(): PeriodMetrics {
  return {
    netSales: 0,
    orders: 0,
    units: 0,
    aov: 0,
    discounts: 0,
    refunds: 0,
    customers: {
      new: 0,
      returning: 0,
      unknown: 0,
      newSales: 0,
      returningSales: 0,
      newAov: null,
      returningAov: null,
      repeatPurchaseRate: null,
    },
    daily: [],
    products: [],
    sizes: [],
    channels: [],
    concentration: { top5: null, top10: null },
  }
}

export function aggregatePeriod(
  orders: CachedShopifyOrder[],
  period: DatePeriod,
  stockBySku: Map<string, StockBySku>,
  filters: MarketingFilters = {},
): PeriodMetrics {
  const result = emptyPeriodMetrics()
  const daily = new Map<string, DailyMetric>()
  const channels = new Map<string, { key: string; sales: number; orders: number }>()
  const products = new Map<string, Omit<ProductMetric, 'share' | 'variation' | 'sizes'> & { orderIds: Set<number>; skus: Set<string> }>()
  const sizes = new Map<string, Omit<SizeMetric, 'variation'> & { orderIds: Set<number> }>()
  const customerBuckets = {
    new: new Set<string>(),
    returning: new Set<string>(),
    unknown: new Set<string>(),
  }
  let newOrders = 0
  let returningOrders = 0

  for (const order of orders) {
    if (!isValidSalesOrder(order)) continue
    const date = isoDateInTimeZone(order.created_at)
    if (date < period.start || date > period.end) continue
    const raw = order.raw || {}
    const channel = (raw.source_name || 'web').trim() || 'web'
    const customerType = customerTypeForPeriod(order, period)
    if (filters.channel && filters.channel !== channel) continue
    if (filters.customerType && filters.customerType !== 'all' && filters.customerType !== customerType) continue

    const eligibleItems = (raw.line_items || []).filter(item => {
      const reference = (item.title || 'Sin referencia').trim()
      const size = (item.variant_title || 'Sin talla').trim()
      if (filters.product && filters.product !== reference) return false
      if (filters.size && filters.size !== size) return false
      return Math.max(0, Number(item.current_quantity ?? item.quantity ?? 0)) > 0
    })
    if ((filters.product || filters.size) && eligibleItems.length === 0) continue

    const orderNetSales = netSalesOf(order)
    const allItems = (raw.line_items || []).filter(item => Math.max(0, Number(item.current_quantity ?? item.quantity ?? 0)) > 0)
    const allGross = allItems.reduce((sum, item) => sum + Math.max(0, Number(item.current_quantity ?? item.quantity ?? 0)) * (Number(item.price) || 0), 0)
    const eligibleGross = eligibleItems.reduce((sum, item) => sum + Math.max(0, Number(item.current_quantity ?? item.quantity ?? 0)) * (Number(item.price) || 0), 0)
    const sales = (filters.product || filters.size) && allGross > 0
      ? orderNetSales * (eligibleGross / allGross)
      : orderNetSales
    const units = eligibleItems.reduce((sum, item) => sum + Math.max(0, Number(item.current_quantity ?? item.quantity ?? 0)), 0)
    if (sales <= 0 && units <= 0) continue

    result.netSales += sales
    result.orders += 1
    result.units += units
    result.discounts += Number(raw.current_total_discounts ?? raw.total_discounts ?? 0) || 0
    result.refunds += refundAmount(order)

    const customer = customerKey(order) || `anonymous:${order.id}`
    customerBuckets[customerType].add(customer)
    if (customerType === 'new') {
      result.customers.newSales += sales
      newOrders += 1
    } else if (customerType === 'returning') {
      result.customers.returningSales += sales
      returningOrders += 1
    }

    const day = daily.get(date) || { date, sales: 0, orders: 0, units: 0 }
    day.sales += sales
    day.orders += 1
    day.units += units
    daily.set(date, day)

    const channelBucket = channels.get(channel) || { key: channel, sales: 0, orders: 0 }
    channelBucket.sales += sales
    channelBucket.orders += 1
    channels.set(channel, channelBucket)

    for (const item of eligibleItems) {
      const reference = (item.title || 'Sin referencia').trim()
      const size = (item.variant_title || 'Sin talla').trim()
      const sku = (item.sku || '').trim()
      const quantity = Math.max(0, Number(item.current_quantity ?? item.quantity ?? 0))
      const gross = quantity * (Number(item.price) || 0)
      const allocatedSales = allGross > 0 ? orderNetSales * (gross / allGross) : 0

      const product = products.get(reference) || {
        key: reference,
        reference,
        sales: 0,
        units: 0,
        orders: 0,
        aov: 0,
        stock: null,
        totalStock: null,
        orderIds: new Set<number>(),
        skus: new Set<string>(),
      }
      product.sales += allocatedSales
      product.units += quantity
      product.orderIds.add(order.id)
      if (sku) product.skus.add(sku)
      products.set(reference, product)

      const sizeKey = `${reference}::${size}::${sku}`
      const sizeBucket = sizes.get(sizeKey) || {
        key: sizeKey,
        reference,
        size,
        sku,
        sales: 0,
        units: 0,
        orders: 0,
        stock: sku && stockBySku.has(sku) ? stockBySku.get(sku)!.own : null,
        totalStock: sku && stockBySku.has(sku) ? stockBySku.get(sku)!.total : null,
        orderIds: new Set<number>(),
      }
      sizeBucket.sales += allocatedSales
      sizeBucket.units += quantity
      sizeBucket.orderIds.add(order.id)
      sizes.set(sizeKey, sizeBucket)
    }
  }

  result.aov = result.orders > 0 ? result.netSales / result.orders : 0
  result.customers.new = customerBuckets.new.size
  result.customers.returning = customerBuckets.returning.size
  result.customers.unknown = customerBuckets.unknown.size
  result.customers.newAov = newOrders > 0 ? result.customers.newSales / newOrders : null
  result.customers.returningAov = returningOrders > 0 ? result.customers.returningSales / returningOrders : null
  const knownCustomers = result.customers.new + result.customers.returning
  result.customers.repeatPurchaseRate = knownCustomers > 0 ? result.customers.returning / knownCustomers : null
  result.daily = Array.from(daily.values()).sort((a, b) => a.date.localeCompare(b.date))
  result.channels = Array.from(channels.values()).sort((a, b) => b.sales - a.sales)

  result.sizes = Array.from(sizes.values()).map(size => ({
    key: size.key,
    reference: size.reference,
    size: size.size,
    sku: size.sku,
    sales: size.sales,
    units: size.units,
    orders: size.orderIds.size,
    stock: size.stock,
    totalStock: size.totalStock,
    variation: null,
  })).sort((a, b) => b.units - a.units)

  result.products = Array.from(products.values()).map(product => {
    let ownStock = 0
    let totalStock = 0
    let matchedStock = false
    for (const sku of product.skus) {
      const stock = stockBySku.get(sku)
      if (!stock) continue
      matchedStock = true
      ownStock += stock.own
      totalStock += stock.total
    }
    const productSizes = result.sizes.filter(size => size.reference === product.reference)
    return {
      key: product.key,
      reference: product.reference,
      sales: product.sales,
      share: result.netSales > 0 ? product.sales / result.netSales : 0,
      units: product.units,
      orders: product.orderIds.size,
      aov: product.orderIds.size > 0 ? product.sales / product.orderIds.size : 0,
      stock: matchedStock ? ownStock : null,
      totalStock: matchedStock ? totalStock : null,
      variation: null,
      sizes: productSizes,
    }
  }).sort((a, b) => b.sales - a.sales)

  result.concentration.top5 = result.netSales > 0
    ? result.products.slice(0, 5).reduce((sum, product) => sum + product.sales, 0) / result.netSales
    : null
  result.concentration.top10 = result.netSales > 0
    ? result.products.slice(0, 10).reduce((sum, product) => sum + product.sales, 0) / result.netSales
    : null
  return result
}

export function addProductComparisons(current: PeriodMetrics, previous: PeriodMetrics): PeriodMetrics {
  const previousProducts = new Map(previous.products.map(product => [product.key, product]))
  const previousSizes = new Map(previous.sizes.map(size => [size.key, size]))
  return {
    ...current,
    products: current.products.map(product => ({
      ...product,
      variation: percentageChange(product.sales, previousProducts.get(product.key)?.sales ?? null),
      sizes: product.sizes.map(size => ({
        ...size,
        variation: percentageChange(size.sales, previousSizes.get(size.key)?.sales ?? null),
      })),
    })),
    sizes: current.sizes.map(size => ({
      ...size,
      variation: percentageChange(size.sales, previousSizes.get(size.key)?.sales ?? null),
    })),
  }
}
