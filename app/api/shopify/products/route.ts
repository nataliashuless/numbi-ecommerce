import { NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

async function getUserShopifyCredentials() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch { }
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: integration } = await serviceClient
    .from('user_integrations')
    .select('shopify_shop, shopify_access_token')
    .eq('user_id', user.id)
    .single()

  return integration
}

export async function GET() {
  const credentials = await getUserShopifyCredentials()
  const shop = credentials?.shopify_shop
  const accessToken = credentials?.shopify_access_token

  if (!shop || !accessToken) {
    return NextResponse.json({ error: 'Shopify not connected' }, { status: 401 })
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
