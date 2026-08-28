import { NextResponse } from 'next/server'
import { requireAuth, getAdminClient } from '@/lib/auth-helpers'
import {
  addBusinessDays,
  correctedSizeProfile,
  forecastMonths,
  largestRemainder,
  monthlyStoreReplenishments,
  partialMonthContinuousDelta,
  productionRequiredAtArrival,
  safetyStock,
  selectDemandModel,
  stabilizedStoreSizeProfile,
  variabilityAdjustedSizeProfile,
} from '@/lib/forecast/demand-model'

interface VariantForecast {
  sku: string
  // For backward compat with existing UI:
  producto: string   // reference name (e.g. "Boy")
  variante: string   // size with prefix (e.g. "Talla 26") or empty
  imagen: string | null
  // New canonical fields:
  size: string | null
  description: string
  stockBodega: number
  stockConsignado: number
  stockTotal: number
  enCamino: number   // units already ordered (pending production orders)
  ventasShopify: number
  ventasWhatsApp: number
  ventasTiendas: number
  ventasFerias: number
  ventasTotal: number
  ventasPeriodoEstacional: number
  velocidadDiariaReciente: number
  velocidadDiariaEstacional: number
  demandaFuente: 'reciente' | 'estacional'
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
  enCamino: number
  ventasTotal: number
  ventasTiendas: number
  ventasPeriodoEstacional: number
  velocidadDiaria: number
  sugerenciaProduccion: number
  prioridad: 'critica' | 'alta' | 'media' | 'baja'
  variants: VariantForecast[]
}

