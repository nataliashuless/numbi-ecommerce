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

export async function GET(request: Request) {
  const { error } = await requireAuth()
  if (error) return error

  const supabase = getAdminClient()
  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get('start_date')
  const endDate = searchParams.get('end_date')
  const page = parseInt(searchParams.get('page') || '1')
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 100)
  const offset = (page - 1) * limit

  let query = supabase
    .from('ventas_whatsapp')
    .select('*', { count: 'exact' })
    .order('fecha', { ascending: false })

  if (startDate) query = query.gte('fecha', startDate)
  if (endDate) query = query.lte('fecha', endDate)

  query = query.range(offset, offset + limit - 1)

  const { data, error: queryError, count } = await query

  if (queryError) {
    return NextResponse.json({ error: queryError.message }, { status: 500 })
  }

  const ventas = data as VentaWhatsApp[]

  const totalVentas = ventas.reduce((sum, v) => sum + Number(v.total), 0)
  const totalUnidades = ventas.reduce((sum, v) => sum + v.cantidad, 0)
  const numVentas = ventas.length

  const chartDataMap: Record<string, { sales: number; orders: number; units: number }> = {}
  ventas.forEach(v => {
    const date = v.fecha
    if (!chartDataMap[date]) {
      chartDataMap[date] = { sales: 0, orders: 0, units: 0 }
    }
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
      page,
      limit,
      total: count || 0,
      pages: Math.ceil((count || 0) / limit),
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
