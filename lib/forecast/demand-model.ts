export type ModelName = 'naive' | 'ma3' | 'wma3' | 'ses' | 'trend' | 'seasonal' | 'seasonal_blend'

export interface BacktestMetrics {
  wape: number
  bias: number
  mase: number | null
  observations: number
}

export interface SelectedModel {
  name: ModelName
  metrics: BacktestMetrics
  residuals: number[]
}

const mean = (values: number[]) => values.length ? values.reduce((s, x) => s + x, 0) / values.length : 0

export function proratePartialMonth(units: number, observedDays: number, daysInMonth: number): number {
  if (units <= 0 || observedDays <= 0 || daysInMonth <= 0 || observedDays >= daysInMonth) return Math.max(0, units)
  // Require at least one week before extrapolating; earlier data is too noisy
  // and the raw units are a safer signal for a newly launched product.
  if (observedDays < 7) return Math.max(0, units)
  return Math.max(0, units * daysInMonth / observedDays)
}

export function partialMonthContinuousDelta(units: number, observedDays: number, daysInMonth: number): number {
  return proratePartialMonth(units, observedDays, daysInMonth) - Math.max(0, units)
}

function predict(name: ModelName, history: number[]): number | null {
  if (!history.length) return null
  const h = history.map(x => Math.max(0, Number(x) || 0))
  if (name === 'naive') return h[h.length - 1]
  if (name === 'ma3') return mean(h.slice(-Math.min(3, h.length)))
  if (name === 'wma3') {
    const tail = h.slice(-3)
    const weights = tail.length === 1 ? [1] : tail.length === 2 ? [1, 2] : [1, 2, 3]
    return tail.reduce((s, x, i) => s + x * weights[i], 0) / weights.reduce((s, x) => s + x, 0)
  }
  if (name === 'ses') {
    let level = h[0]
    const alpha = 0.4
    for (let i = 1; i < h.length; i++) level = alpha * h[i] + (1 - alpha) * level
    return level
  }
  if (name === 'trend') {
    const tail = h.slice(-Math.min(6, h.length))
    if (tail.length < 3) return null
    const xMean = (tail.length - 1) / 2
    const yMean = mean(tail)
    let numerator = 0
    let denominator = 0
    for (let i = 0; i < tail.length; i++) {
      numerator += (i - xMean) * (tail[i] - yMean)
      denominator += (i - xMean) ** 2
    }
    const slope = denominator ? numerator / denominator : 0
    // A damped and capped trend prevents a short spike from exploding inventory.
    return Math.max(0, Math.min(yMean * 2, yMean + slope * (tail.length + 1) / 2))
  }
  if (name === 'seasonal') return h.length >= 12 ? h[h.length - 12] : null
  if (name === 'seasonal_blend') {
    if (h.length < 12) return null
    return (h[h.length - 12] + mean(h.slice(-3))) / 2
  }
  return null
}

function metrics(actual: number[], predicted: number[]): BacktestMetrics {
  const errors = predicted.map((p, i) => p - actual[i])
  const absError = errors.reduce((s, x) => s + Math.abs(x), 0)
  const actualTotal = actual.reduce((s, x) => s + Math.abs(x), 0)
  const scaleTerms: number[] = []
  for (let i = 1; i < actual.length; i++) scaleTerms.push(Math.abs(actual[i] - actual[i - 1]))
  const scale = mean(scaleTerms)
  return {
    wape: actualTotal > 0 ? absError / actualTotal : absError === 0 ? 0 : Number.POSITIVE_INFINITY,
    bias: actualTotal > 0 ? errors.reduce((s, x) => s + x, 0) / actualTotal : 0,
    mase: scale > 0 ? mean(errors.map(Math.abs)) / scale : null,
    observations: actual.length,
  }
}

