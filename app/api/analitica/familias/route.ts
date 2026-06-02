import { NextResponse } from 'next/server'
import { requireAuth, getAdminClient } from '@/lib/auth-helpers'

// YTD comparison by product family + design (reference).
// Reads sales from siigo_invoices, parses the item description for the
// reference name, maps it to a family via the hard-coded map below.
//
// Edit FAMILY_MAP to change the family of each design. Unknown designs
// fall into "Otros".

// Each entry maps ANY keyword that may appear in the Siigo description
// (case-insensitive, accent-insensitive) to a canonical design name + family.
// The first pattern that matches wins. If nothing matches → "Otros".
const DESIGN_PATTERNS: Array<{ keyword: string; design: string; family: string }> = [
  // Pequeños Caminantes
  { keyword: 'blanco',    design: 'Blanco',    family: 'Pequeños Caminantes' },
  { keyword: 'rosa',      design: 'Rosa',      family: 'Pequeños Caminantes' },
  { keyword: 'niño',      design: 'Niño',      family: 'Pequeños Caminantes' },
  { keyword: 'nino',      design: 'Niño',      family: 'Pequeños Caminantes' },
  { keyword: 'niña',      design: 'Niña',      family: 'Pequeños Caminantes' },
  { keyword: 'nina',      design: 'Niña',      family: 'Pequeños Caminantes' },
  { keyword: 'chocolate', design: 'Chocolate', family: 'Pequeños Caminantes' },
  // Exploradores
  { keyword: 'elefante',  design: 'Elefante',  family: 'Exploradores' },
  { keyword: 'globo',     design: 'Globo',     family: 'Exploradores' },
  { keyword: 'jirafa',    design: 'Jirafa',    family: 'Exploradores' },
  { keyword: 'espacio',   design: 'Espacio',   family: 'Exploradores' },
  { keyword: 'leo',       design: 'Leo',       family: 'Exploradores' },
]

type Item = { code: string; description: string; quantity: number; price: number; total?: number }
type CachedInvoice = {
  id: string
  date: string
  total: number
  customer_identification: string | null
  observations: string | null
  items: Item[]
  credited_amount: number | null
}

