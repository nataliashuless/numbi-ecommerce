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
  backtestDemandModel,
  forecastLastYear,
  lastYearSafetyModel,
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


test('sustained decline is not overridden by an unvalidated older seasonal average', () => {
  const history = [...Array(18).fill(100), ...Array(12).fill(10)]
  const selected = selectDemandModel(history)
  assert.deepEqual(forecastMonths(history, selected.name, 4), [10, 10, 10, 10])
})

test('every eligible model is evaluated on identical held-out months', () => {
  for (const length of [6, 14, 15, 17, 18, 23, 24, 27, 30]) {
    const history = Array.from({ length }, (_, index) => 10 + index % 12 * 3)
    const selected = selectDemandModel(history)
    const minHistory = length >= 18 ? 15 : length >= 15 ? 12 : 3
    const start = Math.max(minHistory, length - 12)
    const actual = history.slice(start)
    const residuals = actual.map((value, index) => value - forecastMonths(history.slice(0, start + index), selected.name, 1)[0])
    assert.equal(selected.metrics.observations, length - start)
    assert.deepEqual(selected.residuals, residuals)
  }
  assert.equal(selectDemandModel([10, 20, 30, 40, 50]).metrics.observations, 0)
})

test('repeated annual peaks are retained by a validated seasonal candidate', () => {
  const cycle = [10, 10, 10, 10, 10, 10, 10, 10, 10, 30, 100, 120]
  const history = [...cycle, ...cycle, ...cycle].slice(0, 33)
  const selected = selectDemandModel(history)
  assert.equal(selected.name, 'seasonal')
  assert.deepEqual(forecastMonths(history, selected.name, 4), [30, 100, 120, 10])
})

test('rolling four-month diagnostic selects only from past data and compares identical horizons', () => {
  const history = Array.from({ length: 24 }, (_, index) => index < 18 ? 10 : 100)
  const report = backtestDemandModel(history)
  let absoluteError = 0
  let baselineError = 0
  let actualUnits = 0
  for (let origin = 9; origin <= 20; origin++) {
    const training = history.slice(0, origin)
    const predictions = forecastMonths(training, selectDemandModel(training).name, 4)
    const baseline = forecastMonths(training, 'ma3', 4)
    for (let step = 0; step < 4; step++) {
      absoluteError += Math.abs(predictions[step] - history[origin + step])
      baselineError += Math.abs(baseline[step] - history[origin + step])
      actualUnits += history[origin + step]
    }
  }
  assert.equal(report.origins, 12)
  assert.equal(report.selected.observations, 48)
  assert.equal(report.baseline.observations, 48)
  assert.equal(report.selectedAbsoluteError, absoluteError)
  assert.equal(report.baselineAbsoluteError, baselineError)
  assert.equal(report.actualUnits, actualUnits)
  assert.equal(backtestDemandModel([1, 2, 3, 4]).origins, 0)
})

const annualMonths = Array.from({ length: 24 }, (_, i) => new Date(Date.UTC(2024, 9 + i, 1)).toISOString().slice(0, 7))
test('annual policy uses exact previous year campaign sales without growth or blending', () => {
  const chocolate = Array(24).fill(8)
  chocolate[13] = 36; chocolate[14] = 26; chocolate[15] = 12
  const leo = Array(24).fill(7)
  leo[13] = 23; leo[14] = 17; leo[15] = 9
  const targets = ['2026-11', '2026-12', '2027-01']
  assert.deepEqual(forecastLastYear(chocolate, annualMonths, targets, [8,8,8]).values, [36,26,12])
  assert.deepEqual(forecastLastYear(leo, annualMonths, targets, [7,7,7]).values, [23,17,9])
})
test('annual policy preserves observed zeros and falls back for pre-launch or missing months', () => {
  const history = [...Array(13).fill(0), 36, 0, ...Array(9).fill(8)]
  const result = forecastLastYear(history, annualMonths, ['2026-10','2026-11','2026-12'], [8,8,8])
  assert.deepEqual(result.values, [8,36,0])
  assert.deepEqual(result.sources, ['alternativa sin mes comparable','año anterior','año anterior'])
  assert.deepEqual(forecastLastYear([10], ['2026-09'], ['2027-01'], [4]).values, [4])
})
test('annual safety residuals match year-over-year rule and annual backtest has no future leakage', () => {
  const history = [...Array(12).fill(10), ...Array(12).fill(20)]
  assert.deepEqual(lastYearSafetyModel(history, annualMonths, selectDemandModel(history)).residuals, Array(12).fill(10))
  const report = backtestDemandModel(history, 4, annualMonths)
  let error = 0
  for (let origin=9; origin<=20; origin++) {
    const train = history.slice(0,origin)
    const values = forecastLastYear(train, annualMonths.slice(0,origin), annualMonths.slice(origin,origin+4), forecastMonths(train,selectDemandModel(train).name,4)).values
    values.forEach((value,i)=>{ error += Math.abs(value-history[origin+i]) })
  }
  assert.equal(report.selectedAbsoluteError,error)
})
