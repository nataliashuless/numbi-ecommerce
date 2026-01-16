import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase-server'

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getUser()

  // If user is already logged in, redirect to dashboard
  if (user) {
    redirect('/dashboard')
  }

  return <>{children}</>
}
