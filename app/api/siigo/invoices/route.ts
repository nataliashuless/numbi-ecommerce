import { NextResponse } from 'next/server'
import { requireAuth, getAdminClient } from '@/lib/auth-helpers'
import { listInvoices, getCustomersByIds } from '@/lib/siigo-client'

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
    const invoices = await listInvoices(startDate, endDate)
    const supabase = getAdminClient()

    const customerIds = Array.from(
      new Set(invoices.map(i => i.customer?.id).filter(Boolean) as string[])
    )

    const namesMap = new Map<string, string>()

    if (customerIds.length > 0) {
      const { data: cached } = await supabase
        .from('siigo_customers')
        .select('id, name')
        .in('id', customerIds)
      for (const row of (cached || []) as Array<{ id: string; name: string }>) {
        if (row.name) namesMap.set(row.id, row.name)
      }
    }

    const missing = customerIds.filter(id => !namesMap.has(id))
    if (missing.length > 0) {
      const freshNames = await getCustomersByIds(missing)
      for (const [id, name] of freshNames) {
        namesMap.set(id, name)
      }
      const rowsToUpsert = Array.from(freshNames.entries()).map(([id, name]) => {
        const inv = invoices.find(i => i.customer?.id === id)
        return {
          id,
          name,
          identification: inv?.customer?.identification || null,
          last_synced: new Date().toISOString(),
        }
      })
      if (rowsToUpsert.length > 0) {
        await supabase.from('siigo_customers').upsert(rowsToUpsert, { onConflict: 'id' })
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

    const enriched = invoices.map(inv => {
      const tiendaMatch = inv.customer?.identification
        ? tiendasByNit.get(inv.customer.identification)
        : undefined
      let source: 'whatsapp' | 'tienda' | 'unknown' = 'unknown'
      if (whatsappInvoiceIds.has(inv.id)) source = 'whatsapp'
      else if (tiendaMatch) source = 'tienda'
      return {
        ...inv,
        customer_name: namesMap.get(inv.customer?.id) || null,
        source,
        tienda_id: tiendaMatch?.id || null,
        tienda_nombre: tiendaMatch?.nombre || null,
      }
    })

    return NextResponse.json({
      invoices: enriched,
      total: enriched.length,
      totalAmount: enriched.reduce((sum, i) => sum + i.total, 0),
      cache: {
        cached: customerIds.length - missing.length,
        fetched: missing.length,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error obteniendo facturas Siigo'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
