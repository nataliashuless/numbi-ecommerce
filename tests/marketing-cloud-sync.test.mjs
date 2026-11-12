import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import XLSX from 'xlsx'
import { timingSafeEqual } from 'node:crypto'
function load(path, extra = {}) {
  const api = {}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: api, Date, Intl, structuredClone, Buffer, ...extra })
  return api
}
const { importMonthlyWorkbook, importAccountingWorkbook, importDesignWorkbook } = load('../lib/marketing/cloud-import.ts', { require: () => XLSX })
const book = sheet => ({ SheetNames: Object.keys(sheet), Sheets: sheet })
const cell = v => ({ v })
test('monthly cloud import reads only closed months and preserves blanks as missing', () => {
  const sheet = { '!ref': 'A1:E40', B4: cell('Usuarios'), B14: cell('Fee mensual agencia'), C2: cell(2026), C3: cell(8), C14: cell(100), C15: cell(0), D2: cell(2026), D3: cell(9), D14: cell(999) }
  const result = importMonthlyWorkbook(book({ Monthly: sheet }), new Date('2026-09-15T12:00:00Z'))
  assert.equal(result['2026-08'].agencyFee, 100)
  assert.equal(result['2026-08'].agencyVariable, 0)
  assert.equal(result['2026-08'].natiFee, undefined)
  assert.equal(result['2026-09'], undefined)
  assert.throws(() => importMonthlyWorkbook(book({ Monthly: { ...sheet, B14: cell('changed') } })), /estructura/)
})
test('accounting import excludes projected tabs and blank future columns; actual explicit zeros remain zero', () => {
  const sheet = { B44: cell('Creacion de contenido digital'), B45: cell('Shopify'), B49: cell('Hostgator'), C4: cell(46023), C44: cell(-123), C45: cell(-10), C49: cell(0), D4: cell(46054) }
  const result = importAccountingWorkbook(book({ 'ER 2026': sheet, 'Ppto ER 2026': { ...sheet, C44: cell(-999) } }), new Date('2026-11-12T12:00:00Z'))
  assert.equal(result['2026-01'].contentFee, 123)
  assert.equal(result['2026-01'].servers, 0)
  assert.equal(result['2026-02'], undefined)
  assert.equal(result['2026-01'].unitCost, undefined)
})
test('design import retains error costs as null and rejects a layout that loses a reviewed design', () => {
  const source = { effectiveFrom: '2026-09-01', sourceUrl: 'fixture', entries: [{ design: 'Silver', category: 'Infantil / Exploradores', unitCost: null }] }
  const sheet = { '!ref': 'A1:M40', K21: cell('Modelo EXPLORADORES'), J22: cell(1), K22: cell('Silver'), L22: cell('#N/A') }
  const result = importDesignWorkbook(book({ 'Costos por Diseño': sheet }), source)
  assert.equal(result.entries[0].unitCost, null)
  assert.equal(result.effectiveFrom, '2026-09-01')
  assert.throws(() => importDesignWorkbook(book({ 'Costos por Diseño': { ...sheet, K22: cell('Other') } }), source), /estructura/)
})
test('cron authentication rejects missing, short, and mismatched secrets', () => {
  const env = {}, { isCronRequest } = load('../lib/cron-auth.ts', { process: { env }, require: () => ({ timingSafeEqual }) })
  const request = value => ({ headers: { get: () => value } })
  assert.equal(isCronRequest(request('Bearer undefined')), false)
  env.CRON_SECRET = 'short'
  assert.equal(isCronRequest(request('Bearer short')), false)
  env.CRON_SECRET = 'a-long-random-secret-fixture'
  assert.equal(isCronRequest(request('Bearer a-long-random-secret-fixture')), true)
  assert.equal(isCronRequest(request('Bearer wrong')), false)
})

test('a CAS retry that sees another running lease skips all provider work', async () => {
  let called = 0
  const active = { _cloudLease: { id: 'other', until: Date.now() + 60000 } }
  const { runMarketingCloudSync } = load('../lib/marketing/cloud-sync.ts', { Request, require(name) {
    if (name === 'node:crypto') return { randomUUID: () => 'fixture-run' }
    if (name.endsWith('/route')) return { POST: async () => { called++; return { ok: true } }, GET: async () => { called++; return { ok: true } } }
    if (name === './cloud-state') return { changeCloudValues: async change => { change({}); change(active) } }
    if (name === './cloud-drive') return { downloadMarketingWorkbooks: async () => { called++ } }
    if (name === './cloud-import') return {}
    throw Error(name)
  } })
  const result = await runMarketingCloudSync(new Request('https://example.test'))
  assert.equal(result.skipped, true)
  assert.equal(called, 0)
})
