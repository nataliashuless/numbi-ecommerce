import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Store, MessageCircle, FileText, Package, BarChart3, Truck } from 'lucide-react'

const features = [
  { icon: Store, title: 'Shopify', desc: 'Órdenes y productos sincronizados' },
  { icon: MessageCircle, title: 'WhatsApp', desc: 'Ventas manuales y por IA' },
  { icon: FileText, title: 'Siigo', desc: 'Facturación electrónica' },
  { icon: Package, title: 'Inventario', desc: 'Bodega y consignaciones' },
  { icon: Truck, title: 'EnvioClick', desc: 'Cotización y guías' },
  { icon: BarChart3, title: 'Reportes', desc: 'Ventas consolidadas' },
]

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white text-[#1A2238] flex flex-col">
      <header className="border-b border-[#E5E7EB] bg-white">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl font-bold tracking-tight text-[#1DA9EF]">
              shuless
            </span>
            <span className="text-xs font-semibold text-white bg-[#1DA9EF] px-2.5 py-1 rounded-full uppercase tracking-wider">
              Admin
            </span>
          </div>
          <Link href="/login">
            <Button className="bg-[#1DA9EF] hover:bg-[#0073D1] text-white font-semibold rounded-full px-6">
              Iniciar sesión
            </Button>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="bg-gradient-to-br from-[#E8F5F8] via-white to-[#E8F5F8] py-24">
          <div className="container mx-auto px-6 text-center max-w-3xl">
            <div className="inline-block bg-[#FFD93D] text-[#1A2238] text-xs font-bold px-3 py-1.5 rounded-full uppercase tracking-wider mb-6">
              Panel interno
            </div>
            <h1 className="text-5xl md:text-6xl font-extrabold mb-6 tracking-tight leading-tight">
              Todo tu negocio,
              <br />
              <span className="text-[#1DA9EF]">en un solo lugar</span>
            </h1>
            <p className="text-xl text-[#6B7280] mb-10 max-w-xl mx-auto">
              Gestión central de ventas, inventario y facturación para Shuless.
            </p>
            <Link href="/login">
              <Button
                size="lg"
                className="bg-[#1DA9EF] hover:bg-[#0073D1] text-white font-bold text-lg px-12 py-7 rounded-full shadow-lg shadow-[#1DA9EF]/30"
              >
                Ingresar al panel
              </Button>
            </Link>
          </div>
        </section>

        {/* Features grid */}
        <section className="py-20">
          <div className="container mx-auto px-6 max-w-5xl">
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
              {features.map(({ icon: Icon, title, desc }) => (
                <div
                  key={title}
                  className="bg-white border border-[#E5E7EB] rounded-2xl p-6 hover:border-[#1DA9EF] hover:shadow-lg hover:shadow-[#1DA9EF]/10 transition-all"
                >
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#E8F5F8] mb-4">
                    <Icon className="h-6 w-6 text-[#1DA9EF]" />
                  </div>
                  <h3 className="text-lg font-bold text-[#1A2238] mb-1">{title}</h3>
                  <p className="text-sm text-[#6B7280]">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#E5E7EB] py-8 bg-white">
        <div className="container mx-auto px-6 text-center text-sm text-[#6B7280]">
          © {new Date().getFullYear()} Shuless · Step into adventure
        </div>
      </footer>
    </div>
  )
}
