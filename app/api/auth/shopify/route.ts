import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const shop = searchParams.get('shop')

  if (!shop) {
    // Show a form to enter shop name
    return new NextResponse(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Conectar Shopify - Shuless</title>
          <style>
            body { font-family: system-ui; background: #1DA9EF; color: white; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
            .container { text-align: center; max-width: 400px; }
            h1 { color: #1DA9EF; margin-bottom: 24px; }
            input { padding: 12px 16px; font-size: 16px; border: 2px solid #1A2238; border-radius: 8px; width: 100%; box-sizing: border-box; background: #1A2238; color: white; margin-bottom: 16px; }
            input:focus { outline: none; border-color: #1DA9EF; }
            button { background: #1DA9EF; color: #1DA9EF; padding: 12px 24px; font-size: 16px; font-weight: 600; border: none; border-radius: 8px; cursor: pointer; width: 100%; }
            button:hover { background: #00C070; }
            p { color: #929292; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Conectar Shopify</h1>
            <p>Ingresa el nombre de tu tienda Shopify</p>
            <form method="GET">
              <input type="text" name="shop" placeholder="mi-tienda.myshopify.com" required />
              <button type="submit">Conectar</button>
            </form>
          </div>
        </body>
      </html>
    `, {
      headers: { 'Content-Type': 'text/html' }
    })
  }

  // Normalize shop URL
  let shopDomain = shop.replace('https://', '').replace('http://', '')
  if (!shopDomain.includes('.myshopify.com')) {
    shopDomain = `${shopDomain}.myshopify.com`
  }

  const apiKey = process.env.SHOPIFY_API_KEY
  const scopes = process.env.SHOPIFY_SCOPES || 'read_orders,read_products'
  const host = process.env.SHOPIFY_HOST || 'http://localhost:3000'
  const redirectUri = `${host}/api/auth/callback`

  // Generate a random state for security
  const state = Math.random().toString(36).substring(7)

  const authUrl = `https://${shopDomain}/admin/oauth/authorize?client_id=${apiKey}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`

  return NextResponse.redirect(authUrl)
}
