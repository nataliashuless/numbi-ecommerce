import { NextResponse } from 'next/server'
import { supabase, TiendaTercero } from '@/lib/supabase'

export async function GET() {
  const { data: tiendas, error: tiendasError } = await supabase
    .from('tiendas_terceros')
    .select('*')
    .order('nombre')

  if (tiendasError) {
    return NextResponse.json({ error: tiendasError.message }, { status: 500 })
  }

  // Get inventory and pending sales for each store
  const tiendasConStats = await Promise.all(
    (tiendas as TiendaTercero[]).map(async (tienda) => {
      // Get consignments (inventory sent - returned)
      const { data: consignaciones } = await supabase
        .from('consignaciones')
        .select('tipo, cantidad')
        .eq('tienda_id', tienda.id)

      const inventarioEnviado = (consignaciones || [])
        .filter(c => c.tipo === 'envio')
        .reduce((sum, c) => sum + c.cantidad, 0)
      const inventarioDevuelto = (consignaciones || [])
        .filter(c => c.tipo === 'devolucion')
        .reduce((sum, c) => sum + c.cantidad, 0)

      // Get sold units (to subtract from consigned inventory)
      const { data: ventas } = await supabase
        .from('ventas_terceros')
        .select('cantidad')
        .eq('tienda_id', tienda.id)

      const unidadesVendidas = (ventas || []).reduce((sum, v) => sum + v.cantidad, 0)

      // Get pending sales (not yet settled)
      const { data: ventasPendientes } = await supabase
        .from('ventas_terceros')
        .select('neto')
        .eq('tienda_id', tienda.id)
        .is('liquidacion_id', null)

      const montoPendiente = (ventasPendientes || []).reduce((sum, v) => sum + Number(v.neto), 0)

      return {
        ...tienda,
        inventarioActual: inventarioEnviado - inventarioDevuelto - unidadesVendidas,
        ventasPendientes: ventasPendientes?.length || 0,
        montoPendiente,
      }
    })
  )

  // Calculate global stats
  const totalTiendas = tiendas.length
  const tiendasActivas = (tiendas as TiendaTercero[]).filter(t => t.activa).length
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
  const body = await request.json()

  const { data, error } = await supabase
    .from('tiendas_terceros')
    .insert([{
      nombre: body.nombre,
      contacto_nombre: body.contacto_nombre || null,
      contacto_telefono: body.contacto_telefono || null,
      contacto_email: body.contacto_email || null,
      direccion: body.direccion || null,
      comision_tipo: body.comision_tipo || 'porcentaje',
      comision_porcentaje: body.comision_porcentaje || null,
      comision_fijo: body.comision_fijo || null,
      notas: body.notas || null,
      activa: true,
    }])
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function PUT(request: Request) {
  const body = await request.json()

  const { data, error } = await supabase
    .from('tiendas_terceros')
    .update({
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
    })
    .eq('id', body.id)
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
    .from('tiendas_terceros')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
