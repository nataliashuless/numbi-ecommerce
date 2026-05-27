import { NextResponse } from 'next/server'
import { requireAuth, getAdminClient } from '@/lib/auth-helpers'
import excelNames from './excel-names.json'

// Allow auth either via a logged-in session OR via the service-role bearer
// (so we can trigger this once from a script/curl without a browser login).
async function authorize(request: Request): Promise<NextResponse | null> {
  const bearer = request.headers.get('authorization')
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (bearer && serviceKey && bearer === `Bearer ${serviceKey}`) return null
  const { error } = await requireAuth()
  return error || null
}

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

// Ferias from the historical Excel that may not be in the DB yet.
// Idempotent: only inserts if name doesn't exist.
const EXTRA_FERIAS_SEED: Array<{
  nombre: string
  ubicacion: string | null
  fecha_inicio: string
  fecha_fin: string
  notas: string
}> = [
  {
    nombre: 'Feria Diciembre 2023',
    ubicacion: 'Bogotá',
    fecha_inicio: '2023-12-01',
    fecha_fin: '2023-12-31',
    notas: '218 unidades, $27.4M en Excel ("Ventas Consolidadas"): Vassar 88u/$11.1M + EVA 130u/$16.4M. Ventana ampliada al mes completo porque las fechas exactas del evento no están registradas.',
  },
]

