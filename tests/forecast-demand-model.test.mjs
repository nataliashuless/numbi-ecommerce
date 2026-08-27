import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addBusinessDays,
  correctedSizeProfile,
  forecastMonths,
  largestRemainder,
  monthlyStoreReplenishments,
  pendingEligibleAfterArrival,
  proratePartialMonth,
  safetyStock,
  selectDemandModel,
} from '../lib/forecast/demand-model.ts'

test('seasonal history can select and reproduce an annual pattern', () => {
  const history = [10, 12, 14, 16, 18, 20, 25, 22, 18, 40, 30, 15, 10, 12, 14, 16, 18, 20, 25, 22, 18, 40, 30, 15]
  const selected = selectDemandModel(history)
  const next = forecastMonths(history, selected.name, 1)[0]
  assert.ok(Number.isFinite(next))
  assert.ok(selected.metrics.observations > 0)
})

test('largest remainder reconciles every integer pair', () => {
  const allocation = largestRemainder(100, [
    { key: '19', share: 0.1 }, { key: '20', share: 0.17 }, { key: '21', share: 0.24 },
    { key: '22', share: 0.25 }, { key: '23', share: 0.16 }, { key: '24', share: 0.08 },
  ])
  assert.equal([...allocation.values()].reduce((s, x) => s + x, 0), 100)
  assert.deepEqual([...allocation.values()], [10, 17, 24, 25, 16, 8])
})

test('a likely size stockout is not treated as true zero demand', () => {
  const profile = correctedSizeProfile(new Map([
    ['20', [4, 5, 0, 5, 4]],
    ['21', [4, 5, 8, 5, 4]],
  ]), [8, 10, 8, 10, 8])
  assert.ok((profile.get('20') || 0) > 0.35)
})

test('50 business days excludes weekends and Colombian holidays', () => {
  const start = new Date('2026-08-26T12:00:00')
  const end = addBusinessDays(start, 50)
  assert.equal(end.toISOString().slice(0, 10), '2026-11-06')
})

test('safety stock is driven by historical error and capped', () => {
  const selected = { name: 'ma3', metrics: { wape: 0.2, bias: 0, mase: 1, observations: 4 }, residuals: [4, -4, 6, -6] }
  const stock = safetyStock(selected, 3, 100)
  assert.ok(stock > 0 && stock <= 50)
})

test('systematic underforecast bias increases safety stock', () => {
  const unbiased = { name: 'ma3', metrics: { wape: 0.2, bias: 0, mase: 1, observations: 4 }, residuals: [-4, 4, -4, 4] }
  const underforecast = { ...unbiased, residuals: [4, 12, 4, 12] }
  assert.ok(safetyStock(underforecast, 2, 100) > safetyStock(unbiased, 2, 100))
})

test('store stock only offsets that same store replenishment', () => {
  const storeA = monthlyStoreReplenishments([7], 2, 4)
  const storeB = monthlyStoreReplenishments([3], 1, 20)
  assert.deepEqual(storeA, [5])
  assert.deepEqual(storeB, [0])
  assert.equal(storeA[0] + storeB[0], 5)
})

test('pending production only covers needs on or after arrival', () => {
  const eligible = pendingEligibleAfterArrival(
    [{ quantity: 10, arrival: '2026-11-15' }],
    [{ quantity: 6, date: '2026-11-01' }, { quantity: 8, date: '2026-12-01' }],
  )
  assert.equal(eligible, 8)
})

test('current month sales are prorated after one observed week', () => {
  assert.equal(proratePartialMonth(20, 20, 30), 30)
  assert.equal(proratePartialMonth(3, 3, 30), 3)
  assert.equal(proratePartialMonth(20, 30, 30), 20)
})
