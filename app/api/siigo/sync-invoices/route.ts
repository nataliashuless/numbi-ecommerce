import { NextResponse } from 'next/server'
import { requireAuth, getAdminClient } from '@/lib/auth-helpers'
import { listInvoices } from '@/lib/siigo-client'

export const maxDuration = 300

export async function POST(request: Request) {
  const { error } = await requireAuth()
  if (error) return error

  const body = await request.json().catch(() => ({}))

  // Auto mode: fire-and-forget freshness refresh for recent invoices.
  // - Skips if the cache was synced within the last hour.
  // - Otherwise pulls the last 45 days (covers current + previous month) —
  //   fast, incremental (upsert by id), and enough to keep dashboards current.
  const isAuto = body.auto === true
  let startDate: string = body.start_date || '2023-01-01'
  let endDate: string = body.end_date || new Date().toISOString().slice(0, 10)

  try {
    const supabase = getAdminClient()

    if (isAuto) {
      const { data: st } = await supabase
        .from('siigo_invoices_sync_state')
        .select('last_full_sync_at')
        .eq('id', 1)
        .maybeSingle()
      const ageMs = st?.last_full_sync_at ? Date.now() - new Date(st.last_full_sync_at).getTime() : Infinity
      if (ageMs < 60 * 60 * 1000) {
        return NextResponse.json({ skipped: true, reason: 'fresh', last_sync: st?.last_full_sync_at })
      }
      const from = new Date()
      from.setDate(from.getDate() - 45)
      startDate = from.toISOString().slice(0, 10)
      endDate = new Date().toISOString().slice(0, 10)
    }

    const invoices = await listInvoices(startDate, endDate)

    if (invoices.length === 0) {
      // In auto mode, still stamp the sync time so we honor the 1h TTL and
      // don't re-hit Siigo on every page load when there simply are no
      // recent invoices.
      if (isAuto) {
        await supabase
          .from('siigo_invoices_sync_state')
          .upsert({ id: 1, last_full_sync_at: new Date().toISOString() }, { onConflict: 'id' })
      }
      return NextResponse.json({ inserted: 0, total: 0, startDate, endDate })
    }

    const rows = invoices.map(inv => ({
      id: inv.id,
      number: inv.number,
      prefix: inv.prefix,
      name: inv.name,
      date: inv.date,
      total: inv.total,
      balance: inv.balance,
      customer_id: inv.customer?.id || null,
      customer_identification: inv.customer?.identification || null,
      observations: inv.observations,
      items: inv.items,
      raw: inv,
      synced_at: new Date().toISOString(),
    }))

    const CHUNK = 500
    let upserted = 0
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK)
      const { error: upsertError } = await supabase
        .from('siigo_invoices')
        .upsert(chunk, { onConflict: 'id' })
      if (upsertError) {
        return NextResponse.json(
          { error: upsertError.message, partial_upserted: upserted },
          { status: 500 }
        )
      }
      upserted += chunk.length
    }

    const dates = invoices.map(i => i.date).sort()
    const earliest = dates[0]
    const latest = dates[dates.length - 1]

    const { data: state } = await supabase
      .from('siigo_invoices_sync_state')
      .select('*')
      .eq('id', 1)
      .maybeSingle()

    const newEarliest =
      state?.earliest_date && state.earliest_date < earliest
        ? state.earliest_date
        : earliest
    const newLatest =
      state?.latest_date && state.latest_date > latest
        ? state.latest_date
        : latest

    await supabase
      .from('siigo_invoices_sync_state')
      .upsert(
        {
          id: 1,
          earliest_date: newEarliest,
          latest_date: newLatest,
          last_full_sync_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      )

    return NextResponse.json({
      upserted,
      total: invoices.length,
      earliest,
      latest,
      startDate,
      endDate,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error syncing Siigo invoices'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET() {
  const { error } = await requireAuth()
  if (error) return error

  const supabase = getAdminClient()
  const { data: state } = await supabase
    .from('siigo_invoices_sync_state')
    .select('*')
    .eq('id', 1)
    .maybeSingle()

  const { count } = await supabase
    .from('siigo_invoices')
    .select('*', { count: 'exact', head: true })

  return NextResponse.json({
    cached: count || 0,
    earliest: state?.earliest_date || null,
    latest: state?.latest_date || null,
    last_sync: state?.last_full_sync_at || null,
  })
}
