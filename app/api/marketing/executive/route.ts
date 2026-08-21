import { NextResponse } from 'next/server'
import { getAdminClient, requireAuth } from '@/lib/auth-helpers'
import {
  addMonths,
  addProductComparisons,
  aggregatePeriod,
  buildPeriods,
  comparison,
  type CachedShopifyOrder,
  type MarketingExecutiveReport,
  type MarketingFilters,
  type MarketingView,
  type StockBySku,
} from '@/lib/marketing/metrics'
import {
  type CachedSiigoInvoice,
  hasCompleteOnlineSalesCoverage,
  hasCompleteShopifyCoverage,
  onlineMarketingChannel,
  replaceSalesWithSiigoOnline,
} from '@/lib/marketing/siigo-sales'
import {
  HISTORICAL_ORDER_MISSING_DATES,
  HISTORICAL_ORDERS_FROM,
  HISTORICAL_ORDERS_SOURCE,
  HISTORICAL_ORDERS_TO,
  hasCompleteOnlineOrderCoverage,
  replaceOnlineOrders,
} from '@/lib/marketing/historical-orders'

export const maxDuration = 60

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const PRINCIPAL_WAREHOUSE_ID = 27
const PRODUCT_ACCOUNT_GROUP_ID = 339
const OWN_WAREHOUSE_NAME_PATTERN = /ekho|eko\b/i
const PRODUCT_DESIGNS: Array<[RegExp, string]> = [
  [/\bblanco\b/i, 'Blanco'],
  [/\brosa\b/i, 'Rosa'],
  [/niña|nina/i, 'Niña'],
  [/niño|nino/i, 'Niño'],
  [/\bchocolate\b/i, 'Chocolate'],
  [/\belefante\b/i, 'Elefante'],
  [/\bglobo\b/i, 'Globo'],
  [/\bjirafa\b/i, 'Jirafa'],
  [/\bespacio\b/i, 'Espacio'],
  [/\bleo\b/i, 'Leo'],
]

