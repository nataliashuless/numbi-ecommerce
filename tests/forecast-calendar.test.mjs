import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { businessDateBogota, buildSchoolSeasonPeriods } from '../lib/forecast/calendar.ts'

const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

test('Bogota date changes at Colombian midnight, not UTC midnight', () => {
  assert.equal(dateKey(businessDateBogota(new Date('2026-10-01T04:59:59Z'))), '2026-09-30')
  assert.equal(dateKey(businessDateBogota(new Date('2026-10-01T05:00:00Z'))), '2026-10-01')
  assert.equal(businessDateBogota(new Date('2026-10-01T01:00:00Z')).getHours(), 12)
})

test('January 31 remains in this school season through the entire Colombian day', () => {
  for (const instant of ['2027-01-31T05:00:00Z', '2027-01-31T18:00:00Z', '2027-02-01T04:59:59Z']) {
    const { periods, planningEnd } = buildSchoolSeasonPeriods(businessDateBogota(new Date(instant)))
    assert.equal(dateKey(planningEnd), '2027-01-31')
    assert.deepEqual(periods.map(period => period.month), ['2027-01'])
    assert.equal(periods[0].fraction, 1 / 31)
  }
  const nextSeason = buildSchoolSeasonPeriods(businessDateBogota(new Date('2027-02-01T05:00:00Z')))
  assert.equal(dateKey(nextSeason.planningEnd), '2028-01-31')
  assert.equal(nextSeason.periods.length, 12)
  const lateCivilDate = buildSchoolSeasonPeriods(new Date(2027, 0, 31, 23, 59))
  assert.equal(dateKey(lateCivilDate.planningEnd), '2027-01-31')
})

test('December 10 covers the remaining December days and the following January', () => {
  const { periods, planningEnd } = buildSchoolSeasonPeriods(businessDateBogota(new Date('2026-12-10T20:00:00Z')))
  assert.equal(dateKey(planningEnd), '2027-01-31')
  assert.deepEqual(periods.map(period => period.month), ['2026-12', '2027-01'])
  assert.equal(periods[0].fraction, 22 / 31)
  assert.equal(periods[0].futureIndex, null)
  assert.equal(periods[1].futureIndex, 0)
  assert.equal(periods[1].fraction, 1)
})

test('every calendar month has a contiguous horizon ending in January', () => {
  for (let month = 0; month < 12; month++) {
    const start = new Date(2026, month, 10, 12)
    const { periods, planningEnd } = buildSchoolSeasonPeriods(start)
    assert.equal(periods.length, month === 0 ? 1 : 13 - month)
    assert.equal(dateKey(planningEnd), month === 0 ? '2026-01-31' : '2027-01-31')
    assert.equal(new Set(periods.map(period => period.month)).size, periods.length)
    assert.equal(periods.at(-1).month.slice(-2), '01')
  }
})

test('UTC deployment and Bogota workstation produce identical business dates and periods', () => {
  const moduleUrl = new URL('../lib/forecast/calendar.ts', import.meta.url).href
  const script = `import { businessDateBogota, buildSchoolSeasonPeriods } from ${JSON.stringify(moduleUrl)};
    console.log(JSON.stringify(['2026-10-01T01:00:00Z', '2027-02-01T04:59:59Z', '2026-12-10T20:00:00Z'].map(value => {
      const date = businessDateBogota(new Date(value));
      const result = buildSchoolSeasonPeriods(date);
      return { day: date.toISOString().slice(0, 10), months: result.periods.map(p => p.month), end: result.planningEnd.toISOString().slice(0, 10) };
    })));`
  const run = timeZone => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, TZ: timeZone }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }))
  assert.deepEqual(run('UTC'), run('America/Bogota'))
})
