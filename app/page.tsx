import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ShoppingBag, Store, BarChart3, Zap, MessageCircle, Truck, Users } from 'lucide-react'

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
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" className="text-white hover:text-[#00D47F] hover:bg-[#334047]">
                Iniciar Sesión
              </Button>
            </Link>
            <Link href="/register">
              <Button className="bg-[#00D47F] hover:bg-[#00D47F]/90 text-[#233037] font-medium">
                Crear Cuenta
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="container mx-auto px-4 py-16">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Centraliza todas tus ventas en un solo lugar
          </h1>
          <p className="text-xl text-[#99C3D2] mb-8">
            Conecta tu tienda Shopify, gestiona ventas por WhatsApp, controla consignaciones en tiendas de terceros y genera guías de envío automáticamente.
          </p>
          <p className="text-[#6FDAAA] font-medium mb-8">
            Gratis para clientes de Numbi Contabilidad
          </p>
          <div className="flex justify-center gap-4">
            <Link href="/register">
              <Button size="lg" className="bg-[#00D47F] hover:bg-[#00D47F]/90 text-[#233037] font-semibold text-lg px-8">
                Comenzar Gratis
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline" className="border-[#00D47F] text-[#00D47F] hover:bg-[#00D47F]/10 font-semibold text-lg px-8">
                Ya tengo cuenta
              </Button>
            </Link>
          </div>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          <Card className="bg-[#334047] border-[#334047]">
            <CardHeader>
              <Store className="h-10 w-10 text-[#00D47F] mb-2" />
              <CardTitle className="text-white">Shopify integrado</CardTitle>
              <CardDescription className="text-[#99C3D2]">
                Conecta tu tienda Shopify y visualiza todas tus órdenes, productos e inventario.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="bg-[#334047] border-[#334047]">
            <CardHeader>
              <MessageCircle className="h-10 w-10 text-[#25D366] mb-2" />
              <CardTitle className="text-white">Ventas WhatsApp</CardTitle>
              <CardDescription className="text-[#99C3D2]">
                Registra ventas manuales de WhatsApp e importa pedidos con un solo click.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="bg-[#334047] border-[#334047]">
            <CardHeader>
              <Users className="h-10 w-10 text-[#00D47F] mb-2" />
              <CardTitle className="text-white">Tiendas de terceros</CardTitle>
              <CardDescription className="text-[#99C3D2]">
                Controla consignaciones, comisiones y liquidaciones con tiendas aliadas.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="bg-[#334047] border-[#334047]">
            <CardHeader>
              <Truck className="h-10 w-10 text-[#00D47F] mb-2" />
              <CardTitle className="text-white">Envíos con EnvioClick</CardTitle>
              <CardDescription className="text-[#99C3D2]">
                Cotiza y genera guías de envío con Coordinadora, Servientrega y más.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="bg-[#334047] border-[#334047]">
            <CardHeader>
              <BarChart3 className="h-10 w-10 text-[#00D47F] mb-2" />
              <CardTitle className="text-white">Métricas consolidadas</CardTitle>
              <CardDescription className="text-[#99C3D2]">
                Dashboard unificado con ventas de todos tus canales en tiempo real.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="bg-[#334047] border-[#334047]">
            <CardHeader>
              <ShoppingBag className="h-10 w-10 text-[#00D47F] mb-2" />
              <CardTitle className="text-white">Inventario unificado</CardTitle>
              <CardDescription className="text-[#99C3D2]">
                Controla stock de Shopify, consignaciones y productos disponibles.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* Coming Soon */}
        <div className="mt-16 text-center">
          <p className="text-[#71828A] text-sm">Próximamente: Mercado Libre • Facturación Electrónica • WooCommerce</p>
        </div>
      </main>
    </div>
  )
}
