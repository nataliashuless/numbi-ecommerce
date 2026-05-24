import { NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// Service role client to bypass RLS
function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Create auth-aware Supabase client for API routes
async function createApiClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch { }
        },
      },
    }
  )
}

export interface AuthUser {
  id: string
  email: string
}

export interface AuthResult {
  user: AuthUser | null
  error: NextResponse | null
}

/**
 * Require authentication for an API route.
 * Returns the user if authenticated, or an error response if not.
 */
export async function requireAuth(): Promise<AuthResult> {
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return {
      user: null,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  return {
    user: { id: user.id, email: user.email || '' },
    error: null
  }
}

/**
 * Get user's Shopify credentials from database
 */
export async function getUserShopifyCredentials(userId: string) {
  const serviceClient = getServiceClient()

  const { data: integration } = await serviceClient
    .from('user_integrations')
    .select('shopify_shop, shopify_access_token')
    .eq('user_id', userId)
    .single()

  return integration
}

/**
 * Get user's EnvioClick credentials from database
 */
export async function getUserEnvioClickCredentials(userId: string) {
  const serviceClient = getServiceClient()

  const { data: integration } = await serviceClient
    .from('user_integrations')
    .select('envioclick_api_key, envioclick_origin_address')
    .eq('user_id', userId)
    .single()

  return integration
}

/**
 * Get user's Siigo credentials from database
 */
export async function getUserSiigoCredentials(userId: string) {
  const serviceClient = getServiceClient()

  const { data: integration } = await serviceClient
    .from('user_integrations')
    .select('siigo_username, siigo_access_key')
    .eq('user_id', userId)
    .single()

  return integration
}

/**
 * Get all user integrations
 */
export async function getUserIntegration(userId: string) {
  const serviceClient = getServiceClient()

  const { data: integration } = await serviceClient
    .from('user_integrations')
    .select('*')
    .eq('user_id', userId)
    .single()

  return integration
}

/**
 * Verify that a resource belongs to the authenticated user.
 * Used to prevent users from accessing other users' data.
 */
export async function verifyResourceOwnership(
  table: string,
  resourceId: string,
  userId: string
): Promise<boolean> {
  const serviceClient = getServiceClient()

  const { data } = await serviceClient
    .from(table)
    .select('user_id')
    .eq('id', resourceId)
    .single()

  return data?.user_id === userId
}

/**
 * Verify that a tienda belongs to the authenticated user.
 */
export async function verifyTiendaOwnership(
  tiendaId: string,
  userId: string
): Promise<boolean> {
  return verifyResourceOwnership('tiendas_terceros', tiendaId, userId)
}

/**
 * Get service client for database operations that bypass RLS
 */
export function getAdminClient() {
  return getServiceClient()
}
