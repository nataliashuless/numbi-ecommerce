import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const compile = path => {
  const api = {}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: api, Date })
  return api
}
const { estimateDesignCosts } = compile('../lib/marketing/design-costs.ts')
const { contributionCosts } = compile('../lib/marketing/contribution.ts')
const source = JSON.parse(fs.readFileSync(new URL('../data/marketing-design-costs-oc32.json', import.meta.url), 'utf8'))
const category = 'Infantil / Exploradores'
const period = { start: '2026-08-01', end: '2026-09-30' }
test('OC32 applies only from September, matches exact category and aliases, and leaves invalid or unknown costs pending', () => {
  const result = estimateDesignCosts([
    { date: '2026-08-31', design: 'Blue', category, units: 4 },
    { date: '2026-09-01', design: 'Blue Felipe', category, units: 2 },
    { date: '2026-09-02', design: 'Silver', category, units: 1 },
    { date: '2026-09-03', design: 'Blue', category: 'Bebé / Pequeños Caminantes', units: 1 },
    { date: '2026-10-01', design: 'White', category, units: 5 },
  ], period, source)
  assert.equal(result.units, 4)
  assert.equal(result.coveredUnits, 2)
  assert.equal(result.knownCost, 2 * 60398.18561)
  assert.equal(result.designs.find(row => row.design === 'Silver').unitCost, null)
  assert.equal(result.designs.find(row => row.category !== category).unitCost, null)
  const fees = { '2026-08': { unitCost: 10 }, '2026-09': { unitCost: 1 } }
  const values = contributionCosts(period, { daily: [{ date: '2026-08-31', units: 4 }, { date: '2026-09-01', units: 4 }] }, fees, result)
  assert.equal(values.shoes, null)
  assert.ok(values.missing.includes('2026-09:unitCost'))
})
test('complete estimated design costs combine with pre-September history and never use a monthly override for September', () => {
  const result = estimateDesignCosts([{ date: '2026-09-01', design: 'White', category, units: 3 }], period, source)
  const values = contributionCosts(period, { daily: [{ date: '2026-08-31', units: 4 }, { date: '2026-09-01', units: 3 }] }, { '2026-08': { unitCost: 10 }, '2026-09': { unitCost: 1 } }, result)
  assert.equal(values.shoes, 40 + 3 * 59735.43511)
  assert.equal(result.coveredUnits, 3)
  const mismatch = contributionCosts(period, { daily: [{ date: '2026-09-01', units: 4 }] }, {}, result)
  assert.equal(mismatch.shoes, null)
})
