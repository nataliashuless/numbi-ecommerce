import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { businessDateBogota, buildForecastPeriods, nextMonthlyOrder } from '../lib/forecast/calendar.ts'

const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

test('Bogota date changes at Colombian midnight, not UTC midnight', () => {
  assert.equal(dateKey(businessDateBogota(new Date('2026-10-01T04:59:59Z'))), '2026-09-30')
  assert.equal(dateKey(businessDateBogota(new Date('2026-10-01T05:00:00Z'))), '2026-10-01')
  assert.equal(businessDateBogota(new Date('2026-10-01T01:00:00Z')).getHours(), 12)
})

test('monthly order clamps month ends including leap February', () => {
  assert.equal(dateKey(nextMonthlyOrder(new Date(2026, 0, 31, 12))), '2026-02-28')
  assert.equal(dateKey(nextMonthlyOrder(new Date(2028, 0, 31, 12))), '2028-02-29')
  assert.equal(dateKey(nextMonthlyOrder(new Date(2026, 11, 20, 12))), '2027-01-20')
})

test('monthly horizon prorates the first and last months', () => {
  const { periods, planningEnd } = buildForecastPeriods(new Date(2026, 10, 20, 12), new Date(2027, 2, 4, 12))
  assert.equal(dateKey(planningEnd), '2027-03-04')
  assert.deepEqual(periods.map(p => p.month), ['2026-11', '2026-12', '2027-01', '2027-02', '2027-03'])
  assert.deepEqual(periods.map(p => p.fraction), [11 / 30, 1, 1, 1, 4 / 31])
  assert.equal(dateKey(periods.at(-1).demandDate), '2027-03-04')
  assert.equal(periods[0].futureIndex, null)
  assert.equal(periods[1].futureIndex, 0)
})

test('UTC deployment and Bogota workstation produce identical business dates and periods', () => {
  const moduleUrl = new URL('../lib/forecast/calendar.ts', import.meta.url).href
  const script = `import { businessDateBogota, buildForecastPeriods, nextMonthlyOrder } from ${JSON.stringify(moduleUrl)};
    console.log(JSON.stringify(['2026-10-01T01:00:00Z', '2027-02-01T04:59:59Z', '2026-12-10T20:00:00Z'].map(value => {
      const date = businessDateBogota(new Date(value));
      const result = buildForecastPeriods(date, nextMonthlyOrder(date));
      return { day: date.toISOString().slice(0, 10), months: result.periods.map(p => p.month), end: result.planningEnd.toISOString().slice(0, 10) };
    })));`
  const run = timeZone => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, TZ: timeZone }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }))
  assert.deepEqual(run('UTC'), run('America/Bogota'))
})
