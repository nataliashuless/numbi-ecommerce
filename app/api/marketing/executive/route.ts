import { canonicalInvoices } from '@/lib/marketing/canonical-source'
import { NextResponse } from 'next/server'
import excelHistory from '@/data/marketing-online-excel-2025.json'
import historyAuditInputs from '@/data/marketing-2025-audit-inputs.json'
import { getAdminClient, requireAuth } from '@/lib/auth-helpers'
import { withoutIva } from '@/lib/siigo-values'
import { historicalStoreEvidence } from '@/lib/marketing/channel-reconciliation'
import { marketingBusinessChannelRules } from '@/lib/marketing/business-channel-rules'
import { buildMarketingLedger, marketingItem } from '@/lib/marketing/sales-ledger'
import { MARKETING_WEEKDAYS, marketingWeekday } from '@/lib/marketing/distributions'
import {
  addMonths,
  addProductComparisons,
  aggregatePeriod,
  buildPeriods,
  comparison,
  isoDateInTimeZone,
  type CachedShopifyOrder,
  type MarketingExecutiveReport,
  type MarketingFilters,
  type MarketingView,
  type StockBySku,
} from '@/lib/marketing/metrics'
import {
  type CachedSiigoInvoice,
  hasCompleteSiigoCoverage,
  marketingProductItems,
} from '@/lib/marketing/siigo-sales'
import {
  HISTORICAL_ORDER_MISSING_DATES,
  HISTORICAL_ORDERS_FROM,
  HISTORICAL_ORDERS_TO,
} from '@/lib/marketing/historical-orders'

