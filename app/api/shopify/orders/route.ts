import { loadSalesSource, reportingInvoices } from '@/lib/sales/source'
import { NextResponse } from 'next/server'
import { requireAuth, getShopifyCredentials } from '@/lib/auth-helpers'

export const maxDuration = 60

export async function GET(request: Request) {
  const { error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get('start_date')
  const endDate = searchParams.get('end_date')
  const groupBy = searchParams.get('group_by') || 'day'

  const credentials = await getShopifyCredentials()
  const shop = credentials?.shopify_shop

  try {
    const source = await loadSalesSource()
    const rawById = new Map(source.orders.map(order => [String(order.id), order]))
    const orders = reportingInvoices(source, startDate, endDate).filter(invoice => invoice.salesChannel === 'shopify').map(invoice => {
      const order = rawById.get(invoice.id.replace('shopify:', ''))!
      const cached = order as typeof order & { order_number?: number; name?: string; currency?: string; customer_name?: string; customer_email?: string; fulfillment_status?: string }
      return { id: order.id, order_number: order.raw?.order_number || cached.order_number, name: cached.name, created_at: order.raw?.processed_at || order.created_at, sale_date: invoice.date, total_price: invoice.total, currency: cached.currency || 'COP', financial_status: order.financial_status, fulfillment_status: cached.fulfillment_status, customer_name: cached.customer_name, customer_email: cached.customer_email, item_count: invoice.items.reduce((sum, item) => sum + item.quantity, 0) }
    })

    const totalRevenue = orders.reduce((sum, o) => sum + Number(o.total_price || 0), 0)
    const totalOrders = orders.length
    const paidOrders = orders.filter(o => o.financial_status === 'paid').length
    const pendingOrders = orders.filter(o => o.financial_status === 'pending').length
    const totalUnits = orders.reduce((s, o) => s + (o.item_count || 0), 0)

    const getGroupKey = (dateStr: string): string => {
      const date = new Date(dateStr)
      if (groupBy === 'month') {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      }
      if (groupBy === 'week') {
        const d = new Date(date.getTime())
        d.setHours(0, 0, 0, 0)
        d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7)
        const week1 = new Date(d.getFullYear(), 0, 4)
        const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)
        return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
      }
      return dateStr.split('T')[0]
    }

    const aggregated: Record<string, { sales: number; orders: number; units: number }> = {}
    for (const o of orders) {
      const k = getGroupKey(o.sale_date)
      if (!aggregated[k]) aggregated[k] = { sales: 0, orders: 0, units: 0 }
      aggregated[k].sales += Number(o.total_price || 0)
      aggregated[k].orders += 1
      aggregated[k].units += o.item_count || 0
    }
    const chartData = Object.entries(aggregated)
      .map(([date, d]) => ({
        date,
        sales: Math.round(d.sales),
        orders: d.orders,
        units: d.units,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))

    const dates = orders.map(o => o.created_at).sort()
    return NextResponse.json({
      orders: orders.map(o => ({
        id: o.id,
        orderNumber: o.order_number,
        name: o.name,
        createdAt: o.created_at,
        totalPrice: Number(o.total_price),
        currency: o.currency,
        financialStatus: o.financial_status,
        fulfillmentStatus: o.fulfillment_status,
        customerName: o.customer_name,
        customerEmail: o.customer_email,
        itemCount: o.item_count,
      })),
      stats: {
        totalRevenue,
        totalOrders,
        paidOrders,
        pendingOrders,
        totalUnits,
        averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
      },
      debug: {
        oldestOrder: dates[0] || null,
        newestOrder: dates[dates.length - 1] || null,
        requestedStartDate: startDate,
        requestedEndDate: endDate,
        source: 'Histórico conciliado compartido · producto antes de IVA',
      },
      chartData,
      shop: shop || null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error obteniendo órdenes'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
