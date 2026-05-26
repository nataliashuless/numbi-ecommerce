import { NextResponse } from 'next/server'
import { requireAuth, getAdminClient } from '@/lib/auth-helpers'

// Item descriptions that strongly suggest "feria EVA" products
const EVA_PATTERN = /(blanco|elefante|globo|niña|niño|jirafa|espacio|rosa|chocolate)/i

// Days before/after a feria to search for candidate invoices
const CANDIDATE_WINDOW_DAYS = 21

type SiigoItem = { code?: string; description?: string; quantity?: number }
type Invoice = {
  id: string
  number: number
  prefix: string
  name: string
  date: string
  total: number
  credited_amount: number | null
  balance: number
  customer_id: string | null
  customer_identification: string | null
  observations: string
  items: SiigoItem[]
  assigned_feria_id: string | null
}

function unitsOf(items: SiigoItem[]): number {
  return (items || [])
    .filter(it => it.code !== 'ENVIO')
    .reduce((sum, it) => sum + (Number(it.quantity) || 0), 0)
}

function hasEvaItem(items: SiigoItem[]): boolean {
  return (items || []).some(it => EVA_PATTERN.test(it.description || ''))
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error

  const { id } = await params
  const supabase = getAdminClient()

  // Load the feria itself
  const { data: feria, error: fErr } = await supabase
    .from('ferias')
    .select('*')
    .eq('id', id)
    .single()
  if (fErr || !feria) return NextResponse.json({ error: 'Feria no encontrada' }, { status: 404 })

  // Window for candidate scanning
  const candidateStart = shiftDate(feria.fecha_inicio, -CANDIDATE_WINDOW_DAYS)
  const candidateEnd = shiftDate(feria.fecha_fin, CANDIDATE_WINDOW_DAYS)

  // Load assigned + candidate invoices in parallel
  // 1) Already-assigned to this feria (any date)
  const { data: assignedRaw } = await supabase
    .from('siigo_invoices')
    .select('id, number, prefix, name, date, total, credited_amount, balance, customer_id, customer_identification, observations, items, assigned_feria_id')
    .eq('assigned_feria_id', id)
    .order('date', { ascending: false })
    .range(0, 999)

  // 2) Window scan for candidates — not assigned to ANY feria, not credited fully
  const allWindowRows: Invoice[] = []
  const pageSize = 1000
  for (let pageStart = 0; pageStart < 5000; pageStart += pageSize) {
    const { data: page } = await supabase
      .from('siigo_invoices')
      .select('id, number, prefix, name, date, total, credited_amount, balance, customer_id, customer_identification, observations, items, assigned_feria_id')
      .gte('date', candidateStart)
      .lte('date', candidateEnd)
      .is('assigned_feria_id', null)
      .order('date', { ascending: false })
      .range(pageStart, pageStart + pageSize - 1)
    if (!page || page.length === 0) break
    allWindowRows.push(...(page as Invoice[]))
    if (page.length < pageSize) break
  }

  // Load tienda NITs to mark which invoices are tienda
  const { data: tiendas } = await supabase
    .from('tiendas_terceros')
    .select('id, nombre, nombre_corto, siigo_customer_identification')
    .not('siigo_customer_identification', 'is', null)
  const tiendaByNit = new Map<string, { id: string; nombre: string }>()
  for (const t of (tiendas || []) as Array<{ id: string; nombre: string; nombre_corto: string | null; siigo_customer_identification: string }>) {
    tiendaByNit.set(t.siigo_customer_identification, { id: t.id, nombre: t.nombre_corto || t.nombre })
  }

  // Load customer names cache to enrich display
  const allInvoices = [...((assignedRaw || []) as Invoice[]), ...allWindowRows]
  const customerIds = Array.from(new Set(allInvoices.map(i => i.customer_id).filter(Boolean) as string[]))
  const namesMap = new Map<string, string>()
  if (customerIds.length > 0) {
    const CHUNK = 500
    for (let i = 0; i < customerIds.length; i += CHUNK) {
      const ids = customerIds.slice(i, i + CHUNK)
      const { data: customers } = await supabase
        .from('siigo_customers')
        .select('id, name')
        .in('id', ids)
      for (const row of (customers || []) as Array<{ id: string; name: string }>) {
        if (row.name) namesMap.set(row.id, row.name)
      }
    }
  }

  function enrich(inv: Invoice) {
    const tiendaMatch = inv.customer_identification ? tiendaByNit.get(inv.customer_identification) : undefined
    const orderNum = (() => {
      const m = (inv.observations || '').match(/#(\d+)/)
      return m ? parseInt(m[1], 10) : null
    })()
    const effectiveTotal = inv.total - (inv.credited_amount || 0)
    return {
      id: inv.id,
      number: inv.number,
      prefix: inv.prefix,
      name: inv.name,
      date: inv.date,
      total: effectiveTotal,
      original_total: inv.total,
      credited_amount: inv.credited_amount || 0,
      units: unitsOf(inv.items),
      customer_id: inv.customer_id,
      customer_identification: inv.customer_identification,
      customer_name: inv.customer_id ? namesMap.get(inv.customer_id) || null : null,
      observations: inv.observations,
      has_eva: hasEvaItem(inv.items),
      tienda_id: tiendaMatch?.id || null,
      tienda_nombre: tiendaMatch?.nombre || null,
      shopify_order_number: orderNum,
      assigned_feria_id: inv.assigned_feria_id,
    }
  }

  // Filter candidates: in feria date window OR contains EVA + within ±21 days
  // Exclude credited, exclude tienda (those clearly aren't feria)
  const candidates = (allWindowRows || [])
    .filter(inv => (inv.credited_amount || 0) < inv.total)
    .map(enrich)
    .filter(c => !c.tienda_id) // tienda invoices are never feria candidates
    .filter(c => {
      const inExactWindow = c.date >= feria.fecha_inicio && c.date <= feria.fecha_fin
      return inExactWindow || c.has_eva
    })

  const assigned = (assignedRaw || [])
    .filter(inv => (inv.credited_amount || 0) < inv.total)
    .map(enrich)

  const assignedTotals = {
    facturas: assigned.length,
    unidades: assigned.reduce((s, i) => s + (i.units || 0), 0),
    monto: assigned.reduce((s, i) => s + (i.total || 0), 0),
  }

  return NextResponse.json({
    feria,
    assigned,
    candidates,
    assignedTotals,
    candidateWindow: { start: candidateStart, end: candidateEnd },
  })
}
