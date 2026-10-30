import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { loadSalesSource, reportingInvoices } from '@/lib/sales/source'
export const maxDuration = 60
export async function GET(request: Request) {
  const { error } = await requireAuth()
  if (error) return error
  const params = new URL(request.url).searchParams
  const start = params.get('start_date'), end = params.get('end_date')
  if (!start || !end || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) return NextResponse.json({ error: 'Fechas inválidas' }, { status: 400 })
  try {
    const source = await loadSalesSource()
    const amountsComplete = !reportingInvoices(source, start, end).some(invoice => invoice.marketingSource?.missingValue)
    const empty = () => ({ ventas: 0, ordenes: 0, unidades: 0 })
    const channels = { shopify: empty(), woocommerce: empty(), whatsapp: empty(), tiendas: empty(), ferias: empty() }
    const daily = new Map<string, Record<string, number>>()
    for (const invoice of reportingInvoices(source, start, end)) {
      const channel = invoice.salesChannel === 'tienda' ? 'tiendas' : invoice.salesChannel === 'feria' ? 'ferias' : invoice.salesChannel
      if (!(channel in channels)) continue
      const bucket = channels[channel as keyof typeof channels]
      const units = invoice.items.reduce((sum, item) => sum + item.quantity, 0)
      bucket.ventas += invoice.total; bucket.ordenes++; bucket.unidades += units
      const day = daily.get(invoice.date) || {}
      // Existing Ventas groups WooCommerce + Shopify as the web channel.
      const display = channel === 'woocommerce' ? 'shopify' : channel
      for (const [metric, value] of Object.entries({ ventas: invoice.total, ordenes: 1, unidades: units })) day[`${display}_${metric}`] = (day[`${display}_${metric}`] || 0) + value
      daily.set(invoice.date, day)
    }
    const web = { ventas: channels.shopify.ventas + channels.woocommerce.ventas, ordenes: channels.shopify.ordenes + channels.woocommerce.ordenes, unidades: channels.shopify.unidades + channels.woocommerce.unidades }
    const total = Object.values(channels).reduce((sum, row) => ({ ventas: sum.ventas + row.ventas, ordenes: sum.ordenes + row.ordenes, unidades: sum.unidades + row.unidades }), empty())
    const chartData = Array.from(daily, ([date, values]) => ({ date, ...Object.fromEntries(['shopify', 'whatsapp', 'tiendas', 'ferias'].flatMap(channel => ['ventas', 'ordenes', 'unidades'].map(metric => [`${channel}_${metric}`, values[`${channel}_${metric}`] || 0]))) })).sort((a,b) => a.date.localeCompare(b.date))
    return NextResponse.json({ amountsComplete, shopify: web, whatsapp: channels.whatsapp, tiendas: channels.tiendas, ferias: channels.ferias, total, chartData, source: 'Histórico conciliado compartido · ventas de producto antes de IVA', channels })
  } catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : 'Error de ventas' }, { status: 500 }) }
}
