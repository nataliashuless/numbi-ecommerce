import { NextResponse } from 'next/server'
import { getAdminClient, requireAuth } from '@/lib/auth-helpers'
import { forecastPolicy } from '@/lib/forecast/policy'
export async function GET() {
  const { user, error } = await requireAuth()
  if (error) return error
  return NextResponse.json(forecastPolicy(user?.user_metadata?.forecastPolicy))
}
export async function PATCH(request: Request) {
  const { user, error } = await requireAuth()
  if (error) return error
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => null)
  if (!body || !Array.isArray(body.excludedStores) || body.excludedStores.some((id: unknown) => typeof id !== 'string') || typeof body.includeEva !== 'boolean')
    return NextResponse.json({ error: 'Preferencias inválidas' }, { status: 400 })
  const policy = forecastPolicy(body)
  const result = await getAdminClient().auth.admin.updateUserById(user.id, { user_metadata: { forecastPolicy: policy } })
  if (result.error) return NextResponse.json({ error: 'No se pudieron guardar las preferencias en la cuenta' }, { status: 503 })
  return NextResponse.json(policy)
}