export const maxDuration = 60

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const PRINCIPAL_WAREHOUSE_ID = 27
const PRODUCT_ACCOUNT_GROUP_ID = 339
const OWN_WAREHOUSE_NAME_PATTERN = /ekho|eko\b/i
function designKey(design: string): string {
  return design.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

async function loadPaged<T>(
  queryPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = []
  const pageSize = 1000
  for (let from = 0; from < 100000; from += pageSize) {
    const { data, error } = await queryPage(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < pageSize) break
  }
  return rows
}

function cleanFilter(value: string | null): string | undefined {
  const cleaned = value?.trim()
  return cleaned ? cleaned : undefined
}

export async function GET(request: Request) {
  const { error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(request.url)
  const requestedView = searchParams.get('view')
  const view: MarketingView = requestedView === 'monthly' || requestedView === 'ytd' ? requestedView : 'weekly'
  const start = cleanFilter(searchParams.get('start_date'))
  const end = cleanFilter(searchParams.get('end_date'))
  if ((start && !DATE_PATTERN.test(start)) || (end && !DATE_PATTERN.test(end)) || Boolean(start) !== Boolean(end)) {
    return NextResponse.json({ error: 'start_date y end_date deben enviarse juntos en formato YYYY-MM-DD' }, { status: 400 })
  }
  if (start && end && start > end) {
    return NextResponse.json({ error: 'start_date no puede ser posterior a end_date' }, { status: 400 })
  }

  const filters: MarketingFilters = {
    city: cleanFilter(searchParams.get('city')),
    category: cleanFilter(searchParams.get('category')),
    channel: cleanFilter(searchParams.get('channel')),
    product: cleanFilter(searchParams.get('product')),
    size: cleanFilter(searchParams.get('size')),
    customerType: (cleanFilter(searchParams.get('customer_type')) as MarketingFilters['customerType']) || 'all',
  }
  const periods = buildPeriods(view, start, end)
  const comparisonMode = searchParams.get('comparison') || 'year'
  if (!['year', 'previous', 'none'].includes(comparisonMode)) return NextResponse.json({ error: 'Comparación inválida' }, { status: 400 })
  if (comparisonMode === 'previous') {
    const days = Math.round((new Date(`${periods.current.end}T12:00:00Z`).getTime() - new Date(`${periods.current.start}T12:00:00Z`).getTime()) / 86400000) + 1
    const end = new Date(new Date(`${periods.current.start}T12:00:00Z`).getTime() - 86400000)
    const start = new Date(end.getTime() - (days - 1) * 86400000)
    periods.previous = { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), label: 'Período anterior', complete: true }
  }
  const supabase = getAdminClient()

  try {
    const orders = await loadPaged<CachedShopifyOrder>((from, to) => supabase
      .from('shopify_orders')
      .select('id, created_at, financial_status, total_price, raw')
      .order('created_at', { ascending: true }).order('id', { ascending: true })
      .range(from, to))

    const [siigoInvoices, orderStateResult, invoiceStateResult, stockStateResult, warehouseResult, tiendaResult, feriaResult] = await Promise.all([
      loadPaged<CachedSiigoInvoice>((from, to) => supabase
        .from('siigo_invoices')
        .select('id, name, date, total, credited_amount, customer_identification, assigned_feria_id, observations, items, raw')
        // Include later invoices: their evidenced sale can belong to the selected period.
        .lte('date', isoDateInTimeZone(new Date()))
        .order('date', { ascending: true }).order('id', { ascending: true })
        .range(from, to)),
      supabase.from('shopify_orders_sync_state').select('earliest_at, latest_at').eq('id', 1).maybeSingle(),
      supabase.from('siigo_invoices_sync_state').select('earliest_date, last_full_sync_at').eq('id', 1).maybeSingle(),
      supabase.from('siigo_stock_sync_state').select('last_full_sync_at').eq('id', 1).maybeSingle(),
      supabase.from('siigo_warehouses').select('id, name').range(0, 999),
      supabase.from('tiendas_terceros').select('siigo_customer_identification').not('siigo_customer_identification', 'is', null).range(0, 999),
      supabase.from('ferias').select('fecha_inicio, fecha_fin').eq('activa', true).range(0, 999),
    ])

    const ownWarehouseIds = new Set<number>([PRINCIPAL_WAREHOUSE_ID])
    for (const warehouse of warehouseResult.data || []) {
      if (warehouse.name && OWN_WAREHOUSE_NAME_PATTERN.test(warehouse.name)) ownWarehouseIds.add(warehouse.id)
    }

    const stockRows = await loadPaged<{
      product_code: string | null
      warehouse_id: number
      quantity: number
      account_group_id: number | null
    }>((from, to) => supabase
      .from('siigo_product_stock')
      .select('product_code, warehouse_id, quantity, account_group_id')
      .range(from, to))

    const stockBySku = new Map<string, StockBySku>()
    const retailProductCodes = new Set(stockRows.filter(row => row.account_group_id === PRODUCT_ACCOUNT_GROUP_ID).map(row => (row.product_code || '').trim()))
    const nonRetailProductCodes = new Set(stockRows.filter(row => row.account_group_id !== null && row.account_group_id !== PRODUCT_ACCOUNT_GROUP_ID).map(row => (row.product_code || '').trim()).filter(code => code && !retailProductCodes.has(code)))
    for (const row of stockRows) {
      if (row.account_group_id !== PRODUCT_ACCOUNT_GROUP_ID) continue
      const sku = (row.product_code || '').trim()
      if (!sku) continue
      const stock = stockBySku.get(sku) || { sku, own: 0, total: 0 }
      const quantity = Number(row.quantity) || 0
      stock.total += quantity
      if (ownWarehouseIds.has(row.warehouse_id)) stock.own += quantity
      stockBySku.set(sku, stock)
    }

    const shopifyFrom = (orderStateResult.data?.earliest_at || orders[0]?.created_at || null)?.slice(0, 10) || null
    const shopifyTo = (orderStateResult.data?.latest_at || orders.at(-1)?.created_at || null)?.slice(0, 10) || null
    const siigoFrom = invoiceStateResult.data?.earliest_date || siigoInvoices[0]?.date?.slice(0, 10) || null
    const siigoLastSync = invoiceStateResult.data?.last_full_sync_at || null
    const siigoSyncedThrough = siigoLastSync?.slice(0, 10) || null
    const shopifyOrderNumbers = new Set(
      orders.map(order => Number(order.raw?.order_number)).filter(orderNumber => Number.isFinite(orderNumber) && orderNumber > 0),
    )
    const onlineSalesContext = {
      shopifyOrderNumbers,
      tiendaNits: new Set((tiendaResult.data || []).map(tienda => tienda.siigo_customer_identification).filter(Boolean)),
      feriaWindows: (feriaResult.data || []).map(feria => ({
        start: feria.fecha_inicio,
        end: feria.fecha_fin,
      })),
    }

    const whatsappLinks = await loadPaged<{ siigo_invoice_id: string | null }>((from, to) => supabase.from('ventas_whatsapp').select('siigo_invoice_id').not('siigo_invoice_id', 'is', null).range(from, to))
    const reconciliationContext = { ...onlineSalesContext, ...marketingBusinessChannelRules, historicalStoreEvidence: historicalStoreEvidence(siigoInvoices), firstShopifyOrderDate: shopifyFrom, whatsappInvoiceIds: new Set(whatsappLinks.map(row => row.siigo_invoice_id).filter((id): id is string => Boolean(id))) }
    const { unifiedInvoices, historyAudit } = canonicalInvoices(siigoInvoices, orders, reconciliationContext)
    const ledger = buildMarketingLedger(unifiedInvoices, orders, reconciliationContext, nonRetailProductCodes, filters, 'invoice')
    const salesOrders = ledger.records.map(record => record.order)
    const previous = aggregatePeriod(comparisonMode === 'none' ? [] : salesOrders, periods.previous, stockBySku)
    let current = addProductComparisons(aggregatePeriod(salesOrders, periods.current, stockBySku), previous)
    const yearAgo = null
    const inPeriod = (date: string, period: typeof periods.current) => date >= period.start && date <= period.end
    const pendingCurrent = ledger.reconciliation.filter(row => row.channel === 'pending' && inPeriod(row.date, periods.current))
    const pendingPrevious = ledger.reconciliation.filter(row => row.channel === 'pending' && inPeriod(row.date, periods.previous))
    const authorizedPendingNames = marketingBusinessChannelRules.growthExcludedPendingInvoiceNames
    const isAuthorizedPending = (row: typeof pendingCurrent[number]) => authorizedPendingNames.has(row.name) && row.units === 1
    const classificationComplete = [...pendingCurrent, ...pendingPrevious].every(isAuthorizedPending)
    const periodCovered = (period: typeof periods.current) => hasCompleteSiigoCoverage(period, siigoFrom, siigoSyncedThrough) && Boolean(shopifyFrom && shopifyTo && period.end <= shopifyTo && (period.start >= shopifyFrom || period.start >= excelHistory.from && period.end <= excelHistory.to))
    const unresolvedHistoryRows = historyAudit.decisions.filter(decision => decision.decision === 'pending')
    const authorizedPendingRows = new Set(historyAuditInputs.targets.filter(target => target.ownerDecision === 'pending' && target.invoiceCandidates.some(name => authorizedPendingNames.has(name))).map(target => target.row))
    const historyReadyForConfirmedComparison = historyAuditInputs.targets.length > 0 && historyAudit.decisions.length === historyAuditInputs.targets.length && historyAuditInputs.fairInvoiceNames.length > 0 && historyAudit.fair.every(row => row.online) && unresolvedHistoryRows.every(row => authorizedPendingRows.has(row.row))
    const review = { ...marketingBusinessChannelRules.historicalUnitsReview, status: historyReadyForConfirmedComparison ? 'confirmed_only' : 'pending', message: unresolvedHistoryRows.length ? `Conciliación de 2025: ${unresolvedHistoryRows.length === 1 ? 'falta 1 fila' : `faltan ${unresolvedHistoryRows.length} filas`} por confirmar. No calculamos crecimiento hasta aclarar esas ventas. Revisa la tabla de conciliación detallada.` : marketingBusinessChannelRules.historicalUnitsReview.message }
    const intersectsReviewYear = (period: typeof periods.current) => period.start <= `${review.year}-12-31` && period.end >= `${review.year}-01-01`
    const pendingUnitsReview = review.status === 'pending' && comparisonMode !== 'none' && filters.channel !== 'shopify' && (intersectsReviewYear(periods.current) || intersectsReviewYear(periods.previous))
    const salesComparable = !pendingUnitsReview && classificationComplete && comparisonMode !== 'none' && periodCovered(periods.current) && periodCovered(periods.previous)
    if (!salesComparable) {
      current = { ...current, products: current.products.map(product => ({ ...product, variation: null, sizes: product.sizes.map(size => ({ ...size, variation: null })) })), sizes: current.sizes.map(size => ({ ...size, variation: null })) }
    }
    const missingExcelValues = ledger.records.filter(record => record.invoice.marketingSource?.missingValue && (inPeriod(record.invoice.date, periods.current) || inPeriod(record.invoice.date, periods.previous)))
    const financialComparable = salesComparable && missingExcelValues.length === 0
    if (!financialComparable) current = { ...current, products: current.products.map(product => ({ ...product, variation: null, sizes: product.sizes.map(size => ({ ...size, variation: null })) })), sizes: current.sizes.map(size => ({ ...size, variation: null })) }
    const shopifyComparable = salesComparable
    const ordersComparable = salesComparable
    const historicalOrderMissingDates = HISTORICAL_ORDER_MISSING_DATES.filter(date =>
      (date >= periods.current.start && date <= periods.current.end)
      || (date >= periods.previous.start && date <= periods.previous.end),
    )
    const categoryChannelBuckets = new Map<string, { month: string; category: string; web: number; whatsapp: number }>()
    const weekdayUnits = new Map(MARKETING_WEEKDAYS.map(name => [name, 0]))
    const cityUnits = new Map<string, number>()
    const missingDates = ledger.undated.filter(row => row.invoiceDate >= periods.current.start && row.invoiceDate <= periods.current.end)
    const previousMissingDates = ledger.undated.filter(row => row.invoiceDate >= periods.previous.start && row.invoiceDate <= periods.previous.end)
    const saleDateCoverage = { undatedInvoices: missingDates.length, undatedUnits: missingDates.reduce((sum, row) => sum + row.units, 0), previousUndatedUnits: previousMissingDates.reduce((sum, row) => sum + row.units, 0) }
    const designSalesBuckets = new Map<string, { year: string; design: string; category: string; sales: number }>()
    for (const record of ledger.records) {
      const { invoice, channel, city } = record
      const date = invoice.date.slice(0, 10)
      const saleDate = date
      const belongsToCurrentPeriod = saleDate !== null && saleDate >= periods.current.start && saleDate <= periods.current.end
      const belongsToDesignHistory = belongsToCurrentPeriod
      const total = Number(invoice.total) || 0
      const productItems = marketingProductItems(invoice, nonRetailProductCodes)
      if (!belongsToCurrentPeriod && !belongsToDesignHistory) continue
      if (belongsToCurrentPeriod && productItems.length > 0) {
        const units = productItems.reduce((sum, item) => sum + Number(item.quantity), 0)
        const weekday = marketingWeekday(saleDate!)
        weekdayUnits.set(weekday, (weekdayUnits.get(weekday) || 0) + units)
        cityUnits.set(city, (cityUnits.get(city) || 0) + units)
      }
      const invoiceItemTotal = productItems.reduce((sum, item) => {
        const quantity = Math.max(0, Number(item.quantity) || 0)
        return sum + Math.max(0, Number(item.total) || quantity * (Number(item.price) || 0))
      }, 0)
      const invoiceNetSales = withoutIva(Math.max(0, total - (Number(invoice.credited_amount) || 0)))
      for (const item of productItems) {
        const quantity = Math.max(0, Number(item.quantity) || 0)
        const category = marketingItem(item.description || '').category
        if (belongsToCurrentPeriod) {
          const month = saleDate!.slice(0, 7)
          const key = `${month}\u0000${category}`
          const bucket = categoryChannelBuckets.get(key) || { month, category, web: 0, whatsapp: 0 }
          bucket[channel] += quantity
          categoryChannelBuckets.set(key, bucket)
        }

        if (belongsToDesignHistory) {
          const itemTotal = Math.max(0, Number(item.total) || quantity * (Number(item.price) || 0))
          const allocatedSales = invoiceItemTotal > 0 ? invoiceNetSales * (itemTotal / invoiceItemTotal) : 0
          const year = date.slice(0, 4)
          const design = marketingItem(item.description || '').design
          const designBucketKey = `${year}\u0000${category}\u0000${designKey(design)}`
          const designBucket = designSalesBuckets.get(designBucketKey) || { year, design, category, sales: 0 }
          designBucket.sales += allocatedSales
          designSalesBuckets.set(designBucketKey, designBucket)
        }
      }
    }

    const trendEndMonth = `${periods.current.end.slice(0, 7)}-01`
    const firstTrendMonth = `${periods.current.start.slice(0, 7)}-01`
    const monthCount = (Number(trendEndMonth.slice(0, 4)) - Number(firstTrendMonth.slice(0, 4))) * 12 + Number(trendEndMonth.slice(5, 7)) - Number(firstTrendMonth.slice(5, 7)) + 1
    const trend = Array.from({ length: monthCount }, (_, index) => addMonths(firstTrendMonth, index)).map(month => {
      const nextMonth = addMonths(month, 1)
      const trendPeriod = {
        start: month < periods.current.start ? periods.current.start : month,
        end: nextMonth > periods.current.end ? periods.current.end : new Date(`${nextMonth}T12:00:00Z`).getUTCDate() === 1
          ? new Date(new Date(`${nextMonth}T12:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10)
          : nextMonth,
        label: month.slice(0, 7),
        complete: nextMonth <= `${periods.current.end.slice(0, 7)}-01`,
      }
      const metrics = aggregatePeriod(salesOrders, trendPeriod, stockBySku)
      return {
        month: month.slice(0, 7),
        sales: metrics.netSales,
        orders: metrics.onlineOrders,
        units: metrics.units,
        aov: metrics.aov,
        newCustomers: metrics.customers.new,
      }
    }).filter(point => point.month >= periods.current.start.slice(0, 7) && point.month <= periods.current.end.slice(0, 7))

    const allChannels = new Set(['woocommerce', 'shopify', 'whatsapp'])
    const allProducts = ledger.options.products
    const allSizes = ledger.options.sizes
    const scoped = Boolean(filters.channel || filters.product || filters.size || filters.category || filters.city)
    const metaProbe = await supabase
      .from('user_integrations')
      .select('meta_access_token, meta_ad_account_id')
      .limit(1)
      .maybeSingle()
    const ga4Probe = await supabase
      .from('user_integrations')
      .select('ga4_property_id, ga4_service_account_json')
      .limit(1)
      .maybeSingle()

    const report: MarketingExecutiveReport = {
      source: 'Shopify directo + Excel no Shopify 2025 + WhatsApp Siigo 2026',
      historyAudit,
      unitComparisonReview: pendingUnitsReview ? review : undefined,
      confirmedSalesComparison: salesComparable ? { excludedCurrentUnits: pendingCurrent.filter(isAuthorizedPending).reduce((sum, row) => sum + row.units, 0), excludedPreviousUnits: pendingPrevious.filter(isAuthorizedPending).reduce((sum, row) => sum + row.units, 0), note: 'FV-2-1812 (1 unidad de 2025) sigue pendiente. No está incluida en los totales confirmados ni en el cálculo del crecimiento.' } : undefined,
      excelHistory: { from: excelHistory.from, to: excelHistory.to, missingValueUnits: missingExcelValues.reduce((sum, record) => sum + record.order.raw!.line_items!.reduce((n, item) => n + Number(item.quantity || 0), 0), 0) },
      currency: 'COP',
      timeZone: 'America/Bogota',
      view,
      periods,
      dataCoverage: {
        shopifyFrom,
        shopifyTo,
        historicalOrdersFrom: HISTORICAL_ORDERS_FROM,
        historicalOrdersTo: HISTORICAL_ORDERS_TO,
        historicalOrderMissingDates,
        siigoFrom,
        siigoSyncedThrough,
        siigoLastSync,
        stockAsOf: stockStateResult.data?.last_full_sync_at || null,
      },
      filters: {
        applied: filters,
        comparisonMode,
        categories: Array.from(ledger.options.categories).sort(),
        cities: Array.from(ledger.options.cities).sort(),
        channels: Array.from(allChannels).sort(),
        products: Array.from(allProducts).sort(),
        sizes: Array.from(allSizes).sort((a, b) => a.localeCompare(b, 'es', { numeric: true })),
      },
      current,
      previous,
      yearAgo,
      trend,
      categoryChannelUnits: Array.from(categoryChannelBuckets.values()).sort((a, b) =>
        a.month.localeCompare(b.month) || a.category.localeCompare(b.category, 'es'),
      ),
      salesByWeekday: Array.from(weekdayUnits, ([name, units]) => ({ name, units })).sort((a, b) => b.units - a.units),
      salesByCity: Array.from(cityUnits, ([name, units]) => ({ name, units })).sort((a, b) => b.units - a.units || a.name.localeCompare(b.name, 'es')),
      onlineUnitComparison: comparison(current.units, salesComparable ? previous.units : null),
      invoiceUnitReconciliation: comparison(current.units, salesComparable ? previous.units : null),
      channelReconciliation: {
        current: ledger.reconciliation.filter(row => inPeriod(row.date, periods.current)),
        previous: comparisonMode === 'none' ? [] : ledger.reconciliation.filter(row => inPeriod(row.date, periods.previous)),
      },
      saleDateCoverage,
      designSales: Array.from(designSalesBuckets.values()).sort((a, b) =>
        b.year.localeCompare(a.year) || b.sales - a.sales,
      ),
      comparisons: {
        netSales: comparison(current.netSales, financialComparable ? previous.netSales : null),
        orders: comparison(current.onlineOrders, ordersComparable ? previous.onlineOrders : null),
        units: comparison(current.units, shopifyComparable ? previous.units : null),
        aov: comparison(current.aov, financialComparable ? previous.aov : null),
        newCustomers: comparison(current.customers.new, shopifyComparable ? previous.customers.new : null),
        repeatPurchaseRate: comparison(current.customers.repeatPurchaseRate, shopifyComparable ? previous.customers.repeatPurchaseRate : null),
        discounts: comparison(current.discounts, shopifyComparable ? previous.discounts : null),
        refunds: comparison(current.refunds, shopifyComparable ? previous.refunds : null),
      },
      comparability: {
        netSales: financialComparable,
        orders: ordersComparable,
        aov: financialComparable,
        units: shopifyComparable,
        customers: shopifyComparable,
      },
      availability: {
        shopify: orders.length > 0,
        siigoSales: siigoInvoices.length > 0,
        inventory: stockRows.length > 0,
        meta: Boolean(!scoped && !metaProbe.error && metaProbe.data?.meta_access_token && metaProbe.data?.meta_ad_account_id),
        ga4: Boolean(!scoped && !ga4Probe.error && ga4Probe.data?.ga4_property_id && ga4Probe.data?.ga4_service_account_json),
        cogs: false,
        historicalInventory: false,
        exactNewCustomerAttribution: false,
      },
      limitations: [
        'Todas las gráficas usan el mismo registro: Shopify directo por fecha procesada, Excel no Shopify 2025 por fecha de venta y WhatsApp 2026 de Siigo por fecha de factura. Se excluyen tiendas, ferias, envíos y materias primas.',
        'El Excel reemplaza las ventas no Shopify de Siigo durante 2025. Se excluyen filas identificadas como Shopify y cruces por factura o número de pedido. Las facturas Shopify no se vuelven a sumar.',
        'La ciudad procede del Excel o de la dirección de envío Shopify; WhatsApp Siigo sin ciudad se conserva sin ciudad registrada.',
        'Meta y GA4 solo están disponibles sin filtros de canal, categoría, diseño, talla o ciudad: no se puede atribuir su gasto o tráfico a esos filtros. Usan el período global.',
        'Shopify incluye pedidos pagados válidos aunque todavía no tengan factura; excluye cancelados, pruebas y POS. Las cantidades actuales reflejan devoluciones de Shopify. Las notas crédito parciales de Siigo no reducen unidades sin cruce por línea.',
        'Los clientes nuevos y recurrentes solo pueden identificarse en las ventas vinculadas a Shopify; los demás quedan sin identificar. El inventario es actual.',
      ],
      formulas: [
        { metric: 'Ventas', formula: 'Ventas netas antes de IVA de Shopify, Excel y WhatsApp Siigo; no se compara dinero si faltan importes del Excel.', source: 'Shopify + Excel + Siigo' },
        { metric: 'Unidades', formula: 'Cantidades actuales de Shopify + cantidades del Excel no Shopify 2025 + producto facturado WhatsApp Siigo 2026.', source: 'Shopify + Excel + Siigo' },
        { metric: 'Ventas registradas', formula: 'Pedidos Shopify, facturas WhatsApp y grupos del Excel por fecha/factura; filas sin factura se cuentan como registros, no como pedidos únicos.', source: 'Shopify + Excel + Siigo' },
        { metric: 'Variación', formula: '(Actual − anterior) ÷ anterior, para los períodos seleccionados.', source: 'Selección global' },
      ],
    }

    return NextResponse.json(report)
  } catch (caught) {
    return NextResponse.json({
      error: caught instanceof Error ? caught.message : 'No fue posible construir el reporte de Marketing',
    }, { status: 500 })
  }
}
