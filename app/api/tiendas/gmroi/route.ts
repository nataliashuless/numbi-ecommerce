import { NextResponse } from 'next/server'
import { requireAuth, getAdminClient } from '@/lib/auth-helpers'

export const maxDuration = 60

// GMROI por tienda — Gross Margin Return On Inventory Investment.
//   GMROI = Margen Bruto / Inventario promedio a costo
// Reconstructed from the manual "GMROI por tienda" Excel.
//
// Inputs per tienda (over the chosen period):
//   - Ventas a la tienda  = invoiced amount to that tienda's NIT (siigo_invoices)
//   - Unidades vendidas   = units in those invoices
//   - COGS                = unidades × costo unitario (param, default 45000)
//   - Margen bruto        = ventas − COGS
//   - Inventario (uds)    = current stock in the tienda's Siigo warehouse
//   - Inventario a costo  = inventario × costo unitario
//   - GMROI               = margen / inventario a costo
//   - Rotación            = unidades vendidas / inventario
//
// Siigo doesn't expose unit cost in our cache, so it's a parameter.

const PRODUCT_ACCOUNT_GROUP_ID = 339 // productos terminados (excl. materias primas)
const DEFAULT_UNIT_COST = 45000

type Item = { code: string; quantity: number; price: number; total?: number }
type CachedInvoice = {
  id: string
  date: string
  total: number
  customer_identification: string | null
  items: Item[]
  credited_amount: number | null
}

function recommend(gmroi: number | null, invUnits: number, soldUnits: number): { label: string; tone: 'good' | 'ok' | 'warn' | 'bad' } {
  if (invUnits === 0 && soldUnits === 0) return { label: 'Sin actividad — recoger', tone: 'bad' }
  if (gmroi === null) return { label: 'Sin inventario en tienda', tone: 'warn' }
  if (soldUnits === 0) return { label: 'No vende — mandar a recoger', tone: 'bad' }
  if (gmroi >= 0.40) return { label: 'Excelente — aumentar inventario', tone: 'good' }
  if (gmroi >= 0.20) return { label: 'OK', tone: 'good' }
  if (gmroi >= 0.10) return { label: 'Reducir referencias', tone: 'warn' }
  return { label: 'Bajo — evaluar / recoger', tone: 'bad' }
}

export async function GET(request: Request) {
  const { error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(request.url)
  const unitCost = Number(searchParams.get('unit_cost')) || DEFAULT_UNIT_COST
  // Default period: current year YTD
  const now = new Date()
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const startDate = searchParams.get('start_date') || `${now.getFullYear()}-01-01`
  const endDate = searchParams.get('end_date') || fmt(now)

  try {
    const supabase = getAdminClient()

    // 1. Tiendas with their Siigo warehouse + NIT
    const { data: tiendasRaw } = await supabase
      .from('tiendas_terceros')
      .select('id, nombre, nombre_corto, siigo_customer_identification, siigo_warehouse_id')
    type TiendaRow = { id: string; nombre: string; nombre_corto: string | null; siigo_customer_identification: string | null; siigo_warehouse_id: number | null }
    const tiendas = (tiendasRaw || []) as TiendaRow[]
    const tiendaByNit = new Map<string, TiendaRow>()
    for (const t of tiendas) {
      if (t.siigo_customer_identification) tiendaByNit.set(t.siigo_customer_identification, t)
    }

    // 2. Sales per tienda (by NIT) in range
    const salesByTienda = new Map<string, { ventas: number; unidades: number; facturas: number }>()
    const pageSize = 1000
    for (let off = 0; off < 100000; off += pageSize) {
      const { data: page } = await supabase
        .from('siigo_invoices')
        .select('id, date, total, customer_identification, items, credited_amount')
        .gte('date', startDate)
        .lte('date', endDate)
        .range(off, off + pageSize - 1)
      if (!page || page.length === 0) break
      for (const inv of (page as CachedInvoice[])) {
        if ((inv.credited_amount || 0) >= inv.total) continue
        if (!inv.customer_identification) continue
        const t = tiendaByNit.get(inv.customer_identification)
        if (!t) continue
        const units = (inv.items || []).filter(it => it.code && it.code !== 'ENVIO').reduce((s, it) => s + (Number(it.quantity) || 0), 0)
        const amount = (inv.items || []).filter(it => it.code && it.code !== 'ENVIO').reduce((s, it) => s + (Number(it.total ?? it.quantity * it.price) || 0), 0)
        const cur = salesByTienda.get(t.id) || { ventas: 0, unidades: 0, facturas: 0 }
        cur.ventas += amount
        cur.unidades += units
        cur.facturas += 1
        salesByTienda.set(t.id, cur)
      }
      if (page.length < pageSize) break
    }

    // 3. Inventory units per warehouse (finished goods, qty > 0)
    const invByWarehouse = new Map<number, number>()
    for (let off = 0; off < 200000; off += pageSize) {
      const { data: page } = await supabase
        .from('siigo_product_stock')
        .select('warehouse_id, quantity, account_group_id')
        .eq('account_group_id', PRODUCT_ACCOUNT_GROUP_ID)
        .range(off, off + pageSize - 1)
      if (!page || page.length === 0) break
      for (const r of (page as Array<{ warehouse_id: number; quantity: number }>)) {
        const q = Number(r.quantity) || 0
        if (q <= 0) continue
        invByWarehouse.set(r.warehouse_id, (invByWarehouse.get(r.warehouse_id) || 0) + q)
      }
      if (page.length < pageSize) break
    }

    // 4. Build per-tienda rows
    const rows = tiendas
      .filter(t => t.siigo_customer_identification) // only tiendas linked to Siigo
      .map(t => {
        const s = salesByTienda.get(t.id) || { ventas: 0, unidades: 0, facturas: 0 }
        const invUnits = t.siigo_warehouse_id != null ? (invByWarehouse.get(t.siigo_warehouse_id) || 0) : 0
        const cogs = s.unidades * unitCost
        const margen = s.ventas - cogs
        const invCost = invUnits * unitCost
        const gmroi = invCost > 0 ? margen / invCost : null
        const rotacion = invUnits > 0 ? s.unidades / invUnits : null
        const rec = recommend(gmroi, invUnits, s.unidades)
        return {
          id: t.id,
          tienda: t.nombre_corto || t.nombre,
          tieneWarehouse: t.siigo_warehouse_id != null,
          ventas: s.ventas,
          unidades: s.unidades,
          facturas: s.facturas,
          cogs,
          margen,
          margenPct: s.ventas > 0 ? margen / s.ventas : null,
          invUnits,
          invCost,
          gmroi,
          rotacion,
          recomendacion: rec.label,
          tone: rec.tone,
        }
      })
      .sort((a, b) => (b.gmroi ?? -1) - (a.gmroi ?? -1))

    const totals = rows.reduce((acc, r) => ({
      ventas: acc.ventas + r.ventas,
      unidades: acc.unidades + r.unidades,
      cogs: acc.cogs + r.cogs,
      margen: acc.margen + r.margen,
      invUnits: acc.invUnits + r.invUnits,
      invCost: acc.invCost + r.invCost,
    }), { ventas: 0, unidades: 0, cogs: 0, margen: 0, invUnits: 0, invCost: 0 })

    return NextResponse.json({
      range: { start: startDate, end: endDate },
      unitCost,
      rows,
      totals: {
        ...totals,
        gmroi: totals.invCost > 0 ? totals.margen / totals.invCost : null,
        margenPct: totals.ventas > 0 ? totals.margen / totals.ventas : null,
        rotacion: totals.invUnits > 0 ? totals.unidades / totals.invUnits : null,
      },
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}
