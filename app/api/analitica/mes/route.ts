import { NextResponse } from 'next/server'
import { requireAuth, getAdminClient } from '@/lib/auth-helpers'

export const maxDuration = 60

// Month-over-month comparison: pick a month (YYYY-MM) and compare it to the
// same month the previous year. Breaks down by channel, family (by size) and
// design, mirroring the classification used on the consolidated dashboard.

type Item = { code: string; description: string; quantity: number; price: number; total?: number }
type CachedInvoice = {
  id: string
  date: string
  total: number
  customer_identification: string | null
  observations: string | null
  items: Item[]
  credited_amount: number | null
  assigned_feria_id: string | null
}

const FAMILY_BY_SIZE: Array<{ min: number; max: number; family: string }> = [
  { min: 19, max: 22, family: 'Pequeños Caminantes' },
  { min: 23, max: 29, family: 'Exploradores' },
]
function familyFromSize(size: string | null): string {
  if (!size) return 'Otros'
  const n = parseFloat(size.replace(',', '.'))
  if (isNaN(n)) return 'Otros'
  for (const r of FAMILY_BY_SIZE) if (n >= r.min && n <= r.max) return r.family
  return 'Otros'
}

const DESIGN_KEYWORDS: string[] = [
  'blanco', 'rosa', 'niño', 'nino', 'niña', 'nina', 'chocolate',
  'elefante', 'globo', 'jirafa', 'espacio', 'leo',
]
const DESIGN_CANONICAL: Record<string, string> = {
  'blanco': 'Blanco', 'rosa': 'Rosa', 'niño': 'Niño', 'nino': 'Niño',
  'niña': 'Niña', 'nina': 'Niña', 'chocolate': 'Chocolate',
  'elefante': 'Elefante', 'globo': 'Globo', 'jirafa': 'Jirafa',
  'espacio': 'Espacio', 'leo': 'Leo',
}
function norm(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
}
function extractSize(desc: string): string | null {
  const t = (desc || '').trim()
  let m = t.match(/talla\s+(\d+(?:[.,]\d+)?)/i)
  if (m) return m[1]
  m = t.match(/[\s\-–—](\d{2})(?:\s|$)/)
  if (m) return m[1]
  m = t.match(/(\d{2})$/)
  if (m) return m[1]
  return null
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
function canonicalDesign(desc: string): string | null {
  const text = norm(desc)
  for (const kw of DESIGN_KEYWORDS) if (text.includes(norm(kw))) return DESIGN_CANONICAL[kw]
  return null
}
function extractOrderNum(obs: string | null): number | null {
  if (!obs) return null
  const m = obs.match(/#(\d+)/)
  return m ? parseInt(m[1], 10) : null
}

type Channel = 'shopify' | 'whatsapp' | 'tiendas' | 'ferias'
type Bucket = { ventas: number; unidades: number; ordenes: number }
function emptyBucket(): Bucket { return { ventas: 0, unidades: 0, ordenes: 0 } }

async function loadInvoicesInRange(start: string, end: string): Promise<CachedInvoice[]> {
  const supabase = getAdminClient()
  const out: CachedInvoice[] = []
  const pageSize = 1000
  for (let off = 0; off < 100000; off += pageSize) {
    const { data: page } = await supabase
      .from('siigo_invoices')
      .select('id, date, total, customer_identification, observations, items, credited_amount, assigned_feria_id')
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

function monthBounds(year: number, month0: number): { start: string; end: string } {
  const start = `${year}-${String(month0 + 1).padStart(2, '0')}-01`
  const lastDay = new Date(year, month0 + 1, 0).getDate()
  const end = `${year}-${String(month0 + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

interface AggResult {
  total: Bucket
  byChannel: Record<Channel, Bucket>
  byFamily: Record<string, Bucket>
  byDesign: Map<string, Bucket & { byFamily: Record<string, Bucket> }>
}

function aggregate(
  invoices: CachedInvoice[],
  tiendaNits: Set<string>,
  shopifyOrderNumbers: Set<number>,
  feriaWindows: Array<{ inicio: string; fin: string }>,
): AggResult {
  const total = emptyBucket()
  const byChannel: Record<Channel, Bucket> = {
    shopify: emptyBucket(), whatsapp: emptyBucket(), tiendas: emptyBucket(), ferias: emptyBucket(),
  }
  const byFamily: Record<string, Bucket> = {}
  const byDesign = new Map<string, Bucket & { byFamily: Record<string, Bucket> }>()

  const isFeriaDate = (date: string) => {
    const d = date.slice(0, 10)
    return feriaWindows.some(f => d >= f.inicio && d <= f.fin)
  }

  for (const inv of invoices) {
    // Channel classification (priority matches the dashboard)
    let channel: Channel
    if (inv.assigned_feria_id) channel = 'ferias'
    else if (inv.customer_identification && tiendaNits.has(inv.customer_identification)) channel = 'tiendas'
    else {
      const on = extractOrderNum(inv.observations)
      if (on && shopifyOrderNumbers.has(on)) channel = 'shopify'
      else if (isFeriaDate(inv.date)) channel = 'ferias'
      else channel = 'whatsapp'
    }

    byChannel[channel].ordenes += 1
    total.ordenes += 1

    for (const it of inv.items || []) {
      if (!it.code || it.code === 'ENVIO') continue
      const qty = Number(it.quantity) || 0
      const amount = Number(it.total ?? (it.quantity * it.price)) || 0
      const size = extractSize(it.description || '')
      const family = familyFromSize(size)
      const design = canonicalDesign(it.description || '') || parseReference(it.description || '') || 'Otros'

      total.ventas += amount
      total.unidades += qty
      byChannel[channel].ventas += amount
      byChannel[channel].unidades += qty

      if (!byFamily[family]) byFamily[family] = emptyBucket()
      byFamily[family].ventas += amount
      byFamily[family].unidades += qty
      byFamily[family].ordenes += 1

      let db = byDesign.get(design)
      if (!db) { db = { ...emptyBucket(), byFamily: {} }; byDesign.set(design, db) }
      db.ventas += amount
      db.unidades += qty
      db.ordenes += 1
      if (!db.byFamily[family]) db.byFamily[family] = emptyBucket()
      db.byFamily[family].ventas += amount
      db.byFamily[family].unidades += qty
      db.byFamily[family].ordenes += 1
    }
  }
  return { total, byChannel, byFamily, byDesign }
}

export async function GET(request: Request) {
  const { error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(request.url)
  const monthParam = searchParams.get('month') // "YYYY-MM"
  const now = new Date()
  let year = now.getFullYear()
  let month0 = now.getMonth()
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split('-').map(Number)
    year = y
    month0 = m - 1
  }

  const cur = monthBounds(year, month0)
  const prev = monthBounds(year - 1, month0)

  try {
    const supabase = getAdminClient()

    // Tienda NITs
    const { data: tiendas } = await supabase
      .from('tiendas_terceros')
      .select('siigo_customer_identification')
      .not('siigo_customer_identification', 'is', null)
    const tiendaNits = new Set<string>(
      (tiendas || []).map((t: { siigo_customer_identification: string }) => t.siigo_customer_identification)
    )

    // Feria windows (active)
    const { data: ferias } = await supabase
      .from('ferias')
      .select('fecha_inicio, fecha_fin, activa')
    const feriaWindows = ((ferias || []) as Array<{ fecha_inicio: string; fecha_fin: string; activa: boolean }>)
      .filter(f => f.activa)
      .map(f => ({ inicio: f.fecha_inicio, fin: f.fecha_fin }))

    // All shopify order numbers (small column) for #order matching
    const shopifyOrderNumbers = new Set<number>()
    const pageSize = 1000
    for (let off = 0; off < 200000; off += pageSize) {
      const { data: page } = await supabase
        .from('shopify_orders')
        .select('order_number')
        .range(off, off + pageSize - 1)
      if (!page || page.length === 0) break
      for (const r of (page as Array<{ order_number: number }>)) {
        if (r.order_number != null) shopifyOrderNumbers.add(r.order_number)
      }
      if (page.length < pageSize) break
    }

    const [curInv, prevInv] = await Promise.all([
      loadInvoicesInRange(cur.start, cur.end),
      loadInvoicesInRange(prev.start, prev.end),
    ])

    const a = aggregate(curInv, tiendaNits, shopifyOrderNumbers, feriaWindows)
    const b = aggregate(prevInv, tiendaNits, shopifyOrderNumbers, feriaWindows)

    // Merge families
    const familyKeys = new Set<string>([...Object.keys(a.byFamily), ...Object.keys(b.byFamily)])
    const families = Array.from(familyKeys).map(k => ({
      family: k,
      current: a.byFamily[k] || emptyBucket(),
      previous: b.byFamily[k] || emptyBucket(),
    })).sort((x, y) => y.current.ventas - x.current.ventas)

    // Merge designs
    const designKeys = new Set<string>([...a.byDesign.keys(), ...b.byDesign.keys()])
    const designs = Array.from(designKeys).map(k => {
      const c = a.byDesign.get(k)
      const p = b.byDesign.get(k)
      return {
        design: k,
        current: {
          ventas: c?.ventas || 0, unidades: c?.unidades || 0, ordenes: c?.ordenes || 0,
          byFamily: c?.byFamily || {},
        },
        previous: {
          ventas: p?.ventas || 0, unidades: p?.unidades || 0, ordenes: p?.ordenes || 0,
          byFamily: p?.byFamily || {},
        },
      }
    }).sort((x, y) => y.current.ventas - x.current.ventas)

    const channels: Channel[] = ['shopify', 'whatsapp', 'tiendas', 'ferias']

    return NextResponse.json({
      currentMonth: `${year}-${String(month0 + 1).padStart(2, '0')}`,
      previousMonth: `${year - 1}-${String(month0 + 1).padStart(2, '0')}`,
      currentRange: cur,
      previousRange: prev,
      total: { current: a.total, previous: b.total },
      byChannel: channels.map(ch => ({
        channel: ch,
        current: a.byChannel[ch],
        previous: b.byChannel[ch],
      })),
      families,
      designs,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}
