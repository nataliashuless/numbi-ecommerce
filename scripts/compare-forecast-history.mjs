import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import * as current from '../lib/forecast/demand-model.ts'

const [historyPath, beforePath, outputPath] = process.argv.slice(2)
if (!historyPath || !beforePath) throw new Error('Usage: node scripts/compare-forecast-history.mjs history.json before-model.ts [output.json]')
const before = await import(pathToFileURL(beforePath).href)
const records = JSON.parse(fs.readFileSync(historyPath, 'utf8'))
const months = [...new Set(records.map(row => row.Mes))].sort()
const series = new Map(), channels = new Map()
for (const row of records) {
  const key = JSON.stringify([row.Referencia, row.Canal])
  const entry = series.get(key) || { reference: row.Referencia, channel: row.Canal, values: Array(months.length).fill(0) }
  const i = months.indexOf(row.Mes)
  entry.values[i] += row.Pares
  series.set(key, entry)
  const channel = channels.get(row.Canal) || Array(months.length).fill(0)
  channel[i] += row.Pares
  channels.set(row.Canal, channel)
}
const fresh = () => ({ actual: 0, oldAbs: 0, newAbs: 0, baseAbs: 0, oldExcess: 0, newExcess: 0, oldShort: 0, newShort: 0, observations: 0, oldPeriodAbs: 0, newPeriodAbs: 0, basePeriodAbs: 0 })
const aggregate = { all: fresh(), direct: fresh(), stores: fresh() }
const holdout = { all: fresh(), direct: fresh(), stores: fresh() }
const methods = {}, details = []
function score(target, actual, old, next, base) {
  const total = xs => xs.reduce((sum, x) => sum + x, 0)
  target.oldPeriodAbs += Math.abs(total(old) - total(actual))
  target.newPeriodAbs += Math.abs(total(next) - total(actual))
  target.basePeriodAbs += Math.abs(total(base) - total(actual))
  actual.forEach((a, i) => {
    target.actual += a; target.oldAbs += Math.abs(old[i] - a); target.newAbs += Math.abs(next[i] - a); target.baseAbs += Math.abs(base[i] - a)
    target.oldExcess += Math.max(0, old[i] - a); target.newExcess += Math.max(0, next[i] - a)
    target.oldShort += Math.max(0, a - old[i]); target.newShort += Math.max(0, a - next[i]); target.observations++
  })
}
for (const entry of series.values()) {
  const first = entry.values.findIndex(x => x > 0)
  if (first < 0) continue
  const values = entry.values.slice(first), channel = channels.get(entry.channel)
  const category = ['Shopify', 'WhatsApp'].includes(entry.channel) ? 'direct' : 'stores'
  const old = before.backtestObservedGrowth(values, channel, 4, true)
  const next = current.backtestObservedGrowth(values, channel, 4, true)
  if (old.actualUnits !== next.actualUnits || old.origins !== next.origins) throw new Error('Comparison sample changed')
  const selection = current.selectPurchaseDemand(values, channel)
  methods[selection.method] = (methods[selection.method] || 0) + 1
  if (old.origins < 3 || category === 'stores' && (values.length < 6 || values.filter(x => x > 0).length < 3)) continue
  const row = fresh()
  const offset = channel.length - values.length
  const firstChannel = channel.findIndex(x => x > 0)
  for (let origin = Math.max(6, values.length - 15); origin <= values.length - 4; origin++) {
    const cut = offset + origin
    if (origin - 12 < 0 || cut - 15 <= firstChannel || channel.slice(cut - 15, cut - 12).reduce((s,x)=>s+x,0) <= 0) continue
    const training = values.slice(0, origin), c = channel.slice(0, cut), actual = values.slice(origin, origin + 4)
    const oldPrediction = before.forecastSelectedSales(training, c, 4).values
    const newPrediction = current.forecastSelectedSales(training, c, 4).values
    const basePrediction = current.forecastMonths(training, 'ma3', 4)
    for (const target of [row, aggregate.all, aggregate[category]]) score(target, actual, oldPrediction, newPrediction, basePrediction)
    if (origin === values.length - 4) for (const target of [holdout.all, holdout[category]]) score(target, actual, oldPrediction, newPrediction, basePrediction)
  }
  details.push({ reference: entry.reference, channel: entry.channel, method: selection.method, ...row })
}
const format = row => ({ ...row, oldWape: row.oldAbs / row.actual, newWape: row.newAbs / row.actual, baselineWape: row.baseAbs / row.actual, oldProtectionWape: row.oldPeriodAbs / row.actual, newProtectionWape: row.newPeriodAbs / row.actual, baseProtectionWape: row.basePeriodAbs / row.actual })
const report = { firstMonth: months[0], lastMonth: months.at(-1), series: series.size, comparableSeries: details.length,
  aggregate: Object.fromEntries(Object.entries(aggregate).map(([k,v])=>[k,format(v)])),
  latestFourMonths: Object.fromEntries(Object.entries(holdout).map(([k,v])=>[k,format(v)])), methods,
  details: details.sort((a,b)=>b.newAbs-a.newAbs) }
if (outputPath) fs.writeFileSync(outputPath, JSON.stringify(report, null, 2))
console.log(JSON.stringify({ ...report, details: report.details.slice(0, 8) }, null, 2))
