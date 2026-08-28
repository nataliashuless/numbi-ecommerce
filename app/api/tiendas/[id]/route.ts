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

  // Inventory consigned in this tienda's Siigo warehouse
  let siigoInventario: Array<{
    product_code: string
    product_name: string
    quantity: number
  }> = []
  let warehouseName: string | null = null
  if (tienda.siigo_warehouse_id) {
    const { data: stockRows } = await supabase
      .from('siigo_product_stock')
      .select('product_code, product_name, warehouse_name, quantity')
      .eq('warehouse_id', tienda.siigo_warehouse_id)
      .order('quantity', { ascending: false })
      .range(0, 9999)
    if (stockRows && stockRows.length > 0) {
      warehouseName = stockRows[0].warehouse_name
      siigoInventario = stockRows
        .filter(r => r.quantity !== 0)
        .map(r => ({
          product_code: r.product_code,
          product_name: r.product_name,
          quantity: Number(r.quantity),
        }))
    } else {
      const { data: w } = await supabase
        .from('siigo_warehouses')
        .select('name')
        .eq('id', tienda.siigo_warehouse_id)
        .maybeSingle()
      warehouseName = w?.name || null
    }
  }
  const siigoInventarioStats = {
    skus_con_saldo: siigoInventario.length,
    unidades_total: siigoInventario.reduce((s, i) => s + i.quantity, 0),
    warehouse_name: warehouseName,
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
    siigoInventario,
    siigoInventarioStats,
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error

  const { id } = await params
  const supabase = getAdminClient()
  const body = await request.json()

  const ALLOWED = [
    'nombre',
    'nombre_corto',
    'contacto_nombre',
    'contacto_telefono',
    'contacto_email',
    'direccion',
    'comision_tipo',
    'comision_porcentaje',
    'comision_fijo',
    'notas',
    'activa',
    'siigo_customer_identification',
    'siigo_warehouse_id',
    'siigo_cost_center_id',
    'siigo_cost_center_name',
    'siigo_seller_id',
    'siigo_seller_name',
    'siigo_iva_tax_id',
    'siigo_default_document_id',
    'siigo_default_document_name',
  ] as const
  const update: Record<string, unknown> = {}
  for (const key of ALLOWED) {
    if (key in body) update[key] = body[key] ?? null
  }
  if ('siigo_warehouse_id' in body) {
    update.siigo_warehouse_id = body.siigo_warehouse_id ? Number(body.siigo_warehouse_id) : null
  }
  update.updated_at = new Date().toISOString()

  const { data, error: updateError } = await supabase
    .from('tiendas_terceros')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ tienda: data })
}
