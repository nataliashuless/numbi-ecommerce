import { NextResponse } from 'next/server'
import { requireAuth, getMetaCredentials } from '@/lib/auth-helpers'

// Sanity-check the configured Meta credentials by calling /me on the
// access token and fetching the configured ad account name.
export async function GET() {
  const { error } = await requireAuth()
  if (error) return error

  const creds = await getMetaCredentials()
  if (!creds?.meta_access_token || !creds?.meta_ad_account_id) {
    return NextResponse.json({ ok: false, error: 'Falta meta_access_token o meta_ad_account_id' }, { status: 400 })
  }

  const accountId = creds.meta_ad_account_id.startsWith('act_')
    ? creds.meta_ad_account_id
    : `act_${creds.meta_ad_account_id}`

  try {
    // Probe the ad account directly — also verifies the token has access to it
    const accUrl = `https://graph.facebook.com/v21.0/${accountId}?fields=id,name,currency,account_status,business_name&access_token=${encodeURIComponent(creds.meta_access_token)}`
    const accRes = await fetch(accUrl, { cache: 'no-store' })
    const accData = await accRes.json()
    if (!accRes.ok) {
      return NextResponse.json({
        ok: false,
        error: accData?.error?.message || `HTTP ${accRes.status}`,
        code: accData?.error?.code,
        subcode: accData?.error?.error_subcode,
        type: accData?.error?.type,
      }, { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      account: {
        id: accData.id,
        name: accData.name,
        currency: accData.currency,
        business_name: accData.business_name,
        account_status: accData.account_status,
      },
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}
