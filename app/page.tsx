import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ShoppingBag, Store, BarChart3, Zap } from 'lucide-react'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#233037]">
      {/* Header */}
      <header className="border-b border-[#334047]">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-semibold text-white tracking-tight">numbi</span>
            <span className="text-xs text-[#00D47F] font-medium bg-[#334047] px-2 py-1 rounded">E-commerce</span>
          </div>
          <Link href="/api/auth/shopify">
            <Button className="bg-[#00D47F] hover:bg-[#00D47F]/90 text-[#233037] font-medium">
              Conectar Tienda
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="container mx-auto px-4 py-16">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Centraliza todas tus ventas en un solo lugar
          </h1>
          <p className="text-xl text-[#99C3D2] mb-8">
            Conecta tu tienda Shopify, Mercado Libre y más.
            Visualiza ventas, sincroniza inventario y genera facturas automáticamente.
          </p>
          <p className="text-[#6FDAAA] font-medium mb-8">
            Gratis para clientes de Numbi Contabilidad
          </p>
          <Link href="/api/auth/shopify">
            <Button size="lg" className="bg-[#00D47F] hover:bg-[#00D47F]/90 text-[#233037] font-semibold text-lg px-8">
              <Store className="mr-2 h-5 w-5" />
              Conectar Shopify
            </Button>
          </Link>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          <Card className="bg-[#334047] border-[#334047]">
            <CardHeader>
              <ShoppingBag className="h-10 w-10 text-[#00D47F] mb-2" />
              <CardTitle className="text-white">Todas tus órdenes</CardTitle>
              <CardDescription className="text-[#99C3D2]">
                Ve todas las ventas de Shopify, Mercado Libre y más en un dashboard unificado.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="bg-[#334047] border-[#334047]">
            <CardHeader>
              <BarChart3 className="h-10 w-10 text-[#00D47F] mb-2" />
              <CardTitle className="text-white">Métricas en tiempo real</CardTitle>
              <CardDescription className="text-[#99C3D2]">
                Ventas totales, productos más vendidos, tendencias y más.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="bg-[#334047] border-[#334047]">
            <CardHeader>
              <Zap className="h-10 w-10 text-[#00D47F] mb-2" />
              <CardTitle className="text-white">Facturación automática</CardTitle>
              <CardDescription className="text-[#99C3D2]">
                Genera facturas en Siigo o Alegra automáticamente con cada venta.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* Coming Soon */}
        <div className="mt-16 text-center">
          <p className="text-[#71828A] text-sm">Próximamente: Mercado Libre • Linio • Falabella • WooCommerce</p>
        </div>
      </main>
    </div>
  )
}
