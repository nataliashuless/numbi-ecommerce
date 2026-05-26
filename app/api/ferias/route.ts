import { NextResponse } from 'next/server'
import { requireAuth, getAdminClient } from '@/lib/auth-helpers'

export async function GET() {
  const { error } = await requireAuth()
  if (error) return error

  const supabase = getAdminClient()
  const { data: ferias, error: qErr } = await supabase
    .from('ferias')
    .select('*')
    .order('fecha_inicio', { ascending: false })
    .range(0, 9999)

  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })

  return NextResponse.json({ ferias: ferias || [] })
}

export async function POST(request: Request) {
  const { error } = await requireAuth()
  if (error) return error

  const supabase = getAdminClient()
  const body = await request.json()

  if (!body.nombre || !body.fecha_inicio || !body.fecha_fin) {
    return NextResponse.json({ error: 'nombre, fecha_inicio y fecha_fin son requeridos' }, { status: 400 })
  }

  const { data, error: insErr } = await supabase
    .from('ferias')
    .insert({
      nombre: body.nombre,
      ubicacion: body.ubicacion || null,
      fecha_inicio: body.fecha_inicio,
      fecha_fin: body.fecha_fin,
      siigo_warehouse_id: body.siigo_warehouse_id || null,
      notas: body.notas || null,
      activa: body.activa !== false,
    })
    .select()
    .single()

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  return NextResponse.json({ feria: data })
}

export async function PATCH(request: Request) {
  const { error } = await requireAuth()
  if (error) return error

  const supabase = getAdminClient()
  const body = await request.json()
  if (!body.id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const ALLOWED = ['nombre', 'ubicacion', 'fecha_inicio', 'fecha_fin', 'siigo_warehouse_id', 'notas', 'activa']
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of ALLOWED) {
    if (key in body) update[key] = body[key]
  }

  const { data, error: upErr } = await supabase
    .from('ferias')
    .update(update)
    .eq('id', body.id)
    .select()
    .single()

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  return NextResponse.json({ feria: data })
}

export async function DELETE(request: Request) {
  const { error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const supabase = getAdminClient()
  const { error: delErr } = await supabase.from('ferias').delete().eq('id', id)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
