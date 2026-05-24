import { NextResponse } from 'next/server'
import { requireAuth, getAdminClient } from '@/lib/auth-helpers'

// GET - Get current user's integration settings
export async function GET() {
  const { user, error } = await requireAuth()
  if (error) return error

  const supabase = getAdminClient()

  const { data: integration, error: fetchError } = await supabase
    .from('user_integrations')
    .select('*')
    .eq('user_id', user!.id)
    .single()

  if (fetchError && fetchError.code !== 'PGRST116') {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  // Return integration (or empty object if none exists)
  return NextResponse.json({
    integration: integration || {
      shopify_shop: null,
      shopify_access_token: null,
      envioclick_api_key: null,
      envioclick_origin_address: null,
      siigo_username: null,
      siigo_access_key: null,
    }
  })
}

// PATCH - Update user's integration settings
export async function PATCH(request: Request) {
  const { user, error } = await requireAuth()
  if (error) return error

  const updates = await request.json()
  const supabase = getAdminClient()

  // Only allow updating specific fields
  const allowedFields = [
    'shopify_shop',
    'shopify_access_token',
    'envioclick_api_key',
    'envioclick_origin_address',
    'siigo_username',
    'siigo_access_key',
    // Legacy user-level Siigo config (kept for backward compatibility)
    'siigo_cost_center_id',
    'siigo_cost_center_name',
    'siigo_seller_id',
    'siigo_seller_name',
    'siigo_iva_tax_id',
    'siigo_default_document_id',
    'siigo_default_document_name',
    // WhatsApp-specific Siigo config
    'siigo_whatsapp_cost_center_id',
    'siigo_whatsapp_cost_center_name',
    'siigo_whatsapp_seller_id',
    'siigo_whatsapp_seller_name',
    'siigo_whatsapp_iva_tax_id',
    'siigo_whatsapp_default_document_id',
    'siigo_whatsapp_default_document_name',
  ]

  const sanitizedUpdates: Record<string, unknown> = {}
  for (const field of allowedFields) {
    if (field in updates) {
      sanitizedUpdates[field] = updates[field]
    }
  }

  if (Object.keys(sanitizedUpdates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  // Check if user has an integration record
  const { data: existing } = await supabase
    .from('user_integrations')
    .select('id')
    .eq('user_id', user!.id)
    .single()

  if (existing) {
    // Update existing record
    const { data, error: updateError } = await supabase
      .from('user_integrations')
      .update(sanitizedUpdates)
      .eq('user_id', user!.id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ integration: data })
  } else {
    // Create new record
    const { data, error: insertError } = await supabase
      .from('user_integrations')
      .insert({
        user_id: user!.id,
        ...sanitizedUpdates,
      })
      .select()
      .single()

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ integration: data })
  }
}
