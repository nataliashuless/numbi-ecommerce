import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
let responder, calls
const api = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../lib/siigo-client.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: api, Date, URLSearchParams, console, setTimeout, fetch: async (url, options) => {
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
