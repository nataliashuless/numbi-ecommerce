import { NextResponse } from 'next/server'
import { requireAuth, getAdminClient, getShopifyCredentials } from '@/lib/auth-helpers'

export const maxDuration = 60

// Pulls every product+variant from Shopify and returns SKU -> product_type map.
// Cached in-process so subsequent invocations don't hit Shopify again until
// the function instance is recycled.
type ShopifyVariant = { sku: string | null }
type ShopifyProduct = { id: number; title: string; product_type: string; vendor: string; tags: string; variants: ShopifyVariant[] }
let shopifyMapCache: { skuToType: Map<string, { productType: string; title: string; vendor: string }>; productTypes: Set<string>; fetchedAt: number } | null = null
const CACHE_TTL_MS = 30 * 60 * 1000 // 30 min

async function loadShopifyMap(): Promise<typeof shopifyMapCache | null> {
  if (shopifyMapCache && Date.now() - shopifyMapCache.fetchedAt < CACHE_TTL_MS) {
    return shopifyMapCache
  }
  const creds = await getShopifyCredentials()
  const shop = creds?.shopify_shop
  const token = creds?.shopify_access_token
  if (!shop || !token) return null

  const skuToType = new Map<string, { productType: string; title: string; vendor: string }>()
  const productTypes = new Set<string>()

  let nextUrl: string | null = `https://${shop}/admin/api/2024-10/products.json?limit=250&fields=id,title,product_type,vendor,tags,variants`
  let pages = 0
  while (nextUrl && pages < 30) {
    pages++
    const res: Response = await fetch(nextUrl, {
      headers: { 'X-Shopify-Access-Token': token },
      cache: 'no-store',
    })
    if (!res.ok) break
    const data = await res.json()
    const products: ShopifyProduct[] = data.products || []
    for (const p of products) {
      const productType = (p.product_type || '').trim()
      if (productType) productTypes.add(productType)
      for (const v of p.variants || []) {
        if (v.sku) {
          skuToType.set(v.sku.trim(), { productType, title: p.title || '', vendor: p.vendor || '' })
        }
      }
    }
    // Parse Link header for the next page cursor
    const link = res.headers.get('link') || ''
    const nextMatch = link.match(/<([^>]+)>;\s*rel="next"/)
    nextUrl = nextMatch ? nextMatch[1] : null
  }

  shopifyMapCache = { skuToType, productTypes, fetchedAt: Date.now() }
  return shopifyMapCache
}

// YTD comparison by product family + design (reference).
// Reads sales from siigo_invoices, parses the item description for the
// reference name, maps it to a family via the hard-coded map below.
//
// Edit FAMILY_MAP to change the family of each design. Unknown designs
// fall into "Otros".

// Real categorization on shuless.co is by SIZE, not by design name:
//   Pequeños Caminantes = Talla 19-22 (collection "bebe")
//   Exploradores        = Talla 23-29 (collection "infantil")
// The same design (e.g. "Blanco") appears in both families depending on size.
const FAMILY_BY_SIZE: Array<{ min: number; max: number; family: string }> = [
  { min: 19, max: 22, family: 'Pequeños Caminantes' },
  { min: 23, max: 29, family: 'Exploradores' },
]

function familyFromSize(size: string | null): string {
  if (!size) return 'Otros'
  const n = parseFloat(size.replace(',', '.'))
  if (isNaN(n)) return 'Otros'
  for (const r of FAMILY_BY_SIZE) {
    if (n >= r.min && n <= r.max) return r.family
  }
  return 'Otros'
}

// Design keywords are still useful to canonicalize the design name from raw
// Siigo descriptions like "EVA Blanco 22", "TENIS BLANCO 22", etc. Family is
// derived from size, not from keyword.
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

// Extract size (integer) from any description. Handles formats like
// "Foo Talla 22", "Foo - 22", "Foo 22", "FooT22".
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

// Find a canonical design name from a description by looking for any
// known design keyword as a substring (case + accent insensitive).
function canonicalDesign(desc: string): string | null {
  const text = norm(desc)
  for (const kw of DESIGN_KEYWORDS) {
    if (text.includes(norm(kw))) return DESIGN_CANONICAL[kw]
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

function aggregate(
  invoices: CachedInvoice[],
  skuMap: Map<string, { productType: string; title: string; vendor: string }> | null,
) {
  const byFamily = new Map<string, Bucket>()
  const byDesign = new Map<string, Bucket & { family: string }>()
  // Diagnostic: items whose size doesn't fall into any family bucket
  // (or has no parseable size at all).
  const unmapped = new Map<string, { count: number; unidades: number; monto: number; reference: string; sku: string; size: string }>()

  for (const inv of invoices) {
    for (const it of inv.items || []) {
      if (!it.code || it.code === 'ENVIO') continue
      const qty = Number(it.quantity) || 0
      const amount = Number(it.total ?? (it.quantity * it.price)) || 0

      // Family is derived from SIZE (which is how shuless.co collections split):
      //   19-22 -> Pequeños Caminantes ; 23-29 -> Exploradores ; else -> Otros
      // Design name comes from a keyword match against the canonical list,
      // falling back to the parsed reference if no keyword matched.
      const shopifyMatch = skuMap?.get((it.code || '').trim())
      const desc = it.description || ''
      const size = extractSize(desc)
      const family = familyFromSize(size)
      const design = canonicalDesign(desc)
        || canonicalDesign(shopifyMatch?.title || '')
        || parseReference(desc)
        || 'Otros'

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

      if (family === 'Otros') {
        const ref = parseReference(desc)
        const key = `${it.code}::${ref}::${size || ''}`
        const u = unmapped.get(key) || { count: 0, unidades: 0, monto: 0, reference: ref, sku: it.code, size: size || '—' }
        u.count += 1
        u.unidades += qty
        u.monto += amount
        unmapped.set(key, u)
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
    const [thisYear, lastYear, shopifyMap] = await Promise.all([
      loadInvoicesInRange(thisStart, thisEnd),
      loadInvoicesInRange(lastStart, lastEnd),
      loadShopifyMap(),
    ])
    const skuMap = shopifyMap?.skuToType || null
    const a = aggregate(thisYear, skuMap)
    const b = aggregate(lastYear, skuMap)

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
      sizeRules: FAMILY_BY_SIZE,
      unmappedExamples,
      shopify: {
        productTypes: shopifyMap ? Array.from(shopifyMap.productTypes).sort() : [],
        skuCount: skuMap ? skuMap.size : 0,
      },
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}
