import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
function load(file) {
  const api = {}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(`../lib/marketing/${file}.ts`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, { exports: api, Date, structuredClone, require(name) {
    if (name === '@/data/marketing-shopify-siigo-expenses.json') return JSON.parse(fs.readFileSync(new URL('../data/marketing-shopify-siigo-expenses.json', import.meta.url), 'utf8'))
    throw new Error(name)
  } })
  return api
}
const { reviewedBillingCosts } = load('reviewed-billing')
const { contributionCosts } = load('contribution')
const metric = { daily: [] }
test('annual hosting replaces the accounting cash expense, conserves total, and respects exact service bounds', () => {
  const original = { '2026-08': { servers: 305400, contentFee: 12 } }
  const costs = reviewedBillingCosts(original)
  assert.equal(original['2026-08'].servers, 305400)
  assert.equal(costs['2026-08'].contentFee, 12)
  assert.equal(costs['2026-08'].servers, 305400 * 28 / 365)
  const period = (start, end) => contributionCosts({ start, end }, metric, costs).servers
  assert.ok(Math.abs(period('2026-08-01', '2027-08-31') - 305400) < 0.000001)
  assert.equal(period('2026-08-01', '2026-08-03'), 0)
  assert.equal(period('2026-08-04', '2026-08-04'), 305400 / 365)
  assert.equal(period('2027-08-04', '2027-08-31'), 0)
  assert.equal(period('2026-09-01', '2026-09-30'), 305400 * 30 / 365)
  assert.ok(Math.abs(period('2026-08-01', '2026-09-15') + period('2026-09-16', '2027-08-31') - 305400) < 0.000001)
})
test('Siigo expense documents replace earlier bank subtotals, apply reversals once, and follow actual document dates', () => {
  const costs = reviewedBillingCosts({ '2026-09': { platformFee: 999999 } })
  assert.equal(costs['2026-09'].platformReview, undefined)
  assert.equal(costs['2026-09'].platformFee, 1351041.07)
  assert.equal(costs['2026-10'].platformFee, 1261548.47)
  assert.ok(Math.abs(contributionCosts({ start: '2026-09-01', end: '2026-09-30' }, metric, costs).platformFee - 1351041.07) < 0.000001)
  assert.equal(contributionCosts({ start: '2026-09-07', end: '2026-09-07' }, metric, costs).platformFee, -145275)
  assert.equal(contributionCosts({ start: '2026-09-20', end: '2026-09-20' }, metric, costs).platformDocumented, 151439)
  const documents = Object.values(costs).flatMap(month => month.platformAccounting?.documents || [])
  assert.equal(new Set(documents.map(document => document.id)).size, documents.length)
  assert.equal(documents.filter(document => document.name === 'DS-1-314').length, 1)
  // Foreign VAT and both sides of the journal must not inflate expense.
  assert.equal(costs['2026-09'].platformAccounting.documents.find(document => document.name === 'DS-1-284').amount, 741029.52)
})
test('unposted November remains unavailable rather than zero or an estimated USD conversion', () => {
  const costs = reviewedBillingCosts({})
  assert.equal(contributionCosts({ start: '2026-10-01', end: '2026-11-12' }, metric, costs).platformFee, null)
  assert.equal(contributionCosts({ start: '2026-11-01', end: '2026-11-12' }, metric, costs).platformFee, null)
  const all = Object.values(costs).flatMap(month => month.platformReview?.charges || [])
  assert.equal(new Set(all.map(charge => charge.invoice)).size, all.length)
  assert.equal(all.filter(charge => charge.cop !== null).length, 0)
})
