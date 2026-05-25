import { NextResponse } from 'next/server'
import { requireAuth, getAdminClient } from '@/lib/auth-helpers'
import { getCustomersByIds } from '@/lib/siigo-client'

export async function GET(request: Request) {
  const { error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get('start_date')
  const endDate = searchParams.get('end_date')

  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'start_date y end_date requeridos' }, { status: 400 })
  }

  try {
    const supabase = getAdminClient()

    const allCached: Array<Record<string, unknown>> = []
    const pageSize = 1000
    let pageStart = 0
    for (let i = 0; i < 50; i++) {
      const { data: page, error: pErr } = await supabase
        .from('siigo_invoices')
        .select('id, number, prefix, name, date, total, balance, customer_id, customer_identification, observations, items')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: false })
        .range(pageStart, pageStart + pageSize - 1)
      if (pErr) {
        return NextResponse.json({ error: pErr.message }, { status: 500 })
      }
      if (!page || page.length === 0) break
      allCached.push(...page)
      if (page.length < pageSize) break
      pageStart += pageSize
    }
    const cached = allCached

    type Cached = {
      id: string
      number: number
      prefix: string
      name: string
      date: string
      total: number
      balance: number
      customer_id: string | null
      customer_identification: string | null
      observations: string
      items: Array<{ code: string; description: string; quantity: number; price: number; total?: number; discount?: { percentage?: number; value?: number } }>
    }
    const rows = (cached || []) as Cached[]

    const refreshCustomers = searchParams.get('refresh_customers') === 'true'
    const customerIds = Array.from(
      new Set(rows.map(r => r.customer_id).filter(Boolean) as string[])
    )

    const namesMap = new Map<string, string>()
    if (customerIds.length > 0) {
      // Chunk by 500 to keep URL size and per-query row count safe
      const CHUNK = 500
      for (let i = 0; i < customerIds.length; i += CHUNK) {
        const ids = customerIds.slice(i, i + CHUNK)
        const { data: customersCached } = await supabase
          .from('siigo_customers')
          .select('id, name')
          .in('id', ids)
        for (const row of (customersCached || []) as Array<{ id: string; name: string }>) {
          if (row.name) namesMap.set(row.id, row.name)
        }
      }

      // Only call Siigo on demand. Default behavior: use what's in cache.
      // Pass ?refresh_customers=true to backfill missing names (slow).
      if (refreshCustomers) {
        const missing = customerIds.filter(id => !namesMap.has(id))
        if (missing.length > 0) {
          const fresh = await getCustomersByIds(missing)
          for (const [id, name] of fresh) namesMap.set(id, name)
          const toUpsert = Array.from(fresh.entries()).map(([id, name]) => ({
            id,
            name,
            identification: rows.find(r => r.customer_id === id)?.customer_identification || null,
            last_synced: new Date().toISOString(),
          }))
          if (toUpsert.length > 0) {
            await supabase.from('siigo_customers').upsert(toUpsert, { onConflict: 'id' })
          }
        }
      }
    }

    const { data: waVentas } = await supabase
      .from('ventas_whatsapp')
      .select('siigo_invoice_id')
      .not('siigo_invoice_id', 'is', null)
    const whatsappInvoiceIds = new Set((waVentas || []).map(v => v.siigo_invoice_id))

    const { data: tiendasWithSiigo } = await supabase
      .from('tiendas_terceros')
      .select('id, nombre, nombre_corto, siigo_customer_identification')
      .not('siigo_customer_identification', 'is', null)
    const tiendasByNit = new Map<string, { id: string; nombre: string }>()
    for (const t of (tiendasWithSiigo || []) as Array<{ id: string; nombre: string; nombre_corto: string | null; siigo_customer_identification: string }>) {
      tiendasByNit.set(t.siigo_customer_identification, { id: t.id, nombre: t.nombre_corto || t.nombre })
    }

    const enriched = rows.map(inv => {
      const tiendaMatch = inv.customer_identification
        ? tiendasByNit.get(inv.customer_identification)
        : undefined
      let source: 'whatsapp' | 'tienda' | 'unknown' = 'unknown'
      if (whatsappInvoiceIds.has(inv.id)) source = 'whatsapp'
      else if (tiendaMatch) source = 'tienda'
      return {
        id: inv.id,
        number: inv.number,
        prefix: inv.prefix,
        name: inv.name,
        date: inv.date,
        total: inv.total,
        balance: inv.balance,
        observations: inv.observations,
        items: inv.items,
        customer: {
          id: inv.customer_id || '',
          identification: inv.customer_identification || '',
        },
        customer_name: inv.customer_id ? namesMap.get(inv.customer_id) || null : null,
        source,
        tienda_id: tiendaMatch?.id || null,
        tienda_nombre: tiendaMatch?.nombre || null,
      }
    })

    return NextResponse.json({
      invoices: enriched,
      total: enriched.length,
      totalAmount: enriched.reduce((sum, i) => sum + (i.total || 0), 0),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error obteniendo facturas Siigo'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
