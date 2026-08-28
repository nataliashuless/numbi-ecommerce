import { NextResponse } from 'next/server'
import { requireAuth, getAdminClient } from '@/lib/auth-helpers'

export async function GET() {
  const { error } = await requireAuth()
  if (error) return error

  const supabase = getAdminClient()

  const { data: tiendas, error: tiendasError } = await supabase
    .from('tiendas_terceros')
    .select('*')
    .order('nombre')

  if (tiendasError) {
    return NextResponse.json({ error: tiendasError.message }, { status: 500 })
  }

  const tiendaIds = tiendas.map(t => t.id)

  const { data: allConsignaciones } = await supabase
    .from('consignaciones')
    .select('tienda_id, tipo, cantidad')
    .in('tienda_id', tiendaIds)

  const { data: allVentas } = await supabase
    .from('ventas_terceros')
    .select('tienda_id, cantidad, neto, liquidacion_id')
    .in('tienda_id', tiendaIds)

  const tiendasConStats = tiendas.map((tienda) => {
    const consignaciones = (allConsignaciones || []).filter(c => c.tienda_id === tienda.id)
    const ventas = (allVentas || []).filter(v => v.tienda_id === tienda.id)

    const inventarioEnviado = consignaciones
      .filter(c => c.tipo === 'envio')
      .reduce((sum, c) => sum + c.cantidad, 0)
    const inventarioDevuelto = consignaciones
      .filter(c => c.tipo === 'devolucion')
      .reduce((sum, c) => sum + c.cantidad, 0)

    const unidadesVendidas = ventas.reduce((sum, v) => sum + v.cantidad, 0)

    const ventasPendientes = ventas.filter(v => v.liquidacion_id === null)
    const montoPendiente = ventasPendientes.reduce((sum, v) => sum + Number(v.neto), 0)

    return {
      ...tienda,
      inventarioActual: inventarioEnviado - inventarioDevuelto - unidadesVendidas,
      ventasPendientes: ventasPendientes.length,
      montoPendiente,
    }
  })

  const totalTiendas = tiendas.length
  const tiendasActivas = tiendas.filter(t => t.activa).length
  const inventarioTotal = tiendasConStats.reduce((sum, t) => sum + t.inventarioActual, 0)
  const montoPendienteTotal = tiendasConStats.reduce((sum, t) => sum + t.montoPendiente, 0)

  return NextResponse.json({
    tiendas: tiendasConStats,
    stats: {
      totalTiendas,
      tiendasActivas,
      inventarioTotal,
      montoPendienteTotal,
    },
  })
}

export async function POST(request: Request) {
  const { error } = await requireAuth()
  if (error) return error

  const supabase = getAdminClient()
  const body = await request.json()

  const { data, error: insertError } = await supabase
    .from('tiendas_terceros')
    .insert([{
      nombre: body.nombre,
      nombre_corto: body.nombre_corto || null,
      contacto_nombre: body.contacto_nombre || null,
      contacto_telefono: body.contacto_telefono || null,
      contacto_email: body.contacto_email || null,
      direccion: body.direccion || null,
      comision_tipo: body.comision_tipo || 'porcentaje',
      comision_porcentaje: body.comision_porcentaje || null,
      comision_fijo: body.comision_fijo || null,
      notas: body.notas || null,
      activa: true,
      siigo_customer_identification: body.siigo_customer_identification || null,
      siigo_warehouse_id: body.siigo_warehouse_id ? Number(body.siigo_warehouse_id) : null,
    }])
    .select()
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function PUT(request: Request) {
  const { error } = await requireAuth()
  if (error) return error

  const supabase = getAdminClient()
  const body = await request.json()

  const updateData: Record<string, unknown> = {
    nombre: body.nombre,
    contacto_nombre: body.contacto_nombre || null,
    contacto_telefono: body.contacto_telefono || null,
    contacto_email: body.contacto_email || null,
    direccion: body.direccion || null,
    comision_tipo: body.comision_tipo,
    comision_porcentaje: body.comision_porcentaje || null,
    comision_fijo: body.comision_fijo || null,
    notas: body.notas || null,
    activa: body.activa,
    updated_at: new Date().toISOString(),
  }

  if ('nombre_corto' in body) updateData.nombre_corto = body.nombre_corto || null
  if ('siigo_customer_identification' in body) updateData.siigo_customer_identification = body.siigo_customer_identification || null
  if ('siigo_warehouse_id' in body) updateData.siigo_warehouse_id = body.siigo_warehouse_id ? Number(body.siigo_warehouse_id) : null
  if ('siigo_cost_center_id' in body) updateData.siigo_cost_center_id = body.siigo_cost_center_id
  if ('siigo_cost_center_name' in body) updateData.siigo_cost_center_name = body.siigo_cost_center_name
  if ('siigo_seller_id' in body) updateData.siigo_seller_id = body.siigo_seller_id
  if ('siigo_seller_name' in body) updateData.siigo_seller_name = body.siigo_seller_name
  if ('siigo_iva_tax_id' in body) updateData.siigo_iva_tax_id = body.siigo_iva_tax_id
  if ('siigo_default_document_id' in body) updateData.siigo_default_document_id = body.siigo_default_document_id
  if ('siigo_default_document_name' in body) updateData.siigo_default_document_name = body.siigo_default_document_name

  const { data, error: updateError } = await supabase
    .from('tiendas_terceros')
    .update(updateData)
    .eq('id', body.id)
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
    .from('tiendas_terceros')
    .delete()
    .eq('id', id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
