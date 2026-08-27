import { createClient } from '@supabase/supabase-js'
import { forecastMonths, selectDemandModel } from '../lib/forecast/demand-model.ts'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function pages(table, select, apply = query => query) {
  const rows = []
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await apply(db.from(table).select(select).range(from, from + 999))
    if (error) throw error
    rows.push(...data)
    if (data.length < 1000) break
  }
  return rows
}

function parseReference(description) {
  const text = String(description || '').trim()
  return text
    .replace(/\s*[-–—]?\s*talla\s+\d+(?:[.,]\d+)?$/i, '')
    .replace(/\s*[-–—]\s*\d+(?:[.,]\d+)?$/, '')
    .replace(/\s+\d+(?:[.,]\d+)?$/, '')
    .trim() || '—'
}

const [invoices, stock] = await Promise.all([
  pages('siigo_invoices', 'id,date,total,credited_amount,items'),
  pages('siigo_product_stock', 'product_code,product_name,account_group_id', query => query.eq('account_group_id', 339)),
])
const referenceBySku = new Map(stock.filter(row => row.product_code).map(row => [row.product_code, parseReference(row.product_name)]))
const valid = [...new Map(invoices.map(invoice => [invoice.id, invoice])).values()]
  .filter(invoice => (Number(invoice.credited_amount) || 0) < (Number(invoice.total) || 0))
const firstMonth = valid.reduce((min, invoice) => invoice.date.slice(0, 7) < min ? invoice.date.slice(0, 7) : min, valid[0].date.slice(0, 7))
const latestDate = valid.reduce((max, invoice) => invoice.date > max ? invoice.date : max, valid[0].date)
const latest = new Date(`${latestDate}T12:00:00`)
const latestMonthLastDay = new Date(latest.getFullYear(), latest.getMonth() + 1, 0).getDate()
if (latest.getDate() < latestMonthLastDay) latest.setMonth(latest.getMonth() - 1)
const lastMonth = latest.toISOString().slice(0, 7)
const months = []
const cursor = new Date(`${firstMonth}-01T12:00:00`)
while (cursor.toISOString().slice(0, 7) <= lastMonth) {
  months.push(cursor.toISOString().slice(0, 7))
  cursor.setMonth(cursor.getMonth() + 1)
}
const monthIndex = new Map(months.map((month, index) => [month, index]))
const byReference = new Map()
for (const invoice of valid) {
  const index = monthIndex.get(invoice.date.slice(0, 7))
  if (index == null) continue
  for (const item of invoice.items || []) {
    const reference = referenceBySku.get(item.code)
    if (!reference || item.code === 'ENVIO') continue
    const series = byReference.get(reference) || Array(months.length).fill(0)
    series[index] += Math.max(0, Number(item.quantity) || 0)
    byReference.set(reference, series)
  }
}

const totals = {
  baselineAbs: 0, selectedAbs: 0, baselineError: 0, selectedError: 0, actual: 0,
  baselineExcess: 0, selectedExcess: 0, baselineShort: 0, selectedShort: 0, observations: 0,
}
const modelCounts = {}
for (const series of byReference.values()) {
  const firstPositive = series.findIndex(value => value > 0)
  if (firstPositive < 0) continue
  const values = series.slice(firstPositive)
  const start = Math.max(6, values.length - 12)
  for (let origin = start; origin < values.length; origin++) {
    const training = values.slice(0, origin)
    if (training.length < 3) continue
    const actual = values[origin]
    const baseline = training.slice(-3).reduce((sum, value) => sum + value, 0) / Math.min(3, training.length)
    const selected = selectDemandModel(training)
    const prediction = forecastMonths(training, selected.name, 1)[0]
    const baselineError = baseline - actual
    const selectedError = prediction - actual
    totals.baselineAbs += Math.abs(baselineError)
    totals.selectedAbs += Math.abs(selectedError)
    totals.baselineError += baselineError
    totals.selectedError += selectedError
    totals.actual += actual
    totals.baselineExcess += Math.max(0, baselineError)
    totals.selectedExcess += Math.max(0, selectedError)
    totals.baselineShort += Math.max(0, -baselineError)
    totals.selectedShort += Math.max(0, -selectedError)
    totals.observations += 1
    modelCounts[selected.name] = (modelCounts[selected.name] || 0) + 1
  }
}

const result = {
  history: { firstMonth, lastMonth, months: months.length, references: byReference.size },
  observations: totals.observations,
  baseline: {
    model: 'moving_average_3_months_equivalent_to_recent_90_days',
    wape: totals.actual ? totals.baselineAbs / totals.actual : null,
    bias: totals.actual ? totals.baselineError / totals.actual : null,
    excessUnits: Math.round(totals.baselineExcess),
    shortageUnits: Math.round(totals.baselineShort),
  },
  selected: {
    model: 'per_reference_temporal_selection',
    wape: totals.actual ? totals.selectedAbs / totals.actual : null,
    bias: totals.actual ? totals.selectedError / totals.actual : null,
    excessUnits: Math.round(totals.selectedExcess),
    shortageUnits: Math.round(totals.selectedShort),
    modelCounts,
  },
}
console.log(JSON.stringify(result, null, 2))
