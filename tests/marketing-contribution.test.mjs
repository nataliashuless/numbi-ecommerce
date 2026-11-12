import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const api = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../lib/marketing/contribution.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: api, Date })
const period = { start: '2026-08-01', end: '2026-08-31' }
const costs = { '2026-08': { agencyFee: 1206375, agencyVariable: 0, natiFee: 1000000, servers: 35100, unitCost: 44258 } }
test('source August contribution reconciles all five marketing costs and 59 pairs', () => {
  const result = api.contributionCosts(period, { units: 59, daily: [{ date: '2026-08-10', units: 59 }] }, costs)
  const totalMarketing = api.sumKnown([1799016, result.agencyFee, result.agencyVariable, result.natiFee, result.servers])
  assert.equal(Math.round(api.divide(1799016, 48)), 37480)
  assert.equal(Math.round(api.divide(9137143, 48)), 190357)
  assert.equal((api.divide(1799016, 123382)).toFixed(1), '14.6')
  assert.equal((api.divide(1799016, 9137143) * 100).toFixed(1), '19.7')
  assert.equal(result.shoes, 2611222)
  assert.equal(totalMarketing, 4040491)
  assert.equal(8697714 - totalMarketing - result.shoes, 2046001)
})
test('partial-month fees use calendar days, unit costs follow each month, and missing inputs stay unavailable', () => {
  const result = api.contributionCosts({ start: '2026-08-16', end: '2026-09-15' }, { daily: [{ date: '2026-08-20', units: 2 }, { date: '2026-09-10', units: 3 }] }, { ...costs, '2026-09': { agencyFee: 300, agencyVariable: 0, natiFee: 0, servers: 0, unitCost: 10 } })
  assert.equal(result.agencyFee, 1206375 * 16 / 31 + 150)
  assert.equal(result.shoes, 44258 * 2 + 30)
  const missing = api.contributionCosts(period, { daily: [{ date: '2026-08-20', units: 1 }] }, {})
  assert.equal(missing.shoes, null)
  assert.equal(missing.agencyFee, null)
  assert.equal(api.sumKnown([1, null]), null)
  assert.equal(api.divide(10, 0), null)
  assert.equal(api.divide(0, 10), 0)
})
test('gross revenue is available only with pre-discount and VAT evidence across every selected source', () => {
  const records = [{ invoice: { id: 'shopify:1', date: '2026-08-10', items: [{ code: 'SKU', quantity: 1 }] } }]
  const orders = [{ id: 1, raw: { taxes_included: true, line_items: [{ sku: 'SKU', quantity: 2, current_quantity: 1, price: '119', tax_lines: [{ rate: 0.19 }] }] } }]
  assert.equal(api.documentedGrossSales(records, orders, period), 200)
  assert.equal(api.documentedGrossSales([...records, { invoice: { id: 'excel:2', date: '2026-08-10' } }], orders, period), null)
})

test('gross Siigo and linked Excel history require matching original prices and quantities', () => {
  const records = [{ invoice: { id: 'excel:row', name: 'FV-1', date: '2026-08-10', total: 119, items: [{ code: 'SKU', quantity: 1 }] } }]
  const original = [{ id: 'siigo:1', name: 'FV-1', items: [{ code: 'SKU', quantity: 1, price: 120 }] }]
  assert.equal(api.documentedGrossSales(records, [], period, original), 120)
  assert.equal(api.documentedGrossSales(records, [], period, [{ ...original[0], items: [{ code: 'SKU', quantity: 1, price: 50 }] }]), null)
  assert.equal(api.documentedGrossSales([{ invoice: { ...records[0].invoice, items: [{ code: 'SKU', quantity: 2 }] } }], [], period, original), null)
})

test('a filtered product with a reused Shopify SKU does not inherit another line gross amount', () => {
  const records = [{ invoice: { id: 'shopify:1', date: '2026-08-10', items: [{ code: 'REUSED', quantity: 1 }] } }]
  const orders = [{ id: 1, raw: { taxes_included: false, line_items: [{ sku: 'REUSED', quantity: 1, price: '100' }, { sku: 'REUSED', quantity: 1, price: '300' }] } }]
  assert.equal(api.documentedGrossSales(records, orders, period), null)
})

test('accounting content total replaces separate agency and Nati fees without duplicating them', () => {
  const result = api.contributionCosts(period, { daily: [{ date: '2026-08-10', units: 2 }] }, { '2026-08': { ...costs['2026-08'], contentFee: 2535292.9, platformFee: 1026268.12, unitCost: 49780.0322 } })
  assert.equal(result.agencyTotal, 2535292.9)
  assert.equal(result.platformFee, 1026268.12)
  assert.equal(result.shoes, 99560.0644)
  assert.equal(Math.round(api.sumKnown([1799016, result.agencyTotal, result.servers, result.platformFee]) * 100), 539567702)
  const historic = api.contributionCosts(period, { daily: [] }, { '2026-08': { contentFee: 0, servers: 35100 } })
  assert.equal(historic.agencyTotal, 0)
  assert.equal(historic.missing.length, 0)
})
