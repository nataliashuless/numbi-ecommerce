import { NextResponse } from 'next/server'
import { getAdminClient, requireAuth } from '@/lib/auth-helpers'

const types = new Set(['promocion', 'descuento', 'lanzamiento', 'precio', 'coleccion', 'campana', 'web', 'inventario', 'otro'])
const datePattern = /^\d{4}-\d{2}-\d{2}$/

export async function GET(request: Request) {
  const { error } = await requireAuth()
  if (error) return error
  const { searchParams } = new URL(request.url)
  const start = searchParams.get('start_date')
  const end = searchParams.get('end_date')
  let query = getAdminClient()
    .from('marketing_annotations')
    .select('id, annotation_date, type, title, detail, created_at')
    .order('annotation_date', { ascending: false })
    .limit(500)
  if (start && datePattern.test(start)) query = query.gte('annotation_date', start)
  if (end && datePattern.test(end)) query = query.lte('annotation_date', end)
  const result = await query
  if (result.error) return NextResponse.json({ available: false, items: [], error: result.error.message })
  return NextResponse.json({ available: true, items: result.data || [] })
}

export async function POST(request: Request) {
  const { error } = await requireAuth()
  if (error) return error
  const body = await request.json().catch(() => ({}))
  const date = String(body.annotation_date || '')
  const type = String(body.type || '')
  const title = String(body.title || '').trim()
  const detail = String(body.detail || '').trim()
  if (!datePattern.test(date) || !types.has(type) || !title) {
    return NextResponse.json({ error: 'Fecha, tipo y título son obligatorios.' }, { status: 400 })
  }
  const result = await getAdminClient().from('marketing_annotations').insert({
    annotation_date: date,
    type,
    title: title.slice(0, 200),
    detail: detail ? detail.slice(0, 2000) : null,
  }).select('id, annotation_date, type, title, detail, created_at').single()
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 503 })
  return NextResponse.json({ item: result.data }, { status: 201 })
}

export async function DELETE(request: Request) {
  const { error } = await requireAuth()
  if (error) return error
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id es obligatorio' }, { status: 400 })
  const result = await getAdminClient().from('marketing_annotations').delete().eq('id', id)
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 503 })
  return NextResponse.json({ deleted: true })
}
