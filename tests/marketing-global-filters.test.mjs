import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { createHash } from 'node:crypto'
const cache = new Map()
function load(name) {
  if (name === 'node:crypto') return { createHash }
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
const ctx = { shopifyOrderNumbers: new Set([100]), tiendaNits: new Set(['store']), feriaWindows: [], whatsappInvoiceIds: new Set(['wa', 'unknown']) }
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
  shopify_orders: orders.map(order => ({ ...order, created_at: '2026-10-10T12:00:00-05:00', financial_status: 'paid', total_price: 238, raw: { ...order.raw, current_subtotal_price: '238', line_items: base.items.slice(0, 2).map(item => ({ sku: item.code, title: marketingItem(item.description).design, variant_title: marketingItem(item.description).size, quantity: 1, price: '119', tax_lines: [{ price: '19' }] })) } })),
  ventas_whatsapp: [{ siigo_invoice_id: 'wa' }, { siigo_invoice_id: 'unknown' }],
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
const auditInputsFixture = { targets: [], fairInvoiceNames: [], invoiceLinks: [] }
const excelHistoryFixture = { from: '2025-01-01', to: '2025-12-31', rows: [] }
const route = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../app/api/marketing/executive/route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: route, URL, Date, console, require(name) {
  if (name === '@/data/marketing-2025-audit-inputs.json') return { default: auditInputsFixture }
  if (name === '@/data/marketing-online-excel-2025.json') return { default: excelHistoryFixture }
  if (name === 'next/server') return { NextResponse: { json: (value, options) => ({ ...value, status: options?.status || 200 }) } }
  if (name === '@/lib/auth-helpers') return { requireAuth: async () => ({}), getAdminClient: () => db }
  if (name === '@/lib/marketing/historical-orders') return { HISTORICAL_ORDER_MISSING_DATES: [] }
  if (name.startsWith('@/lib/marketing/')) return load(name.split('/').at(-1))
  return load(name)
} })

