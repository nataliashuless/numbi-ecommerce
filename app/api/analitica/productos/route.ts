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
}

function extractOrderNumber(observations: string | null): number | null {
  if (!observations) return null
  const match = observations.match(/#(\d+)/)
  return match ? parseInt(match[1], 10) : null
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
        .select('id, date, total, customer_identification, observations, items')
        .gte('date', startDate)
        .lte('date', endDate)
        .range(pageStart, pageStart + pageSize - 1)
      if (pErr) {
        return NextResponse.json({ error: pErr.message }, { status: 500 })
      }
      if (!page || page.length === 0) break
      allInvoices.push(...(page as CachedInvoice[]))
      if (page.length < pageSize) break
      pageStart += pageSize
    }
    const invoices = allInvoices

    const { data: waVentas } = await supabase
      .from('ventas_whatsapp')
      .select('siigo_invoice_id')
      .not('siigo_invoice_id', 'is', null)
    const whatsappInvoiceIds = new Set((waVentas || []).map(v => v.siigo_invoice_id))

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
    type ProductStats = {
      code: string
      description: string
      totalQty: number
      totalAmount: number
      byChannel: {
        shopify: ChannelStats
        whatsapp: ChannelStats
        otra: ChannelStats
        tiendas: Record<string, ChannelStats>
      }
    }

    const products = new Map<string, ProductStats>()
    let totalShopify = 0
    let totalWhatsApp = 0
    let totalTienda = 0
    let totalOtra = 0

    function bump(s: ChannelStats, qty: number, amount: number) {
      s.qty += qty
      s.amount += amount
      s.invoices += 1
    }

    for (const inv of invoices) {
      const hasShopifyTag = extractOrderNumber(inv.observations) !== null
      const isWhatsApp = whatsappInvoiceIds.has(inv.id)
      const tiendaMatch = inv.customer_identification
        ? tiendasByNit.get(inv.customer_identification)
        : undefined

      let channel: 'shopify' | 'whatsapp' | 'tienda' | 'otra' = 'otra'
      if (isWhatsApp) channel = 'whatsapp'
      else if (hasShopifyTag) channel = 'shopify'
      else if (tiendaMatch) channel = 'tienda'

      for (const it of inv.items || []) {
        if (it.code === 'ENVIO' || !it.code) continue
        const itemTotal = it.total ?? it.quantity * it.price
        const qty = it.quantity || 0

        let stats = products.get(it.code)
        if (!stats) {
          stats = {
            code: it.code,
            description: it.description || '',
            totalQty: 0,
            totalAmount: 0,
            byChannel: {
              shopify: { qty: 0, amount: 0, invoices: 0 },
              whatsapp: { qty: 0, amount: 0, invoices: 0 },
              otra: { qty: 0, amount: 0, invoices: 0 },
              tiendas: {},
            },
          }
          products.set(it.code, stats)
        }
        if (!stats.description && it.description) stats.description = it.description
        stats.totalQty += qty
        stats.totalAmount += itemTotal

        if (channel === 'shopify') {
          bump(stats.byChannel.shopify, qty, itemTotal)
          totalShopify += itemTotal
        } else if (channel === 'whatsapp') {
          bump(stats.byChannel.whatsapp, qty, itemTotal)
          totalWhatsApp += itemTotal
        } else if (channel === 'tienda' && tiendaMatch) {
          if (!stats.byChannel.tiendas[tiendaMatch.id]) {
            stats.byChannel.tiendas[tiendaMatch.id] = { qty: 0, amount: 0, invoices: 0 }
          }
          bump(stats.byChannel.tiendas[tiendaMatch.id], qty, itemTotal)
          totalTienda += itemTotal
        } else {
          bump(stats.byChannel.otra, qty, itemTotal)
          totalOtra += itemTotal
        }
      }
    }

    const productsList = Array.from(products.values()).sort((a, b) => b.totalQty - a.totalQty)

    return NextResponse.json({
      tiendas: tiendasList,
      products: productsList,
      totals: {
        productos: productsList.length,
        unidades: productsList.reduce((s, p) => s + p.totalQty, 0),
        monto: productsList.reduce((s, p) => s + p.totalAmount, 0),
        facturas: invoices.length,
        byChannel: {
          shopify: totalShopify,
          whatsapp: totalWhatsApp,
          tienda: totalTienda,
          otra: totalOtra,
        },
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error generando analítica'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