export async function POST(request: Request) {
  const unauth = await authorize(request)
  if (unauth) return unauth

  const supabase = getAdminClient()
  const entries = excelNames as ExcelEntry[]

  // 0) Ensure historical-from-Excel ferias exist (idempotent by name)
  const { data: existingFerias } = await supabase
    .from('ferias')
    .select('nombre')
  const existingNames = new Set(((existingFerias || []) as Array<{ nombre: string }>).map(f => f.nombre))
  const toInsert = EXTRA_FERIAS_SEED.filter(f => !existingNames.has(f.nombre))
  if (toInsert.length > 0) {
    await supabase.from('ferias').insert(toInsert.map(f => ({ ...f, activa: true })))
  }

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

  // ───────────────────────────────────────────────────────────
  // PHASE 2: Fill-to-target by EVA reference + date >= feria.start
  // After name-match, top up each feria using WhatsApp candidates (no tienda,
  // no shopify) whose items match the EVA pattern. An invoice goes to the
  // LATEST feria whose fecha_inicio <= invoice.date (closest preceding feria),
  // capped at the Excel target so we never overshoot.
  // ───────────────────────────────────────────────────────────

  const EXCEL_TARGETS: Record<string, number> = {
    'Feria Diciembre 2023': 218,
    'Feria EVA Mayo 2024': 153,
    'Feria VASSAR Julio 2024': 88,
    'Feria EVA Septiembre 2024': 102,
    'Feria EVA Diciembre 2024': 75,
    'Feria EVA Mayo 2025': 108,
    'Feria EVA Septiembre 2025': 98,
    'Feria EVA Diciembre 2025': 111,
    'Feria EVA Mayo 2026': 164,
  }
  const EVA_PATTERN = /(blanco|elefante|globo|niña|niño|jirafa|espacio|rosa|chocolate)/i

  // Reload ferias (post-seed) with their start dates
  const { data: feriasNow } = await supabase
    .from('ferias')
    .select('id, nombre, fecha_inicio')
  type FN = { id: string; nombre: string; fecha_inicio: string }
  const allFerias = ((feriasNow || []) as FN[])
    .filter(f => EXCEL_TARGETS[f.nombre] !== undefined)
    .sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio))

  // Compute current units already assigned per feria (sum of item quantities)
  const currentUnits = new Map<string, number>()
  for (const f of allFerias) {
    const { data: rows } = await supabase
      .from('siigo_invoices')
      .select('items')
      .eq('assigned_feria_id', f.id)
    let units = 0
    for (const r of (rows || []) as Array<{ items: Array<{ code?: string; quantity?: number }> }>) {
      for (const it of (r.items || [])) {
        if (it.code !== 'ENVIO') units += Number(it.quantity) || 0
      }
    }
    currentUnits.set(f.id, units)
  }

  // Load ALL unassigned candidate invoices from min(feria.start) onwards
  const earliestFeriaStart = allFerias.length > 0 ? allFerias[0].fecha_inicio : '2023-01-01'
  type Cand = {
    id: string
    date: string
    customer_identification: string | null
    observations: string | null
    items: Array<{ code?: string; description?: string; quantity?: number }>
    total: number
    credited_amount: number | null
  }
  const candidates: Cand[] = []
  for (let pageStart = 0; pageStart < 200000; pageStart += 1000) {
    const { data: page } = await supabase
      .from('siigo_invoices')
      .select('id, date, customer_identification, observations, items, total, credited_amount')
      .gte('date', earliestFeriaStart)
      .is('assigned_feria_id', null)
      .order('date', { ascending: true })
      .range(pageStart, pageStart + 999)
    if (!page || page.length === 0) break
    candidates.push(...(page as Cand[]))
    if (page.length < 1000) break
  }

  // Filter candidates: not tienda, not shopify, has EVA item, not credited
  function unitsOfItems(items: Cand['items']): number {
    return (items || [])
      .filter(it => it.code !== 'ENVIO')
      .reduce((s, it) => s + (Number(it.quantity) || 0), 0)
  }
  const eligible = candidates.filter(c => {
    if ((c.credited_amount || 0) >= c.total) return false
    if (c.customer_identification && tiendaNits.has(c.customer_identification)) return false
    if (c.observations && /#\d+/.test(c.observations)) return false
    const hasEva = (c.items || []).some(it => EVA_PATTERN.test(it.description || ''))
    if (!hasEva) return false
    if (unitsOfItems(c.items) === 0) return false
    return true
  })

  // Greedy fill: walk candidates in date asc; for each, assign to LATEST feria
  // whose start <= date AND whose currentUnits < target.
  const phase2Assignments = new Map<string, string[]>() // feria_id -> invoice_ids
  const phase2Stats: Array<{ feria_id: string; feria_name: string; target: number; before: number; added: number; final: number }> = []

  // Pre-compute reverse-sorted ferias for fast "find latest preceding" lookup
  const feriasDesc = [...allFerias].sort((a, b) => b.fecha_inicio.localeCompare(a.fecha_inicio))

  for (const c of eligible) {
    const cUnits = unitsOfItems(c.items)
    // Walk preceding ferias from most-recent backwards. Assign to the first
    // one with room that won't overshoot by more than 5% (or 2 units, whichever
    // is more generous).
    for (const f of feriasDesc) {
      if (f.fecha_inicio > c.date) continue
      const target = EXCEL_TARGETS[f.nombre] || 0
      const have = currentUnits.get(f.id) || 0
      if (have >= target) continue
      if (have + cUnits > target * 1.05 && have + cUnits - target > 2) continue
      currentUnits.set(f.id, have + cUnits)
      const list = phase2Assignments.get(f.id) || []
      list.push(c.id)
      phase2Assignments.set(f.id, list)
      break
    }
  }

  // Apply phase-2 UPDATEs
  for (const f of allFerias) {
    const ids = phase2Assignments.get(f.id) || []
    const target = EXCEL_TARGETS[f.nombre]
    const before = (currentUnits.get(f.id) || 0) - ids.reduce((s, id) => {
      const inv = eligible.find(x => x.id === id)
      return s + (inv ? unitsOfItems(inv.items) : 0)
    }, 0)
    // (before is approx; we just want a number for the report)
    if (ids.length > 0) {
      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500)
        await supabase
          .from('siigo_invoices')
          .update({ assigned_feria_id: f.id })
          .in('id', chunk)
      }
    }
    const final = currentUnits.get(f.id) || 0
    const added = final - before
    phase2Stats.push({
      feria_id: f.id,
      feria_name: f.nombre,
      target,
      before,
      added,
      final,
    })
  }

  const phase2Total = phase2Stats.reduce((s, r) => s + r.final, 0)
  const phase2TargetSum = phase2Stats.reduce((s, r) => s + r.target, 0)

  return NextResponse.json({
    ok: true,
    excelEntriesTotal: entries.length,
    skippedMissingFeria,
    stats,
    perFeria: perFeriaSummary.sort((a, b) => a.feria_name.localeCompare(b.feria_name)),
    fillToTarget: {
      eligibleCandidates: eligible.length,
      perFeria: phase2Stats.sort((a, b) => {
        const fa = allFerias.find(x => x.id === a.feria_id)?.fecha_inicio || ''
        const fb = allFerias.find(x => x.id === b.feria_id)?.fecha_inicio || ''
        return fa.localeCompare(fb)
      }),
      totalUnitsAfter: phase2Total,
      totalTarget: phase2TargetSum,
    },
  })
}
