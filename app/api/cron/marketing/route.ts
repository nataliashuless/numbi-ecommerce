import { NextResponse } from 'next/server'
import { isCronRequest } from '@/lib/cron-auth'
import { runMarketingCloudSync } from '@/lib/marketing/cloud-sync'
export const maxDuration = 300
export async function GET(request: Request) {
  if (!isCronRequest(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const result = await runMarketingCloudSync(request)
  return NextResponse.json(result, { status: result.ok || result.skipped ? 200 : 503 })
}