export function selectDemandModel(values: number[]): SelectedModel {
  const clean = values.map(x => Math.max(0, Number(x) || 0))
  const candidates: ModelName[] = ['naive', 'ma3', 'wma3', 'ses', 'trend', 'seasonal', 'seasonal_blend']
  let best: SelectedModel | null = null
  let baseline: SelectedModel | null = null
  let bestScore = Number.POSITIVE_INFINITY
  for (const name of candidates) {
    const actual: number[] = []
    const forecasts: number[] = []
    const firstOrigin = name.startsWith('seasonal') ? 12 : 3
    const start = Math.max(firstOrigin, clean.length - 12)
    for (let origin = start; origin < clean.length; origin++) {
      const forecast = predict(name, clean.slice(0, origin))
      if (forecast == null || !Number.isFinite(forecast)) continue
      actual.push(clean[origin])
      forecasts.push(forecast)
    }
    if (actual.length < Math.min(3, Math.max(1, clean.length - firstOrigin))) continue
    const result = metrics(actual, forecasts)
    // WAPE leads selection; a modest bias penalty rejects systematically high
    // inventory plans when two models have similar absolute error.
    const score = result.wape + Math.abs(result.bias) * 0.2
    const candidate = { name, metrics: result, residuals: forecasts.map((p, i) => actual[i] - p) }
    if (name === 'ma3') baseline = candidate
    if (score < bestScore) {
      bestScore = score
      best = candidate
    }
  }
  // Avoid per-reference model-selection overfit. A more complex model must
  // improve WAPE by at least 75% and cannot introduce materially worse bias;
  // otherwise retain the simple recent moving average.
  if (best && baseline && best.name !== 'ma3') {
    const materiallyBetter = best.metrics.wape <= baseline.metrics.wape * 0.25
    const stableBias = Math.abs(best.metrics.bias) <= Math.abs(baseline.metrics.bias) + 0.05
    if (!materiallyBetter || !stableBias) return baseline
  }
  return best || {
    name: 'ma3',
    metrics: { wape: 0, bias: 0, mase: null, observations: 0 },
    residuals: [],
  }
}

export function forecastMonths(values: number[], model: ModelName, months: number): number[] {
  const history = values.map(x => Math.max(0, Number(x) || 0))
  const out: number[] = []
  for (let i = 0; i < months; i++) {
    const value = predict(model, [...history, ...out]) ?? mean(history.slice(-3))
    out.push(Math.max(0, value))
  }
  return out
}

export function safetyStock(selected: SelectedModel, protectionMonths: number, expectedDemand: number): number {
  if (!selected.residuals.length || expectedDemand <= 0) return 0
  const residualMean = mean(selected.residuals)
  const variance = mean(selected.residuals.map(x => (x - residualMean) ** 2))
  // 80% one-sided service level balances availability with excess inventory.
  // Error scales with sqrt(time); cap at 50% of expected demand so sparse data
  // cannot create an unreasonable buffer.
  const variabilityReserve = 0.84 * Math.sqrt(variance) * Math.sqrt(protectionMonths)
  // residual = actual - forecast, so a positive mean is systematic
  // underforecasting. Preserve that risk instead of centering it away.
  const biasReserve = Math.max(0, residualMean) * protectionMonths
  return Math.min(expectedDemand * 0.5, variabilityReserve + biasReserve)
}

export function largestRemainder(total: number, shares: Array<{ key: string; share: number }>): Map<string, number> {
  const result = new Map<string, number>()
  if (total <= 0 || !shares.length) return result
  const positive = shares.map(x => ({ ...x, share: Math.max(0, x.share) }))
  const sum = positive.reduce((s, x) => s + x.share, 0)
  const normalized = positive.map(x => ({ ...x, share: sum > 0 ? x.share / sum : 1 / positive.length }))
  const rows = normalized.map(x => {
    const raw = x.share * total
    return { ...x, units: Math.floor(raw), remainder: raw - Math.floor(raw) }
  })
  const remaining = total - rows.reduce((s, x) => s + x.units, 0)
  rows.sort((a, b) => b.remainder - a.remainder || a.key.localeCompare(b.key))
  for (let i = 0; i < remaining; i++) rows[i % rows.length].units += 1
  for (const row of rows) result.set(row.key, row.units)
  return result
}

export function correctedSizeProfile(
  sizeSeries: Map<string, number[]>,
  referenceTotals: number[],
): Map<string, number> {
  const correctedTotals = new Map<string, number>()
  for (const [size, series] of sizeSeries) {
    let total = 0
    for (let i = 0; i < series.length; i++) {
      let value = Math.max(0, series[i] || 0)
      // A zero is only treated as censored when the reference sold that month,
      // and this size sold both before and after it. Without stock snapshots,
      // this is the narrowest defensible stockout inference.
      if (value === 0 && referenceTotals[i] > 0) {
        const before = series.slice(Math.max(0, i - 2), i).filter(x => x > 0)
        const after = series.slice(i + 1, i + 3).filter(x => x > 0)
        if (before.length && after.length) value = (mean(before) + mean(after)) / 2
      }
      // Recent observations receive progressively more influence without a
      // fixed arbitrary 50/30/20 split.
      const recencyWeight = 1 + i / Math.max(1, series.length - 1)
      total += value * recencyWeight
    }
    correctedTotals.set(size, total)
  }
  const grandTotal = [...correctedTotals.values()].reduce((s, x) => s + x, 0)
  if (grandTotal <= 0 && correctedTotals.size) {
    const equal = 1 / correctedTotals.size
    for (const size of correctedTotals.keys()) correctedTotals.set(size, equal)
  } else if (grandTotal > 0) {
    for (const [size, value] of correctedTotals) correctedTotals.set(size, value / grandTotal)
  }
  return correctedTotals
}

