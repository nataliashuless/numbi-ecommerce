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

export const maxDuration = 60

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const PRINCIPAL_WAREHOUSE_ID = 27
const PRODUCT_ACCOUNT_GROUP_ID = 339
const OWN_WAREHOUSE_NAME_PATTERN = /ekho|eko\b/i

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
  const view: MarketingView = searchParams.get('view') === 'monthly' ? 'monthly' : 'weekly'
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

    const [orderStateResult, stockStateResult, warehouseResult] = await Promise.all([
      supabase.from('shopify_orders_sync_state').select('earliest_at, latest_at').eq('id', 1).maybeSingle(),
      supabase.from('siigo_stock_sync_state').select('last_full_sync_at').eq('id', 1).maybeSingle(),
      supabase.from('siigo_warehouses').select('id, name').range(0, 999),
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

    const previous = aggregatePeriod(orders, periods.previous, stockBySku, filters)
    const current = addProductComparisons(
      aggregatePeriod(orders, periods.current, stockBySku, filters),
      previous,
    )
    const yearAgo = periods.yearAgo
      ? aggregatePeriod(orders, periods.yearAgo, stockBySku, filters)
      : null

    const trendEndMonth = `${periods.current.end.slice(0, 7)}-01`
    const trend = Array.from({ length: 12 }, (_, index) => addMonths(trendEndMonth, index - 11)).map(month => {
      const nextMonth = addMonths(month, 1)
      const metrics = aggregatePeriod(orders, {
        start: month,
        end: new Date(`${nextMonth}T12:00:00Z`).getUTCDate() === 1
          ? new Date(new Date(`${nextMonth}T12:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10)
          : nextMonth,
        label: month.slice(0, 7),
        complete: nextMonth <= `${periods.current.end.slice(0, 7)}-01`,
      }, stockBySku, filters)
      return {
        month: month.slice(0, 7),
        sales: metrics.netSales,
        orders: metrics.orders,
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
      source: 'Shopify + Siigo inventory',
      currency: 'COP',
      timeZone: 'America/Bogota',
      view,
      periods,
      dataCoverage: {
        shopifyFrom: orderStateResult.data?.earliest_at || orders[0]?.created_at || null,
        shopifyTo: orderStateResult.data?.latest_at || orders.at(-1)?.created_at || null,
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
      comparisons: {
        netSales: comparison(current.netSales, previous.netSales),
        orders: comparison(current.orders, previous.orders),
        units: comparison(current.units, previous.units),
        aov: comparison(current.aov, previous.aov),
        newCustomers: comparison(current.customers.new, previous.customers.new),
        repeatPurchaseRate: comparison(current.customers.repeatPurchaseRate, previous.customers.repeatPurchaseRate),
        discounts: comparison(current.discounts, previous.discounts),
        refunds: comparison(current.refunds, previous.refunds),
      },
      availability: {
        shopify: orders.length > 0,
        inventory: stockRows.length > 0,
        meta: Boolean(!metaProbe.error && metaProbe.data?.meta_access_token && metaProbe.data?.meta_ad_account_id),
        ga4: Boolean(!ga4Probe.error && ga4Probe.data?.ga4_property_id && ga4Probe.data?.ga4_service_account_json),
        cogs: false,
        historicalInventory: false,
        exactNewCustomerAttribution: false,
      },
      limitations: [
        'El historial Shopify disponible comienza en junio de 2025; cohortes y LTV anteriores a esa fecha no son concluyentes.',
        'El inventario proviene de Siigo y representa una foto actual, no un historial de inventario.',
        'No existen COGS ni costos variables completos; margen bruto y margen de contribución no se calculan.',
        'CAC de cliente nuevo atribuible requiere una unión confiable entre adquisición Meta y primer pedido Shopify.',
      ],
      formulas: [
        { metric: 'Ventas netas Shopify', formula: 'Suma de current_subtotal_price en pedidos pagados; excluye pruebas y cancelados.', source: 'Shopify' },
        { metric: 'AOV', formula: 'Ventas netas Shopify / pedidos con venta neta positiva.', source: 'Shopify' },
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
