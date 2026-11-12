import { isCronRequest } from '@/lib/cron-auth'
import { NextResponse } from 'next/server'
import { requireAuth, getShopifyCredentials } from '@/lib/auth-helpers'

// ShopifyQL 2026-10: native store traffic; never infer visitors from orders.
export async function GET(request: Request) {
  if (!isCronRequest(request)) {
    const { error } = await requireAuth()
    if (error) return error
  }
  const credentials = await getShopifyCredentials()
  if (!credentials?.shopify_shop || !credentials.shopify_access_token) return NextResponse.json({ available: false, source: 'shopify', error: 'Shopify no conectado' })
  const params = new URL(request.url).searchParams
  const start = params.get('start_date') || ''
  const end = params.get('end_date') || ''
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
  if (!validDate(start) || !validDate(end) || start > end) return NextResponse.json({ error: 'Fechas inválidas' }, { status: 400 })
  const shop = credentials.shopify_shop.replace(/^https?:\/\//, '').replace(/\/$/, '')
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)) return NextResponse.json({ available: false, source: 'shopify', error: 'Dominio Shopify inválido' })
  try {
    const response = await fetch(`https://${shop}/admin/api/2026-10/graphql.json`, {
      method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(30000),
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': credentials.shopify_access_token },
      body: JSON.stringify({ query: 'query Traffic($q: String!) { shopifyqlQuery(query: $q) { tableData { columns { name dataType } rows } parseErrors } }', variables: { q: `FROM sessions SHOW sessions, online_store_visitors, sessions_with_cart_additions, sessions_that_reached_checkout, sessions_that_completed_checkout, conversion_rate SINCE ${start} UNTIL ${end}` } }),
    })
    const result = await response.json()
    const node = result.data?.shopifyqlQuery
    if (!response.ok || result.errors?.length || node?.parseErrors?.length || !node?.tableData) {
      return NextResponse.json({ available: false, source: 'shopify', error: 'Shopify no permitió consultar tráfico. Comprueba el permiso read_reports de la integración.' })
    }
    const table = node.tableData as { columns: Array<{ name: string }>; rows: Array<Record<string, unknown> | unknown[]> }
    const raw = table.rows[0]
    if (!raw) return NextResponse.json({ available: false, source: 'shopify', error: 'Shopify no devolvió tráfico para esas fechas' })
    const value = (name: string) => {
      const input = Array.isArray(raw) ? raw[table.columns.findIndex(column => column.name === name)] : raw[name]
      if (input === null || input === undefined || input === '') return null
      const number = Number(input)
      return Number.isFinite(number) && number >= 0 ? number : null
    }
    return NextResponse.json({ available: true, source: 'shopify', range: { start, end }, totals: {
      totalUsers: value('online_store_visitors'), sessions: value('sessions'), addToCarts: value('sessions_with_cart_additions'), checkouts: value('sessions_that_reached_checkout'), ecommercePurchases: value('sessions_that_completed_checkout'), conversionRate: value('conversion_rate'),
    } })
  } catch {
    return NextResponse.json({ available: false, source: 'shopify', error: 'No se pudo consultar el tráfico de Shopify' })
  }
}
