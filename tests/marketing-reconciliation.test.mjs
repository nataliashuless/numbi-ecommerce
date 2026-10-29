import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyMarketingInvoice } from '../lib/marketing/channel-reconciliation.ts'
const ctx = { shopifyOrderNumbers: new Set([100]), tiendaNits: new Set(['store']), feriaWindows: [{ start: '2025-05-01', end: '2025-05-10' }], whatsappInvoiceIds: new Set(['wa']), firstShopifyOrderDate: '2025-06-01' }
const inv = overrides => ({ id: 'invoice', date: '2025-04-01', observations: '', raw: null, ...overrides })
test('payment methods and the date of a fair alone never prove channel', () => {
  for (const observations of ['Mercado Pago', 'Pago Nequi', 'Link BOLD', '']) assert.equal(classifyMarketingInvoice(inv({ observations }), ctx).channel, 'pending')
  assert.equal(classifyMarketingInvoice(inv({ date: '2025-05-02' }), ctx).channel, 'pending')
  assert.equal(classifyMarketingInvoice(inv({ raw: { payments: [{ id: 8362 }] } }), ctx).channel, 'pending')
})
test('confirmed evidence separates platforms without using a Shopify start-date guess for all sales', () => {
  assert.equal(classifyMarketingInvoice(inv({ observations: 'Pedido #100' }), ctx).channel, 'shopify')
  assert.equal(classifyMarketingInvoice(inv({ observations: 'Compra página web' }), ctx).channel, 'woocommerce')
  assert.equal(classifyMarketingInvoice(inv({ date: '2026-04-01', observations: 'Compra WooCommerce' }), ctx).channel, 'woocommerce')
  assert.equal(classifyMarketingInvoice(inv({ observations: 'Venta WhatsApp' }), ctx).channel, 'whatsapp')
  assert.equal(classifyMarketingInvoice(inv({ id: 'wa' }), ctx).channel, 'whatsapp')
})
test('stores and assigned fairs take precedence; conflicting observations stay pending', () => {
  assert.equal(classifyMarketingInvoice(inv({ customer_identification: 'store', observations: 'Pedido #100' }), ctx).channel, 'tienda')
  assert.equal(classifyMarketingInvoice(inv({ assigned_feria_id: 'fair', observations: 'Pedido #100' }), ctx).channel, 'feria')
  assert.equal(classifyMarketingInvoice(inv({ observations: 'Compra Feria EVA' }), ctx).channel, 'feria')
  assert.equal(classifyMarketingInvoice(inv({ observations: 'Pedido #100 recoger en feria EVA' }), ctx).channel, 'pending')
})

test('owner-confirmed exclusive Mercado Pago rule reconciles historical WooCommerce, retaining conflicts for review', () => {
  const confirmed = { ...ctx, mercadoPagoWooCommerceOnly: true }
  assert.equal(classifyMarketingInvoice(inv({ observations: 'Pago Mercadopago' }), confirmed).channel, 'woocommerce')
  assert.equal(classifyMarketingInvoice(inv({ raw: { payments: [{ id: 8362 }] } }), confirmed).channel, 'woocommerce')
  assert.equal(classifyMarketingInvoice(inv({ observations: 'Pedido #100 Mercado Pago' }), confirmed).channel, 'shopify')
})

test('historical distributor evidence excludes other invoices for the same store without contaminating generic consumers', async () => {
  const { historicalStoreEvidence } = await import('../lib/marketing/channel-reconciliation.ts')
  const evidence = historicalStoreEvidence([inv({ name: 'FV-2-2746', customer_identification: '12.345-6', observations: 'Venta de 43 pares. Descuento distribuidor 50%' }), inv({ customer_identification: '222222222222', observations: 'Tienda Paraiso' })])
  const known = { ...ctx, historicalStoreEvidence: evidence }
  assert.equal(classifyMarketingInvoice(inv({ customer_identification: '123456', observations: 'Liquidación ventas Julio' }), known).channel, 'tienda')
  assert.equal(classifyMarketingInvoice(inv({ customer_identification: '123456', assigned_feria_id: 'fair' }), known).channel, 'tienda')
  assert.equal(evidence.has('222222222222'), false)
})

test('owner-confirmed direct payment rules apply only after web, store and fair evidence', () => {
  const confirmed = { ...ctx, directPaymentsWhatsAppOnly: true, mercadoPagoWooCommerceOnly: true }
  for (const method of ['Nequi', 'BOLD', 'Bancolombia', 'Daviplata']) assert.equal(classifyMarketingInvoice(inv({ observations: `Pago ${method}` }), confirmed).channel, 'whatsapp')
  assert.equal(classifyMarketingInvoice(inv({ observations: 'Pedido #100 pago Bold' }), confirmed).channel, 'shopify')
  assert.equal(classifyMarketingInvoice(inv({ observations: 'Feria EVA pago Nequi' }), confirmed).channel, 'feria')
  assert.equal(classifyMarketingInvoice(inv({ observations: 'Pago efectivo' }), confirmed).channel, 'pending')
  assert.equal(classifyMarketingInvoice(inv({ raw: { payments: [{ name: 'Bancolombia' }] } }), confirmed).channel, 'whatsapp')
})
test('specific owner corrections reconcile Activetress without rewriting other fair assignments', () => {
  const confirmed = { ...ctx, confirmedStoreInvoiceNames: new Set(['FV-2-2710', 'FV-2-2596']) }
  assert.equal(classifyMarketingInvoice(inv({ name: 'FV-2-2710', assigned_feria_id: 'fair' }), confirmed).channel, 'tienda')
  assert.equal(classifyMarketingInvoice(inv({ name: 'FV-2-other', assigned_feria_id: 'fair' }), confirmed).channel, 'feria')
})

test('a consumer purchase at a shop is excluded individually but never turns all later purchases by that person into store sales', async () => {
  const { historicalStoreEvidence } = await import('../lib/marketing/channel-reconciliation.ts')
  const receipt = inv({ customer_identification: '12345', observations: 'Compra de zapato en Tienda Paraiso' })
  const evidence = historicalStoreEvidence([receipt])
  assert.equal(evidence.size, 0)
  assert.equal(classifyMarketingInvoice(receipt, ctx).channel, 'tienda')
  assert.equal(classifyMarketingInvoice(inv({ customer_identification: '12345', observations: 'Pedido #100' }), { ...ctx, historicalStoreEvidence: evidence }).channel, 'shopify')
})
