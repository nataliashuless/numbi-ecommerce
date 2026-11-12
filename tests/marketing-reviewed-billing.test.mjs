import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
function load(file) {
  const api = {}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(`../lib/marketing/${file}.ts`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: api, Date, structuredClone })
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
test('unreconciled Shopify bills never become zero or a guessed COP total, and bank amounts are not counted twice', () => {
  const costs = reviewedBillingCosts({ '2026-09': { platformFee: 999999 } })
  const review = costs['2026-09'].platformReview
  assert.equal(review.confirmedCop, 151439)
  assert.equal(review.charges.filter(charge => charge.cop !== null).length, 1)
  assert.equal(costs['2026-09'].platformFee, undefined)
  assert.equal(contributionCosts({ start: '2026-09-01', end: '2026-09-30' }, metric, costs).platformFee, null)
  assert.equal(contributionCosts({ start: '2026-09-01', end: '2026-09-30' }, metric, costs).platformDocumented, 151439)
  assert.equal(contributionCosts({ start: '2026-09-01', end: '2026-09-19' }, metric, costs).platformDocumented, 0)
  assert.equal(contributionCosts({ start: '2026-09-20', end: '2026-09-20' }, metric, costs).platformDocumented, 151439)
  assert.equal(contributionCosts({ start: '2026-10-01', end: '2026-11-12' }, metric, costs).platformFee, null)
  const all = Object.values(costs).flatMap(month => month.platformReview?.charges || [])
  assert.equal(new Set(all.map(charge => charge.invoice)).size, all.length)
  assert.equal(all.filter(charge => charge.invoice === '614615004').length, 1)
  assert.equal(all.filter(charge => charge.cop !== null).reduce((sum, charge) => sum + charge.cop, 0), 151439)
})
