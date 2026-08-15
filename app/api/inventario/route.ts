import { NextResponse } from 'next/server'
import { requireAuth, getAdminClient } from '@/lib/auth-helpers'

interface VariantRow {
  sku: string
  size: string | null
  description: string
  bodega: number
  bodegaCalera: number
  bodegaEkho: number
  tiendas: { [tiendaId: string]: number }
  totalConsignado: number
  total: number
}

interface ReferenceRow {
  reference: string
  variantCount: number
  bodega: number
  bodegaCalera: number
  bodegaEkho: number
  tiendas: { [tiendaId: string]: number }
  totalConsignado: number
  total: number
  variants: VariantRow[]
}

const PRINCIPAL_WAREHOUSE_ID = 27
const PRODUCT_ACCOUNT_GROUP_ID = 339 // exclude raw materials

function parseProductName(desc: string): { reference: string; size: string | null } {
  const trimmed = (desc || '').trim()
  let m = trimmed.match(/^(.+?)\s*[-–—]?\s*talla\s+(\d+(?:[.,]\d+)?)$/i)
  if (m) return { reference: m[1].trim(), size: m[2] }
  m = trimmed.match(/^(.+?)\s*[-–—]\s*(\d+(?:[.,]\d+)?)$/)
  if (m) return { reference: m[1].trim(), size: m[2] }
  m = trimmed.match(/^(.+?\D)\s+(\d+(?:[.,]\d+)?)$/)
  if (m) return { reference: m[1].trim(), size: m[2] }
  return { reference: trimmed || '—', size: null }
}

export async function GET() {
  const { error } = await requireAuth()
  if (error) return error

  const supabase = getAdminClient()

  try {
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

    // Own warehouses (bodega propia) = principal + any Siigo warehouse whose
    // name matches an own pattern (e.g. "Ekho", where new production lands).
    const OWN_WAREHOUSE_NAME_PATTERN = /ekho|eko\b/i
    const ownWarehouseIds = new Set<number>([PRINCIPAL_WAREHOUSE_ID])
    {
      const { data: whs } = await supabase
        .from('siigo_warehouses')
        .select('id, name')
        .range(0, 999)
      for (const w of (whs || []) as Array<{ id: number; name: string | null }>) {
        if (w.name && OWN_WAREHOUSE_NAME_PATTERN.test(w.name)) ownWarehouseIds.add(w.id)
      }
    }

    const relevantWarehouseIds = [
      ...Array.from(ownWarehouseIds),
      ...Array.from(warehouseToTienda.keys()),
    ]

    const allStock: Array<{
      product_id: string
      product_code: string
      product_name: string
      warehouse_id: number
      quantity: number
      account_group_id: number | null
    }> = []
    const pageSize = 1000
    let pageStart = 0
    for (let i = 0; i < 50; i++) {
      const { data: page, error: stockErr } = await supabase
        .from('siigo_product_stock')
        .select('product_id, product_code, product_name, warehouse_id, quantity, account_group_id')
        .in('warehouse_id', relevantWarehouseIds)
        .eq('account_group_id', PRODUCT_ACCOUNT_GROUP_ID)
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
        account_group_id: number | null
      }>))
      if (page.length < pageSize) break
      pageStart += pageSize
    }

    // Group by SKU (variant) first
    type VariantBucket = {
      sku: string
      size: string | null
      description: string
      reference: string
      bodega: number
      bodegaCalera: number
      bodegaEkho: number
      tiendas: { [tiendaId: string]: number }
    }
    const bySku = new Map<string, VariantBucket>()

    for (const row of allStock) {
      const sku = row.product_code || ''
      if (!sku) continue
      let v = bySku.get(sku)
      if (!v) {
        const { reference, size } = parseProductName(row.product_name || '')
        v = {
          sku,
          size,
          description: row.product_name || '',
          reference,
          bodega: 0,
          bodegaCalera: 0,
          bodegaEkho: 0,
          tiendas: {},
        }
        bySku.set(sku, v)
      }
      const qty = Number(row.quantity) || 0
      if (ownWarehouseIds.has(row.warehouse_id)) {
        // Own warehouses (principal + Ekho + …) accumulate into bodega
        v.bodega += qty
        if (row.warehouse_id === PRINCIPAL_WAREHOUSE_ID) {
          v.bodegaCalera += qty
        } else {
          v.bodegaEkho += qty
        }
      } else {
        const tiendaId = warehouseToTienda.get(row.warehouse_id)
        if (tiendaId) v.tiendas[tiendaId] = qty
      }
    }

    // Now group variants by reference
    const byRef = new Map<string, ReferenceRow>()
    for (const v of bySku.values()) {
      const tiendaSum = Object.values(v.tiendas).reduce((s, q) => s + Math.max(0, q), 0)
      const variantRow: VariantRow = {
        sku: v.sku,
        size: v.size,
        description: v.description,
        bodega: v.bodega,
        bodegaCalera: v.bodegaCalera,
        bodegaEkho: v.bodegaEkho,
        tiendas: v.tiendas,
        totalConsignado: tiendaSum,
        total: v.bodega + tiendaSum,
      }
      let r = byRef.get(v.reference)
      if (!r) {
        r = {
          reference: v.reference,
          variantCount: 0,
          bodega: 0,
          bodegaCalera: 0,
          bodegaEkho: 0,
          tiendas: {},
          totalConsignado: 0,
          total: 0,
          variants: [],
        }
        byRef.set(v.reference, r)
      }
      r.variants.push(variantRow)
      r.bodega += variantRow.bodega
      r.bodegaCalera += variantRow.bodegaCalera
      r.bodegaEkho += variantRow.bodegaEkho
      for (const tid in v.tiendas) {
        r.tiendas[tid] = (r.tiendas[tid] || 0) + v.tiendas[tid]
      }
      r.totalConsignado += variantRow.totalConsignado
      r.total += variantRow.total
      r.variantCount += 1
    }

    const referencias = Array.from(byRef.values())
      .map(r => ({
        ...r,
        variants: r.variants.sort((a, b) => {
          const na = a.size ? parseFloat(a.size.replace(',', '.')) : NaN
          const nb = b.size ? parseFloat(b.size.replace(',', '.')) : NaN
          if (!isNaN(na) && !isNaN(nb)) return na - nb
          return (a.size || a.sku).localeCompare(b.size || b.sku)
        }),
      }))
      .sort((a, b) => b.total - a.total)

    return NextResponse.json({
      referencias,
      tiendas: tiendas.map(t => ({ id: t.id, nombre: t.nombre })),
      totales: {
        referencias: referencias.length,
        skus: bySku.size,
        bodega: referencias.reduce((s, r) => s + r.bodega, 0),
        consignado: referencias.reduce((s, r) => s + r.totalConsignado, 0),
        total: referencias.reduce((s, r) => s + r.total, 0),
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al obtener inventario'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
