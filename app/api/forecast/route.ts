import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'

interface ForecastItem {
  sku: string
  producto: string
  variante: string
  imagen: string | null
  // Inventario actual
  stockBodega: number
  stockConsignado: number
  stockTotal: number
  // Ventas por canal (últimos 30 días)
  ventasShopify: number
  ventasWhatsApp: number
  ventasTiendas: number
  ventasTotal: number
  // Velocidad y proyección
  velocidadDiaria: number      // unidades/día
  velocidadSemanal: number     // unidades/semana
  diasHastaAgotamiento: number | null  // null = sin ventas o sin stock
  // Sugerencia producción
  sugerenciaProduccion: number
  prioridad: 'critica' | 'alta' | 'media' | 'baja'
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const diasAnalisis = parseInt(searchParams.get('dias') || '30')  // Default 30 días
  const leadTimeDias = parseInt(searchParams.get('lead_time') || '14')  // Default 14 días producción
  const stockSeguridad = parseInt(searchParams.get('stock_seguridad') || '7')  // Default 7 días de stock de seguridad

  const cookieStore = await cookies()
  const shop = cookieStore.get('shopify_shop')?.value
  const accessToken = cookieStore.get('shopify_token')?.value

  if (!shop || !accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    // Calculate date range for analysis
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - diasAnalisis)
    const startDateStr = startDate.toISOString().split('T')[0]
    const endDateStr = endDate.toISOString().split('T')[0]

    // 1. Fetch Shopify products (for inventory and product info)
    let allProducts: Array<{
      id: number
      title: string
      images: Array<{ src: string }>
      variants: Array<{
        id: number
        title: string
        sku: string
        inventory_quantity: number
      }>
    }> = []

