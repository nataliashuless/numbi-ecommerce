import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
let row, conflict
const db = { from() {
  let update, timestamp
  const query = {
    select() { return query },
    eq(key, value) { if (key === 'updated_at') timestamp = value; return query },
    update(value) { update = value; return query },
    insert(value) { update = value; return query },
    async maybeSingle() {
      if (!update) return { data: structuredClone(row), error: null }
      if (conflict) {
        conflict = false
        row = { ...row, objectives: { ...row.objectives, merMin: 8 }, updated_at: '2030-01-01T00:00:00.000Z' }
      }
      if (timestamp !== row.updated_at) return { data: null, error: null }
      row = structuredClone(update)
      return { data: structuredClone(row), error: null }
    },
    async single() { return query.maybeSingle() },
  }
  return query
} }
const route = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../app/api/marketing/settings/route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: route, Date, structuredClone, require(name) {
  if (name === 'next/server') return { NextResponse: { json: (body, options) => ({ ...body, status: options?.status ?? 200 }) } }
  if (name === '@/lib/marketing/cloud-state') return { cloudMonthlyCosts: () => ({}) }
  if (name === '@/lib/marketing/reviewed-billing') return { reviewedBillingCosts: costs => costs }
  if (name === '@/lib/auth-helpers') return { requireAuth: async () => ({}), getAdminClient: () => db }
  if (name === '@/data/marketing-monthly-costs.json') return { default: { costs: {}, sourceUrl: 'fixture' } }
  if (name === '@/lib/marketing/contribution') return { COST_FIELDS: ['agencyFee','agencyVariable','natiFee','servers','unitCost'] }
  throw new Error(name)
} })
test('monthly cost edits retry conflicts and preserve goals, while goal edits preserve monthly costs', async () => {
  row = { objectives: { merMin: 2, 'monthlyCost:2026-08:servers': 35100 }, updated_at: '2026-01-01T00:00:00.000Z' }
  conflict = true
  const result = await route.PATCH({ json: async () => ({ costs: { '2026-08': { agencyFee: 1206375 } } }) })
  assert.equal(result.status, 200)
  assert.equal(row.objectives.merMin, 8)
  assert.equal(row.objectives['monthlyCost:2026-08:servers'], 35100)
  assert.equal(row.objectives['monthlyCost:2026-08:agencyFee'], 1206375)
  const goals = await route.PATCH({ json: async () => ({ objectives: { roasMin: 3 } }) })
  assert.equal(goals.status, 200)
  assert.equal(row.objectives['monthlyCost:2026-08:agencyFee'], 1206375)
  assert.equal(row.objectives.roasMin, 3)
  const before = JSON.stringify(row)
  const invalid = await route.PATCH({ json: async () => ({ costs: { '2026-08': { unitCost: -1 } } }) })
  assert.equal(invalid.status, 400)
  assert.equal(JSON.stringify(row), before)
})
