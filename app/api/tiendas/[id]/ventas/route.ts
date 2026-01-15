import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()

  // Get store commission config
  const { data: tienda } = await supabase
    .from('tiendas_terceros')
    .select('comision_tipo, comision_porcentaje, comision_fijo')
    .eq('id', id)
    .single()

  if (!tienda) {
    return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
  }

  // Calculate commission
  const precioVenta = body.precio_venta * body.cantidad
  let comision = 0

  if (tienda.comision_tipo === 'porcentaje' && tienda.comision_porcentaje) {
    comision = precioVenta * (tienda.comision_porcentaje / 100)
  } else if (tienda.comision_tipo === 'fijo' && tienda.comision_fijo) {
    comision = tienda.comision_fijo * body.cantidad
  } else if (tienda.comision_tipo === 'mixto') {
    if (tienda.comision_porcentaje) {
      comision += precioVenta * (tienda.comision_porcentaje / 100)
    }
    if (tienda.comision_fijo) {
      comision += tienda.comision_fijo * body.cantidad
    }
  }

  const neto = precioVenta - comision

  const { data, error } = await supabase
    .from('ventas_terceros')
    .insert([{
      tienda_id: id,
      fecha: body.fecha,
      producto_nombre: body.producto_nombre,
      producto_sku: body.producto_sku || null,
      cantidad: body.cantidad,
      precio_venta: precioVenta,
      comision: comision,
      neto: neto,
      liquidacion_id: null,
    }])
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { searchParams } = new URL(request.url)
  const ventaId = searchParams.get('venta_id')

  if (!ventaId) {
    return NextResponse.json({ error: 'venta_id requerido' }, { status: 400 })
  }

  const { error } = await supabase
    .from('ventas_terceros')
    .delete()
    .eq('id', ventaId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
