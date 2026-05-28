import { NextResponse } from 'next/server'
import { createSign, createPrivateKey } from 'crypto'
import { requireAuth, getGA4Credentials } from '@/lib/auth-helpers'

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

export async function GET() {
  const { error } = await requireAuth()
  if (error) return error

  const creds = await getGA4Credentials()
  if (!creds?.ga4_property_id || !creds?.ga4_service_account_json) {
    return NextResponse.json({ ok: false, error: 'Falta ga4_property_id o ga4_service_account_json' }, { status: 400 })
  }

  let sa: { client_email: string; private_key: string }
  try {
    sa = JSON.parse(creds.ga4_service_account_json)
  } catch {
    return NextResponse.json({ ok: false, error: 'service_account_json no es JSON válido' }, { status: 400 })
  }

  try {
    const now = Math.floor(Date.now() / 1000)
    const headerB64 = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    const claimsB64 = base64url(JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/analytics.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    }))
    const signingInput = `${headerB64}.${claimsB64}`
    const signer = createSign('RSA-SHA256')
    signer.update(signingInput)
    const sig = signer.sign(createPrivateKey({ key: sa.private_key }))
    const jwt = `${signingInput}.${base64url(sig)}`

    const tokRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    })
    const tokData = await tokRes.json()
    if (!tokRes.ok) {
      return NextResponse.json({ ok: false, error: `Token exchange: ${JSON.stringify(tokData)}` }, { status: 400 })
    }

    // Try fetching the property metadata to confirm access
    const propRes = await fetch(
      `https://analyticsadmin.googleapis.com/v1beta/properties/${creds.ga4_property_id}`,
      { headers: { Authorization: `Bearer ${tokData.access_token}` } },
    )
    const propData = await propRes.json()
    if (!propRes.ok) {
      return NextResponse.json({
        ok: false,
        error: `Property access: ${JSON.stringify(propData).slice(0, 500)}`,
        hint: 'Verificá que el service account email tenga acceso "Viewer" en la propiedad GA4.',
        serviceAccountEmail: sa.client_email,
      }, { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      property: {
        displayName: propData.displayName,
        currencyCode: propData.currencyCode,
        timeZone: propData.timeZone,
      },
      serviceAccountEmail: sa.client_email,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}
