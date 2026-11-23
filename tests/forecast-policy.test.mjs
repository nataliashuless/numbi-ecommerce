import test from 'node:test'
import assert from 'node:assert/strict'
import { forecastPolicy, DEFAULT_EXCLUDED_STORES, isFirmSaleProductionOrder } from '../lib/forecast/policy.ts'
import { coverageAtArrival } from '../lib/forecast/demand-model.ts'
import { netCreditInvoices } from '../lib/forecast/net-credits.ts'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

test('Travesuras production is committed to firm sale, ordinary orders remain available', () => {
  for (const numero of ['travesuras', 'OC 33 TRAVESURAS', ' Travesúras ']) {
    assert.equal(isFirmSaleProductionOrder({ numero }), true)
  }
  for (const numero of [null, 'OC 33', 'travesuritas']) {
    assert.equal(isFirmSaleProductionOrder({ numero }), false)
  }
  const orders = [{ numero: 'travesuras', quantity: 152, arrival: '2026-11-29' }, { numero: 'OC34', quantity: 3, arrival: '2026-11-29' }]
  const needs = [{ date: '2027-02-09', quantity: 10 }]
  const coverage = coverageAtArrival(2, orders.filter(o => !isFirmSaleProductionOrder(o)), needs, '2027-02-09', 'nearest')
  assert.equal(coverage.production, 5)
  assert.equal(orders[0].quantity, 152)
})

test('permanent policy keeps monthly 52 business days, 14 day ceiling and firm exclusion', () => {
  const policy = forecastPolicy({ leadTime: 400, reserveDays: 100, excludedStores: ['store'] })
  assert.equal(policy.leadTime, 52)
  assert.equal(policy.reserveDays, 14)
  assert.equal(policy.review, 'monthly')
  assert.deepEqual(policy.excludedStores, ['store', DEFAULT_EXCLUDED_STORES[0]])
})
test('partial credit changes only returned SKU and does not mutate or double apply notes', () => {
  const invoices = [{ id: 'i', name: 'FV-1', total: 300, credited_amount: 0, items: [{ code: 'white22', quantity: 2, total: 200 }, { code: 'white21', quantity: 1, total: 100 }] }]
  const note = { id: 'c', total: 100, date: '2026-11-17', invoice: { id: 'i' }, items: [{ code: 'white22', quantity: 1 }] }
  const net = netCreditInvoices(invoices, [note, note])
  assert.deepEqual(net[0].items.map(i => i.quantity), [1, 1])
  assert.equal(net[0].credited_amount, 100)
  assert.equal(invoices[0].items[0].quantity, 2)
})
test('credit matching uses document name fallback and consumes repeated SKU lines once', () => {
  const net = netCreditInvoices([{ id: 'i', name: 'FV-1', total: 200, credited_amount: 0, items: [{ code: 'A', quantity: 1 }, { code: 'A', quantity: 1 }] }], [{ id: 'c', total: 100, date: '2026-11-17', invoice: { name: 'FV-1' }, items: [{ code: 'A', quantity: 1 }] }])
  assert.equal(net[0].items.reduce((n, i) => n + i.quantity, 0), 1)
})
test('unresolved partial credits cannot silently inflate forecast quantities', () => {
  assert.throws(() => netCreditInvoices([{ id: 'i', total: 200, credited_amount: 100, items: [{ code: 'A', quantity: 2 }] }], []), /sin detalle/)
})
test('settings save in authenticated account; failed writes do not report success', async () => {
  const exports = {}; let updated, fail = false, authorized = true
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../app/api/forecast/settings/route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, require(name) {
    if (name === 'next/server') return { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } }
    if (name === '@/lib/forecast/policy') return { forecastPolicy }
    if (name === '@/lib/auth-helpers') return { requireAuth: async () => authorized ? { user: { id: 'account-1' } } : { error: { status: 401 } }, createApiClient: async () => ({ auth: { updateUser: async (payload) => { updated = { payload }; return { error: fail ? {} : null } } } }) }
    throw new Error(name)
  } })
  const request = { json: async () => ({ excludedStores: ['other'], includeEva: false }) }
  assert.equal((await exports.PATCH(request)).status, 200)
  assert.equal(updated.payload.data.forecastPolicy.leadTime, 52)
  fail = true; assert.equal((await exports.PATCH(request)).status, 503)
  authorized = false; assert.equal((await exports.GET()).status, 401)
})
