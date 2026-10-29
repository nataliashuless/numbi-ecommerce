import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const cache = new Map()
function load(name) {
  if (name === '@/lib/siigo-values') return { withoutIva: n => n / 1.19 }
  const path = new URL(`../lib/marketing/${name.replace('./', '')}.ts`, import.meta.url)
  if (cache.has(path.href)) return cache.get(path.href)
  const exports = {}; cache.set(path.href, exports)
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: load, Date, Intl })
  return exports
}
const { buildMarketingLedger, marketingItem } = load('sales-ledger')
const { aggregatePeriod } = load('metrics')
const { presetDates } = load('global-filters')
const ctx = { shopifyOrderNumbers: new Set([100]), tiendaNits: new Set(['store']), feriaWindows: [] }
const orders = [{ id: 100, created_at: '2026-09-01T03:00:00Z', raw: { order_number: 100, shipping_address: { city: 'BOGOTA D.C.' } } }]
const base = { total: 357, credited_amount: 0, date: '2026-10-10', customer_identification: 'direct', assigned_feria_id: null, raw: null, items: [{ code: 'a', description: 'Leo - 20', quantity: 1, total: 119 }, { code: 'b', description: 'Blue - 25', quantity: 1, total: 119 }, { code: '2', description: 'Costo de Envío', quantity: 1, total: 119 }] }
const invoices = [{ ...base, id: 'web', observations: 'Pedido #100' }, { ...base, id: 'wa', observations: 'Compra el 7 de septiembre 2026' }]
test('all summaries use sale date and filter the same invoice items, allocating revenue without shipping', () => {
  const result = buildMarketingLedger(invoices, orders, ctx, new Set(), { category: 'Bebé / Pequeños Caminantes', size: '20', city: 'Bogotá', channel: 'web' })
  assert.equal(result.records.length, 1)
  assert.equal(result.records[0].invoice.date, '2026-08-31')
  const metrics = aggregatePeriod(result.records.map(r => r.order), { start: '2026-08-01', end: '2026-08-31' }, new Map())
  assert.equal(metrics.units, 1); assert.equal(metrics.onlineOrders, 1)
  assert.equal(metrics.netSales, 100); assert.equal(metrics.products[0].reference, 'Leo')
})
test('WhatsApp sale in September invoiced in October stays in September', () => {
  const ledger = buildMarketingLedger(invoices, orders, ctx, new Set(), { channel: 'whatsapp', product: 'Blue' })
  assert.equal(ledger.records.length, 1); assert.equal(ledger.records[0].invoice.date, '2026-09-07')
  assert.equal(ledger.records[0].city, 'Sin ciudad registrada')
  assert.equal(ledger.records[0].order.raw.line_items.length, 1)
})
test('unknown dates remain visible as missing data and are never assigned an invoice date', () => {
  const ledger = buildMarketingLedger([{ ...base, id: 'unknown', observations: '' }], [], ctx, new Set(), {})
  assert.equal(ledger.records.length, 0); assert.equal(ledger.undated[0].units, 2)
})
test('every global filter can exclude a record without changing available choices', () => {
  for (const filters of [{ product: 'Other' }, { size: '29' }, { city: 'Cali' }, { category: 'Other' }]) {
    const result = buildMarketingLedger(invoices, orders, ctx, new Set(), filters)
    assert.equal(result.records.length, 0); assert.equal(result.options.products.size, 2)
  }
})
test('duplicates, store invoices, fairs and full credits do not enter any sales view', () => {
  const ledger = buildMarketingLedger([invoices[0], invoices[0], { ...base, id: 'store', customer_identification: 'store' }, { ...base, id: 'fair', assigned_feria_id: 'fair' }, { ...base, id: 'credit', credited_amount: 357 }], orders, ctx, new Set(), {})
  assert.equal(ledger.records.length, 1)
})
test('period presets handle year boundaries, closed months and Colombian time', () => {
  assert.equal(presetDates('last_month', new Date('2026-01-15T12:00:00Z')).start, '2025-12-01')
  assert.equal(presetDates('last_month', new Date('2026-03-15T12:00:00Z')).end, '2026-02-28')
  assert.equal(presetDates('month', new Date('2026-11-01T02:00:00Z')).start, '2026-10-01')
  assert.equal(marketingItem('Leo - 20').category, 'Bebé / Pequeños Caminantes')
})

