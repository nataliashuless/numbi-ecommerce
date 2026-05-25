import { NextResponse } from 'next/server'
import { requireAuth, getAdminClient } from '@/lib/auth-helpers'

interface Item {
  code: string
  description: string
  quantity: number
  price: number
  total?: number
}

interface CachedInvoice {
  id: string
  date: string
  total: number
  customer_identification: string | null
  observations: string | null
  items: Item[]
  credited_amount: number | null
}

function extractOrderNumber(observations: string | null): number | null {
  if (!observations) return null
  const match = observations.match(/#(\d+)/)
  return match ? parseInt(match[1], 10) : null
}

// Heuristics to split "Producto - Talla N" / "Producto Talla N" / "Producto 35"
function parseProductName(desc: string): { reference: string; size: string | null } {
  const trimmed = (desc || '').trim()
  // "Foo Talla 35" or "Foo - Talla 35"
  let m = trimmed.match(/^(.+?)\s*[-–—]?\s*talla\s+(\d+(?:[.,]\d+)?)$/i)
  if (m) return { reference: m[1].trim(), size: m[2] }
  // "Foo - 35" or "Foo — 35"
  m = trimmed.match(/^(.+?)\s*[-–—]\s*(\d+(?:[.,]\d+)?)$/)
  if (m) return { reference: m[1].trim(), size: m[2] }
  // "Foo 35" (trailing number, only when reference has letters)
  m = trimmed.match(/^(.+?\D)\s+(\d+(?:[.,]\d+)?)$/)
  if (m) return { reference: m[1].trim(), size: m[2] }
  return { reference: trimmed || '—', size: null }
}

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
    const supabase = getAdminClient()

    const allInvoices: CachedInvoice[] = []
    const pageSize = 1000
    let pageStart = 0
    for (let i = 0; i < 50; i++) {
      const { data: page, error: pErr } = await supabase
        .from('siigo_invoices')
        .select('id, date, total, customer_identification, observations, items, credited_amount')
        .gte('date', startDate)
        .lte('date', endDate)
        .range(pageStart, pageStart + pageSize - 1)
      if (pErr) {
        return NextResponse.json({ error: pErr.message }, { status: 500 })
      }
      if (!page || page.length === 0) break
      const fresh = (page as CachedInvoice[]).filter(p => (p.credited_amount || 0) < p.total)
      allInvoices.push(...fresh)
      if (page.length < pageSize) break
      pageStart += pageSize
    }
    const invoices = allInvoices

    const { data: tiendasWithSiigo } = await supabase
      .from('tiendas_terceros')
      .select('id, nombre, nombre_corto, siigo_customer_identification')
      .not('siigo_customer_identification', 'is', null)
    const tiendasByNit = new Map<string, { id: string; nombre: string }>()
    const tiendasList: Array<{ id: string; nombre: string }> = []
    for (const t of (tiendasWithSiigo || []) as Array<{ id: string; nombre: string; nombre_corto: string | null; siigo_customer_identification: string }>) {
      const display = t.nombre_corto || t.nombre
      tiendasByNit.set(t.siigo_customer_identification, { id: t.id, nombre: display })
      tiendasList.push({ id: t.id, nombre: display })
    }

    type ChannelStats = { qty: number; amount: number; invoices: number }
    type VariantStats = {
      code: string
      size: string | null
      description: string
      totalQty: number
      totalAmount: number
      byChannel: {
        shopify: ChannelStats
        whatsapp: ChannelStats
        tiendas: Record<string, ChannelStats>
      }
    }
    type ReferenceStats = {
      reference: string
      totalQty: number
      totalAmount: number
      byChannel: {
        shopify: ChannelStats
        whatsapp: ChannelStats
        tiendas: Record<string, ChannelStats>
      }
      variants: Map<string, VariantStats>
    }

    const refs = new Map<string, ReferenceStats>()
    let totalShopify = 0
    let totalWhatsApp = 0
    let totalTienda = 0

    function bump(s: ChannelStats, qty: number, amount: number) {
      s.qty += qty
      s.amount += amount
      s.invoices += 1
    }

    function ensureRef(reference: string): ReferenceStats {
      let r = refs.get(reference)
      if (!r) {
        r = {
          reference,
          totalQty: 0,
          totalAmount: 0,
          byChannel: {
            shopify: { qty: 0, amount: 0, invoices: 0 },
            whatsapp: { qty: 0, amount: 0, invoices: 0 },
            tiendas: {},
          },
          variants: new Map(),
        }
        refs.set(reference, r)
      }
      return r
    }
    function ensureVariant(r: ReferenceStats, code: string, size: string | null, description: string): VariantStats {
      let v = r.variants.get(code)
      if (!v) {
        v = {
          code,
          size,
          description,
          totalQty: 0,
          totalAmount: 0,
          byChannel: {
            shopify: { qty: 0, amount: 0, invoices: 0 },
            whatsapp: { qty: 0, amount: 0, invoices: 0 },
            tiendas: {},
          },
        }
        r.variants.set(code, v)
      }
      if (!v.description && description) v.description = description
      if (!v.size && size) v.size = size
      return v
    }

    for (const inv of invoices) {
      const hasShopifyTag = extractOrderNumber(inv.observations) !== null
      const tiendaMatch = inv.customer_identification
        ? tiendasByNit.get(inv.customer_identification)
        : undefined
      let channel: 'shopify' | 'whatsapp' | 'tienda' = 'whatsapp'
      if (tiendaMatch) channel = 'tienda'
      else if (hasShopifyTag) channel = 'shopify'

      for (const it of inv.items || []) {
        if (it.code === 'ENVIO' || !it.code) continue
        const itemTotal = it.total ?? it.quantity * it.price
        const qty = it.quantity || 0

        const { reference, size } = parseProductName(it.description || '')
        const r = ensureRef(reference)
        const v = ensureVariant(r, it.code, size, it.description || '')

        r.totalQty += qty
        r.totalAmount += itemTotal
        v.totalQty += qty
        v.totalAmount += itemTotal

        const writeChannel = (refCh: ChannelStats, vCh: ChannelStats) => {
          bump(refCh, qty, itemTotal)
          bump(vCh, qty, itemTotal)
        }

        if (channel === 'shopify') {
          writeChannel(r.byChannel.shopify, v.byChannel.shopify)
          totalShopify += itemTotal
        } else if (channel === 'tienda' && tiendaMatch) {
          if (!r.byChannel.tiendas[tiendaMatch.id]) r.byChannel.tiendas[tiendaMatch.id] = { qty: 0, amount: 0, invoices: 0 }
          if (!v.byChannel.tiendas[tiendaMatch.id]) v.byChannel.tiendas[tiendaMatch.id] = { qty: 0, amount: 0, invoices: 0 }
          writeChannel(r.byChannel.tiendas[tiendaMatch.id], v.byChannel.tiendas[tiendaMatch.id])
          totalTienda += itemTotal
        } else {
          writeChannel(r.byChannel.whatsapp, v.byChannel.whatsapp)
          totalWhatsApp += itemTotal
        }
      }
    }

    // Serialize: sort variants by size if numeric else alpha
    const referencesList = Array.from(refs.values())
      .map(r => ({
        reference: r.reference,
        totalQty: r.totalQty,
        totalAmount: r.totalAmount,
        byChannel: r.byChannel,
        variantCount: r.variants.size,
        variants: Array.from(r.variants.values()).sort((a, b) => {
          const na = a.size ? parseFloat(a.size.replace(',', '.')) : NaN
          const nb = b.size ? parseFloat(b.size.replace(',', '.')) : NaN
          if (!isNaN(na) && !isNaN(nb)) return na - nb
          return (a.size || a.code).localeCompare(b.size || b.code)
        }),
      }))
      .sort((a, b) => b.totalQty - a.totalQty)

    return NextResponse.json({
      tiendas: tiendasList,
      references: referencesList,
      totals: {
        referencias: referencesList.length,
        productos: referencesList.reduce((s, r) => s + r.variantCount, 0),
        unidades: referencesList.reduce((s, r) => s + r.totalQty, 0),
        monto: referencesList.reduce((s, r) => s + r.totalAmount, 0),
        facturas: invoices.length,
        byChannel: {
          shopify: totalShopify,
          whatsapp: totalWhatsApp,
          tienda: totalTienda,
        },
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error generando analítica'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
