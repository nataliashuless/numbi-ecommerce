import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
let responder, calls
const api = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../lib/siigo-client.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: api, Date, URL, URLSearchParams, console, setTimeout, fetch: async (url, options) => {
  if (String(url).includes('sign-in')) return { ok: true, json: async () => ({ access_token: 'fixture-token' }) }
  calls.push(new URL(url))
  return responder(new URL(url), options)
}, require(name) {
  if (name === './auth-helpers') return { getSiigoCredentials: async () => ({ siigo_username: 'fixture', siigo_access_key: 'fixture' }) }
  throw new Error(name)
} })
test('Siigo reconciliation reads accounting dates across pages and rejects partial totals on a failed page', async () => {
  calls = []
  responder = async url => ({ ok: true, json: async () => ({ pagination: { total_results: 101 }, results: url.searchParams.get('page') === '1' ? Array.from({ length: 100 }, (_, id) => ({ id: String(id), name: `FV-${id}`, date: '2025-08-01', total: 119 })) : [{ id: 'late', name: 'FV-LATE', date: '2025-09-01', total: 119 }] }) })
  const invoices = await api.listAccountingDocuments('invoices','2025-01-01','2025-08-31')
  assert.equal(invoices.length, 100)
  assert.equal(calls.length, 2)
  assert.equal(calls[0].searchParams.get('date_start'), '2025-01-01')
  assert.equal(calls[0].searchParams.get('created_start'), null)
  responder = async url => url.searchParams.get('page') === '1' ? { ok: true, json: async () => ({ pagination: { total_results: 101 }, results: Array.from({ length: 100 }, (_, id) => ({ id: String(id), name: `NC-${id}`, date: '2026-08-01', total: 119 })) }) } : { ok: false, status: 500 }
  await assert.rejects(api.listAccountingDocuments('credit-notes','2026-01-01','2026-08-31'), /no se emite un total parcial/)
})

test('income journals paginate by accounting date and reject truncated page metadata', async () => {
  calls = []
  responder = async url => ({ ok: true, json: async () => ({ pagination: { total_results: 2 }, results: url.searchParams.get('page') === '1' ? [{ id: 'journal', name: 'CC-1', date: '2025-08-01', items: [] }] : [] }) })
  await assert.rejects(api.listAccountingJournals('2025-01-01','2025-08-31'), /incompleta/)
  assert.equal(calls[0].pathname, '/v1/journals')
  assert.equal(calls[0].searchParams.get('date_start'), '2025-01-01')
})

test('trial balance remains a report request and never downloads from an unverified host', async () => {
  calls = []
  let reportBody
  responder = async (url, options) => { reportBody = JSON.parse(options.body); return { ok: true, json: async () => ({ file_url: 'https://example.test/private-report.xlsx' }) } }
  await assert.rejects(api.readSalesTrialBalance2025(1,8), /verificar el proveedor/)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].pathname, '/v1/test-balance-report')
  assert.equal(reportBody.year, 2025)
  assert.equal(reportBody.month_end, 8)
  assert.equal(reportBody.account_start, '41350101')
  await assert.rejects(api.readSalesTrialBalance2025(8,1), /inválido/)
})

test('Siigo range includes the entire final day while discarding documents from the overlap day', async () => {
  calls = []
  responder = async url => ({ ok: true, json: async () => ({ pagination: { total_results: 3 }, results: [{ id: 'before', date: '2025-08-30' }, { id: 'end', date: '2025-08-31' }, { id: 'overlap', date: '2025-09-01' }] }) })
  const documents = await api.listAccountingDocuments('invoices','2025-08-01','2025-08-31')
  assert.equal(documents.length, 2)
  assert.equal(documents[1].id, 'end')
  assert.equal(calls[0].searchParams.get('date_end'), '2025-09-01T23:59:59Z')
  assert.equal(calls[0].searchParams.get('created_end'), null)
})
