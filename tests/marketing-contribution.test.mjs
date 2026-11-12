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
  const records = [{ invoice: { id: 'shopify:1', date: '2026-08-10', items: [{ code: 'SKU' }] } }]
  const orders = [{ id: 1, raw: { taxes_included: true, line_items: [{ sku: 'SKU', quantity: 2, current_quantity: 1, price: '119', tax_lines: [{ rate: 0.19 }] }] } }]
  assert.equal(api.documentedGrossSales(records, orders, period), 200)
  assert.equal(api.documentedGrossSales([...records, { invoice: { id: 'excel:2', date: '2026-08-10' } }], orders, period), null)
})
