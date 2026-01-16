import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get('start_date')
  const endDate = searchParams.get('end_date')
  const groupBy = searchParams.get('group_by') || 'day' // day, week, month

  const cookieStore = await cookies()
  const shop = cookieStore.get('shopify_shop')?.value
  const accessToken = cookieStore.get('shopify_token')?.value

  if (!shop || !accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    // Build URL with properly encoded parameters
    const params = new URLSearchParams()
    params.set('status', 'any')
    params.set('limit', '250')
    // Include archived orders
    params.set('archived_status', 'any')

    // Set date range - if no start date, use a very old date to get all orders
    const effectiveStartDate = startDate || '2020-01-01'
    params.set('created_at_min', `${effectiveStartDate}T00:00:00-05:00`)

    if (endDate) {
      params.set('created_at_max', `${endDate}T23:59:59-05:00`)
    }

    // Fetch all orders with pagination
    let allOrders: Array<{
      id: number
      order_number: number
      name: string
      created_at: string
      total_price: string
      currency: string
      financial_status: string
      fulfillment_status: string | null
      customer: { first_name?: string; last_name?: string; email?: string } | null
      line_items: { quantity: number }[]
    }> = []

    // Use API version 2024-10 for better support
    let nextUrl: string | null = `https://${shop}/admin/api/2024-10/orders.json?${params.toString()}`
    let pageCount = 0

    while (nextUrl && pageCount < 100) { // Safety limit of 100 pages (25000 orders max)
      pageCount++
      const ordersResponse: Response = await fetch(nextUrl, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      })

      if (!ordersResponse.ok) {
        const error = await ordersResponse.json()
        return NextResponse.json({ error: error.errors || 'Failed to fetch orders' }, { status: ordersResponse.status })
      }

      const ordersData = await ordersResponse.json()
      allOrders = allOrders.concat(ordersData.orders || [])

      // Check for next page in Link header
      const linkHeader = ordersResponse.headers.get('Link')
      nextUrl = null
      if (linkHeader) {
        const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/)
        if (nextMatch) {
          nextUrl = nextMatch[1]
        }
      }
    }

    const orders = allOrders

    // Get date range of fetched orders for debugging
    const orderDates = orders.map(o => o.created_at).sort()
    const oldestOrder = orderDates[0] || null
    const newestOrder = orderDates[orderDates.length - 1] || null

    // Calculate stats
    const totalRevenue = orders.reduce((sum: number, order: { total_price: string }) =>
      sum + parseFloat(order.total_price || '0'), 0)
    const totalOrders = orders.length
    const paidOrders = orders.filter((o: { financial_status: string }) =>
      o.financial_status === 'paid').length
    const pendingOrders = orders.filter((o: { financial_status: string }) =>
      o.financial_status === 'pending').length
    const totalUnits = orders.reduce((sum: number, order: { line_items: { quantity: number }[] }) =>
      sum + order.line_items.reduce((s: number, item: { quantity: number }) => s + item.quantity, 0), 0)

    // Helper function to get group key based on groupBy parameter
    const getGroupKey = (dateStr: string): string => {
      const date = new Date(dateStr)
      if (groupBy === 'month') {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      } else if (groupBy === 'week') {
        // Get ISO week number
        const tempDate = new Date(date.getTime())
        tempDate.setHours(0, 0, 0, 0)
        tempDate.setDate(tempDate.getDate() + 3 - (tempDate.getDay() + 6) % 7)
        const week1 = new Date(tempDate.getFullYear(), 0, 4)
        const weekNum = 1 + Math.round(((tempDate.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)
        return `${tempDate.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
      }
      return dateStr.split('T')[0] // day
    }

    // Aggregate data for charts
    const aggregatedData: Record<string, { sales: number; orders: number; units: number }> = {}
    orders.forEach((order: {
      created_at: string
      total_price: string
      line_items: { quantity: number }[]
    }) => {
      const key = getGroupKey(order.created_at)
      if (!aggregatedData[key]) {
        aggregatedData[key] = { sales: 0, orders: 0, units: 0 }
      }
      aggregatedData[key].sales += parseFloat(order.total_price || '0')
      aggregatedData[key].orders += 1
      aggregatedData[key].units += order.line_items.reduce((s: number, item: { quantity: number }) => s + item.quantity, 0)
    })

    // Convert to sorted array for charts
    const chartData = Object.entries(aggregatedData)
      .map(([date, data]) => ({
        date,
        sales: Math.round(data.sales),
        orders: data.orders,
        units: data.units,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))

    return NextResponse.json({
      orders: orders.map((order: {
        id: number
        order_number: number
        name: string
        created_at: string
        total_price: string
        currency: string
        financial_status: string
        fulfillment_status: string | null
        customer: { first_name?: string; last_name?: string; email?: string } | null
        line_items: { quantity: number }[]
      }) => ({
        id: order.id,
        orderNumber: order.order_number,
        name: order.name,
        createdAt: order.created_at,
        totalPrice: parseFloat(order.total_price),
        currency: order.currency,
        financialStatus: order.financial_status,
        fulfillmentStatus: order.fulfillment_status,
        customerName: order.customer
          ? `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim()
          : 'Cliente anónimo',
        customerEmail: order.customer?.email || null,
        itemCount: order.line_items.reduce((sum: number, item: { quantity: number }) => sum + item.quantity, 0),
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
        pagesFetched: pageCount,
        oldestOrder,
        newestOrder,
        requestedStartDate: startDate,
        requestedEndDate: endDate,
      },
      chartData,
      shop,
    })

  } catch (error) {
    console.error('Shopify API error:', error)
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 })
  }
}
