import { NextResponse } from 'next/server'
import { requireAuth, getAdminClient } from '@/lib/auth-helpers'

interface VentaWhatsApp {
  id: string
  fecha: string
  cliente_nombre: string | null
  cliente_telefono: string | null
  producto_nombre: string
  producto_variante: string | null
  producto_sku: string | null
  cantidad: number
  precio_unitario: number
  total: number
  notas: string | null
}

// WhatsApp tab now reads from Siigo invoices flagged as WhatsApp source
// (i.e. invoices whose customer NIT is NOT a registered tienda AND whose
// observations do NOT reference a Shopify order number). Each Siigo invoice
// renders as one row in the WhatsApp view.
export async function GET(request: Request) {
  const { error } = await requireAuth()
  if (error) return error

  const supabase = getAdminClient()
  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get('start_date')
  const endDate = searchParams.get('end_date')

  type CachedInv = {
    id: string
    number: number
    name: string
    date: string
    total: number
    customer_id: string | null
    customer_identification: string | null
    observations: string | null
    items: Array<{ code: string; description: string; quantity: number; price: number; total?: number }>
  }
  const allInvoices: CachedInv[] = []
  const pageSize = 1000
  let pageStart = 0
  for (let i = 0; i < 50; i++) {
    let q = supabase
      .from('siigo_invoices')
      .select('id, number, name, date, total, customer_id, customer_identification, observations, items')
      .order('date', { ascending: false })
      .range(pageStart, pageStart + pageSize - 1)
    if (startDate) q = q.gte('date', startDate)
    if (endDate) q = q.lte('date', endDate)
    const { data: page, error: qErr } = await q
    if (qErr) {
      return NextResponse.json({ error: qErr.message }, { status: 500 })
    }
    if (!page || page.length === 0) break
    allInvoices.push(...(page as CachedInv[]))
    if (page.length < pageSize) break
    pageStart += pageSize
  }

  const { data: tiendasWithSiigo } = await supabase
    .from('tiendas_terceros')
    .select('siigo_customer_identification')
    .not('siigo_customer_identification', 'is', null)
  const tiendaNits = new Set(
    (tiendasWithSiigo || []).map((t: { siigo_customer_identification: string }) => t.siigo_customer_identification)
  )

  const { data: shopifyOrders } = await supabase
    .from('shopify_orders')
    .select('order_number')
    .range(0, 49999)
  const shopifyOrderNumbers = new Set(
    (shopifyOrders || []).map((o: { order_number: number }) => o.order_number)
  )

  const extractOrderNum = (obs: string | null): number | null => {
    if (!obs) return null
    const m = obs.match(/#(\d+)/)
    return m ? parseInt(m[1], 10) : null
  }

  const whatsappInvoices = allInvoices.filter(inv => {
    if (inv.customer_identification && tiendaNits.has(inv.customer_identification)) return false
    const orderNum = extractOrderNum(inv.observations)
    if (orderNum && shopifyOrderNumbers.has(orderNum)) return false
    return true
  })

  const customerIds = Array.from(
    new Set(whatsappInvoices.map(i => i.customer_id).filter(Boolean) as string[])
  )
  const namesMap = new Map<string, string>()
  if (customerIds.length > 0) {
    const CHUNK = 500
    for (let i = 0; i < customerIds.length; i += CHUNK) {
      const ids = customerIds.slice(i, i + CHUNK)
      const { data: cachedCustomers } = await supabase
        .from('siigo_customers')
        .select('id, name')
        .in('id', ids)
      for (const row of (cachedCustomers || []) as Array<{ id: string; name: string }>) {
        if (row.name) namesMap.set(row.id, row.name)
      }
    }
  }

  const ventas = whatsappInvoices.map(inv => {
    const realItems = (inv.items || []).filter(it => it.code !== 'ENVIO')
    const cantidad = realItems.reduce((s, it) => s + (it.quantity || 0), 0)
    const productSummary =
      realItems.length === 0
        ? '—'
        : realItems.length === 1
          ? realItems[0].description
          : `${realItems[0].description} +${realItems.length - 1} más`
    return {
      id: inv.id,
      fecha: inv.date,
      cliente_nombre: inv.customer_id ? namesMap.get(inv.customer_id) || inv.customer_identification : inv.customer_identification,
      cliente_telefono: null as string | null,
      cliente_cedula: inv.customer_identification,
      producto_nombre: productSummary,
      producto_variante: null as string | null,
      producto_sku: realItems[0]?.code || null,
      cantidad,
      precio_unitario: cantidad > 0 ? inv.total / cantidad : inv.total,
      total: inv.total,
      notas: inv.observations,
      siigo_invoice_id: inv.id,
      siigo_invoice_number: inv.name,
    }
  })

  const totalVentas = ventas.reduce((sum, v) => sum + Number(v.total), 0)
  const totalUnidades = ventas.reduce((sum, v) => sum + v.cantidad, 0)
  const numVentas = ventas.length

  const chartDataMap: Record<string, { sales: number; orders: number; units: number }> = {}
  ventas.forEach(v => {
    const date = v.fecha
    if (!chartDataMap[date]) chartDataMap[date] = { sales: 0, orders: 0, units: 0 }
    chartDataMap[date].sales += Number(v.total)
    chartDataMap[date].orders += 1
    chartDataMap[date].units += v.cantidad
  })

  const chartData = Object.entries(chartDataMap)
    .map(([date, data]) => ({
      date,
      sales: Math.round(data.sales),
      orders: data.orders,
      units: data.units,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return NextResponse.json({
    ventas,
    stats: {
      totalVentas,
      totalUnidades,
      numVentas,
      promedioVenta: numVentas > 0 ? totalVentas / numVentas : 0,
    },
    chartData,
    pagination: {
      page: 1,
      limit: ventas.length,
      total: ventas.length,
      pages: 1,
    },
  })
}

export async function POST(request: Request) {
  const { error } = await requireAuth()
  if (error) return error

  const supabase = getAdminClient()
  const body = await request.json()

  const { data, error: insertError } = await supabase
    .from('ventas_whatsapp')
    .insert([{
      fecha: body.fecha,
      cliente_nombre: body.cliente_nombre || null,
      cliente_telefono: body.cliente_telefono || null,
      cliente_cedula: body.cliente_cedula || null,
      cliente_direccion: body.cliente_direccion || null,
      cliente_ciudad: body.cliente_ciudad || null,
      cliente_email: body.cliente_email || null,
      producto_nombre: body.producto_nombre,
      producto_variante: body.producto_variante || null,
      producto_sku: body.producto_sku || null,
      cantidad: body.cantidad || 1,
      precio_unitario: body.precio_unitario,
      total: body.total || (body.cantidad || 1) * body.precio_unitario,
      notas: body.notas || null,
    }])
    .select()
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function PATCH(request: Request) {
  const { error } = await requireAuth()
  if (error) return error

  const supabase = getAdminClient()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  const body = await request.json()

  if (!id) {
    return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
  }

  const { data, error: updateError } = await supabase
    .from('ventas_whatsapp')
    .update(body)
    .eq('id', id)
    .select()
    .single()

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function DELETE(request: Request) {
  const { error } = await requireAuth()
  if (error) return error

  const supabase = getAdminClient()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
  }

  const { error: deleteError } = await supabase
    .from('ventas_whatsapp')
    .delete()
    .eq('id', id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
