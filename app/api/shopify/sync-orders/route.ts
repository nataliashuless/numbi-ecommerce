import { NextResponse } from 'next/server'
import { requireAuth, getAdminClient, getShopifyCredentials } from '@/lib/auth-helpers'

export const maxDuration = 300

interface ShopifyLineItem {
  sku: string | null
  title: string
  quantity: number
  price: string
}

interface ShopifyOrder {
  id: number
  order_number: number
  name: string
  created_at: string
  total_price: string
  currency: string
  financial_status: string
  fulfillment_status: string | null
  customer: { first_name?: string; last_name?: string; email?: string } | null
  line_items: ShopifyLineItem[]
}

export async function POST(request: Request) {
  const { error } = await requireAuth()
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const startDate: string = body.start_date || '2020-01-01'
  const endDate: string = body.end_date || new Date().toISOString().slice(0, 10)

  const credentials = await getShopifyCredentials()
  const shop = credentials?.shopify_shop
  const accessToken = credentials?.shopify_access_token
  if (!shop || !accessToken) {
    return NextResponse.json({ error: 'Shopify not connected' }, { status: 401 })
  }

  try {
    const supabase = getAdminClient()
    const params = new URLSearchParams()
    params.set('status', 'any')
    params.set('limit', '100')
    params.set('archived_status', 'any')
    params.set('created_at_min', `${startDate}T00:00:00-05:00`)
    params.set('created_at_max', `${endDate}T23:59:59-05:00`)

    let nextUrl: string | null = `https://${shop}/admin/api/2025-07/orders.json?${params.toString()}`
    let pageCount = 0
    let upserted = 0

    while (nextUrl && pageCount < 500) {
      pageCount++
      const res: Response = await fetch(nextUrl, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        return NextResponse.json(
          { error: err.errors || `Shopify ${res.status}`, partial_upserted: upserted },
          { status: res.status }
        )
      }
      const data = await res.json()
      const orders: ShopifyOrder[] = data.orders || []

      if (orders.length === 0) break

      const rows = orders.map(o => ({
        id: o.id,
        order_number: o.order_number,
        name: o.name,
        created_at: o.created_at,
        total_price: parseFloat(o.total_price || '0'),
        currency: o.currency,
        financial_status: o.financial_status,
        fulfillment_status: o.fulfillment_status,
        customer_name: o.customer
          ? `${o.customer.first_name || ''} ${o.customer.last_name || ''}`.trim() || 'Cliente anónimo'
          : 'Cliente anónimo',
        customer_email: o.customer?.email || null,
        item_count: (o.line_items || []).reduce((s, it) => s + (it.quantity || 0), 0),
        line_items: o.line_items || [],
        raw: o,
        synced_at: new Date().toISOString(),
      }))

      const { error: upErr } = await supabase
        .from('shopify_orders')
        .upsert(rows, { onConflict: 'id' })
      if (upErr) {
        return NextResponse.json(
          { error: upErr.message, partial_upserted: upserted },
          { status: 500 }
        )
      }
      upserted += rows.length

      const linkHeader = res.headers.get('Link')
      nextUrl = null
      if (linkHeader) {
        const m = linkHeader.match(/<([^>]+)>;\s*rel="next"/)
        if (m) nextUrl = m[1]
      }
    }

    const { data: minRow } = await supabase
      .from('shopify_orders')
      .select('created_at')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    const { data: maxRow } = await supabase
      .from('shopify_orders')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    await supabase.from('shopify_orders_sync_state').upsert(
      {
        id: 1,
        earliest_at: minRow?.created_at || null,
        latest_at: maxRow?.created_at || null,
        last_full_sync_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    )

    return NextResponse.json({ upserted, pages: pageCount, startDate, endDate })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error syncing Shopify orders'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET() {
  const { error } = await requireAuth()
  if (error) return error

  const supabase = getAdminClient()
  const { data: state } = await supabase
    .from('shopify_orders_sync_state')
    .select('*')
    .eq('id', 1)
    .maybeSingle()
  const { count } = await supabase
    .from('shopify_orders')
    .select('*', { count: 'exact', head: true })

  return NextResponse.json({
    cached: count || 0,
    earliest: state?.earliest_at || null,
    latest: state?.latest_at || null,
    last_sync: state?.last_full_sync_at || null,
  })
}
