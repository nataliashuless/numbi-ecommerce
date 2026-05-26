import { NextResponse } from 'next/server'
import { requireAuth, getAdminClient } from '@/lib/auth-helpers'
import excelNames from './excel-names.json'

// POST: backfill assigned_feria_id for Siigo invoices that match an Excel
// customer name within the feria's month + next month, are not tienda, not
// shopify-matched, and not already assigned.

interface ExcelEntry {
  feria: string
  name: string  // normalized: lowercase, no diacritics
  start: string // YYYY-MM-DD
  end: string   // YYYY-MM-DD
}

function normalize(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')        // non-alphanumeric -> space
    .replace(/\s+/g, ' ')
    .trim()
}

export const maxDuration = 300

export async function POST() {
  const { error } = await requireAuth()
  if (error) return error

  const supabase = getAdminClient()
  const entries = excelNames as ExcelEntry[]

  // 1) Load ferias to map name -> id
  const { data: ferias, error: fErr } = await supabase
    .from('ferias')
    .select('id, nombre')
  if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 })
  const feriaIdByName = new Map<string, string>()
  for (const f of (ferias || []) as Array<{ id: string; nombre: string }>) {
    feriaIdByName.set(f.nombre, f.id)
  }

  // 2) Compute global date range needed
  const allStarts = entries.map(e => e.start).sort()
  const allEnds = entries.map(e => e.end).sort()
  const minDate = allStarts[0]
  const maxDate = allEnds[allEnds.length - 1]

  // 3) Load all unassigned, non-credited Siigo invoices in date range
  type Invoice = {
    id: string
    date: string
    customer_id: string | null
    customer_identification: string | null
    observations: string | null
    total: number
    credited_amount: number | null
    assigned_feria_id: string | null
  }
  const allInvoices: Invoice[] = []
  const pageSize = 1000
  for (let pageStart = 0; pageStart < 100000; pageStart += pageSize) {
    const { data: page, error: pErr } = await supabase
      .from('siigo_invoices')
      .select('id, date, customer_id, customer_identification, observations, total, credited_amount, assigned_feria_id')
      .gte('date', minDate)
      .lte('date', maxDate)
      .is('assigned_feria_id', null)
      .order('date', { ascending: false })
      .range(pageStart, pageStart + pageSize - 1)
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })
    if (!page || page.length === 0) break
    allInvoices.push(...(page as Invoice[]))
    if (page.length < pageSize) break
  }

  // 4) Load tienda NITs (these invoices are excluded)
  const { data: tiendas } = await supabase
    .from('tiendas_terceros')
    .select('siigo_customer_identification')
    .not('siigo_customer_identification', 'is', null)
  const tiendaNits = new Set<string>()
  for (const t of (tiendas || []) as Array<{ siigo_customer_identification: string }>) {
    tiendaNits.add(t.siigo_customer_identification)
  }

  // 5) Load customer names (chunked)
  const customerIds = Array.from(new Set(allInvoices.map(i => i.customer_id).filter(Boolean) as string[]))
  const namesById = new Map<string, string>()
  const CHUNK = 500
  for (let i = 0; i < customerIds.length; i += CHUNK) {
    const ids = customerIds.slice(i, i + CHUNK)
    const { data: customers } = await supabase
      .from('siigo_customers')
      .select('id, name')
      .in('id', ids)
    for (const row of (customers || []) as Array<{ id: string; name: string }>) {
      if (row.name) namesById.set(row.id, row.name)
    }
  }

  // 6) Build name index: name_norm -> list of {feria_id, start, end}
  const nameIndex = new Map<string, Array<{ feria_id: string; start: string; end: string; feria_name: string }>>()
  let skippedMissingFeria = 0
  for (const entry of entries) {
    const fid = feriaIdByName.get(entry.feria)
    if (!fid) { skippedMissingFeria++; continue }
    const list = nameIndex.get(entry.name) || []
    list.push({ feria_id: fid, start: entry.start, end: entry.end, feria_name: entry.feria })
    nameIndex.set(entry.name, list)
  }

  // 7) Match each eligible invoice
  type Assignment = { invoice_id: string; feria_id: string; feria_name: string; invoice_date: string }
  const assignments: Assignment[] = []
  const SHOPIFY_RE = /#\d+/

  let stats = {
    totalInvoicesInWindow: allInvoices.length,
    skippedTienda: 0,
    skippedShopify: 0,
    skippedNoCustomer: 0,
    skippedNoNameMatch: 0,
    skippedDateOutWindow: 0,
    matched: 0,
  }

  for (const inv of allInvoices) {
    if ((inv.credited_amount || 0) >= inv.total) continue
    if (inv.customer_identification && tiendaNits.has(inv.customer_identification)) {
      stats.skippedTienda++; continue
    }
    if (inv.observations && SHOPIFY_RE.test(inv.observations)) {
      stats.skippedShopify++; continue
    }
    const name = inv.customer_id ? namesById.get(inv.customer_id) : null
    if (!name) { stats.skippedNoCustomer++; continue }
    const nameNorm = normalize(name)
    const candidates = nameIndex.get(nameNorm)
    if (!candidates) { stats.skippedNoNameMatch++; continue }
    // Pick the candidate whose window contains the invoice date
    // (if multiple, take earliest start)
    const match = candidates
      .filter(c => inv.date >= c.start && inv.date <= c.end)
      .sort((a, b) => a.start.localeCompare(b.start))[0]
    if (!match) { stats.skippedDateOutWindow++; continue }
    assignments.push({
      invoice_id: inv.id,
      feria_id: match.feria_id,
      feria_name: match.feria_name,
      invoice_date: inv.date,
    })
    stats.matched++
  }

  // 8) Bulk update — batch UPDATE via individual queries grouped per feria
  // Simpler: do one UPDATE per feria with .in('id', [...])
  const byFeria = new Map<string, string[]>()
  for (const a of assignments) {
    const ids = byFeria.get(a.feria_id) || []
    ids.push(a.invoice_id)
    byFeria.set(a.feria_id, ids)
  }

  const perFeriaSummary: Array<{ feria_id: string; feria_name: string; count: number; error?: string }> = []
  for (const [feriaId, invoiceIds] of byFeria) {
    const feriaName = assignments.find(a => a.feria_id === feriaId)?.feria_name || ''
    // Update in chunks of 500 to keep query size reasonable
    let updated = 0
    let lastError: string | undefined
    for (let i = 0; i < invoiceIds.length; i += 500) {
      const chunk = invoiceIds.slice(i, i + 500)
      const { error: uErr, count } = await supabase
        .from('siigo_invoices')
        .update({ assigned_feria_id: feriaId }, { count: 'exact' })
        .in('id', chunk)
      if (uErr) { lastError = uErr.message; break }
      updated += count || chunk.length
    }
    perFeriaSummary.push({
      feria_id: feriaId,
      feria_name: feriaName,
      count: updated,
      error: lastError,
    })
  }

  return NextResponse.json({
    ok: true,
    excelEntriesTotal: entries.length,
    skippedMissingFeria,
    stats,
    perFeria: perFeriaSummary.sort((a, b) => a.feria_name.localeCompare(b.feria_name)),
  })
}
