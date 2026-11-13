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
const siigoCosts = JSON.parse(fs.readFileSync(new URL('../data/marketing-siigo-monthly-sku-costs.json', import.meta.url), 'utf8'))
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

test('reviewed Siigo SKUs resolve titles only within their verified category; unknown Black and missing actual costs stay pending', () => {
  const rows = [
    { date: '2026-09-10', sku: 'WC-1112', design: 'Tenis para niñas básico: Calzado respetuoso con suela flexible', category: 'Bebé / Pequeños Caminantes', units: 2 },
    { date: '2026-09-11', sku: '181', design: 'Black', category, units: 2 },
    { date: '2026-10-01', sku: '183', design: 'Black', category, units: 1 },
    { date: '2026-10-01', sku: 'different', design: 'Black', category, units: 1 },
    { date: '2026-10-01', sku: '181', design: 'Black', category: 'Bebé / Pequeños Caminantes', units: 1 },
    { date: '2026-10-01', sku: '067', design: 'Silver', category, units: 1 },
  ]
  const result = estimateDesignCosts(rows, { start: '2026-09-01', end: '2026-10-31' }, source)
  assert.equal(result.units, 8)
  assert.equal(result.coveredUnits, 5)
  assert.ok(Math.abs(result.knownCost - (2 * 52328.16 + 3 * 60492.08567)) < 0.000001)
  assert.equal(result.designs.find(row => row.design === 'Silver').unitCost, null)
  assert.equal(result.months[0].coveredUnits, 4)
  assert.equal(result.months[1].coveredUnits, 1)
})

test('monthly Siigo costs complete the fourteen missing pairs by exact SKU, category and month', () => {
  const make = (month, sku, design, units = 1) => ({ date: `${month}-10`, sku, design, units, category: ['059','062'].includes(sku) ? 'Bebé / Pequeños Caminantes' : category })
  const rows = [
    ...['067','068','071','072'].map(sku => make('2026-09', sku, 'Silver')),
    ...['059','062'].map(sku => make('2026-09', sku, 'Plateado')),
    ...['160','161','162'].map(sku => make('2026-09', sku, 'Azul Colegial')),
    make('2026-10','067','Silver'), ...['059','062'].map(sku => make('2026-10',sku,'Plateado')),
    make('2026-10','161','Azul Colegial',2),
  ]
  const result = estimateDesignCosts(rows, { start: '2026-09-01', end: '2026-10-31' }, source, siigoCosts)
  assert.equal(result.units, 14)
  assert.equal(result.coveredUnits, 14)
  assert.equal(result.siigo.units, 14)
  assert.ok(Math.abs(result.months[0].knownCost - 496630.762441) < 0.00001)
  assert.ok(Math.abs(result.months[1].knownCost - 269096.799221) < 0.00001)
  assert.ok(Math.abs(result.siigo.cost - 765727.561662) < 0.00001)
  assert.ok(result.designs.every(row => row.cost !== null && Math.abs(row.unitCost * row.units - row.cost) < 0.00001))
  const values = contributionCosts({ start: '2026-09-01', end: '2026-10-31' }, { daily: [{ date: '2026-09-10', units: 9 }, { date: '2026-10-10', units: 5 }] }, {}, result)
  assert.ok(Math.abs(values.shoes - result.knownCost) < 0.00001)
})

test('verified monthly fallback never replaces valid OC32, fills other months, treats zero as free, or hides partial coverage', () => {
  const range = { start: '2026-09-01', end: '2026-11-30' }
  const row = { date: '2026-09-10', sku: '067', design: 'Silver', category, units: 1 }
  const result = estimateDesignCosts([row, { ...row, date: '2026-11-10' }], range, source, siigoCosts)
  assert.equal(result.coveredUnits, 1)
  assert.equal(result.designs[0].cost, null)
  assert.equal(result.designs[0].unitCost, null)
  const costed = { ...source, entries: [...source.entries, { design: 'Silver', category, unitCost: 60000 }] }
  assert.equal(estimateDesignCosts([row], range, costed, siigoCosts).knownCost, 60000)
  assert.equal(estimateDesignCosts([row], range, costed, siigoCosts).siigo.units, 0)
  const zero = { ...siigoCosts, entries: siigoCosts.entries.map(entry => ({ ...entry, unitCost: 0 })) }
  assert.equal(estimateDesignCosts([row], range, source, zero).coveredUnits, 0)
  assert.equal(estimateDesignCosts([{ ...row, category: 'Bebé / Pequeños Caminantes' }], range, source, siigoCosts).coveredUnits, 0)
  const duplicate = { ...siigoCosts, entries: [...siigoCosts.entries, siigoCosts.entries.find(entry => entry.month === '2026-09' && entry.sku === '067')] }
  assert.equal(estimateDesignCosts([row], range, source, duplicate).coveredUnits, 0)
})
