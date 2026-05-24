import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { listInvoices } from '@/lib/siigo-client'

export async function GET(request: Request) {
  const { error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get('start_date')
  const endDate = searchParams.get('end_date')

  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'start_date y end_date requeridos' }, { status: 400 })
  }

  try {
    const invoices = await listInvoices(startDate, endDate)
    return NextResponse.json({
      invoices,
      total: invoices.length,
      totalAmount: invoices.reduce((sum, i) => sum + i.total, 0),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error obteniendo facturas Siigo'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
