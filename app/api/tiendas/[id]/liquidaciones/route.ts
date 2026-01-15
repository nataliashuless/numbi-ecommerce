import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()

  // Get all unsettled sales for this store in the period
  const { data: ventasPendientes, error: ventasError } = await supabase
    .from('ventas_terceros')
    .select('*')
    .eq('tienda_id', id)
    .is('liquidacion_id', null)
    .gte('fecha', body.periodo_inicio)
    .lte('fecha', body.periodo_fin)

  if (ventasError) {
    return NextResponse.json({ error: ventasError.message }, { status: 500 })
  }

  if (!ventasPendientes || ventasPendientes.length === 0) {
    return NextResponse.json({ error: 'No hay ventas pendientes en este período' }, { status: 400 })
  }

  // Calculate totals
  const totalVentas = ventasPendientes.reduce((sum, v) => sum + Number(v.precio_venta), 0)
  const totalComisiones = ventasPendientes.reduce((sum, v) => sum + Number(v.comision), 0)
  const totalNeto = ventasPendientes.reduce((sum, v) => sum + Number(v.neto), 0)

  // Create settlement
  const { data: liquidacion, error: liquidacionError } = await supabase
    .from('liquidaciones')
    .insert([{
      tienda_id: id,
      fecha: body.fecha || new Date().toISOString().split('T')[0],
      periodo_inicio: body.periodo_inicio,
      periodo_fin: body.periodo_fin,
      total_ventas: totalVentas,
      total_comisiones: totalComisiones,
      total_neto: totalNeto,
      estado: 'pendiente',
      notas: body.notas || null,
    }])
    .select()
    .single()

  if (liquidacionError) {
    return NextResponse.json({ error: liquidacionError.message }, { status: 500 })
  }

  // Update sales with settlement ID
  const ventaIds = ventasPendientes.map(v => v.id)
  const { error: updateError } = await supabase
    .from('ventas_terceros')
    .update({ liquidacion_id: liquidacion.id })
    .in('id', ventaIds)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({
    liquidacion,
    ventasLiquidadas: ventasPendientes.length,
  })
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const body = await request.json()

  // Update settlement status (mark as paid)
  const { data, error } = await supabase
    .from('liquidaciones')
    .update({
      estado: body.estado,
      notas: body.notas,
    })
    .eq('id', body.liquidacion_id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