    let nextUrl: string | null = `https://${shop}/admin/api/2024-10/products.json?limit=250`
    while (nextUrl) {
      const response: Response = await fetch(nextUrl, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      })
      if (!response.ok) break
      const data = await response.json()
      allProducts = allProducts.concat(data.products || [])
      const linkHeader = response.headers.get('Link')
      nextUrl = null
      if (linkHeader) {
        const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/)
        if (nextMatch) nextUrl = nextMatch[1]
      }
    }

    // 2. Fetch Shopify orders with line items (for sales by SKU)
    let allOrders: Array<{
      created_at: string
      line_items: Array<{
        sku: string
        quantity: number
        title: string
        variant_title: string
      }>
    }> = []

    const orderParams = new URLSearchParams()
    orderParams.set('status', 'any')
    orderParams.set('limit', '250')
    orderParams.set('created_at_min', `${startDateStr}T00:00:00Z`)
    orderParams.set('created_at_max', `${endDateStr}T23:59:59Z`)

    nextUrl = `https://${shop}/admin/api/2024-10/orders.json?${orderParams.toString()}`
    while (nextUrl) {
      const response: Response = await fetch(nextUrl, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      })
      if (!response.ok) break
      const data = await response.json()
      allOrders = allOrders.concat(data.orders || [])
      const linkHeader = response.headers.get('Link')
      nextUrl = null
      if (linkHeader) {
        const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/)
        if (nextMatch) nextUrl = nextMatch[1]
      }
    }

    // 3. Fetch WhatsApp sales from Supabase
    const { data: ventasWA } = await supabase
      .from('ventas_whatsapp')
      .select('producto_sku, cantidad')
      .gte('fecha', startDateStr)
      .lte('fecha', endDateStr)

    // 4. Fetch Tiendas sales from Supabase
    const { data: ventasTiendas } = await supabase
      .from('ventas_terceros')
      .select('producto_sku, cantidad')
      .gte('fecha', startDateStr)
      .lte('fecha', endDateStr)

    // 5. Fetch consignaciones for consigned inventory
    const { data: consignaciones } = await supabase
      .from('consignaciones')
      .select('producto_sku, tipo, cantidad')

    // 6. Calculate sales per SKU from all channels
    const ventasPorSku: { [sku: string]: { shopify: number; whatsapp: number; tiendas: number } } = {}

    // Shopify sales
    for (const order of allOrders) {
      for (const item of order.line_items) {
        const sku = item.sku || `NO-SKU`
        if (!ventasPorSku[sku]) {
          ventasPorSku[sku] = { shopify: 0, whatsapp: 0, tiendas: 0 }
        }
        ventasPorSku[sku].shopify += item.quantity
      }
    }

    // WhatsApp sales
    for (const venta of ventasWA || []) {
      if (!venta.producto_sku) continue
      if (!ventasPorSku[venta.producto_sku]) {
        ventasPorSku[venta.producto_sku] = { shopify: 0, whatsapp: 0, tiendas: 0 }
      }
      ventasPorSku[venta.producto_sku].whatsapp += venta.cantidad
    }

    // Tiendas sales
    for (const venta of ventasTiendas || []) {
      if (!venta.producto_sku) continue
      if (!ventasPorSku[venta.producto_sku]) {
        ventasPorSku[venta.producto_sku] = { shopify: 0, whatsapp: 0, tiendas: 0 }
      }
      ventasPorSku[venta.producto_sku].tiendas += venta.cantidad
    }

    // 7. Calculate consigned inventory per SKU
    const consignadoPorSku: { [sku: string]: number } = {}
    for (const c of consignaciones || []) {
      if (!c.producto_sku) continue
      if (!consignadoPorSku[c.producto_sku]) {
        consignadoPorSku[c.producto_sku] = 0
      }
      if (c.tipo === 'envio') {
        consignadoPorSku[c.producto_sku] += c.cantidad
      } else if (c.tipo === 'devolucion') {
        consignadoPorSku[c.producto_sku] -= c.cantidad
      }
    }

    // Subtract tiendas sales from consigned
    for (const venta of ventasTiendas || []) {
      if (!venta.producto_sku) continue
      if (consignadoPorSku[venta.producto_sku]) {
        consignadoPorSku[venta.producto_sku] -= venta.cantidad
      }
    }

    // 8. Build forecast data
    const forecast: ForecastItem[] = []

    for (const product of allProducts) {
      for (const variant of product.variants) {
        const sku = variant.sku || `NO-SKU-${variant.id}`
        const ventas = ventasPorSku[sku] || { shopify: 0, whatsapp: 0, tiendas: 0 }
        const ventasTotal = ventas.shopify + ventas.whatsapp + ventas.tiendas
        const stockBodega = variant.inventory_quantity || 0
        const stockConsignado = Math.max(0, consignadoPorSku[sku] || 0)
        const stockTotal = stockBodega + stockConsignado

        // Calculate velocity
        const velocidadDiaria = ventasTotal / diasAnalisis
        const velocidadSemanal = velocidadDiaria * 7

        // Project days until stockout (using bodega stock since that's what's available)
        let diasHastaAgotamiento: number | null = null
        if (velocidadDiaria > 0 && stockBodega > 0) {
          diasHastaAgotamiento = Math.round(stockBodega / velocidadDiaria)
        } else if (velocidadDiaria > 0 && stockBodega === 0) {
          diasHastaAgotamiento = 0 // Already out
        }
        // null means no sales history

        // Calculate suggested production
        // Formula: (lead time + safety stock days) * daily velocity - current bodega stock
        let sugerenciaProduccion = 0
        if (velocidadDiaria > 0) {
          const diasCobertura = leadTimeDias + stockSeguridad
          const stockNecesario = Math.ceil(velocidadDiaria * diasCobertura)
          sugerenciaProduccion = Math.max(0, stockNecesario - stockBodega)
        }

        // Determine priority
        let prioridad: 'critica' | 'alta' | 'media' | 'baja' = 'baja'
        if (diasHastaAgotamiento !== null) {
          if (diasHastaAgotamiento <= 7) {
            prioridad = 'critica'
          } else if (diasHastaAgotamiento <= 14) {
            prioridad = 'alta'
          } else if (diasHastaAgotamiento <= 30) {
            prioridad = 'media'
          }
        }

        forecast.push({
          sku,
          producto: product.title,
          variante: variant.title !== 'Default Title' ? variant.title : '',
          imagen: product.images[0]?.src || null,
          stockBodega,
          stockConsignado,
          stockTotal,
          ventasShopify: ventas.shopify,
          ventasWhatsApp: ventas.whatsapp,
          ventasTiendas: ventas.tiendas,
          ventasTotal,
          velocidadDiaria: Math.round(velocidadDiaria * 100) / 100,
          velocidadSemanal: Math.round(velocidadSemanal * 100) / 100,
          diasHastaAgotamiento,
          sugerenciaProduccion,
          prioridad,
        })
      }
    }

    // Sort by priority (critica first) then by days until stockout
    const prioridadOrder = { critica: 0, alta: 1, media: 2, baja: 3 }
    forecast.sort((a, b) => {
      const prioridadDiff = prioridadOrder[a.prioridad] - prioridadOrder[b.prioridad]
      if (prioridadDiff !== 0) return prioridadDiff
      // Within same priority, sort by days (lower first, null last)
      if (a.diasHastaAgotamiento === null) return 1
      if (b.diasHastaAgotamiento === null) return -1
      return a.diasHastaAgotamiento - b.diasHastaAgotamiento
    })

    // Calculate summary stats
    const resumen = {
      totalSkus: forecast.length,
      criticos: forecast.filter(f => f.prioridad === 'critica').length,
      altos: forecast.filter(f => f.prioridad === 'alta').length,
      medios: forecast.filter(f => f.prioridad === 'media').length,
      bajos: forecast.filter(f => f.prioridad === 'baja').length,
      totalProducirSugerido: forecast.reduce((sum, f) => sum + f.sugerenciaProduccion, 0),
      totalVentasPeriodo: forecast.reduce((sum, f) => sum + f.ventasTotal, 0),
    }

    return NextResponse.json({
      forecast,
      resumen,
      parametros: {
        diasAnalisis,
        leadTimeDias,
        stockSeguridad,
        fechaInicio: startDateStr,
        fechaFin: endDateStr,
      },
    })

  } catch (error) {
    console.error('Forecast API error:', error)
    return NextResponse.json({ error: 'Failed to calculate forecast' }, { status: 500 })
  }
}
