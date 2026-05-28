import { NextResponse } from 'next/server'
import { requireAuth, getMetaCredentials } from '@/lib/auth-helpers'

// Meta Marketing API — campaign-level insights.
// Pulls spend / impressions / clicks / CTR / CPC and purchase actions
// for each campaign in the date range.
// Requires meta_access_token + meta_ad_account_id in user_integrations.
//
// Action types we care about:
//   - "purchase" / "omni_purchase"  →  conversions (#orders)
//   - action_values with type "purchase"  →  revenue attributed
//
// Limitation: Meta attribution differs from Shopify's order_count
// (uses 7-day click + 1-day view by default). Both are valid; just
// surface both.

const META_API = 'https://graph.facebook.com/v21.0'

type MetaAction = { action_type: string; value: string }
type MetaInsightRow = {
  campaign_id?: string
  campaign_name?: string
  adset_id?: string
  adset_name?: string
  ad_id?: string
  ad_name?: string
  spend?: string
  impressions?: string
  clicks?: string
  ctr?: string
  cpc?: string
  cpm?: string
  reach?: string
  date_start?: string
  date_stop?: string
  actions?: MetaAction[]
  action_values?: MetaAction[]
}

function sumActions(actions: MetaAction[] | undefined, types: string[]): number {
  if (!actions) return 0
  return actions
    .filter(a => types.includes(a.action_type))
    .reduce((s, a) => s + (Number(a.value) || 0), 0)
}

export async function GET(request: Request) {
  const { error } = await requireAuth()
  if (error) return error

  const creds = await getMetaCredentials()
  if (!creds?.meta_access_token || !creds?.meta_ad_account_id) {
    return NextResponse.json({
      connected: false,
      error: 'Meta Ads no conectado. Configurá meta_access_token y meta_ad_account_id en /dashboard/configuracion.',
    })
  }

  const { searchParams } = new URL(request.url)
  const start = searchParams.get('start_date') || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const end = searchParams.get('end_date') || new Date().toISOString().slice(0, 10)
  const level = (searchParams.get('level') || 'campaign') as 'account' | 'campaign' | 'adset' | 'ad'

  const accountId = creds.meta_ad_account_id.startsWith('act_')
    ? creds.meta_ad_account_id
    : `act_${creds.meta_ad_account_id}`

  const fields = [
    'campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'ad_id', 'ad_name',
    'spend', 'impressions', 'clicks', 'ctr', 'cpc', 'cpm', 'reach',
    'actions', 'action_values',
    'date_start', 'date_stop',
  ].join(',')

  const url = new URL(`${META_API}/${accountId}/insights`)
  url.searchParams.set('access_token', creds.meta_access_token)
  url.searchParams.set('level', level)
  url.searchParams.set('time_range', JSON.stringify({ since: start, until: end }))
  url.searchParams.set('fields', fields)
  url.searchParams.set('limit', '500')

  try {
    let allRows: MetaInsightRow[] = []
    let nextUrl: string | null = url.toString()
    let pageCount = 0
    while (nextUrl && pageCount < 20) {
      pageCount++
      const res: Response = await fetch(nextUrl, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) {
        return NextResponse.json({
          connected: true,
          error: data?.error?.message || `Meta HTTP ${res.status}`,
          code: data?.error?.code,
          subcode: data?.error?.error_subcode,
          type: data?.error?.type,
        }, { status: 502 })
      }
      const rows: MetaInsightRow[] = data.data || []
      allRows.push(...rows)
      nextUrl = data.paging?.next || null
    }

    // Aggregate by campaign (or chosen level)
    type Agg = {
      key: string
      campaign_id?: string
      campaign_name?: string
      adset_id?: string
      adset_name?: string
      ad_id?: string
      ad_name?: string
      spend: number
      impressions: number
      clicks: number
      reach: number
      purchases: number
      purchase_value: number
      add_to_cart: number
      initiate_checkout: number
      view_content: number
      leads: number
    }
    const byKey = new Map<string, Agg>()
    for (const r of allRows) {
      const key = level === 'campaign' ? (r.campaign_id || 'unknown')
        : level === 'adset' ? (r.adset_id || 'unknown')
        : level === 'ad' ? (r.ad_id || 'unknown')
        : 'account'
      let agg = byKey.get(key)
      if (!agg) {
        agg = {
          key,
          campaign_id: r.campaign_id,
          campaign_name: r.campaign_name,
          adset_id: r.adset_id,
          adset_name: r.adset_name,
          ad_id: r.ad_id,
          ad_name: r.ad_name,
          spend: 0, impressions: 0, clicks: 0, reach: 0,
          purchases: 0, purchase_value: 0,
          add_to_cart: 0, initiate_checkout: 0, view_content: 0, leads: 0,
        }
        byKey.set(key, agg)
      }
      agg.spend += Number(r.spend || '0') || 0
      agg.impressions += Number(r.impressions || '0') || 0
      agg.clicks += Number(r.clicks || '0') || 0
      agg.reach += Number(r.reach || '0') || 0
      agg.purchases += sumActions(r.actions, ['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase'])
      agg.purchase_value += sumActions(r.action_values, ['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase'])
      agg.add_to_cart += sumActions(r.actions, ['add_to_cart', 'offsite_conversion.fb_pixel_add_to_cart'])
      agg.initiate_checkout += sumActions(r.actions, ['initiate_checkout', 'offsite_conversion.fb_pixel_initiate_checkout'])
      agg.view_content += sumActions(r.actions, ['view_content', 'offsite_conversion.fb_pixel_view_content'])
      agg.leads += sumActions(r.actions, ['lead', 'offsite_conversion.fb_pixel_lead'])
    }

    const items = Array.from(byKey.values()).map(a => ({
      ...a,
      ctr: a.impressions > 0 ? a.clicks / a.impressions : 0,
      cpc: a.clicks > 0 ? a.spend / a.clicks : 0,
      cpm: a.impressions > 0 ? (a.spend / a.impressions) * 1000 : 0,
      cpa: a.purchases > 0 ? a.spend / a.purchases : 0,
      roas: a.spend > 0 ? a.purchase_value / a.spend : 0,
    }))
    items.sort((a, b) => b.spend - a.spend)

    const totals = items.reduce(
      (acc, a) => ({
        spend: acc.spend + a.spend,
        impressions: acc.impressions + a.impressions,
        clicks: acc.clicks + a.clicks,
        reach: acc.reach + a.reach,
        purchases: acc.purchases + a.purchases,
        purchase_value: acc.purchase_value + a.purchase_value,
        add_to_cart: acc.add_to_cart + a.add_to_cart,
        initiate_checkout: acc.initiate_checkout + a.initiate_checkout,
      }),
      { spend: 0, impressions: 0, clicks: 0, reach: 0, purchases: 0, purchase_value: 0, add_to_cart: 0, initiate_checkout: 0 },
    )

    return NextResponse.json({
      connected: true,
      range: { start, end },
      level,
      items,
      totals: {
        ...totals,
        ctr: totals.impressions > 0 ? totals.clicks / totals.impressions : 0,
        cpc: totals.clicks > 0 ? totals.spend / totals.clicks : 0,
        cpm: totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0,
        cpa: totals.purchases > 0 ? totals.spend / totals.purchases : 0,
        roas: totals.spend > 0 ? totals.purchase_value / totals.spend : 0,
      },
    })
  } catch (e) {
    return NextResponse.json({
      connected: true,
      error: e instanceof Error ? e.message : 'Error desconocido',
    }, { status: 500 })
  }
}
