import { isoDateInTimeZone, type CachedShopifyOrder, type MarketingFilters } from './metrics'
import { marketingProductItems, marketingSaleDate, type CachedSiigoInvoice } from './siigo-sales'
import { classifyMarketingInvoice, type ReconciliationContext } from './channel-reconciliation'
import { normalizeMarketingCity } from './distributions'

export function marketingItem(description: string) {
  const match = description.trim().match(/(?:\s*[-–—]?\s*talla\s+|\s*[-–—]\s*|\s+)(\d+(?:[.,]\d+)?)$/i)
  const size = match?.[1] || 'Sin talla'
  const design = (match ? description.slice(0, match.index) : description).replace(/\s+/g, ' ').trim() || 'Sin diseño'
  const n = Number(size.replace(',', '.'))
  const category = n >= 19 && n <= 22 ? 'Bebé / Pequeños Caminantes' : n >= 23 && n <= 29 ? 'Infantil / Exploradores' : 'Otros'
  return { design, size, category }
}

/** One shared, dated and filtered invoice ledger for every sales view. */
export function buildMarketingLedger(invoices: CachedSiigoInvoice[], orders: CachedShopifyOrder[], context: ReconciliationContext, nonRetailCodes: Set<string>, filters: MarketingFilters, dateBasis: 'sale' | 'invoice' = 'sale') {
  const byNumber = new Map(orders.filter(order => order.raw?.order_number).map(order => [Number(order.raw!.order_number), order]))
  const dates = new Map(Array.from(byNumber, ([n, order]) => [n, isoDateInTimeZone(order.created_at)]))
  const options = { products: new Set<string>(), sizes: new Set<string>(), categories: new Set<string>(), cities: new Set<string>() }
  const undated: Array<{ invoiceDate: string; units: number }> = []
  const records: Array<{ invoice: CachedSiigoInvoice; order: CachedShopifyOrder; city: string; channel: 'web' | 'whatsapp' }> = []
  const reconciliation: Array<{ id: string; name: string; date: string; channel: string; reason: string; units: number; sales: number }> = []
  const ids = new Set<string>()
  for (const invoice of invoices) {
    if (ids.has(invoice.id)) continue
    ids.add(invoice.id)
    const total = Number(invoice.total) || 0
    const credited = Number(invoice.credited_amount) || 0
    if (total <= 0 || credited >= total) continue
    const date = dateBasis === 'invoice' ? invoice.date.slice(0, 10) : marketingSaleDate(invoice, dates)
    const classification = classifyMarketingInvoice(invoice, context)
    const channel = classification.channel === 'whatsapp' ? 'whatsapp' : 'web'
    const linked = byNumber.get(Number((invoice.observations || '').match(/#(\d+)/)?.[1]))
    const city = normalizeMarketingCity(linked?.raw?.shipping_address?.city)
    const items = marketingProductItems(invoice, nonRetailCodes)
    if (!items.length) continue
    options.cities.add(city)
    for (const item of items) {
      const parsed = marketingItem(item.description || '')
      options.products.add(parsed.design); options.sizes.add(parsed.size); options.categories.add(parsed.category)
    }
    if (filters.channel && (filters.channel === 'web' ? !['woocommerce', 'shopify'].includes(classification.channel) : filters.channel !== classification.channel)) continue
    if (filters.city && filters.city !== city) continue
    const selected = items.filter(item => {
      const parsed = marketingItem(item.description || '')
      return (!filters.product || filters.product === parsed.design) && (!filters.size || filters.size === parsed.size) && (!filters.category || filters.category === parsed.category)
    })
    if (!selected.length) continue
    if (!date) { undated.push({ invoiceDate: invoice.date.slice(0, 10), units: selected.reduce((sum, item) => sum + Number(item.quantity), 0) }); continue }
    const itemValue = (item: typeof items[number]) => Math.max(0, Number(item.total) || Number(item.quantity) * (Number(item.price) || 0))
    const gross = items.reduce((sum, item) => sum + itemValue(item), 0)
    const invoiceGross = (invoice.items || []).reduce((sum, item) => sum + itemValue(item), 0)
    const selectedGross = selected.reduce((sum, item) => sum + itemValue(item), 0)
    const fraction = invoiceGross > 0 ? selectedGross / invoiceGross : gross > 0 ? selectedGross / gross : selected.reduce((sum, item) => sum + Number(item.quantity), 0) / items.reduce((sum, item) => sum + Number(item.quantity), 0)
    const net = Math.max(0, total - credited) / 1.19 * fraction
    reconciliation.push({ id: invoice.id, name: invoice.name || invoice.id, date: invoice.date.slice(0, 10), channel: classification.channel, reason: classification.reason + (classification.channel === 'pending' ? ` · Medios de pago Siigo: ${(invoice.raw?.payments || []).map(payment => payment.name || `ID ${payment.id}`).join(', ') || 'sin dato'}` : ''), units: selected.reduce((sum, item) => sum + Number(item.quantity), 0), sales: net })
    if (['pending', 'tienda', 'feria'].includes(classification.channel)) continue
    const datedInvoice = { ...invoice, date, total: net * 1.19, credited_amount: 0, items: selected }
    records.push({ invoice: datedInvoice, city, channel, order: {
      id: records.length + 1, created_at: `${date}T12:00:00-05:00`, financial_status: 'paid', total_price: net,
      raw: { current_subtotal_price: String(net), source_name: channel, customer: linked?.raw?.customer || null,
        line_items: selected.map(item => ({ sku: item.code, title: marketingItem(item.description || '').design, variant_title: marketingItem(item.description || '').size, quantity: Number(item.quantity), price: String(itemValue(item) / Number(item.quantity)), tax_lines: [] })),
      },
    } })
  }
  return { records, undated, options, reconciliation }
}

export function hasUndatedSales(undated: Array<{ invoiceDate: string }>, period: { start: string; end: string }): boolean {
  return undated.some(row => row.invoiceDate >= period.start && row.invoiceDate <= period.end)
}
