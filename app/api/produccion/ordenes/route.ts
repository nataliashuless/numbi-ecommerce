import { NextResponse } from 'next/server'
import { requireAuth, getAdminClient } from '@/lib/auth-helpers'

type ItemInput = { diseno: string; talla?: string | null; cantidad: number }

export async function GET() {
  const { error } = await requireAuth()
  if (error) return error

  const supabase = getAdminClient()
  const { data: orders, error: oErr } = await supabase
    .from('production_orders')
    .select('*')
    .order('fecha_entrega', { ascending: true, nullsFirst: false })
    .range(0, 999)
  if (oErr) return NextResponse.json({ error: oErr.message }, { status: 500 })

  const ids = (orders || []).map((o: { id: string }) => o.id)
  const itemsByOrder: Record<string, ItemInput[]> = {}
  if (ids.length > 0) {
    const { data: items } = await supabase
      .from('production_order_items')
      .select('order_id, diseno, talla, cantidad')
      .in('order_id', ids)
      .range(0, 9999)
    for (const it of (items || []) as Array<{ order_id: string; diseno: string; talla: string | null; cantidad: number }>) {
      if (!itemsByOrder[it.order_id]) itemsByOrder[it.order_id] = []
      itemsByOrder[it.order_id].push({ diseno: it.diseno, talla: it.talla, cantidad: it.cantidad })
    }
  }

  const result = (orders || []).map((o: Record<string, unknown>) => ({
    ...o,
    items: itemsByOrder[o.id as string] || [],
    totalPares: (itemsByOrder[o.id as string] || []).reduce((s, i) => s + (i.cantidad || 0), 0),
  }))

  return NextResponse.json({ ordenes: result })
}

export async function POST(request: Request) {
  const { error } = await requireAuth()
  if (error) return error

  const supabase = getAdminClient()
  const body = await request.json()
  const items: ItemInput[] = Array.isArray(body.items) ? body.items : []

  const { data: order, error: insErr } = await supabase
    .from('production_orders')
    .insert({
      numero: body.numero || null,
      proveedor: body.proveedor || null,
      fecha_creacion: body.fecha_creacion || null,
      fecha_entrega: body.fecha_entrega || null,
      estado: body.estado || 'pendiente',
      notas: body.notas || null,
    })
    .select()
    .single()
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  const cleanItems = items
    .filter(i => i.diseno && Number(i.cantidad) > 0)
    .map(i => ({
      order_id: order.id,
      diseno: String(i.diseno).trim(),
      talla: i.talla != null && String(i.talla).trim() !== '' ? String(i.talla).trim() : null,
      cantidad: Math.round(Number(i.cantidad)),
    }))
  if (cleanItems.length > 0) {
    const { error: itErr } = await supabase.from('production_order_items').insert(cleanItems)
    if (itErr) return NextResponse.json({ error: itErr.message }, { status: 500 })
  }

  return NextResponse.json({ orden: { ...order, items: cleanItems } })
}

export async function PATCH(request: Request) {
  const { error } = await requireAuth()
  if (error) return error

  const supabase = getAdminClient()
  const body = await request.json()
  if (!body.id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const ALLOWED = ['numero', 'proveedor', 'fecha_creacion', 'fecha_entrega', 'estado', 'notas']
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of ALLOWED) if (k in body) update[k] = body[k]

  const { data, error: upErr } = await supabase
    .from('production_orders')
    .update(update)
    .eq('id', body.id)
    .select()
    .single()
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  return NextResponse.json({ orden: data })
}

export async function DELETE(request: Request) {
  const { error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const supabase = getAdminClient()
  const { error: delErr } = await supabase.from('production_orders').delete().eq('id', id)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
