import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, getUserProfile } from '@/lib/supabase-server'
import { Button } from '@/components/ui/button'
import { Users, Settings, LayoutDashboard, LogOut, Boxes } from 'lucide-react'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const profile = await getUserProfile()

  // Redirect if not admin
  if (!profile || profile.role !== 'admin') {
    redirect('/dashboard')
  }

  const supabase = await createClient()

  async function signOut() {
    'use server'
    const supabase = await createClient()
    await supabase.auth.signOut()
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-[#F5F7F4]">
      {/* Header */}
      <header className="bg-[#233037] border-b border-[#334047]">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="flex items-center gap-2">
              <span className="text-2xl font-semibold text-white tracking-tight">numbi</span>
              <span className="text-xs text-red-400 font-medium bg-red-400/20 px-2 py-1 rounded">Admin</span>
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-white text-sm">{profile.email}</span>
            <form action={signOut}>
              <Button variant="ghost" size="sm" className="text-white hover:text-red-400">
                <LogOut className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r min-h-[calc(100vh-64px)]">
          <nav className="p-4 space-y-2">
            <Link href="/admin">
              <Button variant="ghost" className="w-full justify-start">
                <LayoutDashboard className="h-4 w-4 mr-2" />
                Dashboard
              </Button>
            </Link>
            <Link href="/admin/users">
              <Button variant="ghost" className="w-full justify-start">
                <Users className="h-4 w-4 mr-2" />
                Usuarios
              </Button>
            </Link>
            <Link href="/admin/integrations">
              <Button variant="ghost" className="w-full justify-start">
                <Boxes className="h-4 w-4 mr-2" />
                Integraciones
              </Button>
            </Link>
            <hr className="my-4" />
            <Link href="/dashboard">
              <Button variant="ghost" className="w-full justify-start text-[#71828A]">
                <Settings className="h-4 w-4 mr-2" />
                Ir a Dashboard
              </Button>
            </Link>
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
