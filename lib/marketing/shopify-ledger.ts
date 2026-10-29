import { isValidSalesOrder, isoDateInTimeZone, netSalesOf, type CachedShopifyOrder } from './metrics'
import type { CachedSiigoInvoice } from './siigo-sales'

/** Product quantities and dates come directly from Shopify, even before Siigo invoicing. */
export function directShopifyInvoices(orders: CachedShopifyOrder[]): CachedSiigoInvoice[] {
  const seen = new Set<number>()
  return orders.flatMap(order => {
    if (seen.has(order.id)) return []
    seen.add(order.id)
    if (!isValidSalesOrder(order) || order.raw?.source_name === 'pos') return []
    const raw = order.raw || {}
    const items = (raw.line_items || []).filter(item => Number(item.current_quantity ?? item.quantity) > 0).map((item, index) => {
      const quantity = Math.max(0, Number(item.current_quantity ?? item.quantity) || 0)
      const title = (item.title || 'Sin diseño').trim()
      const size = (item.variant_title || '').match(/\b(1[9]|2\d)\b/)?.[1] || item.variant_title || 'Sin talla'
      const description = `${title} - ${size}`
      return { code: item.sku || `SHOPIFY-${order.id}-${index}`, description, quantity, price: Number(item.price) || 0, total: quantity * (Number(item.price) || 0) }
    })
    if (!items.length) return []
    const date = isoDateInTimeZone(raw.processed_at || order.created_at)
    const number = raw.order_number
    return [{ id: `shopify:${order.id}`, name: `Shopify #${number || order.id}`, date, total: netSalesOf(order) * 1.19, credited_amount: 0, customer_identification: null, assigned_feria_id: null, observations: number ? `Pedido #${number}` : null, items, raw: null, marketingSource: { channel: 'shopify' as const, city: raw.shipping_address?.city || '', reason: `Pedido directo Shopify ${number || order.id}; fecha procesada y cantidades actuales de Shopify`, allowZeroValue: true } }]
  })
}
