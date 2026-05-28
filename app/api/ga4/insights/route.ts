import { NextResponse } from 'next/server'
import { createSign, createPrivateKey } from 'crypto'
import { requireAuth, getGA4Credentials } from '@/lib/auth-helpers'

// Google Analytics Data API v1beta — visits, sessions, conversion rate,
// traffic sources. Uses a GCP service account (no OAuth dance).
//
// Credentials needed in user_integrations:
//   - ga4_property_id          (numeric, e.g. "123456789", NOT the "G-XYZ" stream id)
//   - ga4_service_account_json (raw JSON downloaded from GCP IAM)
//
// The service account email must be added as a Viewer on the GA4 property
// (GA4 admin → Property Access Management → invite the service account email).

type ServiceAccountJSON = {
  client_email: string
  private_key: string
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

async function getAccessToken(sa: ServiceAccountJSON): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const claims = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }
  const headerB64 = base64url(JSON.stringify(header))
  const claimsB64 = base64url(JSON.stringify(claims))
  const signingInput = `${headerB64}.${claimsB64}`

  const key = createPrivateKey({ key: sa.private_key })
  const signer = createSign('RSA-SHA256')
  signer.update(signingInput)
  const sig = signer.sign(key)
  const sigB64 = base64url(sig)
  const jwt = `${signingInput}.${sigB64}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Token exchange failed: ${JSON.stringify(data)}`)
  return data.access_token as string
}

type GAResponse = {
  rows?: Array<{
    dimensionValues: Array<{ value: string }>
    metricValues: Array<{ value: string }>
  }>
  dimensionHeaders?: Array<{ name: string }>
  metricHeaders?: Array<{ name: string; type: string }>
}

async function runReport(
  propertyId: string,
  accessToken: string,
  body: {
    dimensions?: Array<{ name: string }>
    metrics: Array<{ name: string }>
    dateRanges: Array<{ startDate: string; endDate: string }>
    orderBys?: Array<unknown>
    limit?: number
  },
): Promise<GAResponse> {
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`GA4 API ${res.status}: ${JSON.stringify(data).slice(0, 500)}`)
  return data as GAResponse
}

function parseRows(r: GAResponse): Array<Record<string, string | number>> {
  const dimNames = (r.dimensionHeaders || []).map(d => d.name)
  const metNames = (r.metricHeaders || []).map(m => m.name)
  const metTypes = (r.metricHeaders || []).map(m => m.type)
  return (r.rows || []).map(row => {
    const out: Record<string, string | number> = {}
    row.dimensionValues.forEach((dv, i) => { out[dimNames[i]] = dv.value })
    row.metricValues.forEach((mv, i) => {
      const isNum = ['TYPE_INTEGER', 'TYPE_FLOAT', 'TYPE_SECONDS', 'TYPE_CURRENCY'].includes(metTypes[i])
      out[metNames[i]] = isNum ? Number(mv.value) || 0 : mv.value
    })
    return out
  })
}

export async function GET(request: Request) {
  const { error } = await requireAuth()
  if (error) return error

  const creds = await getGA4Credentials()
  if (!creds?.ga4_property_id || !creds?.ga4_service_account_json) {
    return NextResponse.json({
      available: false,
      error: 'GA4 no conectado. Cargá ga4_property_id y ga4_service_account_json en /dashboard/configuracion.',
    })
  }

  let sa: ServiceAccountJSON
  try {
    sa = JSON.parse(creds.ga4_service_account_json)
  } catch {
    return NextResponse.json({
      available: false,
      error: 'ga4_service_account_json no es JSON válido. Pegá el archivo completo del service account.',
    })
  }
  if (!sa.client_email || !sa.private_key) {
    return NextResponse.json({
      available: false,
      error: 'El JSON del service account debe tener client_email y private_key.',
    })
  }

  const { searchParams } = new URL(request.url)
  const start = searchParams.get('start_date') || new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)
  const end = searchParams.get('end_date') || new Date().toISOString().slice(0, 10)

  try {
    const accessToken = await getAccessToken(sa)
    const propertyId = creds.ga4_property_id

    const [totals, daily, bySource] = await Promise.all([
      // Totals for the period
      runReport(propertyId, accessToken, {
        metrics: [
          { name: 'sessions' },
          { name: 'totalUsers' },
          { name: 'screenPageViews' },
          { name: 'bounceRate' },
          { name: 'engagementRate' },
          { name: 'averageSessionDuration' },
        ],
        dateRanges: [{ startDate: start, endDate: end }],
      }),
      // Daily trend
      runReport(propertyId, accessToken, {
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
        dateRanges: [{ startDate: start, endDate: end }],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
      }),
      // Sessions by traffic source
      runReport(propertyId, accessToken, {
        dimensions: [{ name: 'sessionDefaultChannelGroup' }, { name: 'sessionSource' }],
        metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
        dateRanges: [{ startDate: start, endDate: end }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 30,
      }),
    ])

    return NextResponse.json({
      available: true,
      range: { start, end },
      totals: parseRows(totals)[0] || null,
      daily: parseRows(daily),
      bySource: parseRows(bySource),
    })
  } catch (e) {
    return NextResponse.json({
      available: false,
      error: e instanceof Error ? e.message : 'Error desconocido',
    }, { status: 500 })
  }
}
