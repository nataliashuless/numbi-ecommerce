import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()

  const { data, error } = await supabase
    .from('consignaciones')
    .insert([{
      tienda_id: id,
      fecha: body.fecha,
      tipo: body.tipo, // 'envio' or 'devolucion'
      producto_nombre: body.producto_nombre,
      producto_sku: body.producto_sku || null,
      cantidad: body.cantidad,
      precio_unitario: body.precio_unitario,
      notas: body.notas || null,
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
  const consignacionId = searchParams.get('consignacion_id')

  if (!consignacionId) {
    return NextResponse.json({ error: 'consignacion_id requerido' }, { status: 400 })
  }

  const { error } = await supabase
    .from('consignaciones')
    .delete()
    .eq('id', consignacionId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
