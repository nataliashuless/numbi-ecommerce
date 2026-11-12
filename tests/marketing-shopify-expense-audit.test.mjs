import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
let authError, failed, calls
const route = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../app/api/marketing/shopify-expenses/route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: route, URL, require(name) {
  if (name === 'next/server') return { NextResponse: { json: body => body } }
  if (name === '@/lib/auth-helpers') return { requireAuth: async () => ({ error: authError }) }
  if (name === '@/lib/siigo-client') return {
    listExpenseDocuments: async kind => { calls++; if (failed) throw new Error('Incomplete read'); return [{ id: kind, date: '2026-09-01', name: 'DS-1', items: [{ code: '52356005', price: 100 }, { code: 'other', description: 'private unrelated line' }] }] },
    listAccountingJournals: async () => { calls++; return [{ id: 'reversal', date: '2026-09-07', items: [{ account: { code: '52356005', movement: 'Credit' }, value: 145275 }, { account: { code: '21051001', movement: 'Debit' }, description: 'Shopify', value: 145275 }] }] },
  }
  throw new Error(name)
} })
test('expense audit requires authentication, minimizes unrelated lines, preserves reversals, and flags failed sources', async () => {
  calls = 0; authError = { status: 401 }; failed = false
  assert.equal(await route.GET(), authError)
  assert.equal(calls, 0)
  authError = undefined
  const result = await route.GET()
  assert.equal(result.complete, true)
  assert.equal(result.documents[0].items.length, 1)
  assert.equal(result.documents[2].items.length, 1)
  assert.equal(result.documents[2].items[0].account.movement, 'Credit')
  failed = true
  assert.equal((await route.GET()).complete, false)
})

test('content audit selects its own account and rejects arbitrary categories', async () => {
  authError = undefined; failed = false; calls = 0
  const result = await route.GET({ url: 'https://example.test/api/marketing/shopify-expenses?category=content' })
  assert.equal(result.account, '52356004')
  assert.equal(result.complete, true)
  assert.equal(result.documents.length, 0)
  calls = 0
  assert.equal((await route.GET({ url: 'https://example.test/api/marketing/shopify-expenses?category=other' })).error, 'Categoría inválida')
  assert.equal(calls, 0)
})
