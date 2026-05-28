import { NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

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

export async function getShopifyCredentials() {
  const { data } = await getServiceClient()
    .from('user_integrations')
    .select('shopify_shop, shopify_access_token')
    .limit(1)
    .maybeSingle()
  return data
}

export async function getEnvioClickCredentials() {
  const { data } = await getServiceClient()
    .from('user_integrations')
    .select('envioclick_api_key, envioclick_origin_address')
    .limit(1)
    .maybeSingle()
  return data
}

export async function getSiigoCredentials() {
  const { data } = await getServiceClient()
    .from('user_integrations')
    .select('siigo_username, siigo_access_key')
    .limit(1)
    .maybeSingle()
  return data
}

export async function getMetaCredentials() {
  const { data } = await getServiceClient()
    .from('user_integrations')
    .select('meta_access_token, meta_ad_account_id, meta_token_expires_at')
    .limit(1)
    .maybeSingle()
  return data
}

export async function getGA4Credentials() {
  const { data } = await getServiceClient()
    .from('user_integrations')
    .select('ga4_property_id, ga4_service_account_json')
    .limit(1)
    .maybeSingle()
  return data
}

export async function getIntegration() {
  const { data } = await getServiceClient()
    .from('user_integrations')
    .select('*')
    .limit(1)
    .maybeSingle()
  return data
}

export function getAdminClient() {
  return getServiceClient()
}
