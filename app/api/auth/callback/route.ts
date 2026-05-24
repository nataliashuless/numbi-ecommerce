import { NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const shop = searchParams.get('shop')

  if (!code || !shop) {
    return NextResponse.json({ error: 'Missing code or shop parameter' }, { status: 400 })
  }

  const apiKey = process.env.SHOPIFY_API_KEY
  const apiSecret = process.env.SHOPIFY_API_SECRET

  if (!apiKey || !apiSecret) {
    return NextResponse.json({ error: 'Shopify credentials not configured' }, { status: 500 })
  }

  // Get current user from Supabase session
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Ignore
          }
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const host = process.env.SHOPIFY_HOST || 'http://localhost:3000'
    return NextResponse.redirect(`${host}/login?error=not_authenticated`)
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: apiKey,
        client_secret: apiSecret,
        code,
      }),
    })

    const tokenData = await tokenResponse.json()

    if (tokenData.error) {
      return NextResponse.json({ error: tokenData.error_description || tokenData.error }, { status: 400 })
    }

    const accessToken = tokenData.access_token

    // Save to database using service client
    const serviceClient = getServiceClient()

    const { data: existing } = await serviceClient
      .from('user_integrations')
      .select('id')
      .limit(1)
      .maybeSingle()

    if (existing) {
      await serviceClient
        .from('user_integrations')
        .update({
          shopify_shop: shop,
          shopify_access_token: accessToken,
          shopify_connected_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
    } else {
      await serviceClient
        .from('user_integrations')
        .insert({
          shopify_shop: shop,
          shopify_access_token: accessToken,
          shopify_connected_at: new Date().toISOString(),
        })
    }

    await serviceClient
      .from('profiles')
      .update({ onboarding_completed: true })
      .eq('id', user.id)

    // Redirect to dashboard
    const host = process.env.SHOPIFY_HOST || 'http://localhost:3000'
    return NextResponse.redirect(`${host}/dashboard`)

  } catch (error) {
    console.error('OAuth callback error:', error)
    return NextResponse.json({ error: 'Failed to complete authentication' }, { status: 500 })
  }
}
