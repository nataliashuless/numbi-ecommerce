import { NextResponse } from 'next/server'
import { requireAuth, getAdminClient } from '@/lib/auth-helpers'

// Returns Shopify marketing/source/campaign analytics derived from the
// cached shopify_orders.raw JSON. No live Shopify call needed.
//
// Caveat: Shopify Admin API does NOT expose visits/sessions/CVR. Those
// only live in Shopify Analytics dashboard / Storefront API. This
// endpoint focuses on order-level attribution signals.

type ShopifyRaw = {
  id: number
  order_number: number
  created_at: string
  source_name: string | null
  referring_site: string | null
  landing_site: string | null
  total_price: string
  subtotal_price: string
  total_discounts: string
  discount_codes: Array<{ code: string; amount: string; type: string }>
  note_attributes: Array<{ name: string; value: string }>
  line_items: Array<{ sku: string | null; title: string; quantity: number; price: string }>
  customer: {
    id: number
    orders_count: number
    created_at: string
    tags: string
  } | null
  billing_address: {
    city: string | null
    province: string | null
    country: string | null
  } | null
  shipping_address: {
    city: string | null
    province: string | null
    country: string | null
  } | null
  financial_status: string
}

function parseHost(url: string | null): string {
  if (!url) return ''
  try {
    const u = new URL(url)
    return u.hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function parseUTM(landingUrl: string | null): Record<string, string> {
  if (!landingUrl) return {}
  try {
    const u = new URL(landingUrl, 'https://example.com')
    const out: Record<string, string> = {}
    for (const [k, v] of u.searchParams.entries()) {
      if (k.startsWith('utm_') || k === 'gclid' || k === 'fbclid') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

function unitsOf(items: ShopifyRaw['line_items']): number {
  return (items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0)
}

export async function GET(request: Request) {
  const { error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get('start_date') || '2020-01-01'
  const endDate = searchParams.get('end_date') || new Date().toISOString().slice(0, 10)

  const supabase = getAdminClient()

  // Page through all orders in range
  const rows: Array<{ id: number; created_at: string; total_price: number; raw: ShopifyRaw }> = []
  const pageSize = 1000
  for (let off = 0; off < 50000; off += pageSize) {
    const { data: page, error: pErr } = await supabase
      .from('shopify_orders')
      .select('id, created_at, total_price, raw')
      .gte('created_at', `${startDate}T00:00:00-05:00`)
      .lte('created_at', `${endDate}T23:59:59-05:00`)
      .order('created_at', { ascending: false })
      .range(off, off + pageSize - 1)
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })
    if (!page || page.length === 0) break
    rows.push(...(page as Array<{ id: number; created_at: string; total_price: number; raw: ShopifyRaw }>))
    if (page.length < pageSize) break
  }

  // Build a customer→total-orders map over the ENTIRE cache (not just range).
  // A customer with ≥2 orders historically counts as 'recurring'; their orders
  // in the current range are 'returning' (except for the first, which is 'new').
  // To keep it simple: any customer with ≥2 orders total is classified as
  // returning for ALL their orders in range. This is the standard cohort
  // definition used in Shopify Analytics.
  const customerOrderCount = new Map<string, number>()
  const customerFirstOrderAt = new Map<string, string>()
  for (let off = 0; off < 200000; off += pageSize) {
    const { data: page } = await supabase
      .from('shopify_orders')
      .select('id, created_at, raw')
      .order('created_at', { ascending: true })
      .range(off, off + pageSize - 1)
    if (!page || page.length === 0) break
    for (const row of (page as Array<{ id: number; created_at: string; raw: ShopifyRaw }>)) {
      const cust = row.raw?.customer
      // Prefer id; fall back to email for guest checkouts that still capture email
      const key = cust?.id ? `id:${cust.id}` : (() => {
        type RawCustomer = ShopifyRaw['customer'] & { email?: string }
        const c = cust as RawCustomer | null
        return c?.email ? `em:${c.email.toLowerCase()}` : null
      })()
      if (!key) continue
      customerOrderCount.set(key, (customerOrderCount.get(key) || 0) + 1)
      if (!customerFirstOrderAt.has(key)) customerFirstOrderAt.set(key, row.created_at)
    }
    if (page.length < pageSize) break
  }

  // KPIs
  let revenue = 0
  let units = 0
  const orders = rows.length

  // Source breakdowns
  const bySource = new Map<string, { orders: number; revenue: number; units: number }>()
  const byReferrer = new Map<string, { orders: number; revenue: number; units: number }>()
  const byDiscount = new Map<string, { orders: number; revenue: number; units: number; total_discount: number }>()
  const byUtmSource = new Map<string, { orders: number; revenue: number; units: number }>()
  const byUtmMedium = new Map<string, { orders: number; revenue: number; units: number }>()
  const byUtmCampaign = new Map<string, { orders: number; revenue: number; units: number }>()
  const byCity = new Map<string, { orders: number; revenue: number; units: number }>()
  const byProvince = new Map<string, { orders: number; revenue: number; units: number }>()
  const bySku = new Map<string, { orders: number; revenue: number; units: number; title: string }>()

  let newCustomerOrders = 0
  let returningCustomerOrders = 0
  let newCustomerRevenue = 0
  let returningCustomerRevenue = 0
  let totalDiscountUsed = 0
  let ordersWithDiscount = 0
  let hasGclid = 0
  let hasFbclid = 0

  // Time series: daily revenue by source
  const dailyBySource: Map<string, Map<string, { revenue: number; orders: number; units: number }>> = new Map()

  function bump(
    map: Map<string, { orders: number; revenue: number; units: number }>,
    key: string,
    rev: number,
    u: number,
  ) {
    if (!key) return
    const cur = map.get(key) || { orders: 0, revenue: 0, units: 0 }
    cur.orders += 1
    cur.revenue += rev
    cur.units += u
    map.set(key, cur)
  }

  for (const r of rows) {
    const raw = r.raw || ({} as ShopifyRaw)
    const rev = Number(r.total_price) || 0
    const u = unitsOf(raw.line_items)
    revenue += rev
    units += u

    const src = (raw.source_name || 'web').trim()
    bump(bySource, src, rev, u)

    const refHost = parseHost(raw.referring_site)
    if (refHost) bump(byReferrer, refHost, rev, u)
    else bump(byReferrer, 'direct / sin referente', rev, u)

    // Discounts
    const codes = raw.discount_codes || []
    const totalDisc = Number(raw.total_discounts || '0')
    if (totalDisc > 0) {
      totalDiscountUsed += totalDisc
      ordersWithDiscount += 1
    }
    for (const dc of codes) {
      const key = dc.code
      const cur = byDiscount.get(key) || { orders: 0, revenue: 0, units: 0, total_discount: 0 }
      cur.orders += 1
      cur.revenue += rev
      cur.units += u
      cur.total_discount += Number(dc.amount) || 0
      byDiscount.set(key, cur)
    }

    // UTM from landing_site
    const utm = parseUTM(raw.landing_site)
    if (utm.utm_source) bump(byUtmSource, utm.utm_source, rev, u)
    if (utm.utm_medium) bump(byUtmMedium, utm.utm_medium, rev, u)
    if (utm.utm_campaign) bump(byUtmCampaign, utm.utm_campaign, rev, u)
    if (utm.gclid) hasGclid += 1
    if (utm.fbclid) hasFbclid += 1

    // Customer mix — derived from the WHOLE cache (above), not from
    // raw.customer.orders_count (which is unreliable: missing for guests/POS
    // and not updated after sync). Definition: a customer with ≥2 orders
    // total in our DB counts as 'recurring' (all their orders in range are
    // returning). Anonymous orders (no id, no email) count as 'new'.
    const cust = raw.customer as (ShopifyRaw['customer'] & { email?: string }) | null
    const custKey = cust?.id
      ? `id:${cust.id}`
      : (cust?.email ? `em:${cust.email.toLowerCase()}` : null)
    const totalForCustomer = custKey ? (customerOrderCount.get(custKey) || 0) : 0
    if (totalForCustomer >= 2) {
      returningCustomerOrders += 1
      returningCustomerRevenue += rev
    } else {
      newCustomerOrders += 1
      newCustomerRevenue += rev
    }

    // Geography (prefer shipping, fallback billing)
    const addr = raw.shipping_address || raw.billing_address
    const city = (addr?.city || '').trim()
    const province = (addr?.province || '').trim()
    if (city) bump(byCity, city, rev, u)
    if (province) bump(byProvince, province, rev, u)

    // Top SKUs
    for (const item of (raw.line_items || [])) {
      const k = item.sku || item.title || 'sin-sku'
      const cur = bySku.get(k) || { orders: 0, revenue: 0, units: 0, title: item.title || k }
      cur.orders += 1
      cur.revenue += Number(item.price || '0') * Number(item.quantity || 0)
      cur.units += Number(item.quantity || 0)
      bySku.set(k, cur)
    }

    // Time series by source (daily)
    const day = (r.created_at || '').slice(0, 10)
    if (day) {
      let map = dailyBySource.get(src)
      if (!map) { map = new Map(); dailyBySource.set(src, map) }
      const cur = map.get(day) || { revenue: 0, orders: 0, units: 0 }
      cur.revenue += rev
      cur.orders += 1
      cur.units += u
      map.set(day, cur)
    }
  }

  function topN<T extends { orders: number; revenue: number; units: number }>(
    map: Map<string, T>,
    n: number,
    sortBy: 'revenue' | 'orders' = 'revenue',
  ): Array<{ key: string } & T> {
    return Array.from(map.entries())
      .map(([k, v]) => ({ key: k, ...v }))
      .sort((a, b) => (b[sortBy] as number) - (a[sortBy] as number))
      .slice(0, n)
  }

  // Build flat time series: array of { date, source_name, revenue, orders, units }
  const timeSeries: Array<{ date: string; source: string; revenue: number; orders: number; units: number }> = []
  for (const [src, dayMap] of dailyBySource) {
    for (const [day, vals] of dayMap) {
      timeSeries.push({ date: day, source: src, revenue: vals.revenue, orders: vals.orders, units: vals.units })
    }
  }
  timeSeries.sort((a, b) => a.date.localeCompare(b.date))

  const aov = orders > 0 ? revenue / orders : 0

  // Unique customer counts (within the in-range orders)
  const inRangeCustomers = new Set<string>()
  const inRangeReturningCustomers = new Set<string>()
  for (const r of rows) {
    const cust = r.raw?.customer as (ShopifyRaw['customer'] & { email?: string }) | null
    const k = cust?.id ? `id:${cust.id}` : (cust?.email ? `em:${cust.email.toLowerCase()}` : null)
    if (!k) continue
    inRangeCustomers.add(k)
    if ((customerOrderCount.get(k) || 0) >= 2) inRangeReturningCustomers.add(k)
  }
  const uniqueCustomers = inRangeCustomers.size
  const uniqueReturningCustomers = inRangeReturningCustomers.size
  const uniqueReturningRate = uniqueCustomers > 0 ? uniqueReturningCustomers / uniqueCustomers : 0

  return NextResponse.json({
    asOf: new Date().toISOString().slice(0, 10),
    range: { start: startDate, end: endDate },
    kpis: {
      orders,
      revenue,
      units,
      aov,
      ordersWithDiscount,
      discountUsageRate: orders > 0 ? ordersWithDiscount / orders : 0,
      totalDiscountUsed,
      newCustomerOrders,
      newCustomerRevenue,
      returningCustomerOrders,
      returningCustomerRevenue,
      returningRate: orders > 0 ? returningCustomerOrders / orders : 0,
      uniqueCustomers,
      uniqueReturningCustomers,
      uniqueReturningRate,
      gclidOrders: hasGclid,
      fbclidOrders: hasFbclid,
    },
    sources: topN(bySource, 20),
    referrers: topN(byReferrer, 20),
    discounts: Array.from(byDiscount.entries())
      .map(([k, v]) => ({ key: k, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 50),
    utm: {
      source: topN(byUtmSource, 20),
      medium: topN(byUtmMedium, 20),
      campaign: topN(byUtmCampaign, 30),
    },
    geography: {
      cities: topN(byCity, 25),
      provinces: topN(byProvince, 25),
    },
    topSkus: Array.from(bySku.entries())
      .map(([k, v]) => ({ key: k, ...v }))
      .sort((a, b) => b.units - a.units)
      .slice(0, 25),
    timeSeries,
  })
}
