import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET() {
  const cookieStore = await cookies()
  const shop = cookieStore.get('shopify_shop')?.value
  const accessToken = cookieStore.get('shopify_token')?.value

  if (!shop || !accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    // Fetch orders from Shopify
    const ordersResponse = await fetch(
      `https://${shop}/admin/api/2024-01/orders.json?status=any&limit=50`,
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!ordersResponse.ok) {
      const error = await ordersResponse.json()
      return NextResponse.json({ error: error.errors || 'Failed to fetch orders' }, { status: ordersResponse.status })
    }

    const ordersData = await ordersResponse.json()
    const orders = ordersData.orders || []

    // Calculate stats
    const totalRevenue = orders.reduce((sum: number, order: { total_price: string }) =>
      sum + parseFloat(order.total_price || '0'), 0)
    const totalOrders = orders.length
    const paidOrders = orders.filter((o: { financial_status: string }) =>
      o.financial_status === 'paid').length
    const pendingOrders = orders.filter((o: { financial_status: string }) =>
      o.financial_status === 'pending').length

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
        averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
      },
      shop,
    })

  } catch (error) {
    console.error('Shopify API error:', error)
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 })
  }
}
