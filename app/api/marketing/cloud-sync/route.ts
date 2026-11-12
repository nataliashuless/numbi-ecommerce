import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { readCloudValues } from '@/lib/marketing/cloud-state'
import { runMarketingCloudSync } from '@/lib/marketing/cloud-sync'
export const maxDuration = 300
export async function GET() {
  const { error } = await requireAuth()
  if (error) return error
  const values = await readCloudValues()
  return NextResponse.json({ cronConfigured: Boolean(process.env.CRON_SECRET && process.env.CRON_SECRET.length >= 16), driveConfigured: Boolean(process.env.MARKETING_GOOGLE_SERVICE_ACCOUNT_JSON), status: values._cloudSync || null, sourceDates: values._cloudSourceDates || null })
}
export async function POST(request: Request) {
  const { error } = await requireAuth()
  if (error) return error
  const result = await runMarketingCloudSync(request)
  return NextResponse.json(result, { status: result.ok || result.skipped ? 200 : 503 })
}