export function stabilizedStoreSizeProfile(
  localProfile: Map<string, number>,
  aggregateProfile: Map<string, number>,
  observedStoreUnits: number,
  unavailableSizes: Set<string>,
): Map<string, number> {
  const sizes = new Set([...aggregateProfile.keys(), ...localProfile.keys()])
  if (!sizes.size) return new Map()

  // Twelve observed pairs are enough for the store's own size curve to carry
  // half the weight. A currently unavailable size receives a slightly stronger
  // portfolio prior because its recent zero may be censored by a stockout.
  const evidence = Math.max(0, observedStoreUnits)
  const result = new Map<string, number>()
  for (const size of sizes) {
    const priorStrength = unavailableSizes.has(size) ? 18 : 12
    const localWeight = evidence / (evidence + priorStrength)
    const localShare = Math.max(0, localProfile.get(size) || 0)
    const aggregateShare = Math.max(0, aggregateProfile.get(size) || 0)
    result.set(size, localShare * localWeight + aggregateShare * (1 - localWeight))
  }
  const total = [...result.values()].reduce((sum, share) => sum + share, 0)
  if (total > 0) {
    for (const [size, share] of result) result.set(size, share / total)
  } else {
    const equal = 1 / sizes.size
    for (const size of sizes) result.set(size, equal)
  }
  return result
}

export function addBusinessDays(start: Date, businessDays: number): Date {
  const date = new Date(start)
  let added = 0
  while (added < businessDays) {
    date.setDate(date.getDate() + 1)
    const day = date.getDay()
    if (day !== 0 && day !== 6 && !isColombiaHoliday(date)) added += 1
  }
  return date
}

export function monthlyStoreReplenishments(demand: number[], safety: number, initialStock: number): number[] {
  let stock = Math.max(0, initialStock)
  return demand.map(periodDemand => {
    const units = Math.max(0, Math.round(periodDemand))
    const replenishment = Math.max(0, units + Math.max(0, safety) - stock)
    stock = Math.max(0, stock + replenishment - units)
    return replenishment
  })
}

export function pendingEligibleAfterArrival(
  lines: Array<{ quantity: number; arrival: string }>,
  needs: Array<{ quantity: number; date: string }>,
): number {
  const remainingNeeds = needs.map(need => ({ ...need })).sort((a, b) => a.date.localeCompare(b.date))
  let eligible = 0
  for (const line of lines.slice().sort((a, b) => a.arrival.localeCompare(b.arrival))) {
    let remaining = Math.max(0, line.quantity)
    for (const need of remainingNeeds) {
      if (remaining <= 0) break
      if (need.date < line.arrival || need.quantity <= 0) continue
      const applied = Math.min(remaining, need.quantity)
      remaining -= applied
      need.quantity -= applied
      eligible += applied
    }
  }
  return eligible
}

export function productionWithIncrementalReviewCoverage(
  leadTimeTarget: number,
  reviewPeriodTarget: number,
  inventoryPosition: number,
): number {
  const leadNeed = Math.max(0, leadTimeTarget)
  const reviewNeed = Math.max(0, reviewPeriodTarget)
  const available = Math.max(0, inventoryPosition)

  // The review month is not an automatic extra month of production. Inventory
  // remaining after lead-time coverage offsets it first; only its net shortfall
  // is added to today's order.
  const leadShortfall = Math.max(0, leadNeed - available)
  const surplusAfterLead = Math.max(0, available - leadNeed)
  const incrementalReview = Math.max(0, reviewNeed - surplusAfterLead)
  return Math.round(leadShortfall + incrementalReview)
}

function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day, 12)
}

function nextMonday(date: Date): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + ((8 - result.getDay()) % 7))
  return result
}

function isColombiaHoliday(date: Date): boolean {
  const year = date.getFullYear()
  const key = `${date.getMonth() + 1}-${date.getDate()}`
  const fixed = new Set(['1-1', '5-1', '7-20', '8-7', '12-8', '12-25'])
  if (fixed.has(key)) return true
  const emiliani = [[0, 6], [2, 19], [5, 29], [7, 15], [9, 12], [10, 1], [10, 11]]
    .map(([month, day]) => nextMonday(new Date(year, month, day, 12)))
  const easter = easterSunday(year)
  const relative = [-3, -2, 43, 64, 71].map(offset => {
    const holiday = new Date(easter)
    holiday.setDate(holiday.getDate() + offset)
    return holiday
  })
  return [...emiliani, ...relative].some(holiday =>
    holiday.getFullYear() === year && holiday.getMonth() === date.getMonth() && holiday.getDate() === date.getDate()
  )
}
