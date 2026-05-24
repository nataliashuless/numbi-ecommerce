import { NextResponse } from 'next/server'
import { requireAuth, getAdminClient, verifyTiendaOwnership } from '@/lib/auth-helpers'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Require authentication
  const { user, error } = await requireAuth()
  if (error) return error

  const { id } = await params
  const supabase = getAdminClient()

  // Verify ownership of the tienda
  const isOwner = await verifyTiendaOwnership(id, user!.id)
  if (!isOwner) {
    return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
  }

  const body = await request.json()

  const { data, error: insertError } = await supabase
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

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Require authentication
  const { user, error } = await requireAuth()
  if (error) return error

  const { id } = await params
  const supabase = getAdminClient()

  // Verify ownership of the tienda
  const isOwner = await verifyTiendaOwnership(id, user!.id)
  if (!isOwner) {
    return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
  }

  const { searchParams } = new URL(request.url)
  const consignacionId = searchParams.get('consignacion_id')

  if (!consignacionId) {
    return NextResponse.json({ error: 'consignacion_id requerido' }, { status: 400 })
  }

  // Verify the consignacion belongs to this tienda
  const { data: consignacion } = await supabase
    .from('consignaciones')
    .select('tienda_id')
    .eq('id', consignacionId)
    .single()

  if (!consignacion || consignacion.tienda_id !== id) {
    return NextResponse.json({ error: 'Consignación no encontrada' }, { status: 404 })
  }

  const { error: deleteError } = await supabase
    .from('consignaciones')
    .delete()
    .eq('id', consignacionId)
    .eq('tienda_id', id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
