import { NextResponse } from 'next/server'
import { businessDateBogota, buildSchoolSeasonPeriods } from '@/lib/forecast/calendar'
import { requireAuth, getAdminClient } from '@/lib/auth-helpers'
import {
  addBusinessDays,
  correctedSizeProfile,
  largestRemainder,
  monthlyStoreReplenishments,
  remainingMonthDemand,
  coverageAtArrival,
  dailyDemand,
  backtestDemandModel,
  forecastObservedGrowth,
  observedGrowth,
  backtestObservedGrowth,
  proratePartialMonth,
  stabilizedStoreSizeProfile,
  variabilityAdjustedSizeProfile,
} from '@/lib/forecast/demand-model'

interface StoreDispatch {
  tiendaId: string
  nombre: string
  stockTienda: number
  demandaMes: number
  seguridad: number
  cantidad: number
}

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
  enviarTiendas: number
  enviosTiendas: StoreDispatch[]
  faltanteAntesLlegada: number
  primeraFechaFaltante?: string | null
  produccionSinReserva: number
  produccionPorReserva: number
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
  enviarTiendas: number
  faltanteAntesLlegada: number
  primeraFechaFaltante?: string | null
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
  const leadTimeBusinessDays = Number.isFinite(requestedLeadTime)
    ? Math.min(365, Math.max(1, requestedLeadTime))
    : DEFAULT_PRODUCTION_LEAD_BUSINESS_DAYS
  const stockSeguridad = parseInt(searchParams.get('stock_seguridad') || '7')

  const supabase = getAdminClient()

  try {
    const endDate = businessDateBogota(new Date())
    const startDate = new Date(endDate)
    startDate.setDate(startDate.getDate() - diasAnalisis)
    const startDateStr = startDate.toISOString().slice(0, 10)
    const endDateStr = endDate.toISOString().slice(0, 10)
    const leadTimeEnd = addBusinessDays(endDate, leadTimeBusinessDays)
    const { periods: planningPeriods, planningEnd: protectionEnd } = buildSchoolSeasonPeriods(endDate)
    const protectionDays = Math.max(1, Math.round((Date.UTC(protectionEnd.getFullYear(), protectionEnd.getMonth(), protectionEnd.getDate()) - Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate())) / 86_400_000) + 1)
    const horizonteDias = protectionDays
    const seasonalStart = new Date(endDate)
    seasonalStart.setFullYear(seasonalStart.getFullYear() - 1)
    const seasonalEnd = new Date(endDate)
    seasonalEnd.setDate(seasonalEnd.getDate() + horizonteDias - 1)
    seasonalEnd.setFullYear(seasonalEnd.getFullYear() - 1)
    const seasonalStartStr = seasonalStart.toISOString().slice(0, 10)
    const seasonalEndStr = seasonalEnd.toISOString().slice(0, 10)
    const { data: feriaRows, error: feriaError } = await supabase
      .from('ferias')
      .select('fecha_inicio, fecha_fin')
      .lte('fecha_inicio', endDateStr)
    if (feriaError) throw new Error(feriaError.message)
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
      for (;;) {
        const { data: page, error: sErr } = await supabase
          .from('siigo_product_stock')
          .select('product_id, product_code, product_name, warehouse_id, warehouse_name, quantity')
          .eq('account_group_id', PRODUCT_ACCOUNT_GROUP_ID)
          .order('product_id').order('warehouse_id').range(pageStart, pageStart + pageSize - 1)
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
    type Store = { id: string; nombre: string; siigo_customer_identification: string | null; siigo_warehouse_id: number | null; activa?: boolean }
    const { data: tiendaNitsRaw, error: tiendasError } = await supabase
      .from('tiendas_terceros')
      .select('id, nombre, siigo_customer_identification, siigo_warehouse_id, activa')
    if (tiendasError) throw tiendasError
    const allStores = (tiendaNitsRaw || []) as Store[]
    const availableStores = allStores.filter(store => store.activa !== false)
    const excludedStoreIds = new Set((searchParams.get('excluir_tiendas') || '').split(',').filter(Boolean))
    for (const store of allStores) if (store.activa === false) excludedStoreIds.add(store.id)
    const stores = availableStores.filter(store => !excludedStoreIds.has(store.id))
    const storeByNit = new Map<string, Store>()
    for (const store of allStores) {
      for (const nit of identificationKeys(store.siigo_customer_identification)) storeByNit.set(nit, store)
    }

    type StoreSale = { tienda_id: string; fecha: string; producto_sku: string | null; cantidad: number }
    const realStoreSales: StoreSale[] = []
    const excludedSalesSkus = new Set<string>()
    for (let pageStart = 0; ; pageStart += 1000) {
      const { data: page, error: storeSalesError } = await supabase
        .from('ventas_terceros')
        .select('tienda_id, fecha, producto_sku, cantidad')
        .order('id').range(pageStart, pageStart + 999)
      if (storeSalesError) throw new Error(storeSalesError.message)
      if (!page?.length) break
      for (const sale of page as StoreSale[]) {
        if (excludedStoreIds.has(sale.tienda_id) && sale.producto_sku) excludedSalesSkus.add(sale.producto_sku)
      }
      realStoreSales.push(...(page as StoreSale[]).filter(sale => stores.some(store => store.id === sale.tienda_id)))
      if (page.length < 1000) break
    }
    // Classify the full invoice history, including Shopify orders older than
    // the recent sales window. Supabase caps each response at 1,000 records.
    const shopOrderNumbers = new Set<number>()
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from('shopify_orders')
        .select('order_number').order('id').range(offset, offset + 999)
      if (error) throw error
      for (const order of data || []) shopOrderNumbers.add(Number(order.order_number))
      if (!data || data.length < 1000) break
    }

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
      for (;;) {
        const { data: page, error: invoiceError } = await supabase
          .from('siigo_invoices')
          .select('id, date, customer_identification, observations, items, total, credited_amount, assigned_feria_id')
          .gte('date', from)
          .lte('date', to)
          .order('id').range(pageStart, pageStart + pageSize - 1)
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

    // Siigo invoices are actual store sales. Prefer the invoiced SKU/month;
    // manual store records only fill months without invoices, never add both.
    const invoicedStoreMonths = new Set<string>()
    for (const inv of uniqueInvoices) {
      const store = identificationKeys(inv.customer_identification).map(nit => storeByNit.get(nit)).find(Boolean)
      if (!store || excludedStoreIds.has(store.id) || inv.assigned_feria_id != null) continue
      for (const item of inv.items || []) {
        if (item.code && item.code !== 'ENVIO') invoicedStoreMonths.add(`${store.id}|${item.code}|${inv.date.slice(0, 7)}`)
      }
    }
    const supplementalStoreSales = realStoreSales.filter(sale =>
      !invoicedStoreMonths.has(`${sale.tienda_id}|${sale.producto_sku}|${sale.fecha.slice(0, 7)}`))

    // 4. Aggregate sales per SKU per channel
    type Sales = { shopify: number; whatsapp: number; tiendas: number; ferias: number }
    const ventasPorSku = new Map<string, Sales>()
    const ventasEstacionalesPorSku = new Map<string, number>()

    for (const inv of invoices) {
      const invoiceStore = identificationKeys(inv.customer_identification).map(nit => storeByNit.get(nit)).find(Boolean)
      if (invoiceStore && excludedStoreIds.has(invoiceStore.id)) continue
      const orderNum = extractOrderNum(inv.observations)
      const knownShopify = orderNum !== null && shopOrderNumbers.has(orderNum)
      const isFeria = inv.assigned_feria_id != null || (!invoiceStore && !knownShopify && isFeriaDate(inv.date))
      const isTienda = invoiceStore != null && !isFeria
      const isShopify = !isFeria && !isTienda && knownShopify
      // Default: WhatsApp (direct sale)
      const channel: keyof Sales = isFeria ? 'ferias' : isTienda ? 'tiendas' : isShopify ? 'shopify' : 'whatsapp'

      for (const it of inv.items || []) {
        if (!it.code || it.code === 'ENVIO') continue
        let s = ventasPorSku.get(it.code)
        if (!s) {
          s = { shopify: 0, whatsapp: 0, tiendas: 0, ferias: 0 }
          ventasPorSku.set(it.code, s)
        }
        s[channel] += it.quantity || 0
      }
    }
    for (const sale of supplementalStoreSales) {
      if (!sale.producto_sku || sale.fecha < startDateStr || sale.fecha > endDateStr) continue
      const current = ventasPorSku.get(sale.producto_sku) || { shopify: 0, whatsapp: 0, tiendas: 0, ferias: 0 }
      current.tiendas += Math.max(0, Number(sale.cantidad) || 0)
      ventasPorSku.set(sale.producto_sku, current)
    }

    for (const inv of seasonalInvoices) {
      const store = identificationKeys(inv.customer_identification).map(nit => storeByNit.get(nit)).find(Boolean)
      if (store && excludedStoreIds.has(store.id)) continue
      for (const it of inv.items || []) {
        if (!it.code || it.code === 'ENVIO') continue
        ventasEstacionalesPorSku.set(
          it.code,
          (ventasEstacionalesPorSku.get(it.code) || 0) + (Number(it.quantity) || 0)
        )
      }
    }

    // Complete monthly actual sales history, with Siigo as the primary source.
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
    const onlineMonthly = { Shopify: new Map<string, number[]>(), WhatsApp: new Map<string, number[]>() }
    const storeSkuMonthly = new Map<string, Map<string, number[]>>()
    for (const sku of stockBySku.keys()) {
      skuMonthly.set(sku, Array(monthSequence.length).fill(0))
      directSkuMonthly.set(sku, Array(monthSequence.length).fill(0))
      onlineMonthly.Shopify.set(sku, Array(monthSequence.length).fill(0))
      onlineMonthly.WhatsApp.set(sku, Array(monthSequence.length).fill(0))
    }
    for (const store of stores) {
      storeSkuMonthly.set(store.id, new Map([...stockBySku.keys()].map(sku => [sku, Array(monthSequence.length).fill(0)])))
    }
    for (const inv of uniqueInvoices) {
      const index = monthIndex.get(monthKey(inv.date))
      if (index == null) continue
      const matchedStore = identificationKeys(inv.customer_identification).map(nit => storeByNit.get(nit)).find(Boolean)
      if (matchedStore && excludedStoreIds.has(matchedStore.id)) {
        for (const item of inv.items || []) if (item.code) excludedSalesSkus.add(item.code)
        continue
      }
      const orderNum = extractOrderNum(inv.observations)
      const knownShopify = orderNum !== null && shopOrderNumbers.has(orderNum)
      const isFeriaInvoice = inv.assigned_feria_id != null || (!matchedStore && !knownShopify && isFeriaDate(inv.date))
      // Ferias are event demand, not recurring Online/WhatsApp demand and not
      // a monthly store replenishment proxy.
      if (isFeriaInvoice) continue
      const invoiceStore = matchedStore
      for (const it of inv.items || []) {
        if (!it.code || it.code === 'ENVIO' || !stockBySku.has(it.code)) continue
        const qty = Math.max(0, Number(it.quantity) || 0)
        const series = skuMonthly.get(it.code)!
        series[index] += qty
        if (invoiceStore) {
          const storeSeries = storeSkuMonthly.get(invoiceStore.id)?.get(it.code)
          if (storeSeries) storeSeries[index] += qty
        } else {
          directSkuMonthly.get(it.code)![index] += qty
          onlineMonthly[knownShopify ? 'Shopify' : 'WhatsApp'].get(it.code)![index] += qty
        }
      }
    }
    for (const sale of supplementalStoreSales) {
      if (!sale.producto_sku || !stockBySku.has(sale.producto_sku)) continue
      const index = monthIndex.get(monthKey(sale.fecha))
      if (index == null) continue
      const qty = Math.max(0, Number(sale.cantidad) || 0)
      skuMonthly.get(sale.producto_sku)![index] += qty
      const storeSeries = storeSkuMonthly.get(sale.tienda_id)?.get(sale.producto_sku)
      if (storeSeries) storeSeries[index] += qty
    }

    // Train only on completed months. Actual month-to-date sales are kept
    // separately and subtracted from this month's forecast, never from stock.
    const currentStoreObserved = new Map([...storeSkuMonthly].map(([id, rows]) =>
      [id, new Map([...rows].map(([sku, series]) => [sku, series.at(-1) || 0]))],
    ))
    const onlineActual = {
      Shopify: new Map([...onlineMonthly.Shopify].map(([sku, values]) => [sku, values.at(-1) || 0])),
      WhatsApp: new Map([...onlineMonthly.WhatsApp].map(([sku, values]) => [sku, values.at(-1) || 0])),
    }
    monthSequence.pop()
    for (const rows of Object.values(onlineMonthly)) for (const series of rows.values()) series.pop()
    for (const rows of [skuMonthly, directSkuMonthly]) for (const series of rows.values()) series.pop()
    for (const rows of storeSkuMonthly.values()) for (const series of rows.values()) series.pop()
    const elapsedDays = Number(endDateStr.slice(8, 10))
    const calendarDays = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0).getDate()

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
    const needsWithoutReserve = new Map<string, Array<{ date: string; quantity: number }>>()
    const needEventsBySku = new Map<string, Array<{ date: string; quantity: number; recoverableSafety?: number }>>()
    const dispatchesBySku = new Map<string, StoreDispatch[]>()
    const forecastDemandBySku = new Map<string, number>()
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
    const auditRows: Array<{ referencia: string; canal: string; modelo: string; mesesHistoria: number; meses: string[]; fuentes: string[]; demanda: number[]; reserva: number; evidencia: string; historial: Array<{ mes: string; pares: number }> }> = []
    const validation = { previousAbsoluteError: 0, actualUnits: 0, selectedAbsoluteError: 0, baselineAbsoluteError: 0, observations: 0, seriesEvaluadas: 0, seriesSinEvaluar: 0 }
    const validationByChannel = {
      directo: { actual: 0, abs: 0, baselineAbs: 0, series: 0 },
      tiendas: { actual: 0, abs: 0, baselineAbs: 0, series: 0 },
    }
    const onlineHistory = {
      Shopify: monthSequence.map((_, i) => [...onlineMonthly.Shopify.values()].reduce((sum, values) => sum + (values[i] || 0), 0)),
      WhatsApp: monthSequence.map((_, i) => [...onlineMonthly.WhatsApp.values()].reduce((sum, values) => sum + (values[i] || 0), 0)),
    }
    const storeHistories = new Map([...storeSkuMonthly].map(([id, rows]) => [id, monthSequence.map((_, i) => [...rows.values()].reduce((sum, values) => sum + (values[i] || 0), 0))]))
    const checksByReference = new Map<string, { actual: number; error: number; previousError: number; baselineError: number; evaluated: number; missing: number }>()
    const recordCheck = (reference: string, check?: ReturnType<typeof backtestDemandModel>, previousError = 0) => {
      const row = checksByReference.get(reference) || { actual: 0, error: 0, previousError: 0, baselineError: 0, evaluated: 0, missing: 0 }
      if (check && check.origins >= 3 && check.actualUnits > 0) {
        row.actual += check.actualUnits
        row.error += check.selectedAbsoluteError
        row.previousError += previousError
        row.baselineError += check.baselineAbsoluteError
        row.evaluated++
      } else row.missing++
      checksByReference.set(reference, row)
    }
    const validateSeries = (values: number[], channel: 'directo' | 'tiendas', reference: string, growthHistory: number[]) => {
      const check = backtestObservedGrowth(values, growthHistory, 4)
      const previous = backtestDemandModel(values, 4, monthSequence.slice(-values.length))
      recordCheck(reference, check, previous.selectedAbsoluteError)
      if (check.origins < 3) { validation.seriesSinEvaluar++; return }
      const channelTotal = validationByChannel[channel]
      channelTotal.actual += check.actualUnits
      channelTotal.abs += check.selectedAbsoluteError
      channelTotal.baselineAbs += check.baselineAbsoluteError
      channelTotal.series++
      validation.previousAbsoluteError += previous.selectedAbsoluteError
      validation.actualUnits += check.actualUnits
      validation.selectedAbsoluteError += check.selectedAbsoluteError
      validation.baselineAbsoluteError += check.baselineAbsoluteError
      validation.observations += check.selected.observations
      validation.seriesEvaluadas++
    }
    const seasonalReferences = new Set<string>()
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

      const futureMonthsNeeded = planningPeriods.filter(period => period.futureIndex != null).length
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

      const futureMonthKeys = planningPeriods.map(period => period.month)
      for (const directChannel of ['Shopify', 'WhatsApp'] as const) {
      // Direct Online/WhatsApp demand: forecast at reference level. Its error
      // buffer is the only warehouse safety stock; store uncertainty is handled
      // separately below and is never buffered again at warehouse level.
      const directSeries = monthSequence.map((_, i) =>
        skus.reduce((sum, sku) => sum + (onlineMonthly[directChannel].get(sku)?.[i] || 0), 0)
      )
      const directFirst = directSeries.findIndex(value => value > 0)
      // A reference without closed-month sales has no empirical future base.
      const directTraining = directFirst >= 0 ? directSeries.slice(directFirst) : []
      if (directFirst < 0 && !skus.some(sku => (onlineActual[directChannel].get(sku) || 0) > 0)) continue
      const directAnnual = forecastObservedGrowth(directTraining, onlineHistory[directChannel], futureMonthsNeeded + 1)
      const directProjection = directAnnual.values
      const directSizeSeries = new Map<string, number[]>()
      for (const sku of skus) {
        const size = parseProductName(stockBySku.get(sku)?.product_name || '').size || sku
        const existing = directSizeSeries.get(size) || Array(monthSequence.length).fill(0)
        const values = onlineMonthly[directChannel].get(sku) || []
        for (let i = 0; i < existing.length; i++) existing[i] += values[i] || 0
        directSizeSeries.set(size, existing)
      }
      const directProfile = directFirst >= 0 ? correctedSizeProfile(directSizeSeries, directSeries) : profile
      const directActual = skus.reduce((sum, sku) => sum + (onlineActual[directChannel].get(sku) || 0), 0)
      const directCurrentMonth = directFirst < 0 && directActual > 0
        ? proratePartialMonth(directActual, elapsedDays, calendarDays)
        : directProjection[0] || 0
      const directFuture = directProjection.slice(1)
      const directPeriodDemand = planningPeriods.map(period => Math.max(0, Math.round(
        (period.futureIndex == null ? remainingMonthDemand(directCurrentMonth, directActual) : (directFuture[period.futureIndex] || 0)),
      )))
      for (let periodIndex = 0; periodIndex < planningPeriods.length; periodIndex++) {
        const period = planningPeriods[periodIndex]
        const quantity = directPeriodDemand[periodIndex]
        for (const [sku, units] of allocateToSkus(skus, quantity, directProfile)) {
          addForecastDemand(sku, units)
          const periodEnd = period.demandDate.toISOString().slice(0, 10)
          const periodStart = period.futureIndex == null ? endDateStr : `${period.month}-01`
          for (const daily of dailyDemand(units, periodStart, periodEnd)) {
            addTarget(sku, daily.quantity, new Date(`${daily.date}T12:00:00Z`))
            const baseNeeds = needsWithoutReserve.get(sku) || []
            baseNeeds.push(daily)
            needsWithoutReserve.set(sku, baseNeeds)
          }
        }
      }
      if (directAnnual.sources.some(source => source.startsWith('año anterior'))) seasonalReferences.add(reference)
      if (directFirst >= 0) validateSeries(directTraining, 'directo', reference, onlineHistory[directChannel])
      else { validation.seriesSinEvaluar++; recordCheck(reference) }
      const directExpected = directPeriodDemand.reduce((sum, value) => sum + value, 0)
      const manualSafety = directExpected / Math.max(1, protectionDays) * Math.max(0, stockSeguridad)
      // Configured days are a hard ceiling, never a floor for statistical inflation.
      const directSafety = Math.floor(manualSafety)
      auditRows.push({ referencia: reference, canal: directChannel, historial: monthSequence.map((mes, i) => ({ mes, pares: directSeries[i] || 0 })), modelo: 'año anterior × crecimiento observado', mesesHistoria: directFirst >= 0 ? directTraining.length : 0, meses: futureMonthKeys, fuentes: directAnnual.sources, demanda: directPeriodDemand, reserva: directSafety, evidencia: directFirst >= 0 ? 'ventas directas' : 'sin historial cerrado: estimación provisional' })
      const directSafetyProfile = variabilityAdjustedSizeProfile(directSizeSeries, directProfile)
      for (const [sku, units] of allocateToSkus(skus, directSafety, directSafetyProfile)) addTarget(sku, units, protectionEnd)

      }

      // Each store owns its stock; demand follows its recent share of the
      // selected stores' calendar pattern, without inventing sales for inactive series.
      const eligibleStores = stores.filter(store => store.siigo_warehouse_id != null && skus.some(sku =>
        (stockByWarehouseSku.get(`${store.siigo_warehouse_id}|${sku}`) || 0) > 0
        || (storeSkuMonthly.get(store.id)?.get(sku) || []).some(value => value > 0)
        || (currentStoreObserved.get(store.id)?.get(sku) || 0) > 0
      ))
      for (const store of eligibleStores) {
        const storeSeries = monthSequence.map((_, i) => skus.reduce((sum, sku) =>
          sum + (storeSkuMonthly.get(store.id)?.get(sku)?.[i] || 0), 0
        ))
        const storeFirst = storeSeries.findIndex(value => value > 0)
        const storeTraining = storeFirst >= 0 ? storeSeries.slice(storeFirst) : []
        const enoughHistory = storeTraining.length >= 6 && storeTraining.filter(value => value > 0).length >= 3
        const storeAnnual = forecastObservedGrowth(storeTraining, storeHistories.get(store.id) || [], futureMonthsNeeded + 1)
        const storeProjection = storeAnnual.values
        if (storeAnnual.sources.some(source => source.startsWith('año anterior'))) seasonalReferences.add(reference)
        if (enoughHistory) validateSeries(storeTraining, 'tiendas', reference, storeHistories.get(store.id) || [])
        else { validation.seriesSinEvaluar++; recordCheck(reference) }
        const storeFuture = storeProjection.slice(1)
        const storeActual = skus.reduce((sum, sku) => sum + (currentStoreObserved.get(store.id)?.get(sku) || 0), 0)
        const storeCurrentMonth = storeFirst < 0 && storeActual > 0
          ? proratePartialMonth(storeActual, elapsedDays, calendarDays)
          : storeProjection[0] || 0
        // Invoice sales already reduced Siigo stock: subtract them only from
        // the remaining monthly demand, exactly once, in every calendar month.
        const storePeriodDemand = planningPeriods.map(period => Math.max(0, Math.round(
          period.futureIndex == null
            ? remainingMonthDemand(storeCurrentMonth, storeActual)
            : storeFuture[period.futureIndex] || 0,
        )))
        const storeDayLimit = storePeriodDemand.reduce((sum, value) => sum + value, 0)
          / Math.max(1, protectionDays) * Math.max(0, stockSeguridad)
        const storeBuffer = Math.floor(storeDayLimit)
        auditRows.push({ referencia: reference, canal: store.nombre, historial: monthSequence.map((mes, i) => ({ mes, pares: storeSeries[i] || 0 })), modelo: 'año anterior × crecimiento observado', mesesHistoria: storeTraining.length, meses: futureMonthKeys, fuentes: storeAnnual.sources, demanda: storePeriodDemand, reserva: storeBuffer, evidencia: enoughHistory ? 'ventas de tienda facturadas en Siigo; registros manuales solo sin factura del SKU/mes' : 'historial escaso: participación reciente observada, sin validación individual' })
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
        // Only linked stores are eligible. Each store's reserve uses its own
        // size curve and is netted only against that store's stock.
        const storeSafetyProfile = variabilityAdjustedSizeProfile(storeSizeSeries, storeProfile)
        const safetyAllocation = allocateToSkus(skus, storeBuffer, storeSafetyProfile)
        // One monthly shipment target, separate from production through January.
        // Do not net warehouse stock or inbound orders here: this is what the
        // store needs to receive, not additional manufacturing demand.
        const shipmentDemand = allocateToSkus(skus, Math.max(0, Math.round(storeFuture[0] ?? storeCurrentMonth)), storeProfile)
        for (const sku of skus) {
          const stockTienda = Math.max(0, stockByWarehouseSku.get(`${store.siigo_warehouse_id}|${sku}`) || 0)
          const demandaMes = shipmentDemand.get(sku) || 0
          const seguridad = safetyAllocation.get(sku) || 0
          const cantidad = monthlyStoreReplenishments([demandaMes], seguridad, stockTienda)[0]
          if (cantidad > 0) {
            const dispatches = dispatchesBySku.get(sku) || []
            dispatches.push({ tiendaId: store.id, nombre: store.nombre, stockTienda, demandaMes, seguridad, cantidad })
            dispatchesBySku.set(sku, dispatches)
          }
        }
        const demandBySku = new Map(skus.map(sku => [sku, [] as number[]]))
        for (let periodIndex = 0; periodIndex < planningPeriods.length; periodIndex++) {
          const demandAllocation = allocateToSkus(skus, storePeriodDemand[periodIndex], storeProfile)
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
          const baseReplenishments = monthlyStoreReplenishments(demandBySku.get(sku) || [], 0, initialStock)
          const baseNeeds = needsWithoutReserve.get(sku) || []
          baseReplenishments.forEach((quantity, index) => baseNeeds.push({
            date: index === 0 ? endDateStr : `${planningPeriods[index].month}-01`, quantity,
          }))
          needsWithoutReserve.set(sku, baseNeeds)
          const firstDemand = demandBySku.get(sku)?.[0] || 0
          const safetyUnits = safetyAllocation.get(sku) || 0
          const safetyShortfallAfterDemand = Math.max(0, safetyUnits - Math.max(0, initialStock - firstDemand))
          replenishments.forEach((quantity, periodIndex) => {
            const period = planningPeriods[periodIndex]
            // Monthly store replenishment must be available at the START of
            // its coverage period, not after that month's sales have occurred.
            const reviewDate = new Date(`${periodIndex === 0 ? endDateStr : `${period.month}-01`}T12:00:00Z`)
            addTarget(sku, quantity, reviewDate, periodIndex === 0 ? safetyShortfallAfterDemand : 0)
          })
        }
      }


    }

    // 4b. Pending production orders (zapatos en camino) → units by (diseño, talla)
    type PendingLine = { quantity: number; arrival: string; inTransit: boolean }
    const enCaminoByKey = new Map<string, PendingLine[]>()
    // Keep the original label per key so diagnostics can show "Oso 23", not the
    // normalized key.
    const enCaminoLabelByKey = new Map<string, string>()
    let enCaminoTotalUnits = 0
    {
      type OrderRow = { id: string; numero: string | null; fecha_creacion: string | null; fecha_entrega: string | null; estado: string }
      const orderRows: OrderRow[] = []
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from('production_orders')
          .select('id, numero, fecha_creacion, fecha_entrega, estado')
          .in('estado', ['pendiente', 'recibida']).order('id').range(offset, offset + 999)
        if (error) throw new Error('No se pudieron cargar las órdenes en camino: ' + error.message)
        orderRows.push(...(data || []))
        if (!data || data.length < 1000) break
      }
      const typedOrders = ((orderRows || []) as OrderRow[]).filter(order =>
        order.estado === 'pendiente' || /^(orden\s+)?0*30$/i.test((order.numero || '').trim()),
      )
      const orderIds = typedOrders.map(o => o.id)
      const arrivalByOrder = new Map(typedOrders.map(o => {
        // OC30 is the explicitly reported partial receipt: 30/100 are already
        // physically in our warehouse but not yet in Siigo; the other 70 use
        // the confirmed 52-business-day planning date from 2026-08-31.
        if (/^(orden\s+)?0*30$/i.test((o.numero || '').trim())) {
          return [o.id, addBusinessDays(new Date('2026-08-31T12:00:00'), leadTimeBusinessDays).toISOString().slice(0, 10)]
        }
        if (o.fecha_entrega) return [o.id, o.fecha_entrega]
        const placed = o.fecha_creacion ? new Date(`${o.fecha_creacion}T12:00:00`) : endDate
        return [o.id, addBusinessDays(placed, leadTimeBusinessDays).toISOString().slice(0, 10)]
      }))
      if (orderIds.length > 0) {
        type OrderItem = { id: string; order_id: string; diseno: string; talla: string | null; cantidad: number }
        const typedItems: OrderItem[] = []
        for (let offset = 0; ; offset += 1000) {
          const { data, error } = await supabase.from('production_order_items')
            .select('id, order_id, diseno, talla, cantidad').in('order_id', orderIds)
            .order('id').range(offset, offset + 999)
          if (error) throw new Error('No se pudieron cargar las tallas en camino: ' + error.message)
          typedItems.push(...(data || []))
          if (!data || data.length < 1000) break
        }
        const oc30 = typedOrders.find(order => /^(orden\s+)?0*30$/i.test((order.numero || '').trim()))
        const oc30Items = typedItems.filter(item => item.order_id === oc30?.id)
        const receivedAllocation = largestRemainder(30, oc30Items.map(item => ({
          key: item.id,
          share: Math.max(0, Number(item.cantidad) || 0),
        })))
        for (const it of typedItems) {
          const key = enCaminoKey(it.diseno, it.talla)
          const qty = Number(it.cantidad) || 0
          const lines = enCaminoByKey.get(key) || []
          const received = it.order_id === oc30?.id ? Math.min(qty, receivedAllocation.get(it.id) || 0) : 0
          const remaining = Math.max(0, qty - received)
          if (received > 0) lines.push({ quantity: received, arrival: endDateStr, inTransit: false })
          if (remaining > 0) lines.push({
            quantity: remaining,
            arrival: arrivalByOrder.get(it.order_id) || endDateStr,
            inTransit: true,
          })
          enCaminoByKey.set(key, lines)
          enCaminoTotalUnits += remaining
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

      // Match confirmed supply before calculating coverage. OC30 includes 30
      // pairs physically received outside Siigo, so those units are current
      // warehouse inventory for planning even though the accounting cache has
      // not caught up yet.
      const matchingPendingLines: PendingLine[] = []
      for (const key of pendingKeysBySku.get(sku) || []) {
        matchingPendingLines.push(...(enCaminoByKey.get(key) || []))
        enCaminoMatchedKeys.add(key)
      }
      const receivedOutsideSiigo = matchingPendingLines.reduce(
        (sum, line) => sum + (!line.inTransit ? Math.max(0, line.quantity) : 0),
        0,
      )

      const ventasTotal = ventas.shopify + ventas.whatsapp + ventas.tiendas + ventas.ferias
      // Store inventory was already netted location-by-location when producing
      // replenishment needs. It must not be subtracted again as a pooled asset.
      const planningStock = stockInfo.stockBodega + receivedOutsideSiigo
      const stockTotal = planningStock + stockInfo.stockConsignado

      const velocidadDiariaReciente = ventasTotal / diasAnalisis
      const velocidadDiariaEstacional = ventasPeriodoEstacional / horizonteDias
      const { reference, size } = parseProductName(stockInfo.product_name)
      const demandaFuente: VariantForecast['demandaFuente'] =
        seasonalReferences.has(reference) ? 'estacional' : 'reciente'
      const datedNeeds = needEventsBySku.get(sku) || []
      const velocidadDiaria = (forecastDemandBySku.get(sku) || 0) / protectionDays
      const velocidadSemanal = velocidadDiaria * 7

      let diasHastaAgotamiento: number | null = null
      if (velocidadDiaria > 0 && planningStock > 0) {
        diasHastaAgotamiento = Math.round(planningStock / velocidadDiaria)
      } else if (velocidadDiaria > 0 && planningStock === 0) {
        diasHastaAgotamiento = 0
      }

      // Units already on order (in transit) for this design + size.
      // Try exact key first, then a tolerant word-level design match (same size),
      // consuming each order key once so it can't discount two variants.
      const productionArrival = leadTimeEnd.toISOString().slice(0, 10)
      const coverage = coverageAtArrival(
        planningStock,
        matchingPendingLines.filter(line => line.inTransit),
        datedNeeds,
        productionArrival,
      )
      const sugerenciaProduccion = coverage.production
      // Counterfactual with identical sales, sizes, stock and arrival dates;
      // only direct/store reserves are removed. This does not change policy.
      const produccionSinReserva = coverageAtArrival(planningStock,
        matchingPendingLines.filter(line => line.inTransit), needsWithoutReserve.get(sku) || [], productionArrival).production
      const produccionPorReserva = sugerenciaProduccion - produccionSinReserva
      const faltanteAntesLlegada = coverage.shortageBeforeArrival
      if (coverage.firstShortageDate) diasHastaAgotamiento = Math.max(0, Math.round((Date.parse(coverage.firstShortageDate) - Date.parse(endDateStr)) / 86400000))
      const enCamino = matchingPendingLines.reduce(
        (sum, line) => sum + (line.inTransit ? Math.max(0, line.quantity) : 0),
        0,
      )

      let prioridad: VariantForecast['prioridad'] = 'baja'
      if ((sugerenciaProduccion > 0 || faltanteAntesLlegada > 0) && diasHastaAgotamiento !== null) {
        if (diasHastaAgotamiento <= 7) prioridad = 'critica'
        else if (diasHastaAgotamiento <= 14) prioridad = 'alta'
        else if (diasHastaAgotamiento <= 30 || faltanteAntesLlegada > 0) prioridad = 'media'
      }

      variantsForecast.push({
        sku,
        producto: reference || stockInfo.product_name,
        variante: size ? `Talla ${size}` : '',
        imagen: null,
        size,
        description: stockInfo.product_name,
        stockBodega: planningStock,
        stockConsignado: stockInfo.stockConsignado,
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
        enviarTiendas: (dispatchesBySku.get(sku) || []).reduce((sum, store) => sum + store.cantidad, 0),
        enviosTiendas: dispatchesBySku.get(sku) || [],
        faltanteAntesLlegada,
        primeraFechaFaltante: coverage.firstShortageDate,
        produccionSinReserva,
        produccionPorReserva,
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
          enviarTiendas: 0,
          faltanteAntesLlegada: 0,
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
      r.enviarTiendas += v.enviarTiendas
      r.faltanteAntesLlegada += v.faltanteAntesLlegada
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
      totalProduccionSinReserva: forecast.reduce((sum, f) => sum + f.produccionSinReserva, 0),
      totalProduccionPorReserva: forecast.reduce((sum, f) => sum + f.produccionPorReserva, 0),
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
      const qty = lines.reduce((sum, line) => sum + (line.inTransit ? line.quantity : 0), 0)
      if (!enCaminoMatchedKeys.has(key)) enCaminoSinMatch.push({ label: enCaminoLabelByKey.get(key) || key, unidades: qty })
    }
    enCaminoSinMatch.sort((a, b) => b.unidades - a.unidades)

    return NextResponse.json({
      crecimientoObservado: [
        ...Object.entries(onlineHistory).map(([canal, history]) => ({ canal, ...observedGrowth(history) })),
        ...stores.filter(store => store.siigo_warehouse_id != null).map(store => ({ canal: store.nombre, ...observedGrowth(storeHistories.get(store.id) || []) })),
      ].map(row => ({ ...row, mesesActuales: monthSequence.slice(-3), mesesComparables: monthSequence.length >= 15 ? monthSequence.slice(-15, -12) : [] })),
      auditoria: auditRows,
      validacion: {
        ...validation,
        horizonteMeses: 4,
        revisionReferencias: referencias.map(row => {
          const check = checksByReference.get(row.reference)
          return {
            referencia: row.reference,
            produccion: row.sugerenciaProduccion,
            error: check?.actual ? check.error / check.actual : null,
            errorAnterior: check?.actual ? check.previousError / check.actual : null,
            errorBase: check?.actual ? check.baselineError / check.actual : null,
            canalesEvaluados: check?.evaluated || 0,
            canalesSinEvaluar: check?.missing || 0,
          }
        }).sort((a, b) => b.produccion - a.produccion),
        porCanal: Object.entries(validationByChannel).map(([canal, row]) => ({ canal, series: row.series, error: row.actual > 0 ? row.abs / row.actual : null, errorBase: row.actual > 0 ? row.baselineAbs / row.actual : null })),
        errorAnterior: validation.actualUnits > 0 ? validation.previousAbsoluteError / validation.actualUnits : null,
        errorModelo: validation.actualUnits > 0 ? validation.selectedAbsoluteError / validation.actualUnits : null,
        errorBase: validation.actualUnits > 0 ? validation.baselineAbsoluteError / validation.actualUnits : null,
        alcance: 'Mismo mes del año anterior por referencia con variación interanual de los últimos tres meses cerrados de Shopify, WhatsApp o cada tienda; cortes históricos de cuatro meses. No valida existencias históricas, curvas por talla ni tiendas con historial escaso.',
      },
      cobertura: {
        fechaLlegadaProduccion: leadTimeEnd.toISOString().slice(0, 10),
        faltanteAntesLlegada: forecast.reduce((sum, row) => sum + row.faltanteAntesLlegada, 0),
        distribucion: 'Demanda directa uniforme por día; reposición de tiendas al inicio de cada mes. No incluye tiempo de traslado a tiendas.',
      },
      tiendasForecast: availableStores.map(store => ({ id: store.id, nombre: store.nombre, incluida: !excludedStoreIds.has(store.id), tieneBodega: store.siigo_warehouse_id != null })),
      reposicionTiendas: {
        mes: planningPeriods.find(period => period.futureIndex === 0)?.month || endDateStr.slice(0, 7),
        tiendasSinBodega: stores.filter(store => store.siigo_warehouse_id == null).length,
      },
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
        leadTimeDias: leadTimeBusinessDays,
        stockSeguridad,
        fechaInicio: startDateStr,
        fechaFin: endDateStr,
        horizonteDias,
        fechaInicioEstacional: seasonalStartStr,
        fechaFinEstacional: seasonalEndStr,
      },
      // Internal diagnostics; the current view does not render these fields.
      metodologia: {
        leadTimeBusinessDays,
        businessDayCalendar: 'Colombia: excludes weekends and national holidays',
        commercialSeasonality: 'same_month_last_year_times_observed_channel_or_store_three_closed_month_yoy_growth',
        planningHorizon: `through_${protectionEnd.toISOString().slice(0, 10)}`,
        planningMonths: planningPeriods.map(period => period.month),
        protectionDays,
        historyStart: firstInvoiceMonth,
        historyMonths: monthSequence.length,
        safetyPolicy: 'configured_days_hard_cap_per_reference_and_channel_floor_to_whole_pairs',
        stockoutHistory: 'inferred_size_gaps_only_no_historical_stock_snapshots',
        storeDemand: 'siigo_invoices_are_actual_sales_manual_fallback_without_same_sku_month_invoice',
        stores: {
          active: stores.length,
          withWarehouse: stores.filter(store => store.siigo_warehouse_id != null).length,
          missingWarehouseExcluded: stores.filter(store => store.siigo_warehouse_id == null).length,
        },
        backtest: { scope: 'demand_only_four_month_rolling_origin', ...validation },
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error calculando forecast'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
