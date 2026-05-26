import { NextResponse } from 'next/server'
import { requireAuth, getAdminClient } from '@/lib/auth-helpers'

interface InventarioItem {
  sku: string
  producto: string
  variante: string
  imagen: string | null
  bodega: number
  tiendas: { [tiendaId: string]: number }
  totalConsignado: number
  total: number
}

// Reads everything from the local Siigo stock cache (table siigo_product_stock).
// Warehouse 27 = Bodega Principal La Calera (Shuless). The rest are stores.
const PRINCIPAL_WAREHOUSE_ID = 27

export async function GET() {
  const { error } = await requireAuth()
  if (error) return error

  const supabase = getAdminClient()

  try {
    // 1. Active tiendas + their warehouse mapping
    const { data: tiendasRaw } = await supabase
      .from('tiendas_terceros')
      .select('id, nombre, nombre_corto, siigo_warehouse_id')
      .eq('activa', true)
      .order('nombre')
    const tiendas = (tiendasRaw || []).map(t => ({
      id: t.id,
      nombre: t.nombre_corto || t.nombre,
      siigo_warehouse_id: t.siigo_warehouse_id as number | null,
    }))

    const warehouseToTienda = new Map<number, string>()
    for (const t of tiendas) {
      if (t.siigo_warehouse_id) warehouseToTienda.set(t.siigo_warehouse_id, t.id)
    }

    // 2. All stock rows for: principal + every linked tienda warehouse
    const relevantWarehouseIds = [PRINCIPAL_WAREHOUSE_ID, ...Array.from(warehouseToTienda.keys())]

    const allStock: Array<{
      product_id: string
      product_code: string
      product_name: string
      warehouse_id: number
      quantity: number
    }> = []
    const pageSize = 1000
    let pageStart = 0
    for (let i = 0; i < 50; i++) {
      const { data: page, error: stockErr } = await supabase
        .from('siigo_product_stock')
        .select('product_id, product_code, product_name, warehouse_id, quantity')
        .in('warehouse_id', relevantWarehouseIds)
        .range(pageStart, pageStart + pageSize - 1)
      if (stockErr) {
        return NextResponse.json({ error: stockErr.message }, { status: 500 })
      }
      if (!page || page.length === 0) break
      allStock.push(...(page as Array<{
        product_id: string
        product_code: string
        product_name: string
        warehouse_id: number
        quantity: number
      }>))
      if (page.length < pageSize) break
      pageStart += pageSize
    }

    // 3. Group by product_code (the SKU)
    type Bucket = {
      product_name: string
      bodega: number
      tiendas: { [tiendaId: string]: number }
    }
    const bySku = new Map<string, Bucket>()

    for (const row of allStock) {
      const sku = row.product_code || ''
      if (!sku) continue
      let b = bySku.get(sku)
      if (!b) {
        b = { product_name: row.product_name || '', bodega: 0, tiendas: {} }
        bySku.set(sku, b)
      }
      if (!b.product_name && row.product_name) b.product_name = row.product_name
      const qty = Number(row.quantity) || 0
      if (row.warehouse_id === PRINCIPAL_WAREHOUSE_ID) {
        b.bodega = qty
      } else {
        const tiendaId = warehouseToTienda.get(row.warehouse_id)
        if (tiendaId) {
          b.tiendas[tiendaId] = qty
        }
      }
    }

    // 4. Build inventory rows
    const inventario: InventarioItem[] = []
    for (const [sku, b] of bySku) {
      const totalConsignado = Object.values(b.tiendas).reduce((s, q) => s + Math.max(0, q), 0)
      // Try to split "Producto - Talla" into producto vs variante
      const m = b.product_name.match(/^(.+?)\s*[-–]\s*(.+)$/) || b.product_name.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)$/)
      const producto = m ? m[1].trim() : b.product_name
      const variante = m ? m[2].trim() : ''
      inventario.push({
        sku,
        producto,
        variante,
        imagen: null,
        bodega: b.bodega,
        tiendas: b.tiendas,
        totalConsignado,
        total: b.bodega + totalConsignado,
      })
    }

    // Sort: descending by total
    inventario.sort((a, b) => b.total - a.total)

    return NextResponse.json({
      inventario,
      tiendas: tiendas.map(t => ({ id: t.id, nombre: t.nombre })),
      totales: {
        bodega: inventario.reduce((s, i) => s + i.bodega, 0),
        consignado: inventario.reduce((s, i) => s + i.totalConsignado, 0),
        total: inventario.reduce((s, i) => s + i.total, 0),
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al obtener inventario'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
