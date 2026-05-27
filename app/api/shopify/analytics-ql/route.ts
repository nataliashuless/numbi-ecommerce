import { NextResponse } from 'next/server'
import { requireAuth, getShopifyCredentials } from '@/lib/auth-helpers'

// Real visits / sessions / CVR via Shopify Analytics ShopifyQL.
// Requires the `read_reports` scope on the connected Shopify app.
// On scope error, returns a structured payload so the UI can show
// step-by-step instructions instead of a generic 401/403.

type QLColumn = { name: string; dataType: string }
type QLTable = { columns: QLColumn[]; rowData: string[][] }

async function shopifyql(shop: string, accessToken: string, query: string): Promise<
  | { ok: true; table: QLTable; raw: unknown }
  | { ok: false; code: string; message: string; raw: unknown }
> {
  const res = await fetch(`https://${shop}/admin/api/2025-07/graphql.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `
        query Ql($q: String!) {
          shopifyqlQuery(query: $q) {
            __typename
            ... on TableResponse {
              tableData {
                rowData
                columns { name dataType }
              }
            }
            ... on ParseError { code message }
          }
        }
      `,
      variables: { q: query },
    }),
    cache: 'no-store',
  })
  const raw = await res.json().catch(() => ({}))

  if (!res.ok) {
    return { ok: false, code: `HTTP_${res.status}`, message: JSON.stringify(raw).slice(0, 500), raw }
  }
  if (raw?.errors?.length) {
    const first = raw.errors[0]
    return { ok: false, code: first?.extensions?.code || 'GRAPHQL_ERROR', message: first?.message || 'GraphQL error', raw }
  }
  const node = raw?.data?.shopifyqlQuery
  if (!node) {
    return { ok: false, code: 'EMPTY_RESPONSE', message: 'shopifyqlQuery returned null', raw }
  }
  if (node.__typename === 'ParseError') {
    return { ok: false, code: node.code || 'PARSE_ERROR', message: node.message || 'Parse error', raw }
  }
  if (node.__typename === 'TableResponse') {
    return { ok: true, table: node.tableData as QLTable, raw }
  }
  return { ok: false, code: 'UNKNOWN_RESPONSE_TYPE', message: node.__typename || 'unknown', raw }
}

function tableToRows(t: QLTable): Array<Record<string, string | number>> {
  return (t.rowData || []).map(row => {
    const obj: Record<string, string | number> = {}
    t.columns.forEach((col, idx) => {
      const v = row[idx]
      if (col.dataType === 'NUMBER' || col.dataType === 'PERCENT' || col.dataType === 'CURRENCY') {
        obj[col.name] = Number(v) || 0
      } else {
        obj[col.name] = v
      }
    })
    return obj
  })
}

export async function GET(request: Request) {
  const { error } = await requireAuth()
  if (error) return error

  const credentials = await getShopifyCredentials()
  const shop = credentials?.shopify_shop
  const accessToken = credentials?.shopify_access_token
  if (!shop || !accessToken) {
    return NextResponse.json({ error: 'Shopify not connected' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const start = searchParams.get('start_date') || new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)
  const end = searchParams.get('end_date') || new Date().toISOString().slice(0, 10)
  const dateClause = `SINCE ${start} UNTIL ${end}`

  // Try a single small query first to detect scope issues cheaply.
  const ping = await shopifyql(shop, accessToken, `FROM sessions SHOW total_sessions ${dateClause}`)

  if (!ping.ok) {
    const isScopeError =
      /scope/i.test(ping.message) ||
      /access denied/i.test(ping.message) ||
      ping.code === 'ACCESS_DENIED' ||
      ping.code === 'HTTP_403'
    return NextResponse.json({
      available: false,
      error: ping.message,
      code: ping.code,
      hint: isScopeError
        ? 'El access token no tiene el scope read_reports. Pasos: 1) En Shopify Admin → Settings → Apps → Develop apps → la app conectada, agregá el scope read_reports. 2) Re-instalá la app (re-authorize). 3) El token nuevo ya devuelve datos de ShopifyQL.'
        : null,
      raw: ping.raw,
    })
  }

  // Now run the full set of queries in parallel
  const [
    totals,
    daily,
    bySource,
  ] = await Promise.all([
    // Aggregated KPIs for the period
    shopifyql(shop, accessToken, `
      FROM sessions
      SHOW total_sessions, online_store_visitors
      ${dateClause}
    `),
    // Daily trend
    shopifyql(shop, accessToken, `
      FROM sessions
      SHOW total_sessions, online_store_visitors
      GROUP BY day
      ${dateClause}
      ORDER BY day ASC
    `),
    // Sessions by referrer source (organic, direct, social, ads, …)
    shopifyql(shop, accessToken, `
      FROM sessions
      SHOW total_sessions
      GROUP BY referrer_source
      ${dateClause}
      ORDER BY total_sessions DESC
    `),
  ])

  return NextResponse.json({
    available: true,
    range: { start, end },
    totals: totals.ok ? tableToRows(totals.table)[0] || null : null,
    daily: daily.ok ? tableToRows(daily.table) : [],
    bySource: bySource.ok ? tableToRows(bySource.table) : [],
    diagnostics: {
      totals_error: totals.ok ? null : { code: totals.code, message: totals.message },
      daily_error: daily.ok ? null : { code: daily.code, message: daily.message },
      bySource_error: bySource.ok ? null : { code: bySource.code, message: bySource.message },
    },
  })
}
