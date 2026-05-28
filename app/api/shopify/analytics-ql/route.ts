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

// ShopifyQL syntax has shifted across Shopify Admin API versions. We try
// multiple known-good schemas and pick the first that returns data, so a
// single codepath works across stores on different plans / API ages.
type SchemaVariant = {
  name: string
  totals: string
  daily: string
  bySource: string
  sessionsField: string
  visitorsField: string
}

function buildVariants(dateClause: string): SchemaVariant[] {
  return [
    {
      name: 'customer_journey_summary',
      sessionsField: 'sessions',
      visitorsField: 'visitors',
      totals: `FROM customer_journey_summary SHOW sessions, visitors ${dateClause}`,
      daily: `FROM customer_journey_summary SHOW sessions, visitors GROUP BY day ${dateClause} ORDER BY day ASC`,
      bySource: `FROM customer_journey_summary SHOW sessions GROUP BY referrer_source ${dateClause} ORDER BY sessions DESC`,
    },
    {
      name: 'sessions (online_store_*)',
      sessionsField: 'online_store_sessions',
      visitorsField: 'online_store_visitors',
      totals: `FROM sessions SHOW online_store_sessions, online_store_visitors ${dateClause}`,
      daily: `FROM sessions SHOW online_store_sessions, online_store_visitors GROUP BY day ${dateClause} ORDER BY day ASC`,
      bySource: `FROM sessions SHOW online_store_sessions GROUP BY referrer_source ${dateClause} ORDER BY online_store_sessions DESC`,
    },
    {
      name: 'sessions (short names)',
      sessionsField: 'sessions',
      visitorsField: 'visitors',
      totals: `FROM sessions SHOW sessions, visitors ${dateClause}`,
      daily: `FROM sessions SHOW sessions, visitors GROUP BY day ${dateClause} ORDER BY day ASC`,
      bySource: `FROM sessions SHOW sessions GROUP BY referrer_source ${dateClause} ORDER BY sessions DESC`,
    },
  ]
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

  // First, see if ShopifyQL works at all (and surface scope errors). The
  // `sales` dataset is the universal smoke-test that exists on all plans
  // — if it fails, it's a scope / token problem, not a field-name problem.
  const ping = await shopifyql(shop, accessToken, `FROM sales SHOW total_sales ${dateClause}`)
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

  // ShopifyQL is reachable — now find the right schema for visitor data.
  // Try variants in order; first that returns a non-empty response wins.
  const variants = buildVariants(dateClause)
  const variantAttempts: Array<{ name: string; ok: boolean; code?: string; message?: string }> = []
  let chosenVariant: SchemaVariant | null = null
  let totalsTable: QLTable | null = null
  for (const v of variants) {
    const r = await shopifyql(shop, accessToken, v.totals)
    variantAttempts.push({ name: v.name, ok: r.ok, code: r.ok ? undefined : r.code, message: r.ok ? undefined : r.message })
    if (r.ok) {
      chosenVariant = v
      totalsTable = r.table
      break
    }
  }

  if (!chosenVariant || !totalsTable) {
    return NextResponse.json({
      available: false,
      error: 'No working ShopifyQL schema found for visitor data',
      code: 'NO_SCHEMA_MATCHED',
      hint: 'Tu token tiene scope ShopifyQL pero ninguna sintaxis conocida para visitors funcionó. Compartime el "diagnostics.attempts" abajo y ajusto el endpoint a tu plan/versión.',
      diagnostics: { attempts: variantAttempts },
    })
  }

  // Fetch daily + by-source using the chosen variant
  const [daily, bySource] = await Promise.all([
    shopifyql(shop, accessToken, chosenVariant.daily),
    shopifyql(shop, accessToken, chosenVariant.bySource),
  ])

  // Normalize: the UI expects keys total_sessions, online_store_visitors,
  // day, referrer_source. Rename based on the chosen schema.
  function rename(rows: Array<Record<string, string | number>>): Array<Record<string, string | number>> {
    return rows.map(r => {
      const out: Record<string, string | number> = { ...r }
      if (chosenVariant && chosenVariant.sessionsField !== 'total_sessions') {
        out.total_sessions = r[chosenVariant.sessionsField] ?? 0
      }
      if (chosenVariant && chosenVariant.visitorsField !== 'online_store_visitors') {
        out.online_store_visitors = r[chosenVariant.visitorsField] ?? 0
      }
      return out
    })
  }

  return NextResponse.json({
    available: true,
    range: { start, end },
    schema: chosenVariant.name,
    totals: rename(tableToRows(totalsTable))[0] || null,
    daily: daily.ok ? rename(tableToRows(daily.table)) : [],
    bySource: bySource.ok ? rename(tableToRows(bySource.table)) : [],
    diagnostics: {
      attempts: variantAttempts,
      daily_error: daily.ok ? null : { code: daily.code, message: daily.message },
      bySource_error: bySource.ok ? null : { code: bySource.code, message: bySource.message },
    },
  })
}
