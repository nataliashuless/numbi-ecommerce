import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addBusinessDays,
  coverageAtArrival,
  dailyDemand,
  correctedSizeProfile,
  forecastMonths,
  largestRemainder,
  monthlyStoreReplenishments,
  partialMonthContinuousDelta,
  pendingEligibleAfterArrival,
  productionRequiredAtArrival,
  proratePartialMonth,
  safetyStock,
  selectDemandModel,
  seasonallyAdjustedFuture,
  stabilizedStoreSizeProfile,
  variabilityAdjustedSizeProfile,
} from '../lib/forecast/demand-model.ts'

test('seasonal history can select and reproduce an annual pattern', () => {
  const history = [10, 12, 14, 16, 18, 20, 25, 22, 18, 40, 30, 15, 10, 12, 14, 16, 18, 20, 25, 22, 18, 40, 30, 15]
  const selected = selectDemandModel(history)
  const next = forecastMonths(history, selected.name, 1)[0]
  assert.ok(Number.isFinite(next))
  assert.ok(selected.metrics.observations > 0)
})

test('seasonal blend keeps the prior-year month and applies recent growth', () => {
  const history = [10, 10, 10, 10, 10, 10, 10, 10, 10, 40, 20, 10, 12, 12, 12]
  const next = forecastMonths(history, 'seasonal_blend', 1)[0]
  assert.equal(next, 12)
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

test('backtested safety chooses the smallest buffer without materially worse shortages', () => {
  const model = { name: 'ma3', metrics: { wape: 0.2, bias: 0, mase: 1, observations: 8 }, residuals: [-2, 1, -1, 2, -2, 1, -1, 2] }
  const reserve = safetyStock(model, 1, 20)
  assert.ok(reserve >= 0 && reserve <= 10)
})

test('variable sizes receive more safety weight than equally selling stable sizes', () => {
  const adjusted = variabilityAdjustedSizeProfile(
    new Map([['23', [2, 2, 2, 2]], ['24', [0, 4, 0, 4]]]),
    new Map([['23', 0.5], ['24', 0.5]]),
  )
  assert.ok((adjusted.get('24') || 0) > (adjusted.get('23') || 0))
})

test('store stock only offsets that same store replenishment', () => {
  const storeA = monthlyStoreReplenishments([7], 2, 4)
  const storeB = monthlyStoreReplenishments([3], 1, 20)
  assert.deepEqual(storeA, [5])
  assert.deepEqual(storeB, [0])
  assert.equal(storeA[0] + storeB[0], 5)
})

test('an unavailable store size retains demand through the stable aggregate curve', () => {
  const profile = stabilizedStoreSizeProfile(
    new Map([['23', 1], ['24', 0]]),
    new Map([['23', 0.6], ['24', 0.4]]),
    8,
    new Set(['24']),
  )
  assert.ok((profile.get('24') || 0) > 0)
  assert.ok(Math.abs([...profile.values()].reduce((sum, value) => sum + value, 0) - 1) < 1e-9)
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

test('monthly store replenishment stays fixed while continuous sales are prorated', () => {
  const monthlyStoreProxy = 10
  const onlineSales = 20
  const adjustedTotal = monthlyStoreProxy + onlineSales + partialMonthContinuousDelta(onlineSales, 20, 30)
  assert.equal(adjustedTotal, 40)
  assert.equal(monthlyStoreProxy, 10)
})

test('production arriving after lead time does not replace already lost demand', () => {
  const needs = [
    { quantity: 60, date: '2026-09-30' },
    { quantity: 20, date: '2026-11-15' },
  ]
  assert.equal(productionRequiredAtArrival(40, [], needs, '2026-11-06'), 20)
})

test('production uses dated inbound and prevents post-arrival stockouts', () => {
  const needs = [
    { quantity: 6, date: '2026-11-10' },
    { quantity: 8, date: '2026-12-01' },
  ]
  assert.equal(productionRequiredAtArrival(0, [{ quantity: 10, arrival: '2026-11-20' }], needs, '2026-11-06'), 6)
  assert.equal(productionRequiredAtArrival(14, [], needs, '2026-11-06'), 0)
})

test('unserved pre-arrival store safety is restored but lost demand is not produced', () => {
  const needs = [
    { quantity: 7, recoverableSafety: 2, date: '2026-09-01' },
    { quantity: 5, date: '2026-10-01' },
    { quantity: 5, date: '2026-11-01' },
    { quantity: 5, date: '2026-12-01' },
  ]
  assert.equal(productionRequiredAtArrival(0, [], needs, '2026-11-06'), 7)
})


test('late November inbound cannot erase earlier daily shortages', () => {
  const needs = dailyDemand(30, '2026-11-01', '2026-11-30')
  const coverage = coverageAtArrival(0, [{ quantity: 30, arrival: '2026-11-30' }], needs, '2026-12-22')
  assert.equal(coverage.shortageBeforeArrival, 29)
  assert.equal(coverage.firstShortageDate, '2026-11-01')
  assert.equal(coverage.production, 0)
  assert.equal(coverageAtArrival(0, [{ quantity: 30, arrival: '2026-11-01' }], needs, '2026-12-22').shortageBeforeArrival, 0)
})

test('separates December demand before and after production arrival', () => {
  const coverage = coverageAtArrival(0, [], dailyDemand(31, '2026-12-01', '2026-12-31'), '2026-12-22')
  assert.equal(coverage.shortageBeforeArrival, 21)
  assert.equal(coverage.production, 10)
})

test('daily allocation preserves remaining-month total and receives same-day supply before demand', () => {
  const needs = dailyDemand(80, '2026-10-05', '2026-10-31')
  assert.equal(needs.length, 27)
  assert.ok(Math.abs(needs.reduce((sum, row) => sum + row.quantity, 0) - 80) < 1e-9)
  assert.equal(coverageAtArrival(0, [{ quantity: 80, arrival: '2026-10-05' }], needs, '2026-12-22').shortageBeforeArrival, 0)
})

const seasonalMonths = Array.from({ length: 24 }, (_, i) => new Date(Date.UTC(2024, 9 + i, 1)).toISOString().slice(0, 7))
test('pre-launch zeros do not halve a new model seasonal forecast', () => {
  assert.deepEqual(seasonallyAdjustedFuture([100, 100, 100, 100], [...Array(22).fill(0), 100, 100], seasonalMonths, ['2026-10', '2026-11', '2026-12', '2027-01']), [100, 100, 100, 100])
  assert.deepEqual(seasonallyAdjustedFuture([100], Array(24).fill(0), seasonalMonths, ['2026-10']), [100])
})
test('seasonal adjustment preserves real zero months after launch and established weights', () => {
  const history = Array(24).fill(100)
  history[12] = 0
  assert.deepEqual(seasonallyAdjustedFuture([100], history, seasonalMonths, ['2026-10']), [67.5])
  history[0] = 200
  history[12] = 300
  assert.deepEqual(seasonallyAdjustedFuture([100], history, seasonalMonths, ['2026-10']), [182.5])
})
