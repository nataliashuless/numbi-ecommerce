'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Store } from 'lucide-react'

export default function OnboardingPage() {
  const [shop, setShop] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    let shopName = shop.trim().toLowerCase()

    // Clean up shop name
    if (shopName.includes('.myshopify.com')) {
      shopName = shopName.replace('.myshopify.com', '')
    }
    if (shopName.includes('https://')) {
      shopName = shopName.replace('https://', '')
    }
    if (shopName.includes('http://')) {
      shopName = shopName.replace('http://', '')
    }

    const fullShop = `${shopName}.myshopify.com`

    // Redirect to Shopify OAuth
    const apiKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY || '1a21e5ac9c64c84b693e9c2d354e6d0e'
    const scopes = 'read_orders,read_products,read_customers'
    const redirectUri = `${window.location.origin}/api/auth/callback`

    const authUrl = `https://${fullShop}/admin/oauth/authorize?client_id=${apiKey}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}`

    window.location.href = authUrl
  }

  return (
    <div className="min-h-screen bg-[#121212] flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-[#2a3942] border-[#242833]">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 bg-[#121212]/20 rounded-full flex items-center justify-center">
            <Store className="h-8 w-8 text-[#121212]" />
          </div>
          <CardTitle className="text-white text-2xl">Conectar Shopify</CardTitle>
          <CardDescription className="text-[#929292]">
            Conecta tu tienda Shopify para comenzar a gestionar tus ventas y envíos
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleConnect} className="space-y-4">
            {error && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-2 rounded-md text-sm">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="shop" className="text-white">Nombre de tu tienda</Label>
              <div className="flex">
                <Input
                  id="shop"
                  type="text"
                  placeholder="mi-tienda"
                  value={shop}
                  onChange={(e) => setShop(e.target.value)}
                  required
                  className="bg-[#242833] border-[#445057] text-white placeholder:text-[#545454] rounded-r-none"
                />
                <span className="inline-flex items-center px-3 bg-[#445057] border border-l-0 border-[#445057] text-[#929292] text-sm rounded-r-md">
                  .myshopify.com
                </span>
              </div>
              <p className="text-xs text-[#545454]">
                Ejemplo: si tu tienda es shuless.myshopify.com, escribe "shuless"
              </p>
            </div>

            <Button
              type="submit"
              className="w-full bg-[#121212] hover:bg-[#121212]/90 text-[#121212] font-medium"
              disabled={loading || !shop.trim()}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Conectando...
                </>
              ) : (
                'Conectar Tienda'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