test('endpoint reconciles summary, design, size, weekday, city, monthly units and trend under global filters', async () => {
  const report = await route.GET({ url: 'https://example.test/api/marketing/executive?view=ytd&start_date=2026-10-01&end_date=2026-10-28&channel=web&category=Beb%C3%A9%20%2F%20Peque%C3%B1os%20Caminantes&size=20&city=Bogot%C3%A1' })
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

test('invoice reconciliation includes unknown sale dates without assigning them a fake sale date', () => {
  const records = [{ ...base, id: 'unknown', observations: '' }]
  assert.equal(buildMarketingLedger(records, [], ctx, new Set(), {}).records.length, 0)
  const invoiceLedger = buildMarketingLedger(records, [], ctx, new Set(), {}, 'invoice')
  assert.equal(invoiceLedger.records.length, 1)
  assert.equal(invoiceLedger.records[0].invoice.date, '2026-10-10')
  assert.equal(invoiceLedger.records[0].order.raw.line_items.reduce((s, x) => s + x.quantity, 0), 2)
})
test('Siigo historical basis includes invoices with no sale date in notes and does not drop the denominator', async () => {
  const report = await route.GET({ url: 'https://example.test/api/marketing/executive?view=ytd&start_date=2026-01-01&end_date=2026-10-28' })
  assert.equal(report.saleDateCoverage.undatedUnits, 0)
  assert.equal(report.current.units, 6)
  assert.equal(report.invoiceUnitReconciliation.current, 6)
  assert.equal(report.current.netSales, 600)
})

test('unclassified invoices are reconciled, not discarded or labelled WhatsApp, and suppress aggregate growth', async () => {
  tables.siigo_invoices.push({ ...base, id: 'ambiguous', observations: 'Pago transferencia' })
  try {
    const report = await route.GET({ url: 'https://example.test/api/marketing/executive?view=ytd&start_date=2026-01-01&end_date=2026-10-28' })
    assert.equal(report.channelReconciliation.current.find(row => row.id === 'ambiguous').channel, 'pending')
    assert.equal(report.channelReconciliation.current.reduce((sum, row) => sum + row.units, 0), 8)
    assert.equal(report.current.units, 6)
    assert.equal(report.comparisons.units.change, null)
    assert.equal(report.comparisons.netSales.change, null)
    const confirm = report.channelReconciliation.current.filter(row => ['shopify', 'woocommerce', 'whatsapp'].includes(row.channel)).reduce((sum, row) => sum + row.units, 0)
    assert.equal(confirm, report.current.units)
  } finally { tables.siigo_invoices.pop() }
})

const { applyExcelHistory } = load('excel-history')
test('Excel replaces only covered non-Shopify invoices, deduplicates Shopify cross-links, and retains 2026', () => {
  const old = { ...base, id: 'old', name: 'FV-2-1', date: '2025-01-15', observations: 'WhatsApp' }
  const shopify = { ...base, id: 'shop', name: 'FV-2-2', date: '2025-07-15', observations: 'Pedido #100' }
  const row = { row: 2, date: '2025-01-02', units: 2, design: 'Leo', size: '20', city: 'Cali', amount: 238, payment: 'Nequi', status: 'Enviado', invoice: 'FV-2-1', webOrder: '', flags: [] }
  const history = { from: '2025-01-01', to: '2025-12-31', rows: [row, { ...row, row: 3, invoice: 'FV-2-2' }, { ...row, row: 4, invoice: null, payment: 'MercadoPago- Shopify' }, { ...row, row: 5, invoice: null, flags: ['gift'] }] }
  const result = applyExcelHistory([old, shopify, invoices[1]], ctx, history)
  assert.equal(result.invoices.length, 3)
  assert.equal(result.invoices.some(x => x.id === 'old'), false)
  assert.equal(result.excluded.length, 3)
  const ledger = buildMarketingLedger(result.invoices, orders, ctx, new Set(), { channel: 'whatsapp', city: 'Cali' }, 'invoice')
  assert.equal(ledger.records.length, 1)
  assert.equal(ledger.records[0].invoice.date, '2025-01-02')
  assert.equal(ledger.records[0].order.raw.line_items[0].quantity, 2)
  assert.equal(aggregatePeriod(ledger.records.map(r => r.order), { start: '2025-01-01', end: '2025-01-31' }, new Map()).netSales, 200)
})
test('Excel missing price retains sold units, marks missing value, and exclusions never become sales', () => {
  const row = { row: 2, date: '2025-01-02', units: 1, design: 'Leo', size: '20', city: 'Cali', amount: null, payment: 'Nequi', status: '', invoice: null, webOrder: '', flags: [] }
  const { invoices: source } = applyExcelHistory([], ctx, { from: '2025-01-01', to: '2025-12-31', rows: [row, ...['gift', 'unpaid', 'cancelled', 'fair', 'store'].map((flag, i) => ({ ...row, row: i + 3, flags: [flag] }))] })
  const ledger = buildMarketingLedger(source, [], ctx, new Set(), {}, 'invoice')
  assert.equal(ledger.records.length, 1)
  assert.equal(ledger.records[0].invoice.marketingSource.missingValue, true)
  assert.equal(aggregatePeriod(ledger.records.map(r => r.order), { start: '2025-01-01', end: '2025-01-31' }, new Map()).units, 1)
})

const { directShopifyInvoices } = load('shopify-ledger')
test('direct Shopify uses processed sale date, current quantities, and includes paid orders without an invoice', () => {
  const order = { id: 123, created_at: '2026-10-02T12:00:00Z', financial_status: 'partially_refunded', total_price: 238, raw: { order_number: 100, processed_at: '2026-09-30T23:00:00-05:00', current_subtotal_price: '119', shipping_address: { city: 'Cali' }, line_items: [{ title: 'Leo', variant_title: '20', quantity: 2, current_quantity: 1, price: '119', tax_lines: [{ price: '38' }] }] } }
  const source = directShopifyInvoices([order, order, { ...order, id: 124, raw: { ...order.raw, cancelled_at: '2026-10-03' } }, { ...order, id: 125, raw: { ...order.raw, test: true } }, { ...order, id: 126, financial_status: 'pending' }, { ...order, id: 127, raw: { ...order.raw, source_name: 'pos' } }])
  assert.equal(source.length, 1)
  const ledger = buildMarketingLedger(source, [order], ctx, new Set(), {}, 'invoice')
  assert.equal(ledger.records[0].invoice.date, '2026-09-30')
  assert.equal(ledger.records[0].city, 'Cali')
  const result = aggregatePeriod(ledger.records.map(r => r.order), { start: '2026-09-01', end: '2026-09-30' }, new Map())
  assert.equal(result.units, 1); assert.equal(result.netSales, 100)
})

test('disputed 2025 online baseline suppresses growth without changing source unit counts', async () => {
  const report = await route.GET({ url: 'https://example.test/api/marketing/executive?view=ytd&start_date=2026-01-01&end_date=2026-10-28' })
  assert.equal(report.current.units, 6)
  assert.equal(report.unitComparisonReview.reportedUnits, 1414)
  assert.equal(report.unitComparisonReview.status, 'pending')
  assert.equal(report.onlineUnitComparison.change, null)
  assert.equal(report.comparisons.units.change, null)
  assert.equal(report.comparability.units, false)
  const sameYear = await route.GET({ url: 'https://example.test/api/marketing/executive?view=monthly&start_date=2026-09-01&end_date=2026-09-30&comparison=previous' })
  assert.equal(sameYear.unitComparisonReview, undefined)
  assert.equal(sameYear.comparability.units, true)
})

const { reconcileHistory } = load('history-reconciliation')
const buyerHash = value => createHash('sha256').update(value).digest('hex')
const auditRow = { row: 2, date: '2025-01-02', units: 1, design: 'Leo', size: '20', city: 'Cali', amount: 119, payment: 'Nequi', status: 'Enviado', invoice: 'FV-2-10', webOrder: '', flags: [] }
const auditTarget = { row: 2, invoiceCandidates: ['FV-2-10'], buyerHash: buyerHash('buyer'), nameHash: buyerHash('privatebuyer'), emailHash: null, shipping: 0, explicitRefund: false, explicitFair: false }
test('internal history reconciliation finds explicit replacement while keeping private buyer evidence off the report', () => {
  const source = [{ ...base, id: 'void', name: 'FV-2-10', date: '2025-01-05', total: 119, credited_amount: 119, customer_identification: 'buyer' }, { ...base, id: 'new', name: 'FV-2-11', date: '2025-01-06', total: 119, customer_identification: 'buyer', observations: 'Reemplaza factura 10' }]
  const result = reconcileHistory({ from: '2025-01-01', to: '2025-12-31', rows: [auditRow] }, { targets: [auditTarget], fairInvoiceNames: [] }, source, [], new Set())
  assert.equal(result.decisions[0].decision, 'online'); assert.equal(result.decisions[0].replacement, 'FV-2-11')
  assert.equal(JSON.stringify(result).includes(auditTarget.buyerHash), false)
  assert.equal(JSON.stringify(result).includes('privatebuyer'), false)
})
test('paid Shopify evidence supersedes stale unpaid flags; cancelled orders and explicit refunds are excluded', () => {
  const order = { id: 9, created_at: '2025-01-02T12:00:00Z', financial_status: 'paid', total_price: 119, raw: { order_number: 9, customer: { first_name: 'Private', last_name: 'Buyer' }, line_items: [{ title: 'Leo', variant_title: '20', quantity: 1 }] } }
  const history = { from: '2025-01-01', to: '2025-12-31', rows: [{ ...auditRow, flags: ['unpaid'] }] }
  const inputs = { targets: [auditTarget], fairInvoiceNames: [] }
  assert.equal(reconcileHistory(history, inputs, [], [order], new Set()).decisions[0].decision, 'shopify')
  assert.equal(reconcileHistory(history, inputs, [], [{ ...order, raw: { ...order.raw, cancelled_at: '2025-01-03' } }], new Set()).decisions[0].decision, 'excluded')
  assert.equal(reconcileHistory(history, { ...inputs, targets: [{ ...auditTarget, explicitRefund: true }] }, [], [order], new Set()).decisions[0].decision, 'excluded')
})

test('historical sale invoiced next year is counted once in the Excel sale year, never again as current WhatsApp', () => {
  const late = { ...base, id: 'late', name: 'FV-2-late', date: '2026-01-20', observations: 'WhatsApp', total: 119, items: [base.items[0]] }
  const history = { from: '2025-01-01', to: '2025-12-31', rows: [{ ...auditRow, date: '2025-12-29', invoice: 'FV-2-late' }] }
  const result = applyExcelHistory([late], ctx, history, [{ row: 2, invoice: 'FV-2-late', decision: 'online', reason: 'Venta de diciembre documentada' }])
  const ledger = buildMarketingLedger(result.invoices, [], ctx, new Set(), {}, 'invoice')
  const metrics = year => aggregatePeriod(ledger.records.map(r => r.order), { start: `${year}-01-01`, end: `${year}-12-31` }, new Map())
  assert.equal(metrics(2025).units, 1); assert.equal(metrics(2026).units, 0)
})
test('unresolved rows remain explicit pending units and owner-confirmed physical stores override spreadsheet inference', () => {
  const history = { from: '2025-01-01', to: '2025-12-31', rows: [auditRow] }
  const source = applyExcelHistory([], ctx, history, [{ row: 2, decision: 'pending', reason: 'Nota crédito por aclarar' }])
  const ledger = buildMarketingLedger(source.invoices, [], ctx, new Set(), {}, 'invoice')
  assert.equal(ledger.records.length, 0); assert.equal(ledger.reconciliation[0].channel, 'pending'); assert.equal(ledger.reconciliation[0].units, 1)
  const physical = { ...base, id: 'physical', name: 'FV-2-10', date: '2025-01-03', customer_identification: 'store' }
  assert.equal(applyExcelHistory([physical], ctx, history).invoices.length, 0)
})

test('two credited duplicates reissued into one invoice retain only the documented product quantity', () => {
  const rows = [auditRow, { ...auditRow, row: 3, invoice: 'FV-2-12' }]
  const source = [{ ...base, id: 'old10', name: 'FV-2-10', total: 119, credited_amount: 119, customer_identification: 'buyer' }, { ...base, id: 'old12', name: 'FV-2-12', total: 119, credited_amount: 119, customer_identification: 'buyer' }, { ...base, id: 'new11', name: 'FV-2-11', date: '2025-01-06', total: 119, customer_identification: 'buyer', observations: 'Reemplaza factura 10 y factura 12', items: [base.items[0]] }]
  const result = reconcileHistory({ from: '2025-01-01', to: '2025-12-31', rows }, { targets: [auditTarget, { ...auditTarget, row: 3, invoiceCandidates: ['FV-2-12'] }], fairInvoiceNames: [] }, source, [], new Set())
  assert.equal(result.decisions.filter(row => row.decision === 'online').length, 1)
  assert.equal(result.decisions.filter(row => row.decision === 'excluded').length, 1)
})

test('a paid Shopify order explicitly reconciled as a physical fair is excluded from online', () => {
  const order = { id: 1326, created_at: '2025-09-15T12:00:00Z', financial_status: 'paid', total_price: 119, raw: { order_number: 1326, current_subtotal_price: '119', line_items: [{ title: 'Leo', variant_title: '20', quantity: 1, price: '119' }] } }
  assert.equal(directShopifyInvoices([order]).length, 1)
  assert.equal(directShopifyInvoices([order], new Set([1326])).length, 0)
})

test('owner instruction to leave a credited sale pending is preserved rather than inferred from another invoice', () => {
  const result = reconcileHistory({ from: '2025-01-01', to: '2025-12-31', rows: [auditRow] }, { targets: [{ ...auditTarget, ownerDecision: 'pending', ownerReviewedOn: '2026-10-29' }], fairInvoiceNames: [] }, [{ ...base, id: 'old', name: 'FV-2-10', credited_amount: 357 }, { ...base, id: 'new', name: 'FV-2-11', customer_identification: 'buyer', observations: 'Reemplaza factura 10' }], [], new Set())
  assert.equal(result.decisions[0].decision, 'pending')
  assert.match(result.decisions[0].reason, /indicación de la dueña/)
})

test('confirmed-only growth excludes the authorized pending unit while retaining its status and blocking other unknown sales', async () => {
  auditInputsFixture.targets.push({ ...auditTarget, row: 466, invoiceCandidates: ['FV-2-1812'], ownerDecision: 'pending', ownerReviewedOn: '2026-10-29' })
  auditInputsFixture.fairInvoiceNames.push('FV-2-44')
  excelHistoryFixture.rows.push({ ...auditRow, row: 466, date: '2025-05-16', invoice: 'FV-2-1812' }, { ...auditRow, row: 744, date: '2025-10-10', invoice: 'FV-2-44', payment: 'Mercadopago' })
  tables.siigo_invoices.push({ ...base, id: 'old1812', name: 'FV-2-1812', date: '2025-05-20', total: 119, credited_amount: 119, items: [base.items[0]] }, { ...base, id: 'fair44', name: 'FV-2-44', date: '2025-10-10', total: 119, observations: 'Mercadopago', assigned_feria_id: 'fair', items: [base.items[0]] })
  const url = 'https://example.test/api/marketing/executive?view=ytd&start_date=2026-01-01&end_date=2026-10-28'
  try {
    const report = await route.GET({ url })
    assert.equal(report.status, 200)
    assert.equal(report.current.units, 6); assert.equal(report.previous.units, 1)
    assert.equal(report.onlineUnitComparison.change, 5)
    assert.equal(report.confirmedSalesComparison.excludedCurrentUnits, 0)
    assert.equal(report.confirmedSalesComparison.excludedPreviousUnits, 1)
    assert.equal(report.historyAudit.decisions[0].decision, 'pending')
    assert.equal(report.channelReconciliation.previous.find(row => row.name === 'FV-2-1812').channel, 'pending')
    assert.equal(report.unitComparisonReview, undefined)
    tables.siigo_invoices.push({ ...base, id: 'new-unknown', name: 'FV-2-other', observations: 'Sin canal confirmado' })
    const unknown = await route.GET({ url })
    assert.equal(unknown.onlineUnitComparison.change, null)
    assert.equal(unknown.confirmedSalesComparison, undefined)
    tables.siigo_invoices.pop()
  } finally {
    tables.siigo_invoices.splice(-2)
    auditInputsFixture.targets.length = 0; auditInputsFixture.fairInvoiceNames.length = 0; excelHistoryFixture.rows.length = 0
  }
})
