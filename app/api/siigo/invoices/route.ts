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

    const customerIds = invoices.map(i => i.customer?.id).filter(Boolean) as string[]
    const namesMap = await getCustomersByIds(customerIds)

    const supabase = getAdminClient()
    const { data: waVentas } = await supabase
      .from('ventas_whatsapp')
      .select('siigo_invoice_id')
      .not('siigo_invoice_id', 'is', null)
    const whatsappInvoiceIds = new Set((waVentas || []).map(v => v.siigo_invoice_id))

    const enriched = invoices.map(inv => ({
      ...inv,
      customer_name: namesMap.get(inv.customer?.id) || null,
      source: whatsappInvoiceIds.has(inv.id) ? 'whatsapp' : 'unknown',
    }))

    return NextResponse.json({
      invoices: enriched,
      total: enriched.length,
      totalAmount: enriched.reduce((sum, i) => sum + i.total, 0),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error obteniendo facturas Siigo'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
