import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const exports = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../lib/marketing/siigo-sales.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports, require(name) {
  if (name === '@/lib/siigo-values') return { withoutIva: value => value / 1.19 }
  throw new Error(name)
} })
const { onlineMarketingChannel, marketingProductItems } = exports
const context = { shopifyOrderNumbers: new Set([2987]), tiendaNits: new Set(['store']), feriaWindows: [{ start: '2026-05-07', end: '2026-05-10' }] }
const invoice = overrides => ({ date: '2026-05-27', assigned_feria_id: null, customer_identification: 'direct', observations: '', raw: null, ...overrides })

test('Shopify matches remain web during fair dates; direct sales remain WhatsApp', () => {
  assert.equal(onlineMarketingChannel(invoice({ date: '2026-05-08', observations: 'Pedido #2987' }), context), 'web')
  assert.equal(onlineMarketingChannel(invoice({ observations: 'Pago vía Nequi' }), context), 'whatsapp')
})
test('automatic Moship invoices stay web when Shopify cache lacks the order', () => {
  assert.equal(onlineMarketingChannel(invoice({ observations: 'Registro automático Moship API para el pedido #2420 **moship_id-1447-11494455**' }), context), 'web')
  assert.equal(onlineMarketingChannel(invoice({ observations: 'Referencia #2420' }), context), 'whatsapp')
})
test('explicit fair sales are excluded even when invoiced after the event', () => {
  for (const observations of ['Compra feria EVA Mayo 9', 'Cruce FERIA EVA', 'Venta en PLAYTIME New York']) {
    assert.equal(onlineMarketingChannel(invoice({ observations }), context), null)
  }
})
test('store NITs and manually assigned fairs take precedence over Shopify matches', () => {
  assert.equal(onlineMarketingChannel(invoice({ observations: 'Pedido #2987', customer_identification: 'store' }), context), null)
  assert.equal(onlineMarketingChannel(invoice({ observations: 'Pedido #2987', assigned_feria_id: 'fair' }), context), null)
})
test('historical WooCommerce Mercado Pago and fair date exclusions still work', () => {
  assert.equal(onlineMarketingChannel(invoice({ date: '2025-06-01', raw: { payments: [{ id: 8362 }] } }), context), 'web')
  assert.equal(onlineMarketingChannel(invoice({ date: '2026-05-08' }), context), null)
})
test('units exclude raw materials, shipping, missing codes and nonpositive quantities', () => {
  const items = [{ code: 'MP001', quantity: 92.3 }, { code: 'ENVIO', quantity: 1 }, { quantity: 1 }, { code: 'shoe', quantity: 0 }, { code: 'shoe', quantity: -1 }, { code: 'shoe', quantity: 2 }, { code: 'historical-shoe', quantity: 1 }]
  const actual = marketingProductItems(invoice({ items }), new Set(['MP001']))
  assert.equal(actual.length, 2)
  assert.equal(actual.reduce((sum, item) => sum + item.quantity, 0), 3)
})

test('sale date uses the matched Shopify purchase date instead of invoice date', () => {
  assert.equal(exports.marketingSaleDate(invoice({ observations: 'Pedido #2987', date: '2026-10-02' }), new Map([[2987, '2026-09-30']])), '2026-09-30')
})
test('late invoices are assigned to the documented sale month in both Spanish date orders', () => {
  for (const observations of ['Compra FADA 22 Shuless Agosto 28 Via Nequi', 'Compra el 27 de agosto via BOLD', 'Pago 04/08/2026', 'Agosto 4 2026\n4 Pares Shuless']) {
    assert.match(exports.marketingSaleDate(invoice({ date: '2026-09-16', observations }), new Map()), /^2026-08-/)
  }
})
test('missing, invalid, future and conflicting dates never fall back to invoice date', () => {
  for (const observations of ['', 'White 29 descuento 10%', '31 de febrero 2026', '28 de agosto 2027', '12 de diciembre y 19 de diciembre', 'Registro automático Moship API para el pedido #2420']) {
    assert.equal(exports.marketingSaleDate(invoice({ observations }), new Map()), null, observations)
  }
})
test('missing year resolves to the most recent past date, including previous December', () => {
  assert.equal(exports.marketingSaleDate(invoice({ date: '2026-01-21', observations: 'Dic 28' }), new Map()), '2025-12-28')
  assert.equal(exports.marketingSaleDate(invoice({ date: '2026-01-31', observations: '7 Enero 2025' }), new Map()), '2025-01-07')
})

test('shoe sizes on a previous line cannot be mistaken for a day of month', () => {
  assert.equal(exports.marketingSaleDate(invoice({ date: '2026-09-16', observations: 'Sharky 21\nAgosto 20 2026\nNequi' }), new Map()), '2026-08-20')
})

test('online unit comparison counts both historical years using Siigo, excluding unrelated items and invoices', () => {
  const period = { start: '2026-01-01', end: '2026-12-31' }
  const make = overrides => invoice({ id: 'invoice', total: 100, credited_amount: 0, date: '2026-09-16', items: [{ code: 'shoe', quantity: 2 }, { code: 'MP001', quantity: 92.3 }, { code: 'ENVIO', quantity: 1 }], ...overrides })
  assert.equal(exports.onlineInvoiceUnits([make({}), make({ observations: 'Pedido #2987' }), make({ customer_identification: 'store' }), make({ assigned_feria_id: 'fair' }), make({ credited_amount: 100 }), make({ date: '2025-09-16' })], period, context, new Set(['MP001'])), 4)
})
