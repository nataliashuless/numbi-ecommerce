import { NextResponse } from 'next/server'
import { getAdminClient, requireAuth } from '@/lib/auth-helpers'

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

  if (result.error) {
    return NextResponse.json({ available: false, objectives: {}, error: result.error.message })
  }
  return NextResponse.json({ available: true, objectives: result.data?.objectives || {}, updatedAt: result.data?.updated_at || null })
}

export async function PATCH(request: Request) {
  const { error } = await requireAuth()
  if (error) return error
  const body = await request.json().catch(() => ({}))
  const objectives = sanitizeObjectives(body.objectives)
  const supabase = getAdminClient()
  const result = await supabase.from('marketing_settings').upsert({
    id: 1,
    objectives,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' }).select('objectives, updated_at').single()

  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 503 })
  return NextResponse.json({ available: true, objectives: result.data.objectives, updatedAt: result.data.updated_at })
}
