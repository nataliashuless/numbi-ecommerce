import { NextResponse } from 'next/server'
import { supabase, VentaWhatsApp } from '@/lib/supabase'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get('start_date')
  const endDate = searchParams.get('end_date')

  let query = supabase
    .from('ventas_whatsapp')
    .select('*')
    .order('fecha', { ascending: false })

  if (startDate) {
    query = query.gte('fecha', startDate)
  }
  if (endDate) {
    query = query.lte('fecha', endDate)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const ventas = data as VentaWhatsApp[]

  // Calculate stats
  const totalVentas = ventas.reduce((sum, v) => sum + Number(v.total), 0)
  const totalUnidades = ventas.reduce((sum, v) => sum + v.cantidad, 0)
  const numVentas = ventas.length

  // Group by date for chart
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
  })
}

export async function POST(request: Request) {
  const body = await request.json()

  const { data, error } = await supabase
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

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
  }

  const { error } = await supabase
    .from('ventas_whatsapp')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
