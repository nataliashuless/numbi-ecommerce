import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase-server'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getUser()

  if (!user) {
    redirect('/login')
  }

  return <>{children}</>
}
