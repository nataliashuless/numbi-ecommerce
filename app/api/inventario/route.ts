import { NextResponse } from 'next/server'
import { requireAuth, getUserShopifyCredentials, getAdminClient } from '@/lib/auth-helpers'

interface InventarioItem {
  sku: string
  producto: string
  variante: string
  imagen: string | null
  bodega: number
  tiendas: { [tiendaId: string]: number }
  totalConsignado: number
  total: number
}

export async function GET() {
  // Require authentication
  const { user, error } = await requireAuth()
  if (error) return error

  // Get Shopify credentials from database
  const credentials = await getUserShopifyCredentials(user!.id)
  const shop = credentials?.shopify_shop
  const accessToken = credentials?.shopify_access_token

  if (!shop || !accessToken) {
    return NextResponse.json({ error: 'Shopify no conectado' }, { status: 401 })
  }

  const supabase = getAdminClient()

  try {
    // 1. Fetch products from Shopify (Bodega inventory)
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

      if (!response.ok) {
        const error = await response.json()
        return NextResponse.json({ error: error.errors || 'Failed to fetch products' }, { status: response.status })
      }

      const data = await response.json()
      allProducts = allProducts.concat(data.products || [])

      const linkHeader = response.headers.get('Link')
      nextUrl = null
      if (linkHeader) {
        const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/)
        if (nextMatch) {
          nextUrl = nextMatch[1]
        }
      }
    }

    // 2. Fetch all stores (filtered by user_id)
    const { data: tiendas, error: tiendasError } = await supabase
      .from('tiendas_terceros')
      .select('id, nombre')
      .eq('user_id', user!.id)
      .eq('activa', true)
      .order('nombre')

    if (tiendasError) {
      console.error('Error fetching tiendas:', tiendasError)
    }

    const tiendasList = tiendas || []
    const tiendaIds = tiendasList.map(t => t.id)

    // 3. Fetch all consignaciones for user's tiendas
    const { data: consignaciones, error: consignacionesError } = tiendaIds.length > 0
      ? await supabase
          .from('consignaciones')
          .select('tienda_id, producto_sku, tipo, cantidad')
          .in('tienda_id', tiendaIds)
      : { data: [], error: null }

    if (consignacionesError) {
      console.error('Error fetching consignaciones:', consignacionesError)
    }

    // 4. Fetch all ventas_terceros for user's tiendas (to subtract from consigned)
    const { data: ventasTerceros, error: ventasError } = tiendaIds.length > 0
      ? await supabase
          .from('ventas_terceros')
          .select('tienda_id, producto_sku, cantidad')
          .in('tienda_id', tiendaIds)
      : { data: [], error: null }

    if (ventasError) {
      console.error('Error fetching ventas_terceros:', ventasError)
    }

    // 5. Calculate consigned inventory per SKU per store
    const consignadoPorSku: { [sku: string]: { [tiendaId: string]: number } } = {}

    // Add consignaciones (envio adds, devolucion subtracts)
    for (const c of consignaciones || []) {
      if (!c.producto_sku) continue
      if (!consignadoPorSku[c.producto_sku]) {
        consignadoPorSku[c.producto_sku] = {}
      }
      if (!consignadoPorSku[c.producto_sku][c.tienda_id]) {
        consignadoPorSku[c.producto_sku][c.tienda_id] = 0
      }
      if (c.tipo === 'envio') {
        consignadoPorSku[c.producto_sku][c.tienda_id] += c.cantidad
      } else if (c.tipo === 'devolucion') {
        consignadoPorSku[c.producto_sku][c.tienda_id] -= c.cantidad
      }
    }

    // Subtract ventas from consigned
    for (const v of ventasTerceros || []) {
      if (!v.producto_sku) continue
      if (consignadoPorSku[v.producto_sku] && consignadoPorSku[v.producto_sku][v.tienda_id]) {
        consignadoPorSku[v.producto_sku][v.tienda_id] -= v.cantidad
      }
    }

    // 6. Build consolidated inventory
    const inventario: InventarioItem[] = []

    for (const product of allProducts) {
      for (const variant of product.variants) {
        const sku = variant.sku || `NO-SKU-${variant.id}`
        const bodega = variant.inventory_quantity || 0

        // Get consigned quantities for this SKU
        const tiendasInventario: { [tiendaId: string]: number } = {}
        let totalConsignado = 0

        for (const tienda of tiendasList) {
          const cantidad = consignadoPorSku[sku]?.[tienda.id] || 0
          tiendasInventario[tienda.id] = Math.max(0, cantidad) // No negative
          totalConsignado += tiendasInventario[tienda.id]
        }

        inventario.push({
          sku,
          producto: product.title,
          variante: variant.title !== 'Default Title' ? variant.title : '',
          imagen: product.images[0]?.src || null,
          bodega,
          tiendas: tiendasInventario,
          totalConsignado,
          total: bodega + totalConsignado,
        })
      }
    }

    // Sort by product name, then variant
    inventario.sort((a, b) => {
      const productCompare = a.producto.localeCompare(b.producto)
      if (productCompare !== 0) return productCompare
      return a.variante.localeCompare(b.variante)
    })

    // Calculate totals
    const totales = {
      bodega: inventario.reduce((sum, i) => sum + i.bodega, 0),
      consignado: inventario.reduce((sum, i) => sum + i.totalConsignado, 0),
      total: inventario.reduce((sum, i) => sum + i.total, 0),
    }

    return NextResponse.json({
      inventario,
      tiendas: tiendasList,
      totales,
    })

  } catch (error) {
    console.error('Inventario API error:', error)
    return NextResponse.json({ error: 'Failed to fetch inventario' }, { status: 500 })
  }
}
