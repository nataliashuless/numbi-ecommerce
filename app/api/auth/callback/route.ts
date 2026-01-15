import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

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

    // Store in cookies (in production, use a database)
    const cookieStore = await cookies()
    cookieStore.set('shopify_shop', shop, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    })
    cookieStore.set('shopify_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    })

    // Redirect to dashboard
    const host = process.env.SHOPIFY_HOST || 'http://localhost:3000'
    return NextResponse.redirect(`${host}/dashboard`)

  } catch (error) {
    console.error('OAuth callback error:', error)
    return NextResponse.json({ error: 'Failed to complete authentication' }, { status: 500 })
  }
}
