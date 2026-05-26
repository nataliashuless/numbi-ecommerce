import { NextResponse } from 'next/server'
import { requireAuth, getAdminClient } from '@/lib/auth-helpers'

// PATCH: set or clear the assigned_feria_id for a specific invoice
// Body: { feria_id: string | null }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error

  const { id } = await params
  const body = await request.json()
  const feriaId = body.feria_id as string | null | undefined

  if (feriaId !== null && typeof feriaId !== 'string') {
    return NextResponse.json({ error: 'feria_id must be a string or null' }, { status: 400 })
  }

  const supabase = getAdminClient()
  const { data, error: upErr } = await supabase
    .from('siigo_invoices')
    .update({ assigned_feria_id: feriaId })
    .eq('id', id)
    .select('id, assigned_feria_id')
    .single()

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  return NextResponse.json({ invoice: data })
}
