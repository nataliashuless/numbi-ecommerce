import { NextResponse } from 'next/server'
import { requireAuth, getAdminClient } from '@/lib/auth-helpers'

export async function GET() {
  const { error } = await requireAuth()
  if (error) return error

  const supabase = getAdminClient()
  const { data, error: qErr } = await supabase
    .from('siigo_warehouses')
    .select('id, name, active')
    .order('name')
    .range(0, 999)

  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })
  return NextResponse.json({ warehouses: data || [] })
}
