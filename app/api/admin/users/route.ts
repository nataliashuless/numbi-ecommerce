import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@supabase/supabase-js'
import { createClient, isAdmin } from '@/lib/supabase-server'

// Create admin client with service role key
function getAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}

export async function POST(request: Request) {
  // Check if user is admin
  const isUserAdmin = await isAdmin()
  if (!isUserAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { email, password, full_name, company_name, role } = body

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
  }

  try {
    const adminClient = getAdminClient()

    // Create user with admin API
    const { data: userData, error: userError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        full_name,
      },
    })

    if (userError) {
      return NextResponse.json({ error: userError.message }, { status: 400 })
    }

    // Update profile with additional data
    if (userData.user) {
      await adminClient
        .from('profiles')
        .update({
          full_name,
          company_name,
          role: role || 'user',
        })
        .eq('id', userData.user.id)
    }

    return NextResponse.json({ success: true, user: userData.user })
  } catch (error) {
    console.error('Error creating user:', error)
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  // Check if user is admin
  const isUserAdmin = await isAdmin()
  if (!isUserAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('id')

  if (!userId) {
    return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
  }

  try {
    const adminClient = getAdminClient()

    // Delete user with admin API
    const { error } = await adminClient.auth.admin.deleteUser(userId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting user:', error)
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  // Check if user is admin
  const isUserAdmin = await isAdmin()
  if (!isUserAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('id')
  const body = await request.json()

  if (!userId) {
    return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
  }

  try {
    const adminClient = getAdminClient()

    // Update profile
    const { error } = await adminClient
      .from('profiles')
      .update(body)
      .eq('id', userId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating user:', error)
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}
