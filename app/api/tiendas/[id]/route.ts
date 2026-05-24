import { NextResponse } from 'next/server'
import { requireAuth, getAdminClient } from '@/lib/auth-helpers'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error

  const { id } = await params
  const supabase = getAdminClient()

  const { data: tienda, error: tiendaError } = await supabase
    .from('tiendas_terceros')
    .select('*')
    .eq('id', id)
    .single()

  if (!tienda) {
    return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
  }

  if (tiendaError) {
    return NextResponse.json({ error: tiendaError.message }, { status: 500 })
  }

  // Get consignments
  const { data: consignaciones } = await supabase
    .from('consignaciones')
    .select('*')
    .eq('tienda_id', id)
    .order('fecha', { ascending: false })

  // Get sales
  const { data: ventas } = await supabase
    .from('ventas_terceros')
    .select('*')
    .eq('tienda_id', id)
    .order('fecha', { ascending: false })

  // Get settlements
  const { data: liquidaciones } = await supabase
    .from('liquidaciones')
    .select('*')
    .eq('tienda_id', id)
    .order('fecha', { ascending: false })

  // Calculate inventory by product
  const inventarioMap: Record<string, { producto: string; sku: string | null; cantidad: number; precio: number }> = {}

  // Add consigned items
  ;(consignaciones || []).forEach(c => {
    const key = c.producto_sku || c.producto_nombre
    if (!inventarioMap[key]) {
      inventarioMap[key] = { producto: c.producto_nombre, sku: c.producto_sku, cantidad: 0, precio: c.precio_unitario }
    }
    if (c.tipo === 'envio') {
      inventarioMap[key].cantidad += c.cantidad
    } else {
      inventarioMap[key].cantidad -= c.cantidad
    }
  })

  // Subtract sold items
  ;(ventas || []).forEach(v => {
    const key = v.producto_sku || v.producto_nombre
    if (inventarioMap[key]) {
      inventarioMap[key].cantidad -= v.cantidad
    }
  })

  const inventario = Object.values(inventarioMap).filter(i => i.cantidad > 0)

  // Calculate stats
  const totalConsignado = (consignaciones || [])
    .filter(c => c.tipo === 'envio')
    .reduce((sum, c) => sum + c.cantidad, 0)
  const totalDevuelto = (consignaciones || [])
    .filter(c => c.tipo === 'devolucion')
    .reduce((sum, c) => sum + c.cantidad, 0)
  const totalVendido = (ventas || []).reduce((sum, v) => sum + v.cantidad, 0)
  const inventarioActual = totalConsignado - totalDevuelto - totalVendido

  const ventasPendientes = (ventas || []).filter(v => !v.liquidacion_id)
  const montoPendiente = ventasPendientes.reduce((sum, v) => sum + Number(v.neto), 0)
  const totalVentas = (ventas || []).reduce((sum, v) => sum + Number(v.precio_venta), 0)
  const totalComisiones = (ventas || []).reduce((sum, v) => sum + Number(v.comision), 0)

  return NextResponse.json({
    tienda,
    consignaciones: consignaciones || [],
    ventas: ventas || [],
    liquidaciones: liquidaciones || [],
    inventario,
    stats: {
      inventarioActual,
      totalConsignado,
      totalDevuelto,
      totalVendido,
      ventasPendientes: ventasPendientes.length,
      montoPendiente,
      totalVentas,
      totalComisiones,
    },
  })
}
