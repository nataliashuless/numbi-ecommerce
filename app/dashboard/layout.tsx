import { redirect } from 'next/navigation'
import { getUser, isAdmin } from '@/lib/supabase-server'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getUser()

  if (!user) {
    redirect('/login')
  }

  // Admin users should use /admin, not /dashboard
  const userIsAdmin = await isAdmin()
  if (userIsAdmin) {
    redirect('/admin')
  }

  return <>{children}</>
}