// Normalize a design/reference name for matching order items to forecast variants.
function normName(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
function enCaminoKey(diseno: string, talla: string | null): string {
  return `${normName(diseno)}|${talla != null ? String(talla).trim() : ''}`
}

// Tolerant design matching (already-normalized strings). Matches when all the
// words of one name appear in the other — so an order "Niño" matches a Siigo
// "Básico Niño", but "Niña" does NOT match "Básico Niño".
function designMatchesNorm(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  const aw = a.split(' ').filter(Boolean)
  const bw = b.split(' ').filter(Boolean)
  if (aw.length === 0 || bw.length === 0) return false
  const bset = new Set(bw)
  if (aw.every(w => bset.has(w))) return true
  const aset = new Set(aw)
  if (bw.every(w => aset.has(w))) return true
  return false
}

const PRINCIPAL_WAREHOUSE_ID = 27
const PRODUCT_ACCOUNT_GROUP_ID = 339 // solo productos terminados
const DEFAULT_PRODUCTION_LEAD_BUSINESS_DAYS = 52
const REVIEW_PERIOD_MONTHS = 1
const BLACK_FRIDAY_UPLIFT = 0.10
const SCHOOL_SEASON_UPLIFT = 0.10

function commercialSeasonFactor(date: Date): number {
  if (date.getMonth() === 10) return 1 + BLACK_FRIDAY_UPLIFT
  if (date.getMonth() === 0) return 1 + SCHOOL_SEASON_UPLIFT
  return 1
}

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

// Siigo normally returns the customer identification without formatting, while
// it is common to save a tienda NIT with dots and an explicit check digit
// (for example 900.123.456-7). Return every safe representation so both forms
// identify the same tienda without dropping a real digit from unformatted IDs.
function identificationKeys(value: string | null): string[] {
  if (!value) return []
  const digits = value.replace(/\D/g, '')
  if (!digits) return []
  const keys = [digits]
  if (/[-–—]\s*\d\s*$/.test(value) && digits.length > 1) keys.push(digits.slice(0, -1))
  return keys
}

export async function GET(request: Request) {
  const { error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(request.url)
  const diasAnalisis = parseInt(searchParams.get('dias') || '60')
  const requestedLeadTime = Number.parseInt(searchParams.get('lead_time') || '', 10)
  const leadTimeDias = Number.isFinite(requestedLeadTime)
    ? Math.min(365, Math.max(1, requestedLeadTime))
    : DEFAULT_PRODUCTION_LEAD_BUSINESS_DAYS
  const stockSeguridad = parseInt(searchParams.get('stock_seguridad') || '7')

  const supabase = getAdminClient()

  try {
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - diasAnalisis)
    const startDateStr = startDate.toISOString().slice(0, 10)
    const endDateStr = endDate.toISOString().slice(0, 10)
    const leadTimeEnd = addBusinessDays(endDate, leadTimeDias)
    const protectionEnd = new Date(leadTimeEnd)
    protectionEnd.setMonth(protectionEnd.getMonth() + REVIEW_PERIOD_MONTHS)
    const protectionDays = Math.max(1, Math.ceil((protectionEnd.getTime() - endDate.getTime()) / 86_400_000))
    const protectionMonths = protectionDays / 30.4375
    const horizonteDias = protectionDays
    const seasonalStart = new Date(endDate)
    seasonalStart.setFullYear(seasonalStart.getFullYear() - 1)
    const seasonalEnd = new Date(endDate)
    seasonalEnd.setDate(seasonalEnd.getDate() + horizonteDias - 1)
    seasonalEnd.setFullYear(seasonalEnd.getFullYear() - 1)
    const seasonalStartStr = seasonalStart.toISOString().slice(0, 10)
    const seasonalEndStr = seasonalEnd.toISOString().slice(0, 10)
    const { data: feriaRows } = await supabase
      .from('ferias')
      .select('fecha_inicio, fecha_fin')
      .lte('fecha_inicio', endDateStr)
    const feriaWindows = (feriaRows || []) as Array<{ fecha_inicio: string; fecha_fin: string }>
    const isFeriaDate = (date: string) => feriaWindows.some(feria => date >= feria.fecha_inicio && date <= feria.fecha_fin)

    // 1. Stock per SKU from siigo_product_stock (paginated)
    type StockRow = {
      product_id: string
      product_code: string
      product_name: string
      warehouse_id: number
      warehouse_name: string | null
      quantity: number
    }
    const stockRows: StockRow[] = []
    {
      let pageStart = 0
      const pageSize = 1000
      for (let i = 0; i < 50; i++) {
        const { data: page, error: sErr } = await supabase
          .from('siigo_product_stock')
          .select('product_id, product_code, product_name, warehouse_id, warehouse_name, quantity')
          .eq('account_group_id', PRODUCT_ACCOUNT_GROUP_ID)
          .range(pageStart, pageStart + pageSize - 1)
        if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 })
        if (!page || page.length === 0) break
        stockRows.push(...(page as StockRow[]))
        if (page.length < pageSize) break
        pageStart += pageSize
      }
    }

    // Own warehouses (bodega propia) = principal + any whose name matches a
    // known own-warehouse pattern (e.g. "Ekho", where new production lands).
    // Everything else with stock counts as consigned in tiendas.
    const OWN_WAREHOUSE_NAME_PATTERN = /ekho|eko\b/i
    const isOwnWarehouse = (id: number, name: string | null) =>
      id === PRINCIPAL_WAREHOUSE_ID || (name != null && OWN_WAREHOUSE_NAME_PATTERN.test(name))

    // 2. Build stock map per SKU
    type StockBucket = {
      product_name: string
      stockBodega: number
      stockConsignado: number
    }
    const stockBySku = new Map<string, StockBucket>()
    const stockByWarehouseSku = new Map<string, number>()
    // Diagnostic: units + bucket per warehouse so the UI can show where stock sits.
    const warehouseDiag = new Map<number, { name: string; bucket: 'bodega' | 'consignado'; units: number }>()
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
      const warehouseSkuKey = `${row.warehouse_id}|${sku}`
      stockByWarehouseSku.set(
        warehouseSkuKey,
        (stockByWarehouseSku.get(warehouseSkuKey) || 0) + Math.max(0, qty),
      )
      const own = isOwnWarehouse(row.warehouse_id, row.warehouse_name)
      if (own) {
        // Own warehouses accumulate (principal + Ekho + any other own)
        b.stockBodega += Math.max(0, qty)
      } else if (qty > 0) {
        b.stockConsignado += qty
      }
      // diagnostic
      const wd = warehouseDiag.get(row.warehouse_id) || { name: row.warehouse_name || `#${row.warehouse_id}`, bucket: own ? 'bodega' : 'consignado', units: 0 }
      if (qty > 0 || own) wd.units += qty
      warehouseDiag.set(row.warehouse_id, wd)
    }
    for (const bucket of stockBySku.values()) {
      // Siigo can temporarily expose negative balances after adjustments. A
      // negative physical inventory is not a valid inventory position.
      bucket.stockBodega = Math.max(0, bucket.stockBodega)
      bucket.stockConsignado = Math.max(0, bucket.stockConsignado)
    }

    // 3. Sales in last N days: from Siigo invoice cache, items × quantity, classifying by channel
    type Store = { id: string; siigo_customer_identification: string | null; siigo_warehouse_id: number | null }
    const { data: tiendaNitsRaw } = await supabase
      .from('tiendas_terceros')
      .select('id, siigo_customer_identification, siigo_warehouse_id')
      .eq('activa', true)
    const stores = (tiendaNitsRaw || []) as Store[]
    const storeByNit = new Map<string, Store>()
    for (const store of stores) {
      for (const nit of identificationKeys(store.siigo_customer_identification)) storeByNit.set(nit, store)
    }

    type StoreSale = { tienda_id: string; fecha: string; producto_sku: string | null; cantidad: number }
    const realStoreSales: StoreSale[] = []
    for (let pageStart = 0; pageStart < 50_000; pageStart += 1000) {
      const { data: page, error: storeSalesError } = await supabase
        .from('ventas_terceros')
        .select('tienda_id, fecha, producto_sku, cantidad')
        .range(pageStart, pageStart + 999)
      if (storeSalesError) throw new Error(storeSalesError.message)
      if (!page?.length) break
      realStoreSales.push(...(page as StoreSale[]))
      if (page.length < 1000) break
    }
    const realStoreSalesBySkuMonth = new Map<string, number>()
    for (const sale of realStoreSales) {
      if (!sale.producto_sku) continue
      const key = `${sale.tienda_id}|${sale.producto_sku}|${sale.fecha.slice(0, 7)}`
      realStoreSalesBySkuMonth.set(key, (realStoreSalesBySkuMonth.get(key) || 0) + Math.max(0, Number(sale.cantidad) || 0))
    }

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
      assigned_feria_id: string | null
    }
    async function fetchInvoices(from: string, to: string): Promise<Invoice[]> {
      const result: Invoice[] = []
      let pageStart = 0
      const pageSize = 1000
      for (let i = 0; i < 50; i++) {
        const { data: page, error: invoiceError } = await supabase
          .from('siigo_invoices')
          .select('id, date, customer_identification, observations, items, total, credited_amount, assigned_feria_id')
          .gte('date', from)
          .lte('date', to)
          .range(pageStart, pageStart + pageSize - 1)
        if (invoiceError) throw new Error(invoiceError.message)
        if (!page || page.length === 0) break
        const fresh = (page as Invoice[]).filter(p => (p.credited_amount || 0) < p.total)
        result.push(...fresh)
        if (page.length < pageSize) break
        pageStart += pageSize
      }
      return result
    }
    // Load all available history. The cache currently begins in Nov-2023;
    // asking from 2000 keeps this logic future-proof as older data is added.
    const allInvoices = await fetchInvoices('2000-01-01', endDateStr)
    // Defensive deduplication by immutable Siigo invoice id.
    const uniqueInvoices = [...new Map(allInvoices.map(inv => [inv.id, inv])).values()]
    const invoices = uniqueInvoices.filter(inv => inv.date >= startDateStr && inv.date <= endDateStr)
    const seasonalInvoices = uniqueInvoices.filter(inv => inv.date >= seasonalStartStr && inv.date <= seasonalEndStr)

    // 4. Aggregate sales per SKU per channel
    type Sales = { shopify: number; whatsapp: number; tiendas: number; ferias: number }
    const ventasPorSku = new Map<string, Sales>()
    const ventasEstacionalesPorSku = new Map<string, number>()

    for (const inv of invoices) {
      const invoiceStore = identificationKeys(inv.customer_identification).map(nit => storeByNit.get(nit)).find(Boolean)
      const isFeria = inv.assigned_feria_id != null || (!invoiceStore && isFeriaDate(inv.date))
      const isTienda = invoiceStore != null && !isFeria
      const orderNum = extractOrderNum(inv.observations)
      const isShopify = !isFeria && !isTienda && orderNum !== null && shopOrderNumbers.has(orderNum)
      // Default: WhatsApp (direct sale)
      const channel: keyof Sales = isFeria ? 'ferias' : isTienda ? 'tiendas' : isShopify ? 'shopify' : 'whatsapp'

      for (const it of inv.items || []) {
        if (!it.code || it.code === 'ENVIO') continue
        // A real store sell-through record replaces the Siigo replenishment
        // proxy for the same SKU/month; never add both.
        if (invoiceStore && realStoreSalesBySkuMonth.has(`${invoiceStore.id}|${it.code}|${inv.date.slice(0, 7)}`)) continue
        let s = ventasPorSku.get(it.code)
        if (!s) {
          s = { shopify: 0, whatsapp: 0, tiendas: 0, ferias: 0 }
          ventasPorSku.set(it.code, s)
        }
        s[channel] += it.quantity || 0
      }
    }
    for (const sale of realStoreSales) {
      if (!sale.producto_sku || sale.fecha < startDateStr || sale.fecha > endDateStr) continue
      const current = ventasPorSku.get(sale.producto_sku) || { shopify: 0, whatsapp: 0, tiendas: 0, ferias: 0 }
      current.tiendas += Math.max(0, Number(sale.cantidad) || 0)
      ventasPorSku.set(sale.producto_sku, current)
    }

    for (const inv of seasonalInvoices) {
      for (const it of inv.items || []) {
        if (!it.code || it.code === 'ENVIO') continue
        ventasEstacionalesPorSku.set(
          it.code,
          (ventasEstacionalesPorSku.get(it.code) || 0) + (Number(it.quantity) || 0)
        )
      }
    }

    // Complete monthly history by SKU. Store invoices are the available
    // replenishment proxy because ventas_terceros/consignaciones currently have
    // no rows. They are already part of Siigo invoices, so no second store
    // signal is added (which would duplicate demand).
    const monthKey = (date: string) => date.slice(0, 7)
    const monthSequence: string[] = []
    const firstInvoiceMonth = uniqueInvoices.length
      ? uniqueInvoices.reduce((min, inv) => monthKey(inv.date) < min ? monthKey(inv.date) : min, monthKey(uniqueInvoices[0].date))
      : monthKey(startDateStr)
    const monthCursor = new Date(`${firstInvoiceMonth}-01T12:00:00`)
    const lastHistoryMonth = monthKey(endDateStr)
    while (monthKey(monthCursor.toISOString()) <= lastHistoryMonth) {
      monthSequence.push(monthKey(monthCursor.toISOString()))
      monthCursor.setMonth(monthCursor.getMonth() + 1)
    }
    const monthIndex = new Map(monthSequence.map((month, index) => [month, index]))
    const skuMonthly = new Map<string, number[]>()
    const directSkuMonthly = new Map<string, number[]>()
    const storeSkuMonthly = new Map<string, Map<string, number[]>>()
    const realStoreSkuMonthly = new Map<string, Map<string, number[]>>()
    for (const sku of stockBySku.keys()) {
      skuMonthly.set(sku, Array(monthSequence.length).fill(0))
      directSkuMonthly.set(sku, Array(monthSequence.length).fill(0))
    }
    for (const store of stores) {
      storeSkuMonthly.set(store.id, new Map([...stockBySku.keys()].map(sku => [sku, Array(monthSequence.length).fill(0)])))
      realStoreSkuMonthly.set(store.id, new Map([...stockBySku.keys()].map(sku => [sku, Array(monthSequence.length).fill(0)])))
    }
    for (const inv of uniqueInvoices) {
      const index = monthIndex.get(monthKey(inv.date))
      if (index == null) continue
      const matchedStore = identificationKeys(inv.customer_identification).map(nit => storeByNit.get(nit)).find(Boolean)
      const isFeriaInvoice = inv.assigned_feria_id != null || (!matchedStore && isFeriaDate(inv.date))
      // Ferias are event demand, not recurring Online/WhatsApp demand and not
      // a monthly store replenishment proxy.
      if (isFeriaInvoice) continue
      const invoiceStore = matchedStore
      for (const it of inv.items || []) {
        if (!it.code || it.code === 'ENVIO' || !stockBySku.has(it.code)) continue
        if (invoiceStore && realStoreSalesBySkuMonth.has(`${invoiceStore.id}|${it.code}|${monthKey(inv.date)}`)) continue
        const qty = Math.max(0, Number(it.quantity) || 0)
        const series = skuMonthly.get(it.code)!
        series[index] += qty
        if (invoiceStore) {
          const storeSeries = storeSkuMonthly.get(invoiceStore.id)?.get(it.code)
          if (storeSeries) storeSeries[index] += qty
        } else directSkuMonthly.get(it.code)![index] += qty
      }
    }
    for (const sale of realStoreSales) {
      if (!sale.producto_sku || !stockBySku.has(sale.producto_sku)) continue
      const index = monthIndex.get(monthKey(sale.fecha))
      if (index == null) continue
      const qty = Math.max(0, Number(sale.cantidad) || 0)
      skuMonthly.get(sale.producto_sku)![index] += qty
      const storeSeries = storeSkuMonthly.get(sale.tienda_id)?.get(sale.producto_sku)
      if (storeSeries) storeSeries[index] += qty
      const realSeries = realStoreSkuMonthly.get(sale.tienda_id)?.get(sale.producto_sku)
      if (realSeries) realSeries[index] += qty
    }

    // Include the open month as a current-demand signal. Forecasting models
    // receive a run-rate estimate to avoid treating a partial month as a full
    // low month; visible sales remain the actual, unscaled quantities above.
    const latestObservedDate = uniqueInvoices.reduce(
      (latest, invoice) => invoice.date > latest ? invoice.date : latest,
      `${lastHistoryMonth}-01`,
    )
    const latestObserved = new Date(`${latestObservedDate}T12:00:00`)
    if (monthKey(latestObservedDate) === lastHistoryMonth) {
      const currentIndex = monthIndex.get(lastHistoryMonth)
      const observedDays = latestObserved.getDate()
      const daysInMonth = new Date(latestObserved.getFullYear(), latestObserved.getMonth() + 1, 0).getDate()
      if (currentIndex != null && observedDays < daysInMonth) {
        const scaleSeries = (series: number[]) => {
          const previous = series[currentIndex]
          const delta = partialMonthContinuousDelta(previous, observedDays, daysInMonth)
          series[currentIndex] = previous + delta
          return delta
        }
        // Direct sales occur continuously, so their open-month run rate can be
        // extrapolated. Store invoices are one monthly replenishment and must
        // never be multiplied by the day of month. Only real store sell-through
        // is continuous enough to prorate.
        for (const [sku, series] of directSkuMonthly) {
          const delta = scaleSeries(series)
          const totalSeries = skuMonthly.get(sku)
          if (totalSeries) totalSeries[currentIndex] += delta
        }
        for (const [storeId, storeMap] of realStoreSkuMonthly) {
          for (const [sku, realSeries] of storeMap) {
            const delta = scaleSeries(realSeries)
            if (delta === 0) continue
            const totalSeries = skuMonthly.get(sku)
            if (totalSeries) totalSeries[currentIndex] += delta
            const combinedStoreSeries = storeSkuMonthly.get(storeId)?.get(sku)
            if (combinedStoreSeries) combinedStoreSeries[currentIndex] += delta
          }
        }
      }
    }

    // Forecast the reference first, then allocate the inventory target through
    // a stockout-corrected historical size curve. This keeps every integer pair
    // reconciled between reference and size.
    const skusByReference = new Map<string, string[]>()
    for (const [sku, stock] of stockBySku) {
      const reference = parseProductName(stock.product_name).reference
      const list = skusByReference.get(reference) || []
      list.push(sku)
      skusByReference.set(reference, list)
    }
    const needEventsBySku = new Map<string, Array<{ date: string; quantity: number; recoverableSafety?: number }>>()
    const forecastDemandBySku = new Map<string, number>()
    const modelByReference = new Map<string, ReturnType<typeof selectDemandModel>>()
    const comparableMonthlyLevels = [...skusByReference.values()]
      .map(skus => {
        const recent = monthSequence.slice(-3).map((_, offset) => {
          const index = monthSequence.length - 3 + offset
          return skus.reduce((sum, sku) => sum + (skuMonthly.get(sku)?.[index] || 0), 0)
        })
        return recent.reduce((sum, value) => sum + value, 0) / Math.max(1, recent.length)
      })
      .filter(value => value > 0)
      .sort((a, b) => a - b)
    // Conservative comparable-product baseline for a reference with no sales
    // history. Product creation/category metadata is unavailable, so use the
    // lower quartile rather than the portfolio mean to limit overproduction.
    const newReferenceFallback = comparableMonthlyLevels.length
      ? comparableMonthlyLevels[Math.floor((comparableMonthlyLevels.length - 1) * 0.25)]
      : 0
    let baselineAbsError = 0
    let selectedAbsError = 0
    let backtestActual = 0
    const addTarget = (sku: string, quantity: number, date: Date, recoverableSafety = 0) => {
      if (quantity <= 0) return
      const events = needEventsBySku.get(sku) || []
      events.push({ date: date.toISOString().slice(0, 10), quantity, recoverableSafety: Math.min(quantity, recoverableSafety) })
      needEventsBySku.set(sku, events)
    }
    const addForecastDemand = (sku: string, quantity: number) => {
      if (quantity > 0) forecastDemandBySku.set(sku, (forecastDemandBySku.get(sku) || 0) + quantity)
    }
    const allocateToSkus = (skus: string[], total: number, profile: Map<string, number>) => {
      const bySize = largestRemainder(total, [...profile].map(([key, share]) => ({ key, share })))
      const result = new Map<string, number>()
      for (const [size, sizeTarget] of bySize) {
        const sizeSkus = skus.filter(sku => (parseProductName(stockBySku.get(sku)?.product_name || '').size || sku) === size)
        const skuTargets = largestRemainder(sizeTarget, sizeSkus.map(sku => ({
          key: sku,
          share: (skuMonthly.get(sku) || []).reduce((sum, value) => sum + value, 0),
        })))
        for (const [sku, quantity] of skuTargets) result.set(sku, quantity)
      }
      return result
    }
    for (const [reference, skus] of skusByReference) {
      const referenceSeries = monthSequence.map((_, i) =>
        skus.reduce((sum, sku) => sum + (skuMonthly.get(sku)?.[i] || 0), 0)
      )
      // Exclude structural pre-launch zeros; zeros after first demand remain and
      // are meaningful observations at reference level.
      const firstPositive = referenceSeries.findIndex(value => value > 0)
      const hasLaunchInventory = skus.some(sku => {
        const item = stockBySku.get(sku)
        return item != null && item.stockBodega + item.stockConsignado > 0
      })
      const training = firstPositive >= 0
        ? referenceSeries.slice(firstPositive)
        : hasLaunchInventory
          ? [newReferenceFallback, newReferenceFallback, newReferenceFallback]
          : [0, 0, 0]
      const selected = selectDemandModel(training)
      modelByReference.set(reference, selected)
      const monthsNeeded = Math.max(1, Math.ceil(protectionMonths))
      const sizeSeries = new Map<string, number[]>()
      for (const sku of skus) {
        const size = parseProductName(stockBySku.get(sku)?.product_name || '').size || sku
        const existing = sizeSeries.get(size) || Array(monthSequence.length).fill(0)
        const values = skuMonthly.get(sku) || []
        for (let i = 0; i < existing.length; i++) existing[i] += values[i] || 0
        sizeSeries.set(size, existing)
      }
      const profile = correctedSizeProfile(sizeSeries, referenceSeries)

      const aggregateStoreSeries = monthSequence.map((_, i) => stores.reduce((sum, store) =>
        sum + skus.reduce((skuSum, sku) => skuSum + (storeSkuMonthly.get(store.id)?.get(sku)?.[i] || 0), 0), 0
      ))
      const aggregateFirst = aggregateStoreSeries.findIndex(value => value > 0)

      // Direct Online/WhatsApp demand: forecast at reference level. Its error
      // buffer is the only warehouse safety stock; store uncertainty is handled
      // separately below and is never buffered again at warehouse level.
      const directSeries = monthSequence.map((_, i) =>
        skus.reduce((sum, sku) => sum + (directSkuMonthly.get(sku)?.[i] || 0), 0)
      )
      const directFirst = directSeries.findIndex(value => value > 0)
      // Never inherit store demand as direct demand. For a completely new
      // reference, the conservative portfolio fallback belongs to direct only;
      // stores require their own observed history and linked inventory.
      const directTraining = directFirst >= 0
        ? directSeries.slice(directFirst)
        : aggregateFirst >= 0 ? [0, 0, 0] : training
      const directModel = selectDemandModel(directTraining)
      const directFuture = forecastMonths(directTraining, directModel.name, monthsNeeded)
      const wholeMonths = Math.floor(protectionMonths)
      const partial = protectionMonths - wholeMonths
      for (let monthOffset = 0; monthOffset < monthsNeeded; monthOffset++) {
        const factor = monthOffset < wholeMonths ? 1 : monthOffset === wholeMonths ? partial : 0
        const periodStart = new Date(endDate)
        periodStart.setMonth(periodStart.getMonth() + monthOffset)
        const periodEnd = new Date(endDate)
        periodEnd.setMonth(periodEnd.getMonth() + monthOffset + 1)
        const intervalMs = periodEnd.getTime() - periodStart.getTime()
        const periodMidpoint = new Date(periodStart.getTime() + intervalMs / 2)
        // Apply the commercial allowance before allocating integer pairs to
        // sizes; applying it SKU by SKU would round away most of a 10% uplift.
        const quantity = Math.max(0, Math.round(
          (directFuture[monthOffset] || 0) * factor * commercialSeasonFactor(periodMidpoint),
        ))
        for (const [sku, units] of allocateToSkus(skus, quantity, profile)) {
          addForecastDemand(sku, units)
          const weekly = largestRemainder(units, [1, 2, 3, 4].map(key => ({ key: String(key), share: 1 })))
          for (let quarter = 1; quarter <= 4; quarter++) {
            const eventDate = new Date(periodStart.getTime() + intervalMs * quarter / 4)
            addTarget(sku, weekly.get(String(quarter)) || 0, eventDate)
          }
        }
      }
      const directExpected = directFuture.slice(0, wholeMonths).reduce((sum, value) => sum + value, 0)
        + (partial > 0 ? (directFuture[wholeMonths] || 0) * partial : 0)
      const directSafety = Math.round(safetyStock(directModel, protectionMonths, directExpected))
      const directSizeSeries = new Map<string, number[]>()
      for (const sku of skus) {
        const size = parseProductName(stockBySku.get(sku)?.product_name || '').size || sku
        const existing = directSizeSeries.get(size) || Array(monthSequence.length).fill(0)
        const values = directSkuMonthly.get(sku) || []
        for (let i = 0; i < existing.length; i++) existing[i] += values[i] || 0
        directSizeSeries.set(size, existing)
      }
      const directSafetyProfile = variabilityAdjustedSizeProfile(directSizeSeries, profile)
      for (const [sku, units] of allocateToSkus(skus, directSafety, directSafetyProfile)) addTarget(sku, units, protectionEnd)

      // Store demand: each location owns its stock and receives one independent
      // replenishment per month. A store with sparse history inherits the same
      // reference aggregated across stores, scaled by its stable recent share.
      const aggregateTraining = aggregateFirst >= 0 ? aggregateStoreSeries.slice(aggregateFirst) : [0, 0, 0]
      const aggregateModel = selectDemandModel(aggregateTraining)
      const aggregateFuture = forecastMonths(aggregateTraining, aggregateModel.name, monthsNeeded)
      const eligibleStores = stores.filter(store => store.siigo_warehouse_id != null && skus.some(sku =>
        (stockByWarehouseSku.get(`${store.siigo_warehouse_id}|${sku}`) || 0) > 0
        || (storeSkuMonthly.get(store.id)?.get(sku) || []).some(value => value > 0)
      ))
      const aggregateRecent = aggregateStoreSeries.slice(-6).reduce((sum, value) => sum + value, 0)
      for (const store of eligibleStores) {
        const storeSeries = monthSequence.map((_, i) => skus.reduce((sum, sku) =>
          sum + (storeSkuMonthly.get(store.id)?.get(sku)?.[i] || 0), 0
        ))
        const storeFirst = storeSeries.findIndex(value => value > 0)
        const storeTraining = storeFirst >= 0 ? storeSeries.slice(storeFirst) : []
        const enoughHistory = storeTraining.length >= 6 && storeTraining.filter(value => value > 0).length >= 3
        const storeRecent = storeSeries.slice(-6).reduce((sum, value) => sum + value, 0)
        const equalShare = 1 / Math.max(1, eligibleStores.length)
        // Empirical-Bayes smoothing: sparse stores inherit part of the stable
        // aggregate reference rate instead of receiving a forced zero, while
        // established stores retain most of their observed share.
        const share = aggregateRecent > 0
          ? (storeRecent + aggregateRecent * equalShare * 0.25) / (aggregateRecent * 1.25)
          : equalShare
        const storeModel = enoughHistory ? selectDemandModel(storeTraining) : aggregateModel
        const storeFuture = enoughHistory
          ? forecastMonths(storeTraining, storeModel.name, monthsNeeded)
          : aggregateFuture.map(value => value * share)
        const monthlyExpected = storeFuture[0] || 0
        const storeBuffer = Math.round(enoughHistory
          ? safetyStock(storeModel, 1, monthlyExpected)
          : safetyStock(aggregateModel, 1, aggregateFuture[0] || 0) * share)
        const storeSizeSeries = new Map<string, number[]>()
        for (const sku of skus) {
          const size = parseProductName(stockBySku.get(sku)?.product_name || '').size || sku
          const existing = storeSizeSeries.get(size) || Array(monthSequence.length).fill(0)
          const values = storeSkuMonthly.get(store.id)?.get(sku) || []
          for (let i = 0; i < existing.length; i++) existing[i] += values[i] || 0
          storeSizeSeries.set(size, existing)
        }
        const localStoreProfile = storeSeries.some(value => value > 0)
          ? correctedSizeProfile(storeSizeSeries, storeSeries)
          : profile
        const unavailableSizes = new Set(skus
          .filter(sku => store.siigo_warehouse_id == null
            || (stockByWarehouseSku.get(`${store.siigo_warehouse_id}|${sku}`) || 0) <= 0)
          .map(sku => parseProductName(stockBySku.get(sku)?.product_name || '').size || sku))
        const observedStoreUnits = storeSeries.reduce((sum, value) => sum + Math.max(0, value), 0)
        // A missing size cannot be interpreted as demand zero. Blend the
        // store's own curve with the aggregate reference curve; currently
        // unavailable sizes receive a stronger stable prior. This restores
        // plausible lost demand without blindly filling every size.
        const storeProfile = stabilizedStoreSizeProfile(
          localStoreProfile,
          profile,
          observedStoreUnits,
          unavailableSizes,
        )
        // If a store has demand but no warehouse link, do not silently drop its
        // replenishment. Its observable stock is unknown, so use zero rather
        // than inventing inventory that may not exist.
        const storeSafetyProfile = variabilityAdjustedSizeProfile(storeSizeSeries, storeProfile)
        const safetyAllocation = allocateToSkus(skus, storeBuffer, storeSafetyProfile)
        const demandBySku = new Map(skus.map(sku => [sku, [] as number[]]))
        for (let monthOffset = 0; monthOffset < monthsNeeded; monthOffset++) {
          const factor = monthOffset < wholeMonths ? 1 : monthOffset === wholeMonths ? partial : 0
          if (factor <= 0) continue
          const reviewDate = new Date(endDate)
          reviewDate.setMonth(reviewDate.getMonth() + monthOffset)
          const seasonalDemand = Math.max(0, Math.round(
            (storeFuture[monthOffset] || 0) * factor * commercialSeasonFactor(reviewDate),
          ))
          const demandAllocation = allocateToSkus(skus, seasonalDemand, storeProfile)
          for (const sku of skus) {
            const units = demandAllocation.get(sku) || 0
            demandBySku.get(sku)!.push(units)
            addForecastDemand(sku, units)
          }
        }
        for (const sku of skus) {
          const initialStock = stockByWarehouseSku.get(`${store.siigo_warehouse_id}|${sku}`) || 0
          const replenishments = monthlyStoreReplenishments(
            demandBySku.get(sku) || [],
            safetyAllocation.get(sku) || 0,
            initialStock,
          )
          const firstDemand = demandBySku.get(sku)?.[0] || 0
          const safetyUnits = safetyAllocation.get(sku) || 0
          const safetyShortfallAfterDemand = Math.max(0, safetyUnits - Math.max(0, initialStock - firstDemand))
          replenishments.forEach((quantity, monthOffset) => {
            const reviewDate = new Date(endDate)
            reviewDate.setMonth(reviewDate.getMonth() + monthOffset)
            addTarget(sku, quantity, reviewDate, monthOffset === 0 ? safetyShortfallAfterDemand : 0)
          })
        }
      }

      // Aggregate comparable one-step metrics for the internal baseline report.
      if (selected.metrics.observations > 0) {
        const actualScale = training.slice(-selected.metrics.observations).reduce((sum, value) => sum + Math.abs(value), 0)
        backtestActual += actualScale
        selectedAbsError += selected.metrics.wape * actualScale
        const naiveErrors: number[] = []
        const start = Math.max(1, training.length - selected.metrics.observations)
        for (let i = start; i < training.length; i++) naiveErrors.push(Math.abs(training[i] - training[i - 1]))
        baselineAbsError += naiveErrors.reduce((sum, value) => sum + value, 0)
      }
    }

    // 4b. Pending production orders (zapatos en camino) → units by (diseño, talla)
    type PendingLine = { quantity: number; arrival: string }
    const enCaminoByKey = new Map<string, PendingLine[]>()
    // Keep the original label per key so diagnostics can show "Oso 23", not the
    // normalized key.
    const enCaminoLabelByKey = new Map<string, string>()
    let enCaminoTotalUnits = 0
    {
      const { data: pendingOrders } = await supabase
        .from('production_orders')
        .select('id, fecha_creacion, fecha_entrega')
        .eq('estado', 'pendiente')
        .range(0, 999)
      const typedOrders = (pendingOrders || []) as Array<{ id: string; fecha_creacion: string | null; fecha_entrega: string | null }>
      const orderIds = typedOrders.map(o => o.id)
      const arrivalByOrder = new Map(typedOrders.map(o => {
        if (o.fecha_entrega) return [o.id, o.fecha_entrega]
        const placed = o.fecha_creacion ? new Date(`${o.fecha_creacion}T12:00:00`) : endDate
        return [o.id, addBusinessDays(placed, leadTimeDias).toISOString().slice(0, 10)]
      }))
      if (orderIds.length > 0) {
        const { data: items } = await supabase
          .from('production_order_items')
          .select('order_id, diseno, talla, cantidad')
          .in('order_id', orderIds)
          .range(0, 9999)
        for (const it of (items || []) as Array<{ order_id: string; diseno: string; talla: string | null; cantidad: number }>) {
          const key = enCaminoKey(it.diseno, it.talla)
          const qty = Number(it.cantidad) || 0
          const lines = enCaminoByKey.get(key) || []
          lines.push({ quantity: qty, arrival: arrivalByOrder.get(it.order_id) || endDateStr })
          enCaminoByKey.set(key, lines)
          enCaminoTotalUnits += qty
          if (!enCaminoLabelByKey.has(key)) {
            enCaminoLabelByKey.set(key, `${it.diseno}${it.talla ? ` ${it.talla}` : ''}`)
          }
        }
      }
    }
    // Track which keys actually matched a forecast variant.
    const enCaminoMatchedKeys = new Set<string>()
    // 5. Build variant forecasts
    const allSkus = new Set<string>([...stockBySku.keys(), ...ventasPorSku.keys()])
    const pendingKeysBySku = new Map<string, string[]>()
    for (const key of enCaminoByKey.keys()) {
      const sep = key.lastIndexOf('|')
      const pendingDesign = key.slice(0, sep)
      const pendingSize = key.slice(sep + 1)
      const sizeCandidates = [...allSkus].filter(sku => {
        const stock = stockBySku.get(sku)
        if (!stock) return false
        const parsed = parseProductName(stock.product_name)
        return (parsed.size != null ? String(parsed.size).trim() : '') === pendingSize
      })
      const exactCandidates = sizeCandidates.filter(sku =>
        normName(parseProductName(stockBySku.get(sku)?.product_name || '').reference) === pendingDesign
      )
      const candidates = exactCandidates.length > 0
        ? exactCandidates
        : sizeCandidates.filter(sku =>
          designMatchesNorm(pendingDesign, normName(parseProductName(stockBySku.get(sku)?.product_name || '').reference))
        )
      // Ambiguous aliases are deliberately left unmatched. Discounting the
      // wrong product creates both a hidden shortage and a duplicate order.
      if (candidates.length === 1) {
        const list = pendingKeysBySku.get(candidates[0]) || []
        list.push(key)
        pendingKeysBySku.set(candidates[0], list)
      }
    }
    const variantsForecast: VariantForecast[] = []

    for (const sku of allSkus) {
      const stockInfo = stockBySku.get(sku) || { product_name: '', stockBodega: 0, stockConsignado: 0 }
      const ventas = ventasPorSku.get(sku) || { shopify: 0, whatsapp: 0, tiendas: 0, ferias: 0 }
      const ventasPeriodoEstacional = ventasEstacionalesPorSku.get(sku) || 0

      // Only include SKUs that exist in product cache (i.e. are real products, not raw mat)
      // If a SKU has sales but no stock entry, it might be a raw material item we don't want.
      if (!stockBySku.has(sku)) continue

      const ventasTotal = ventas.shopify + ventas.whatsapp + ventas.tiendas + ventas.ferias
      // Store inventory was already netted location-by-location when producing
      // replenishment needs. It must not be subtracted again as a pooled asset.
      const stockTotal = stockInfo.stockBodega

      const velocidadDiariaReciente = ventasTotal / diasAnalisis
      const velocidadDiariaEstacional = ventasPeriodoEstacional / horizonteDias
      const { reference, size } = parseProductName(stockInfo.product_name)
      const selectedModel = modelByReference.get(reference)
      const demandaFuente: VariantForecast['demandaFuente'] =
        selectedModel?.name.startsWith('seasonal') ? 'estacional' : 'reciente'
      const datedNeeds = needEventsBySku.get(sku) || []
      const velocidadDiaria = (forecastDemandBySku.get(sku) || 0) / protectionDays
      const velocidadSemanal = velocidadDiaria * 7

      let diasHastaAgotamiento: number | null = null
      if (velocidadDiaria > 0 && stockTotal > 0) {
        diasHastaAgotamiento = Math.round(stockTotal / velocidadDiaria)
      } else if (velocidadDiaria > 0 && stockTotal === 0) {
        diasHastaAgotamiento = 0
      }

      // Units already on order (in transit) for this design + size.
      // Try exact key first, then a tolerant word-level design match (same size),
      // consuming each order key once so it can't discount two variants.
      const matchingPendingLines: PendingLine[] = []
      for (const key of pendingKeysBySku.get(sku) || []) {
        matchingPendingLines.push(...(enCaminoByKey.get(key) || []))
        enCaminoMatchedKeys.add(key)
      }
      const productionArrival = leadTimeEnd.toISOString().slice(0, 10)
      const withoutInbound = productionRequiredAtArrival(stockTotal, [], datedNeeds, productionArrival)
      const sugerenciaProduccion = productionRequiredAtArrival(
        stockTotal,
        matchingPendingLines,
        datedNeeds,
        productionArrival,
      )
      const enCamino = Math.max(0, withoutInbound - sugerenciaProduccion)

      let prioridad: VariantForecast['prioridad'] = 'baja'
      if (sugerenciaProduccion > 0 && diasHastaAgotamiento !== null) {
        if (diasHastaAgotamiento <= 7) prioridad = 'critica'
        else if (diasHastaAgotamiento <= 14) prioridad = 'alta'
        else if (diasHastaAgotamiento <= 30) prioridad = 'media'
      }

      variantsForecast.push({
        sku,
        producto: reference || stockInfo.product_name,
        variante: size ? `Talla ${size}` : '',
        imagen: null,
        size,
        description: stockInfo.product_name,
        stockBodega: stockInfo.stockBodega,
        stockConsignado: 0,
        stockTotal,
        enCamino,
        ventasShopify: ventas.shopify,
        ventasWhatsApp: ventas.whatsapp,
        ventasTiendas: ventas.tiendas,
        ventasFerias: ventas.ferias,
        ventasTotal,
        ventasPeriodoEstacional,
        velocidadDiariaReciente: Math.round(velocidadDiariaReciente * 100) / 100,
        velocidadDiariaEstacional: Math.round(velocidadDiariaEstacional * 100) / 100,
        demandaFuente,
        velocidadDiaria,
        velocidadSemanal,
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
          enCamino: 0,
          ventasTotal: 0,
          ventasTiendas: 0,
          ventasPeriodoEstacional: 0,
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
      r.enCamino += v.enCamino
      r.ventasTotal += v.ventasTotal
      r.ventasTiendas += v.ventasTiendas
      r.ventasPeriodoEstacional += v.ventasPeriodoEstacional
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
      totalVentasOnline: forecast.reduce((sum, f) => sum + f.ventasShopify, 0),
      totalVentasWhatsApp: forecast.reduce((sum, f) => sum + f.ventasWhatsApp, 0),
      totalVentasTiendas: forecast.reduce((sum, f) => sum + f.ventasTiendas, 0),
      totalVentasFerias: forecast.reduce((sum, f) => sum + f.ventasFerias, 0),
      totalVentasPeriodoEstacional: forecast.reduce((sum, f) => sum + f.ventasPeriodoEstacional, 0),
      skusConAjusteEstacional: forecast.filter(f => f.demandaFuente === 'estacional').length,
      totalStockBodega: forecast.reduce((sum, f) => sum + f.stockBodega, 0),
      totalStockConsignado: forecast.reduce((sum, f) => sum + f.stockConsignado, 0),
    }

    // Diagnostic: which "en camino" items did NOT match any forecast variant
    // (design/size naming differs between the order and Siigo). These units are
    // NOT being discounted from the suggestion.
    const enCaminoSinMatch: Array<{ label: string; unidades: number }> = []
    const enCaminoDiscountedUnits = variantsForecast.reduce((sum, variant) => sum + variant.enCamino, 0)
    for (const [key, lines] of enCaminoByKey) {
      const qty = lines.reduce((sum, line) => sum + line.quantity, 0)
      if (!enCaminoMatchedKeys.has(key)) enCaminoSinMatch.push({ label: enCaminoLabelByKey.get(key) || key, unidades: qty })
    }
    enCaminoSinMatch.sort((a, b) => b.unidades - a.unidades)

    return NextResponse.json({
      forecast,
      referencias,
      resumen,
      enCamino: {
        totalUnidades: enCaminoTotalUnits,
        matchUnidades: enCaminoDiscountedUnits,
        sinMatch: enCaminoSinMatch,
      },
      bodegas: Array.from(warehouseDiag.entries())
        .map(([id, w]) => ({ id, name: w.name, bucket: w.bucket, units: w.units }))
        .sort((a, b) => (a.bucket === b.bucket ? b.units - a.units : a.bucket === 'bodega' ? -1 : 1)),
      parametros: {
        diasAnalisis,
        leadTimeDias,
        stockSeguridad,
        fechaInicio: startDateStr,
        fechaFin: endDateStr,
        horizonteDias,
        fechaInicioEstacional: seasonalStartStr,
        fechaFinEstacional: seasonalEndStr,
      },
      // Internal diagnostics; the current view does not render these fields.
      metodologia: {
        leadTimeBusinessDays: leadTimeDias,
        blackFridayUplift: BLACK_FRIDAY_UPLIFT,
        schoolSeasonUplift: SCHOOL_SEASON_UPLIFT,
        reviewPeriodMonths: REVIEW_PERIOD_MONTHS,
        protectionDays,
        historyStart: firstInvoiceMonth,
        historyMonths: monthSequence.length,
        stockoutHistory: 'inferred_size_gaps_only_no_historical_stock_snapshots',
        storeDemand: realStoreSales.length
          ? 'real_sell_through_replaces_same_sku_month_replenishment_proxy'
          : 'siigo_store_invoices_as_replenishment_proxy_no_double_count',
        stores: {
          active: stores.length,
          withWarehouse: stores.filter(store => store.siigo_warehouse_id != null).length,
          missingWarehouseAssumedZeroStock: stores.filter(store => store.siigo_warehouse_id == null).length,
        },
        backtest: {
          baseline: 'one_step_naive',
          baselineWape: backtestActual > 0 ? baselineAbsError / backtestActual : null,
          selectedWape: backtestActual > 0 ? selectedAbsError / backtestActual : null,
        },
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error calculando forecast'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
