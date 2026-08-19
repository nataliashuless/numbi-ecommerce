import { NextResponse } from 'next/server'
import { requireAuth, getAdminClient } from '@/lib/auth-helpers'

export const maxDuration = 300

interface SiigoWarehouse {
  id: number
  name: string
  active?: boolean
}

interface SiigoProductStock {
  id: number
  name: string
  quantity: number
}

interface SiigoProduct {
  id: string
  code: string
  name: string
  account_group?: { id: number; name: string }
  available_quantity?: number
  warehouses?: SiigoProductStock[]
}

async function siigoToken(supabase: ReturnType<typeof getAdminClient>): Promise<string> {
  const { data: cred } = await supabase
    .from('user_integrations')
    .select('siigo_username, siigo_access_key')
    .limit(1)
    .maybeSingle()
  if (!cred?.siigo_username || !cred?.siigo_access_key) throw new Error('Siigo no configurado')
  const res = await fetch('https://services.siigo.com/alliances/api/siigoapi-users/v1/sign-in', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: cred.siigo_username, access_key: cred.siigo_access_key }),
  })
  const data = await res.json()
  if (!res.ok || !data.access_token) throw new Error('Error autenticando Siigo')
  return data.access_token
}

async function siigoFetch(token: string, path: string): Promise<Response> {
  return fetch(`https://api.siigo.com${path}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Partner-Id': 'shuless',
    },
  })
}

export async function POST() {
  const { error } = await requireAuth()
  if (error) return error

  try {
    const supabase = getAdminClient()
    const token = await siigoToken(supabase)

    // 1. Warehouses
    const whRes = await siigoFetch(token, '/v1/warehouses')
    if (!whRes.ok) {
      return NextResponse.json({ error: `Warehouses ${whRes.status}` }, { status: 500 })
    }
    const warehouses: SiigoWarehouse[] = await whRes.json()
    if (warehouses.length > 0) {
      await supabase.from('siigo_warehouses').upsert(
        warehouses.map(w => ({
          id: w.id,
          name: w.name,
          active: w.active ?? true,
          synced_at: new Date().toISOString(),
        })),
        { onConflict: 'id' }
      )
    }

    // 2. Product stock — paginate
    let page = 1
    let total = 0
    let stockRows: Array<Record<string, unknown>> = []
    const now = new Date().toISOString()

    while (page <= 50) {
      const res = await siigoFetch(token, `/v1/products?include=stock&page_size=100&page=${page}`)
      if (res.status === 429) {
        await new Promise(r => setTimeout(r, 2000 * page))
        continue
      }
      if (!res.ok) {
        return NextResponse.json({ error: `Products ${res.status}`, partial: total }, { status: 500 })
      }
      const data: { results: SiigoProduct[]; pagination?: { total_results?: number } } = await res.json()
      const products = data.results || []
      if (products.length === 0) break

      for (const p of products) {
        for (const w of p.warehouses || []) {
          if (w.id < 0) continue
          stockRows.push({
            product_id: p.id,
            warehouse_id: w.id,
            product_code: p.code,
            product_name: p.name,
            account_group_id: p.account_group?.id || null,
            account_group_name: p.account_group?.name || null,
            warehouse_name: w.name,
            quantity: w.quantity,
            available_total: p.available_quantity || 0,
            synced_at: now,
          })
        }
      }

      total += products.length

      if (stockRows.length >= 1000) {
        await supabase
          .from('siigo_product_stock')
          .upsert(stockRows, { onConflict: 'product_id,warehouse_id' })
        stockRows = []
      }

      if (products.length < 100) break
      page++
      await new Promise(r => setTimeout(r, 300))
    }

    if (stockRows.length > 0) {
      await supabase
        .from('siigo_product_stock')
        .upsert(stockRows, { onConflict: 'product_id,warehouse_id' })
    }

    await supabase.from('siigo_stock_sync_state').upsert(
      { id: 1, last_full_sync_at: now, products_synced: total },
      { onConflict: 'id' }
    )

    return NextResponse.json({
      products: total,
      warehouses: warehouses.length,
      synced_at: now,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error syncing stock'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET() {
  const { error } = await requireAuth()
  if (error) return error

  const supabase = getAdminClient()
  const { data: state } = await supabase
    .from('siigo_stock_sync_state')
    .select('*')
    .eq('id', 1)
    .maybeSingle()
  const { count } = await supabase
    .from('siigo_product_stock')
    .select('*', { count: 'exact', head: true })
  const { count: missingAccountGroupRows } = await supabase
    .from('siigo_product_stock')
    .select('*', { count: 'exact', head: true })
    .is('account_group_id', null)
    .gt('quantity', 0)

  return NextResponse.json({
    rows: count || 0,
    products_synced: state?.products_synced || 0,
    last_sync: state?.last_full_sync_at || null,
    missing_account_group_rows: missingAccountGroupRows || 0,
  })
}
