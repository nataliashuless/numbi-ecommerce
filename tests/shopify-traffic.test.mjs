import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
let payload, calls = 0
const route = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../app/api/shopify/analytics-ql/route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  exports: route, Date, URL, AbortSignal,
  fetch: async (url, options) => { calls++; assert.match(url, /2026-10\/graphql.json$/); assert.match(JSON.parse(options.body).variables.q, /SINCE 2026-08-01 UNTIL 2026-08-31$/); return { ok: true, json: async () => payload } },
  require(name) {
    if (name === 'next/server') return { NextResponse: { json: (body, options) => ({ ...body, status: options?.status ?? 200 }) } }
    if (name === '@/lib/auth-helpers') return { requireAuth: async () => ({}), getShopifyCredentials: async () => ({ shopify_shop: 'shuless.myshopify.com', shopify_access_token: 'fixture' }) }
    throw Error(name)
  },
})
test('native Shopify traffic preserves the session conversion denominator and missing values', async () => {
  payload = { data: { shopifyqlQuery: { parseErrors: [], tableData: { columns: [], rows: [{ sessions: '6725', online_store_visitors: '4214', sessions_that_completed_checkout: '115', conversion_rate: '0.017100371747211896' }] } } } }
  const result = await route.GET({ url: 'https://example.test?start_date=2026-08-01&end_date=2026-08-31' })
  assert.equal(result.source, 'shopify')
  assert.equal(result.totals.totalUsers, 4214)
  assert.equal(result.totals.sessions, 6725)
  assert.equal(result.totals.conversionRate, 115 / 6725)
  assert.equal(result.totals.addToCarts, null)
  payload = { errors: [{ message: 'secret diagnostic must not leak' }] }
  const denied = await route.GET({ url: 'https://example.test?start_date=2026-08-01&end_date=2026-08-31' })
  assert.equal(denied.available, false)
  assert.ok(!JSON.stringify(denied).includes('secret'))
  const before = calls
  const invalid = await route.GET({ url: 'https://example.test?start_date=2026-02-31&end_date=2026-08-31' })
  assert.equal(invalid.status, 400)
  assert.equal(calls, before)
})
