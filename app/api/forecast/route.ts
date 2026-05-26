import { NextResponse } from 'next/server'
import { requireAuth, getAdminClient } from '@/lib/auth-helpers'

interface VariantForecast {
  sku: string
  size: string | null
  description: string
  stockBodega: number
  stockConsignado: number
  stockTotal: number
  ventasShopify: number
  ventasWhatsApp: number
  ventasTiendas: number
  ventasTotal: number
  velocidadDiaria: number
  velocidadSemanal: number
  diasHastaAgotamiento: number | null
  sugerenciaProduccion: number
  prioridad: 'critica' | 'alta' | 'media' | 'baja'
}

interface ReferenceForecast {
  reference: string
  variantCount: number
  stockBodega: number
  stockConsignado: number
  stockTotal: number
  ventasTotal: number
  velocidadDiaria: number
  sugerenciaProduccion: number
  prioridad: 'critica' | 'alta' | 'media' | 'baja'
  variants: VariantForecast[]
}

const PRINCIPAL_WAREHOUSE_ID = 27
const PRODUCT_ACCOUNT_GROUP_ID = 339 // solo productos terminados

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

function extractOrderNum(obs: string | null): number | null {
  if (!obs) return null
  const m = obs.match(/#(\d+)/)
  return m ? parseInt(m[1], 10) : null
}

export async function GET(request: Request) {
  const { error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(request.url)
  const diasAnalisis = parseInt(searchParams.get('dias') || '60')
  const leadTimeDias = parseInt(searchParams.get('lead_time') || '14')
  const stockSeguridad = parseInt(searchParams.get('stock_seguridad') || '7')

  const supabase = getAdminClient()

  try {
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - diasAnalisis)
    const startDateStr = startDate.toISOString().slice(0, 10)
    const endDateStr = endDate.toISOString().slice(0, 10)

    // 1. Stock per SKU from siigo_product_stock (paginated)
    type StockRow = {
      product_id: string
      product_code: string
      product_name: string
      warehouse_id: number
      quantity: number
    }
    const stockRows: StockRow[] = []
    {
      let pageStart = 0
      const pageSize = 1000
      for (let i = 0; i < 50; i++) {
        const { data: page, error: sErr } = await supabase
          .from('siigo_product_stock')
          .select('product_id, product_code, product_name, warehouse_id, quantity')
          .eq('account_group_id', PRODUCT_ACCOUNT_GROUP_ID)
          .range(pageStart, pageStart + pageSize - 1)
        if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 })
        if (!page || page.length === 0) break
        stockRows.push(...(page as StockRow[]))
        if (page.length < pageSize) break
        pageStart += pageSize
      }
    }

    // 2. Build stock map per SKU
    type StockBucket = {
      product_name: string
      stockBodega: number
      stockConsignado: number
    }
    const stockBySku = new Map<string, StockBucket>()
    for (const row of stockRows) {
      const sku = row.product_code
      if (!sku) continue
      let b = stockBySku.get(sku)
      if (!b) {
        b = { product_name: row.product_name || '', stockBodega: 0, stockConsignado: 0 }
        stockBySku.set(sku, b)
      }
      if (!b.product_name && row.product_name) b.product_name = row.product_name
      const qty = Number(row.quantity) || 0
      if (row.warehouse_id === PRINCIPAL_WAREHOUSE_ID) {
        b.stockBodega = qty
      } else {
        // Anything outside main warehouse counts as consigned (positive only)
        if (qty > 0) b.stockConsignado += qty
      }
    }

    // 3. Sales in last N days: from Siigo invoice cache, items × quantity, classifying by channel
    const { data: tiendaNitsRaw } = await supabase
      .from('tiendas_terceros')
      .select('siigo_customer_identification')
      .not('siigo_customer_identification', 'is', null)
    const tiendaNits = new Set(
      (tiendaNitsRaw || []).map((t: { siigo_customer_identification: string }) => t.siigo_customer_identification)
    )

    const { data: shopOrdersRaw } = await supabase
      .from('shopify_orders')
      .select('order_number')
      .gte('created_at', `${startDateStr}T00:00:00-05:00`)
      .lte('created_at', `${endDateStr}T23:59:59-05:00`)
      .range(0, 49999)
    const shopOrderNumbers = new Set(
      (shopOrdersRaw || []).map((o: { order_number: number }) => o.order_number)
    )

    type Invoice = {
      id: string
      date: string
      customer_identification: string | null
      observations: string | null
      items: Array<{ code: string; description: string; quantity: number }>
      total: number
      credited_amount: number | null
    }
    const invoices: Invoice[] = []
    {
      let pageStart = 0
      const pageSize = 1000
      for (let i = 0; i < 50; i++) {
        const { data: page } = await supabase
          .from('siigo_invoices')
          .select('id, date, customer_identification, observations, items, total, credited_amount')
          .gte('date', startDateStr)
          .lte('date', endDateStr)
          .range(pageStart, pageStart + pageSize - 1)
        if (!page || page.length === 0) break
        const fresh = (page as Invoice[]).filter(p => (p.credited_amount || 0) < p.total)
        invoices.push(...fresh)
        if (page.length < pageSize) break
        pageStart += pageSize
      }
    }

    // 4. Aggregate sales per SKU per channel
    type Sales = { shopify: number; whatsapp: number; tiendas: number }
    const ventasPorSku = new Map<string, Sales>()

    for (const inv of invoices) {
      const isTienda = inv.customer_identification && tiendaNits.has(inv.customer_identification)
      const orderNum = extractOrderNum(inv.observations)
      const isShopify = !isTienda && orderNum !== null && shopOrderNumbers.has(orderNum)
      // Default: WhatsApp (direct sale)
      const channel: 'shopify' | 'whatsapp' | 'tiendas' = isTienda ? 'tiendas' : isShopify ? 'shopify' : 'whatsapp'

      for (const it of inv.items || []) {
        if (!it.code || it.code === 'ENVIO') continue
        let s = ventasPorSku.get(it.code)
        if (!s) {
          s = { shopify: 0, whatsapp: 0, tiendas: 0 }
          ventasPorSku.set(it.code, s)
        }
        s[channel] += it.quantity || 0
      }
    }

    // 5. Build variant forecasts
    const allSkus = new Set<string>([...stockBySku.keys(), ...ventasPorSku.keys()])
    const variantsForecast: VariantForecast[] = []

    for (const sku of allSkus) {
      const stockInfo = stockBySku.get(sku) || { product_name: '', stockBodega: 0, stockConsignado: 0 }
      const ventas = ventasPorSku.get(sku) || { shopify: 0, whatsapp: 0, tiendas: 0 }

      // Only include SKUs that exist in product cache (i.e. are real products, not raw mat)
      // If a SKU has sales but no stock entry, it might be a raw material item we don't want.
      if (!stockBySku.has(sku)) continue

      const ventasTotal = ventas.shopify + ventas.whatsapp + ventas.tiendas
      const stockTotal = stockInfo.stockBodega + stockInfo.stockConsignado

      const velocidadDiaria = ventasTotal / diasAnalisis
      const velocidadSemanal = velocidadDiaria * 7

      let diasHastaAgotamiento: number | null = null
      if (velocidadDiaria > 0 && stockTotal > 0) {
        diasHastaAgotamiento = Math.round(stockTotal / velocidadDiaria)
      } else if (velocidadDiaria > 0 && stockTotal === 0) {
        diasHastaAgotamiento = 0
      }

      // Suggestion: cover lead time + safety stock based on total available (bodega + consigned)
      let sugerenciaProduccion = 0
      if (velocidadDiaria > 0) {
        const stockNecesario = Math.ceil(velocidadDiaria * (leadTimeDias + stockSeguridad))
        sugerenciaProduccion = Math.max(0, stockNecesario - stockTotal)
      }

      let prioridad: VariantForecast['prioridad'] = 'baja'
      if (diasHastaAgotamiento !== null) {
        if (diasHastaAgotamiento <= 7) prioridad = 'critica'
        else if (diasHastaAgotamiento <= 14) prioridad = 'alta'
        else if (diasHastaAgotamiento <= 30) prioridad = 'media'
      }

      const { reference, size } = parseProductName(stockInfo.product_name)
      void reference

      variantsForecast.push({
        sku,
        size,
        description: stockInfo.product_name,
        stockBodega: stockInfo.stockBodega,
        stockConsignado: stockInfo.stockConsignado,
        stockTotal,
        ventasShopify: ventas.shopify,
        ventasWhatsApp: ventas.whatsapp,
        ventasTiendas: ventas.tiendas,
        ventasTotal,
        velocidadDiaria: Math.round(velocidadDiaria * 100) / 100,
        velocidadSemanal: Math.round(velocidadSemanal * 100) / 100,
        diasHastaAgotamiento,
        sugerenciaProduccion,
        prioridad,
      })
    }

    // 6. Group by reference
    const refMap = new Map<string, ReferenceForecast>()
    for (const v of variantsForecast) {
      const { reference } = parseProductName(v.description)
      let r = refMap.get(reference)
      if (!r) {
        r = {
          reference,
          variantCount: 0,
          stockBodega: 0,
          stockConsignado: 0,
          stockTotal: 0,
          ventasTotal: 0,
          velocidadDiaria: 0,
          sugerenciaProduccion: 0,
          prioridad: 'baja',
          variants: [],
        }
        refMap.set(reference, r)
      }
      r.variants.push(v)
      r.variantCount += 1
      r.stockBodega += v.stockBodega
      r.stockConsignado += v.stockConsignado
      r.stockTotal += v.stockTotal
      r.ventasTotal += v.ventasTotal
      r.velocidadDiaria += v.velocidadDiaria
      r.sugerenciaProduccion += v.sugerenciaProduccion
      // Inherit worst priority of any variant
      const order = { critica: 0, alta: 1, media: 2, baja: 3 }
      if (order[v.prioridad] < order[r.prioridad]) r.prioridad = v.prioridad
    }

    // Sort variants inside each ref
    for (const r of refMap.values()) {
      r.velocidadDiaria = Math.round(r.velocidadDiaria * 100) / 100
      r.variants.sort((a, b) => {
        const na = a.size ? parseFloat(a.size.replace(',', '.')) : NaN
        const nb = b.size ? parseFloat(b.size.replace(',', '.')) : NaN
        if (!isNaN(na) && !isNaN(nb)) return na - nb
        return (a.size || a.sku).localeCompare(b.size || b.sku)
      })
    }

    // Sort references by priority then suggestion
    const order = { critica: 0, alta: 1, media: 2, baja: 3 }
    const referencias = Array.from(refMap.values()).sort((a, b) => {
      const d = order[a.prioridad] - order[b.prioridad]
      if (d !== 0) return d
      return b.sugerenciaProduccion - a.sugerenciaProduccion
    })

    // Flat forecast (for backward compatibility) — sort like before
    const forecast = variantsForecast.slice().sort((a, b) => {
      const d = order[a.prioridad] - order[b.prioridad]
      if (d !== 0) return d
      if (a.diasHastaAgotamiento === null) return 1
      if (b.diasHastaAgotamiento === null) return -1
      return a.diasHastaAgotamiento - b.diasHastaAgotamiento
    })

    const resumen = {
      totalSkus: forecast.length,
      totalReferencias: referencias.length,
      criticos: forecast.filter(f => f.prioridad === 'critica').length,
      altos: forecast.filter(f => f.prioridad === 'alta').length,
      medios: forecast.filter(f => f.prioridad === 'media').length,
      bajos: forecast.filter(f => f.prioridad === 'baja').length,
      totalProducirSugerido: forecast.reduce((sum, f) => sum + f.sugerenciaProduccion, 0),
      totalVentasPeriodo: forecast.reduce((sum, f) => sum + f.ventasTotal, 0),
      totalStockBodega: forecast.reduce((sum, f) => sum + f.stockBodega, 0),
      totalStockConsignado: forecast.reduce((sum, f) => sum + f.stockConsignado, 0),
    }

    return NextResponse.json({
      forecast,
      referencias,
      resumen,
      parametros: {
        diasAnalisis,
        leadTimeDias,
        stockSeguridad,
        fechaInicio: startDateStr,
        fechaFin: endDateStr,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error calculando forecast'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