const tables = {
  shopify_orders: orders,
  siigo_invoices: [...invoices, { ...base, id: 'unknown', observations: '' }],
  shopify_orders_sync_state: [{ id: 1, earliest_at: '2025-01-01', latest_at: '2026-10-29' }],
  siigo_invoices_sync_state: [{ id: 1, earliest_date: '2025-01-01', last_full_sync_at: '2026-10-29T12:00:00Z' }],
  siigo_stock_sync_state: [{ id: 1 }], siigo_warehouses: [], tiendas_terceros: [], ferias: [], user_integrations: [],
  siigo_product_stock: [{ product_code: 'a', warehouse_id: 27, account_group_id: 339, quantity: 5 }, { product_code: 'b', warehouse_id: 27, account_group_id: 339, quantity: 5 }],
}
function query(table) {
  let rows = [...(tables[table] || [])], single = false
  const q = new Proxy({}, { get(_, key) {
    if (key === 'then') return resolve => resolve({ data: single ? rows[0] || null : rows, error: null })
    return (...args) => {
      if (key === 'eq') rows = rows.filter(r => r[args[0]] === args[1])
      if (key === 'gte') rows = rows.filter(r => r[args[0]] >= args[1])
      if (key === 'lte') rows = rows.filter(r => r[args[0]] <= args[1])
      if (key === 'range') rows = rows.slice(args[0], Math.min(args[1] + 1, args[0] + 1000))
      if (key === 'limit') rows = rows.slice(0, args[0])
      if (key === 'maybeSingle') single = true
      return q
    }
  } })
  return q
}
const db = { from: query }
const route = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../app/api/marketing/executive/route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: route, URL, Date, console, require(name) {
  if (name === 'next/server') return { NextResponse: { json: (value, options) => ({ ...value, status: options?.status || 200 }) } }
  if (name === '@/lib/auth-helpers') return { requireAuth: async () => ({}), getAdminClient: () => db }
  if (name === '@/lib/marketing/historical-orders') return { HISTORICAL_ORDER_MISSING_DATES: [] }
  if (name.startsWith('@/lib/marketing/')) return load(name.split('/').at(-1))
  return load(name)
} })

test('endpoint reconciles summary, design, size, weekday, city, monthly units and trend under global filters', async () => {
  const report = await route.GET({ url: 'https://example.test/api/marketing/executive?view=ytd&start_date=2026-08-01&end_date=2026-08-31&channel=web&category=Beb%C3%A9%20%2F%20Peque%C3%B1os%20Caminantes&size=20&city=Bogot%C3%A1' })
  assert.equal(report.status, 200)
  assert.equal(report.current.units, 1)
  assert.equal(report.current.netSales, 100)
  assert.equal(report.current.sizes.reduce((s, x) => s + x.units, 0), 1)
  assert.equal(report.categoryChannelUnits.reduce((s, x) => s + x.web + x.whatsapp, 0), 1)
  assert.equal(report.salesByWeekday.reduce((s, x) => s + x.units, 0), 1)
  assert.equal(report.salesByCity.reduce((s, x) => s + x.units, 0), 1)
  assert.equal(report.designSales.reduce((s, x) => s + x.sales, 0), 100)
  assert.equal(report.trend.reduce((s, x) => s + x.sales, 0), 100)
  assert.equal(report.availability.meta, false)
})
test('no comparison returns no growth and previous-period mode uses an equal-length preceding range', async () => {
  const params = 'view=ytd&start_date=2026-09-01&end_date=2026-09-30'
  const none = await route.GET({ url: `https://example.test/api/marketing/executive?${params}&comparison=none` })
  assert.equal(none.comparisons.netSales.change, null); assert.equal(none.onlineUnitComparison.previous, null)
  const previous = await route.GET({ url: `https://example.test/api/marketing/executive?${params}&comparison=previous` })
  assert.equal(previous.periods.previous.start, '2026-08-02'); assert.equal(previous.periods.previous.end, '2026-08-31')
})
