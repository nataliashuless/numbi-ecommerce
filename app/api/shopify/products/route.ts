import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET() {
  const cookieStore = await cookies()
  const shop = cookieStore.get('shopify_shop')?.value
  const accessToken = cookieStore.get('shopify_token')?.value

  if (!shop || !accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    // Fetch all products with pagination
    let allProducts: Array<{
      id: number
      title: string
      handle: string
      status: string
      vendor: string
      product_type: string
      created_at: string
      updated_at: string
      images: Array<{ src: string }>
      variants: Array<{
        id: number
        title: string
        price: string
        sku: string
        inventory_quantity: number
        inventory_management: string | null
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

      // Check for next page
      const linkHeader = response.headers.get('Link')
      nextUrl = null
      if (linkHeader) {
        const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/)
        if (nextMatch) {
          nextUrl = nextMatch[1]
        }
      }
    }

    // Transform products data
    const products = allProducts.map(product => {
      const totalInventory = product.variants.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0)
      const hasInventoryTracking = product.variants.some(v => v.inventory_management !== null)

      return {
        id: product.id,
        title: product.title,
        handle: product.handle,
        status: product.status,
        vendor: product.vendor,
        productType: product.product_type,
        image: product.images[0]?.src || null,
        createdAt: product.created_at,
        updatedAt: product.updated_at,
        totalInventory,
        hasInventoryTracking,
        variantCount: product.variants.length,
        variants: product.variants.map(v => ({
          id: v.id,
          title: v.title,
          price: parseFloat(v.price),
          sku: v.sku || '',
          inventory: v.inventory_quantity || 0,
          tracked: v.inventory_management !== null,
        })),
        minPrice: Math.min(...product.variants.map(v => parseFloat(v.price))),
        maxPrice: Math.max(...product.variants.map(v => parseFloat(v.price))),
      }
    })

    // Calculate stats
    const totalProducts = products.length
    const activeProducts = products.filter(p => p.status === 'active').length
    const totalInventory = products.reduce((sum, p) => sum + p.totalInventory, 0)
    const outOfStock = products.filter(p => p.hasInventoryTracking && p.totalInventory === 0).length
    const lowStock = products.filter(p => p.hasInventoryTracking && p.totalInventory > 0 && p.totalInventory <= 5).length

    return NextResponse.json({
      products,
      stats: {
        totalProducts,
        activeProducts,
        totalInventory,
        outOfStock,
        lowStock,
      },
      shop,
    })

  } catch (error) {
    console.error('Shopify API error:', error)
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 })
  }
}
