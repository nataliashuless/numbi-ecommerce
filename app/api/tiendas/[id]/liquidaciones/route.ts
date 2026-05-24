import { NextResponse } from 'next/server'
import { requireAuth, getAdminClient } from '@/lib/auth-helpers'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error

  const { id } = await params
  const supabase = getAdminClient()

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
  const { error } = await requireAuth()
  if (error) return error

  const { id } = await params
  const supabase = getAdminClient()

  const body = await request.json()

  // Verify the liquidacion belongs to this tienda
  const { data: existingLiquidacion } = await supabase
    .from('liquidaciones')
    .select('tienda_id')
    .eq('id', body.liquidacion_id)
    .single()

  if (!existingLiquidacion || existingLiquidacion.tienda_id !== id) {
    return NextResponse.json({ error: 'Liquidación no encontrada' }, { status: 404 })
  }

  // Update settlement status (mark as paid)
  const { data, error: updateError } = await supabase
    .from('liquidaciones')
    .update({
      estado: body.estado,
      notas: body.notas,
    })
    .eq('id', body.liquidacion_id)
    .eq('tienda_id', id)
    .select()
    .single()

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
