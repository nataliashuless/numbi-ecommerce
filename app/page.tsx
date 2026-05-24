import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white text-[#121212] flex flex-col">
      <header className="border-b border-[#E5E5E5]">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-semibold tracking-tight">shuless</span>
            <span className="text-xs text-[#545454] font-medium bg-[#F3F3F3] px-2 py-1 rounded">Admin</span>
          </div>
          <Link href="/login">
            <Button className="bg-[#121212] hover:bg-[#242833] text-white font-medium">
              Iniciar Sesión
            </Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-24 flex items-center justify-center">
        <div className="text-center max-w-2xl">
          <h1 className="text-5xl md:text-6xl font-bold mb-6 tracking-tight">
            Panel de administración
          </h1>
          <p className="text-xl text-[#545454] mb-12">
            Gestión central de ventas, inventario y facturación para Shuless.
          </p>
          <Link href="/login">
            <Button size="lg" className="bg-[#121212] hover:bg-[#242833] text-white font-semibold text-lg px-12 py-6">
              Ingresar
            </Button>
          </Link>
        </div>
      </main>

      <footer className="border-t border-[#E5E5E5] py-6">
        <div className="container mx-auto px-4 text-center text-sm text-[#545454]">
          © {new Date().getFullYear()} Shuless
        </div>
      </footer>
    </div>
  )
}
