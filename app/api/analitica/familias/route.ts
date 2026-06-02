import { NextResponse } from 'next/server'
import { requireAuth, getAdminClient } from '@/lib/auth-helpers'

// YTD comparison by product family + design (reference).
// Reads sales from siigo_invoices, parses the item description for the
// reference name, maps it to a family via the hard-coded map below.
//
// Edit FAMILY_MAP to change the family of each design. Unknown designs
// fall into "Otros".

const FAMILY_MAP: Record<string, string> = {
  // Pequeños Caminantes (basics / first walkers)
  'Blanco': 'Pequeños Caminantes',
  'Rosa': 'Pequeños Caminantes',
  'Niño': 'Pequeños Caminantes',
  'Niña': 'Pequeños Caminantes',
  'Chocolate': 'Pequeños Caminantes',
  // Exploradores (animal / adventure designs)
  'Elefante': 'Exploradores',
  'Globo': 'Exploradores',
  'Jirafa': 'Exploradores',
  'Espacio': 'Exploradores',
  'Leo': 'Exploradores',
}

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

function familyOf(reference: string): string {
  const refNorm = norm(reference)
  for (const [design, family] of Object.entries(FAMILY_MAP)) {
    if (norm(design) === refNorm) return family
  }
  return 'Otros'
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

  for (const inv of invoices) {
    for (const it of inv.items || []) {
      if (!it.code || it.code === 'ENVIO') continue
      const reference = parseReference(it.description || '')
      const family = familyOf(reference)
      const qty = Number(it.quantity) || 0
      const amount = Number(it.total ?? (it.quantity * it.price)) || 0

      const fb = byFamily.get(family) || { unidades: 0, monto: 0, ordenes: 0 }
      fb.unidades += qty
      fb.monto += amount
      fb.ordenes += 1
      byFamily.set(family, fb)

      const db = byDesign.get(reference) || { unidades: 0, monto: 0, ordenes: 0, family }
      db.unidades += qty
      db.monto += amount
      db.ordenes += 1
      byDesign.set(reference, db)
    }
  }
  return { byFamily, byDesign }
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
      const cur = a.byDesign.get(key) || { unidades: 0, monto: 0, ordenes: 0, family: familyOf(key) }
      const prev = b.byDesign.get(key) || { unidades: 0, monto: 0, ordenes: 0, family: familyOf(key) }
      return {
        design: key,
        family: cur.family || prev.family || familyOf(key),
        current: { unidades: cur.unidades, monto: cur.monto, ordenes: cur.ordenes },
        previous: { unidades: prev.unidades, monto: prev.monto, ordenes: prev.ordenes },
      }
    }).sort((x, y) => y.current.monto - x.current.monto)

    return NextResponse.json({
      asOf: fmt(asOf),
      currentRange: { start: thisStart, end: thisEnd },
      previousRange: { start: lastStart, end: lastEnd },
      families,
      designs,
      familyMap: FAMILY_MAP,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}