function norm(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseReference(desc: string): string {
  const trimmed = (desc || '').trim()
  let m = trimmed.match(/^(.+?)\s*[-–—]?\s*talla\s+(\d+(?:[.,]\d+)?)$/i)
  if (m) return m[1].trim()
  m = trimmed.match(/^(.+?)\s*[-–—]\s*(\d+(?:[.,]\d+)?)$/)
  if (m) return m[1].trim()
  m = trimmed.match(/^(.+?\D)\s+(\d+(?:[.,]\d+)?)$/)
  if (m) return m[1].trim()
  return trimmed || '—'
}

// Resolve a (description) -> canonical design + family.
// Looks for any of the keywords as a substring in the normalized text.
// Returns null if nothing matched (caller decides how to bucket it).
function resolveDesign(description: string): { design: string; family: string } | null {
  const text = norm(description)
  for (const { keyword, design, family } of DESIGN_PATTERNS) {
    if (text.includes(norm(keyword))) return { design, family }
  }
  return null
}

type Bucket = { unidades: number; monto: number; ordenes: number }

async function loadInvoicesInRange(start: string, end: string): Promise<CachedInvoice[]> {
  const supabase = getAdminClient()
  const out: CachedInvoice[] = []
  const pageSize = 1000
  for (let off = 0; off < 100000; off += pageSize) {
    const { data: page } = await supabase
      .from('siigo_invoices')
      .select('id, date, total, customer_identification, observations, items, credited_amount')
      .gte('date', start)
      .lte('date', end)
      .range(off, off + pageSize - 1)
    if (!page || page.length === 0) break
    for (const row of (page as CachedInvoice[])) {
      if ((row.credited_amount || 0) >= row.total) continue
      out.push(row)
    }
    if (page.length < pageSize) break
  }
  return out
}

function aggregate(invoices: CachedInvoice[]) {
  const byFamily = new Map<string, Bucket>()
  const byDesign = new Map<string, Bucket & { family: string }>()
  // Diagnostic: descriptions that didn't match any keyword, with their qty totals.
  const unmapped = new Map<string, { count: number; unidades: number; monto: number; reference: string }>()

  for (const inv of invoices) {
    for (const it of inv.items || []) {
      if (!it.code || it.code === 'ENVIO') continue
      const qty = Number(it.quantity) || 0
      const amount = Number(it.total ?? (it.quantity * it.price)) || 0

      const resolved = resolveDesign(it.description || '')
      const design = resolved?.design || 'Otros'
      const family = resolved?.family || 'Otros'

      const fb = byFamily.get(family) || { unidades: 0, monto: 0, ordenes: 0 }
      fb.unidades += qty
      fb.monto += amount
      fb.ordenes += 1
      byFamily.set(family, fb)

      const db = byDesign.get(design) || { unidades: 0, monto: 0, ordenes: 0, family }
      db.unidades += qty
      db.monto += amount
      db.ordenes += 1
      byDesign.set(design, db)

      if (!resolved) {
        // Track the raw description (parsed reference) so we can extend the
        // pattern list to cover whatever is leaking through.
        const ref = parseReference(it.description || '')
        const u = unmapped.get(ref) || { count: 0, unidades: 0, monto: 0, reference: ref }
        u.count += 1
        u.unidades += qty
        u.monto += amount
        unmapped.set(ref, u)
      }
    }
  }
  return { byFamily, byDesign, unmapped }
}

export async function GET(request: Request) {
  const { error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(request.url)
  const asOfParam = searchParams.get('as_of')
  const asOf = asOfParam ? new Date(asOfParam + 'T12:00:00') : new Date()

  const year = asOf.getFullYear()
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const thisStart = `${year}-01-01`
  const thisEnd = fmt(asOf)
  const lastStart = `${year - 1}-01-01`
  const lastEnd = `${year - 1}-${String(asOf.getMonth() + 1).padStart(2, '0')}-${String(asOf.getDate()).padStart(2, '0')}`

  try {
    const [thisYear, lastYear] = await Promise.all([
      loadInvoicesInRange(thisStart, thisEnd),
      loadInvoicesInRange(lastStart, lastEnd),
    ])
    const a = aggregate(thisYear)
    const b = aggregate(lastYear)

    // Merge family keys
    const familyKeys = new Set<string>([...a.byFamily.keys(), ...b.byFamily.keys()])
    const families = Array.from(familyKeys).map(key => {
      const cur = a.byFamily.get(key) || { unidades: 0, monto: 0, ordenes: 0 }
      const prev = b.byFamily.get(key) || { unidades: 0, monto: 0, ordenes: 0 }
      return { family: key, current: cur, previous: prev }
    }).sort((x, y) => y.current.monto - x.current.monto)

    const designKeys = new Set<string>([...a.byDesign.keys(), ...b.byDesign.keys()])
    const designs = Array.from(designKeys).map(key => {
      const cur = a.byDesign.get(key)
      const prev = b.byDesign.get(key)
      const family = cur?.family || prev?.family || 'Otros'
      return {
        design: key,
        family,
        current: { unidades: cur?.unidades || 0, monto: cur?.monto || 0, ordenes: cur?.ordenes || 0 },
        previous: { unidades: prev?.unidades || 0, monto: prev?.monto || 0, ordenes: prev?.ordenes || 0 },
      }
    }).sort((x, y) => y.current.monto - x.current.monto)

    // Combine unmapped from both periods so we get a complete view of what
    // descriptions aren't matching any keyword.
    const unmappedMerged = new Map<string, { reference: string; count: number; unidades: number; monto: number }>()
    for (const m of [a.unmapped, b.unmapped]) {
      for (const [ref, vals] of m) {
        const cur = unmappedMerged.get(ref) || { reference: ref, count: 0, unidades: 0, monto: 0 }
        cur.count += vals.count
        cur.unidades += vals.unidades
        cur.monto += vals.monto
        unmappedMerged.set(ref, cur)
      }
    }
    const unmappedExamples = Array.from(unmappedMerged.values())
      .sort((x, y) => y.unidades - x.unidades)
      .slice(0, 40)

    return NextResponse.json({
      asOf: fmt(asOf),
      currentRange: { start: thisStart, end: thisEnd },
      previousRange: { start: lastStart, end: lastEnd },
      families,
      designs,
      patterns: DESIGN_PATTERNS,
      unmappedExamples,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}
