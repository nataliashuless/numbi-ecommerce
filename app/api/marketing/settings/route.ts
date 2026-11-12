import { cloudMonthlyCosts } from '@/lib/marketing/cloud-state'
import { NextResponse } from 'next/server'
import { getAdminClient, requireAuth } from '@/lib/auth-helpers'
import importedCosts from '@/data/marketing-monthly-costs.json'
import { COST_FIELDS, type MonthlyCosts } from '@/lib/marketing/contribution'

const allowedObjectiveKeys = new Set([
  'merMin',
  'roasMin',
  'cpaMax',
  'cacMax',
  'conversionMin',
  'aovMin',
  'marketingPctMax',
  'minOrdersForDecision',
  'stockCriticalUnits',
  'stockExcessUnits',
  'spendWithoutPurchaseReview',
  'growthGapAlertPct',
  'warningTolerancePct',
])

const costKey = /^monthlyCost:(\d{4}-(?:0[1-9]|1[0-2])):(agencyFee|agencyVariable|natiFee|servers|unitCost|contentFee|platformFee)$/

function monthlyCosts(values: Record<string, unknown>): MonthlyCosts {
  const costs: MonthlyCosts = cloudMonthlyCosts(values)
  for (const [key, value] of Object.entries(values)) {
    const match = key.match(costKey)
    if (!match || typeof value !== 'number' || value < 0 || !Number.isFinite(value)) continue
    const field = match[2] as typeof COST_FIELDS[number]
    costs[match[1]] = { ...costs[match[1]], [field]: value }
  }
  return costs
}

function sanitizeObjectives(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const result: Record<string, number> = {}
  for (const [key, raw] of Object.entries(value)) {
    if (!allowedObjectiveKeys.has(key)) continue
    const number = Number(raw)
    if (Number.isFinite(number) && number >= 0) result[key] = number
  }
  return result
}

export async function GET() {
  const { error } = await requireAuth()
  if (error) return error
  const supabase = getAdminClient()
  const result = await supabase
    .from('marketing_settings')
    .select('objectives, updated_at')
    .eq('id', 1)
    .maybeSingle()

  if (result.error) return NextResponse.json({ available: false, objectives: {}, costs: importedCosts.costs, error: result.error.message })
  const values = result.data?.objectives || {}
  return NextResponse.json({ available: true, objectives: sanitizeObjectives(values), costs: monthlyCosts(values), costSource: importedCosts.sourceUrl, updatedAt: result.data?.updated_at || null })
}

export async function PATCH(request: Request) {
  const { error } = await requireAuth()
  if (error) return error
  const body = await request.json().catch(() => ({}))
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Configuración inválida' }, { status: 400 })
  const hasObjectives = Object.prototype.hasOwnProperty.call(body, 'objectives')
  const hasCosts = Object.prototype.hasOwnProperty.call(body, 'costs')
  if (!hasObjectives && !hasCosts) return NextResponse.json({ error: 'No hay cambios para guardar' }, { status: 400 })
  const costUpdates: Record<string, number | null> = {}
  if (hasCosts) {
    if (!body.costs || typeof body.costs !== 'object' || Array.isArray(body.costs)) return NextResponse.json({ error: 'Costos inválidos' }, { status: 400 })
    for (const [month, values] of Object.entries(body.costs)) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !values || typeof values !== 'object' || Array.isArray(values)) return NextResponse.json({ error: 'Mes de costos inválido' }, { status: 400 })
      for (const [field, value] of Object.entries(values)) {
        if (!COST_FIELDS.includes(field as typeof COST_FIELDS[number]) || value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) return NextResponse.json({ error: 'Los costos deben ser importes positivos o cero' }, { status: 400 })
        costUpdates[`monthlyCost:${month}:${field}`] = value as number | null
      }
    }
  }
  const supabase = getAdminClient()
  // Compare-and-swap preserves simultaneous edits to goals and monthly costs.
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await supabase.from('marketing_settings').select('objectives, updated_at').eq('id', 1).maybeSingle()
    if (current.error) return NextResponse.json({ error: current.error.message }, { status: 503 })
    const merged: Record<string, unknown> = { ...(current.data?.objectives || {}) }
    if (hasObjectives) {
      for (const key of allowedObjectiveKeys) delete merged[key]
      Object.assign(merged, sanitizeObjectives(body.objectives))
    }
    for (const [key, value] of Object.entries(costUpdates)) {
      if (value === null) delete merged[key]
      else merged[key] = value
    }
    const previousTime = Date.parse(current.data?.updated_at || '') || 0
    const updatedAt = new Date(Math.max(Date.now(), previousTime + 1)).toISOString()
    const row = { id: 1, objectives: merged, updated_at: updatedAt }
    const result = current.data
      ? await supabase.from('marketing_settings').update(row).eq('id', 1).eq('updated_at', current.data.updated_at).select('objectives, updated_at').maybeSingle()
      : await supabase.from('marketing_settings').insert(row).select('objectives, updated_at').single()
    if (result.error?.code === '23505') continue
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 503 })
    if (!result.data) continue
    return NextResponse.json({ available: true, objectives: sanitizeObjectives(result.data.objectives), costs: monthlyCosts(result.data.objectives), updatedAt: result.data.updated_at })
  }
  return NextResponse.json({ error: 'Otro cambio se guardó al mismo tiempo. Vuelve a guardar.' }, { status: 409 })
}