function productName(description: string): string {
  const design = PRODUCT_DESIGNS.find(([pattern]) => pattern.test(description))
  if (design) return design[1]
  return description
    .replace(/\s*[-–—]?\s*talla\s+\d+(?:[.,]\d+)?$/i, '')
    .replace(/\s*[-–—]\s*\d+(?:[.,]\d+)?$/, '')
    .trim() || 'Sin referencia'
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
    channel: cleanFilter(searchParams.get('channel')),
    product: cleanFilter(searchParams.get('product')),
    size: cleanFilter(searchParams.get('size')),
    customerType: (cleanFilter(searchParams.get('customer_type')) as MarketingFilters['customerType']) || 'all',
  }
  const periods = buildPeriods(view, start, end)
  const supabase = getAdminClient()

  try {
    const orders = await loadPaged<CachedShopifyOrder>((from, to) => supabase
      .from('shopify_orders')
      .select('id, created_at, financial_status, total_price, raw')
      .order('created_at', { ascending: true })
      .range(from, to))

    const [siigoInvoices, orderStateResult, invoiceStateResult, stockStateResult, warehouseResult, tiendaResult, feriaResult] = await Promise.all([
      loadPaged<CachedSiigoInvoice>((from, to) => supabase
        .from('siigo_invoices')
        .select('id, date, total, credited_amount, customer_identification, assigned_feria_id, observations, items, raw')
        .gte('date', periods.previous.start)
        .lte('date', periods.current.end)
        .order('date', { ascending: true })
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
    }>((from, to) => supabase
      .from('siigo_product_stock')
      .select('product_code, warehouse_id, quantity')
      .eq('account_group_id', PRODUCT_ACCOUNT_GROUP_ID)
      .range(from, to))

    const stockBySku = new Map<string, StockBySku>()
    for (const row of stockRows) {
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

    const previousShopify = aggregatePeriod(orders, periods.previous, stockBySku, filters)
    const previousShopifyAll = aggregatePeriod(orders, periods.previous, stockBySku)
    const previous = replaceOnlineOrders(
      replaceSalesWithSiigoOnline(previousShopify, siigoInvoices, periods.previous, onlineSalesContext),
      previousShopifyAll,
      periods.previous,
    )
    const currentShopifyAll = aggregatePeriod(orders, periods.current, stockBySku)
    const current = replaceOnlineOrders(
      replaceSalesWithSiigoOnline(
        addProductComparisons(
          aggregatePeriod(orders, periods.current, stockBySku, filters),
          previousShopify,
        ),
        siigoInvoices,
        periods.current,
        onlineSalesContext,
      ),
      currentShopifyAll,
      periods.current,
    )
    const yearAgo = periods.yearAgo
      ? replaceOnlineOrders(
        replaceSalesWithSiigoOnline(
          aggregatePeriod(orders, periods.yearAgo, stockBySku, filters),
          siigoInvoices,
          periods.yearAgo,
          onlineSalesContext,
        ),
        aggregatePeriod(orders, periods.yearAgo, stockBySku),
        periods.yearAgo,
      )
      : null

    const salesComparable = hasCompleteOnlineSalesCoverage(periods.current, siigoFrom, siigoSyncedThrough, shopifyFrom, shopifyTo)
      && hasCompleteOnlineSalesCoverage(periods.previous, siigoFrom, siigoSyncedThrough, shopifyFrom, shopifyTo)
    const shopifyComparable = hasCompleteShopifyCoverage(periods.current, shopifyFrom, shopifyTo)
      && hasCompleteShopifyCoverage(periods.previous, shopifyFrom, shopifyTo)
    const ordersComparable = hasCompleteOnlineOrderCoverage(periods.current, shopifyFrom, shopifyTo)
      && hasCompleteOnlineOrderCoverage(periods.previous, shopifyFrom, shopifyTo)
    const historicalOrderMissingDates = HISTORICAL_ORDER_MISSING_DATES.filter(date =>
      (date >= periods.current.start && date <= periods.current.end)
      || (date >= periods.previous.start && date <= periods.previous.end),
    )
    const productChannelBuckets = new Map<string, { month: string; product: string; web: number; whatsapp: number }>()
    for (const invoice of siigoInvoices) {
      const date = invoice.date.slice(0, 10)
      if (date < periods.current.start || date > periods.current.end) continue
      const total = Number(invoice.total) || 0
      if (total <= 0 || (Number(invoice.credited_amount) || 0) >= total) continue
      const channel = onlineMarketingChannel(invoice, onlineSalesContext)
      if (!channel) continue
      for (const item of invoice.items || []) {
        if (!item.code || item.code === 'ENVIO') continue
        const quantity = Math.max(0, Number(item.quantity) || 0)
        if (quantity <= 0) continue
        const product = productName(item.description || '')
        const month = date.slice(0, 7)
        const key = `${month}\u0000${product}`
        const bucket = productChannelBuckets.get(key) || { month, product, web: 0, whatsapp: 0 }
        bucket[channel] += quantity
        productChannelBuckets.set(key, bucket)
      }
    }

    const trendEndMonth = `${periods.current.end.slice(0, 7)}-01`
    const trend = Array.from({ length: 12 }, (_, index) => addMonths(trendEndMonth, index - 11)).map(month => {
      const nextMonth = addMonths(month, 1)
      const trendPeriod = {
        start: month,
        end: new Date(`${nextMonth}T12:00:00Z`).getUTCDate() === 1
          ? new Date(new Date(`${nextMonth}T12:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10)
          : nextMonth,
        label: month.slice(0, 7),
        complete: nextMonth <= `${periods.current.end.slice(0, 7)}-01`,
      }
      const metrics = replaceOnlineOrders(
        replaceSalesWithSiigoOnline(
          aggregatePeriod(orders, trendPeriod, stockBySku, filters),
          siigoInvoices,
          trendPeriod,
          onlineSalesContext,
        ),
        aggregatePeriod(orders, trendPeriod, stockBySku),
        trendPeriod,
      )
      return {
        month: month.slice(0, 7),
        sales: metrics.netSales,
        orders: metrics.onlineOrders,
        units: metrics.units,
        aov: metrics.aov,
        newCustomers: metrics.customers.new,
      }
    })

    const allChannels = new Set<string>()
    const allProducts = new Set<string>()
    const allSizes = new Set<string>()
    for (const order of orders) {
      const raw = order.raw || {}
      allChannels.add((raw.source_name || 'web').trim() || 'web')
      for (const item of raw.line_items || []) {
        allProducts.add((item.title || 'Sin referencia').trim())
        allSizes.add((item.variant_title || 'Sin talla').trim())
      }
    }

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
      source: 'Ventas online Siigo + detalle ecommerce Shopify + inventario Siigo',
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
        channels: Array.from(allChannels).sort(),
        products: Array.from(allProducts).sort(),
        sizes: Array.from(allSizes).sort((a, b) => a.localeCompare(b, 'es', { numeric: true })),
      },
      current,
      previous,
      yearAgo,
      trend,
      productChannelUnits: Array.from(productChannelBuckets.values()).sort((a, b) =>
        a.month.localeCompare(b.month) || a.product.localeCompare(b.product, 'es'),
      ),
      comparisons: {
        netSales: comparison(current.netSales, salesComparable ? previous.netSales : null),
        orders: comparison(current.onlineOrders, ordersComparable ? previous.onlineOrders : null),
        units: comparison(current.units, shopifyComparable ? previous.units : null),
        aov: comparison(current.aov, shopifyComparable ? previous.aov : null),
        newCustomers: comparison(current.customers.new, shopifyComparable ? previous.customers.new : null),
        repeatPurchaseRate: comparison(current.customers.repeatPurchaseRate, shopifyComparable ? previous.customers.repeatPurchaseRate : null),
        discounts: comparison(current.discounts, shopifyComparable ? previous.discounts : null),
        refunds: comparison(current.refunds, shopifyComparable ? previous.refunds : null),
      },
      comparability: {
        netSales: salesComparable,
        orders: ordersComparable,
        aov: shopifyComparable,
        units: shopifyComparable,
        customers: shopifyComparable,
      },
      availability: {
        shopify: orders.length > 0,
        siigoSales: siigoInvoices.length > 0,
        inventory: stockRows.length > 0,
        meta: Boolean(!metaProbe.error && metaProbe.data?.meta_access_token && metaProbe.data?.meta_ad_account_id),
        ga4: Boolean(!ga4Probe.error && ga4Probe.data?.ga4_property_id && ga4Probe.data?.ga4_service_account_json),
        cogs: false,
        historicalInventory: false,
        exactNewCustomerAttribution: false,
      },
      limitations: [
        'Las ventas online provienen de Siigo e incluyen WooCommerce histórico, Shopify y WhatsApp. Se excluyen tiendas y ferias.',
        'Antes de julio de 2025, Mercado Pago identifica WooCommerce; las demás facturas directas válidas se clasifican como WhatsApp. Desde julio de 2025, el número de pedido identifica Shopify y las demás facturas directas válidas se clasifican como WhatsApp.',
        'Las notas crédito se descuentan de la factura relacionada y las ventas se muestran antes de IVA.',
        `Los pedidos anteriores a julio de 2025 provienen de ${HISTORICAL_ORDERS_SOURCE}; desde julio de 2025 provienen de Shopify.`,
        `El archivo histórico tiene ${HISTORICAL_ORDER_MISSING_DATES.length} fechas sin dato (${HISTORICAL_ORDER_MISSING_DATES.join(', ')}); esos días no se interpretan como cero y los periodos que los incluyen no se consideran comparables.`,
        'AOV, unidades, clientes, productos, tallas y conversión provienen de Shopify y no deben interpretarse como el detalle completo de las ventas Siigo.',
        'La gráfica de unidades por producto y canal usa las líneas de factura Siigo. Las notas crédito parciales no descuentan unidades porque no existe un cruce confiable por línea.',
        'Los filtros ecommerce no modifican el total de ventas online identificado en Siigo.',
        'El inventario proviene de Siigo y representa una foto actual, no un historial de inventario.',
        'No existen COGS ni costos variables completos; margen bruto y margen de contribución no se calculan.',
        'CAC de cliente nuevo atribuible requiere una unión confiable entre adquisición Meta y primer pedido Shopify.',
      ],
      formulas: [
        { metric: 'Ventas online netas antes de IVA', formula: '(Total factura Siigo - notas crédito aplicadas) / 1,19. Online = WooCommerce histórico (Mercado Pago) + Shopify (número de pedido) + WhatsApp (facturas directas no clasificadas como tienda o feria).', source: 'Siigo + identificación Shopify' },
        { metric: 'Pedidos online', formula: 'Suma diaria del archivo histórico antes de julio de 2025 + pedidos Shopify desde julio de 2025. Las fechas vacías se mantienen como dato faltante.', source: `${HISTORICAL_ORDERS_SOURCE} + Shopify` },
        { metric: 'Unidades online por producto y canal', formula: 'Suma de cantidades facturadas por mes. Shuless.co = factura con pedido web identificado; WhatsApp = factura online directa. Se excluyen tiendas, ferias, envíos y facturas totalmente anuladas.', source: 'Siigo + identificación Shopify' },
        { metric: 'AOV ecommerce', formula: 'Ventas Shopify antes de IVA / pedidos Shopify con venta neta positiva.', source: 'Shopify' },
        { metric: 'Variación', formula: '(Periodo actual - periodo anterior) / valor absoluto del periodo anterior.', source: 'Cálculo interno' },
        { metric: 'Cliente nuevo', formula: 'Cliente cuyo created_at de Shopify cae dentro del periodo analizado.', source: 'Shopify' },
        { metric: 'Concentración Top N', formula: 'Ventas netas de las N referencias principales / ventas netas totales.', source: 'Shopify' },
        { metric: 'Stock disponible', formula: 'Suma de unidades por SKU en bodega principal y bodegas propias EKHO/EKO.', source: 'Siigo' },
      ],
    }

    return NextResponse.json(report)
  } catch (caught) {
    return NextResponse.json({
      error: caught instanceof Error ? caught.message : 'No fue posible construir el reporte de Marketing',
    }, { status: 500 })
  }
}
