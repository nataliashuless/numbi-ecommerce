'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  BarChart3, Boxes, ChevronRight, CircleDollarSign, FileText, Gauge, Loader2,
  LogOut, Megaphone, MessageCircle, Package, Plus, RefreshCw, ShoppingCart,
  Store, Target, Tent, TrendingUp, X,
} from 'lucide-react'
import {
  Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { KpiCard } from '@/components/marketing/kpi-card'
import type { MarketingExecutiveReport, MarketingView, SizeMetric } from '@/lib/marketing/metrics'

type ObjectiveKey =
  | 'merMin' | 'roasMin' | 'cpaMax' | 'cacMax' | 'conversionMin' | 'aovMin'
  | 'marketingPctMax' | 'minOrdersForDecision' | 'stockCriticalUnits'
  | 'stockExcessUnits' | 'spendWithoutPurchaseReview' | 'growthGapAlertPct'
  | 'warningTolerancePct'
type Objectives = Partial<Record<ObjectiveKey, number>>

interface MetaItem {
  key: string
  campaign_id?: string
  campaign_name?: string
  adset_id?: string
  adset_name?: string
  ad_id?: string
  ad_name?: string
  spend: number
  impressions: number
  link_clicks: number
  reach: number
  purchases: number
  purchase_value: number
  ctr_link: number
  cpc_link: number | null
  cpm: number
  frequency: number | null
  cpa: number | null
  roas: number | null
}

interface MetaResponse {
  connected: boolean
  error?: string
  items?: MetaItem[]
  totals?: Omit<MetaItem, 'key'>
  daily?: Array<{ date: string; spend: number; purchases: number; purchase_value: number }>
}

interface GA4Response {
  available: boolean
  error?: string
  totals?: {
    sessions?: number
    addToCarts?: number
    checkouts?: number
    ecommercePurchases?: number
    purchaseRevenue?: number
  } | null
}

interface Annotation {
  id: string
  annotation_date: string
  type: string
  title: string
  detail: string | null
}

const objectiveFields: Array<{ key: ObjectiveKey; label: string; suffix: string }> = [
  { key: 'merMin', label: 'MER mínimo', suffix: 'x' },
  { key: 'roasMin', label: 'ROAS Meta mínimo', suffix: 'x' },
  { key: 'cpaMax', label: 'CPA máximo', suffix: 'COP' },
  { key: 'cacMax', label: 'CAC nuevo máximo', suffix: 'COP' },
  { key: 'conversionMin', label: 'Conversión mínima', suffix: '%' },
  { key: 'aovMin', label: 'AOV mínimo', suffix: 'COP' },
  { key: 'marketingPctMax', label: 'Marketing máximo sobre ventas', suffix: '%' },
  { key: 'minOrdersForDecision', label: 'Pedidos mínimos para concluir', suffix: 'pedidos' },
  { key: 'stockCriticalUnits', label: 'Stock crítico', suffix: 'unidades' },
  { key: 'stockExcessUnits', label: 'Stock en exceso', suffix: 'unidades' },
  { key: 'spendWithoutPurchaseReview', label: 'Gasto sin compra para revisar', suffix: 'COP' },
  { key: 'growthGapAlertPct', label: 'Brecha gasto vs ventas', suffix: '%' },
  { key: 'warningTolerancePct', label: 'Banda amarilla', suffix: '%' },
]

function currency(value: number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value)
}

function compactCurrency(value: number): string {
  return new Intl.NumberFormat('es-CO', { notation: 'compact', style: 'currency', currency: 'COP', maximumFractionDigits: 1 }).format(value)
}

function number(value: number): string {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value)
}

function ratio(value: number): string { return `${value.toFixed(2)}x` }
function percent(value: number): string { return `${(value * 100).toFixed(1)}%` }
function slug(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') }

function Unavailable({ label, reason }: { label: string; reason: string }) {
  return <Card className="border-dashed border-slate-300 bg-slate-50/70"><CardContent className="p-5"><p className="font-semibold text-slate-700">{label}: Dato no disponible</p><p className="mt-1 text-sm text-slate-500">{reason}</p></CardContent></Card>
}

function ChangeBadge({ value }: { value: number | null }) {
  if (value === null) return <Badge variant="outline">Sin comparación</Badge>
  const style = value > 0 ? 'bg-emerald-100 text-emerald-800' : value < 0 ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'
  return <Badge className={style}>{value > 0 ? '+' : ''}{(value * 100).toFixed(1)}%</Badge>
}

function classification(item: MetaItem, objectives: Objectives, enoughVolume: boolean) {
  if (!enoughVolume) return { action: 'DATOS INSUFICIENTES', reason: 'No alcanza el volumen mínimo configurado.' }
  const reviewSpend = objectives.spendWithoutPurchaseReview
  if (item.purchases === 0 && reviewSpend !== undefined && item.spend >= reviewSpend) {
    return { action: 'PAUSAR', reason: `Gastó ${currency(item.spend)} sin compras; supera el límite configurado.` }
  }
  const evidence: boolean[] = []
  const reasons: string[] = []
  if (objectives.roasMin !== undefined && item.roas !== null) {
    evidence.push(item.roas >= objectives.roasMin)
    reasons.push(`ROAS ${ratio(item.roas)} vs objetivo ${ratio(objectives.roasMin)}`)
  }
  if (objectives.cpaMax !== undefined && item.cpa !== null) {
    evidence.push(item.cpa <= objectives.cpaMax)
    reasons.push(`CPA ${currency(item.cpa)} vs máximo ${currency(objectives.cpaMax)}`)
  }
  if (evidence.length === 0) return { action: 'SIN OBJETIVO', reason: 'Configura ROAS o CPA para clasificar.' }
  if (evidence.every(Boolean)) return { action: 'ESCALAR', reason: reasons.join(' · ') }
  if (evidence.some(Boolean)) return { action: 'MANTENER', reason: reasons.join(' · ') }
  return { action: 'REVISAR', reason: reasons.join(' · ') }
}

function actionStyle(action: string): string {
  if (action === 'ESCALAR') return 'bg-emerald-100 text-emerald-800'
  if (action === 'MANTENER') return 'bg-sky-100 text-sky-800'
  if (action === 'REVISAR') return 'bg-amber-100 text-amber-800'
  if (action === 'PAUSAR') return 'bg-rose-100 text-rose-800'
  return 'bg-slate-100 text-slate-700'
}

function stockStatus(size: SizeMetric, objectives: Objectives): { label: string; style: string } {
  if (size.stock === null) return { label: 'Sin cruce de stock', style: 'bg-slate-100 text-slate-700' }
  if (size.stock <= 0) return { label: 'Agotado', style: 'bg-rose-100 text-rose-800' }
  if (objectives.stockCriticalUnits !== undefined && size.stock <= objectives.stockCriticalUnits) return { label: 'Próximo a agotarse', style: 'bg-amber-100 text-amber-800' }
  if (objectives.stockExcessUnits !== undefined && size.stock >= objectives.stockExcessUnits) return { label: 'Revisar exceso', style: 'bg-sky-100 text-sky-800' }
  return { label: 'Disponible', style: 'bg-emerald-100 text-emerald-800' }
}

function previousMetaItem(item: MetaItem, previous: MetaResponse | null): MetaItem | undefined {
  return previous?.items?.find(candidate => candidate.key === item.key)
}

export default function MarketingPage() {
  const [view, setView] = useState<MarketingView>('weekly')
  const [report, setReport] = useState<MarketingExecutiveReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [channel, setChannel] = useState('')
  const [product, setProduct] = useState('')
  const [size, setSize] = useState('')
  const [customerType, setCustomerType] = useState('all')
  const [metaCurrent, setMetaCurrent] = useState<MetaResponse | null>(null)
  const [metaPrevious, setMetaPrevious] = useState<MetaResponse | null>(null)
  const [metaAds, setMetaAds] = useState<MetaResponse | null>(null)
  const [metaAdsPrevious, setMetaAdsPrevious] = useState<MetaResponse | null>(null)
  const [metaAdsets, setMetaAdsets] = useState<MetaResponse | null>(null)
  const [ga4Current, setGa4Current] = useState<GA4Response | null>(null)
  const [ga4Previous, setGa4Previous] = useState<GA4Response | null>(null)
  const [campaignFilter, setCampaignFilter] = useState('')
  const [adsetFilter, setAdsetFilter] = useState('')
  const [adFilter, setAdFilter] = useState('')
  const [tableSearch, setTableSearch] = useState('')
  const [objectives, setObjectives] = useState<Objectives>({})
  const [settingsAvailable, setSettingsAvailable] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [annotationsAvailable, setAnnotationsAvailable] = useState(false)
  const [showAnnotation, setShowAnnotation] = useState(false)
  const [annotationForm, setAnnotationForm] = useState({ annotation_date: '', type: 'promocion', title: '', detail: '' })

  async function fetchSupportingData(nextReport: MarketingExecutiveReport) {
    const { current, previous } = nextReport.periods
    const annotationResponse = await fetch(`/api/marketing/annotations?start_date=${nextReport.trend[0]?.month || current.start}&end_date=${current.end}`)
      .then(response => response.json()).catch(() => ({ available: false, items: [] }))
    setAnnotationsAvailable(Boolean(annotationResponse.available))
    setAnnotations(annotationResponse.items || [])

    if (nextReport.availability.meta) {
      const metaUrl = (period: { start: string; end: string }, level: string, daily = false) => `/api/meta/insights?start_date=${period.start}&end_date=${period.end}&level=${level}${daily ? '&daily=true' : ''}`
      const responses = await Promise.all([
        fetch(metaUrl(current, 'campaign')).then(response => response.json()),
        fetch(metaUrl(previous, 'campaign')).then(response => response.json()),
        fetch(metaUrl(current, 'ad')).then(response => response.json()),
        fetch(metaUrl(previous, 'ad')).then(response => response.json()),
        fetch(metaUrl(current, 'adset')).then(response => response.json()),
        fetch(metaUrl(current, 'account', true)).then(response => response.json()),
      ])
      setMetaCurrent({ ...responses[0], daily: responses[5]?.daily || [] }); setMetaPrevious(responses[1]); setMetaAds(responses[2]); setMetaAdsPrevious(responses[3]); setMetaAdsets(responses[4])
    } else {
      setMetaCurrent(null); setMetaPrevious(null); setMetaAds(null); setMetaAdsPrevious(null); setMetaAdsets(null)
    }

    if (nextReport.availability.ga4) {
      const [currentGa, previousGa] = await Promise.all([
        fetch(`/api/ga4/insights?start_date=${current.start}&end_date=${current.end}`).then(response => response.json()),
        fetch(`/api/ga4/insights?start_date=${previous.start}&end_date=${previous.end}`).then(response => response.json()),
      ])
      setGa4Current(currentGa); setGa4Previous(previousGa)
    } else { setGa4Current(null); setGa4Previous(null) }
  }

  async function fetchReport() {
    setLoading(true); setError(null)
    const params = new URLSearchParams({ view, customer_type: customerType })
    if (startDate && endDate) { params.set('start_date', startDate); params.set('end_date', endDate) }
    if (channel) params.set('channel', channel)
    if (product) params.set('product', product)
    if (size) params.set('size', size)
    try {
      const response = await fetch(`/api/marketing/executive?${params}`)
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'No fue posible cargar Marketing')
      setReport(payload)
      await fetchSupportingData(payload)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Error desconocido') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    fetch('/api/marketing/settings').then(response => response.json()).then(payload => {
      setSettingsAvailable(Boolean(payload.available)); setObjectives(payload.objectives || {})
    }).catch(() => {})
  }, [])

  useEffect(() => {
    fetchReport()
    // Filters are applied explicitly with the Actualizar button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  async function saveObjectives() {
    const response = await fetch('/api/marketing/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ objectives }) })
    if (response.ok) setShowSettings(false)
  }

  async function createAnnotation() {
    const response = await fetch('/api/marketing/annotations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(annotationForm) })
    if (!response.ok) return
    setShowAnnotation(false); setAnnotationForm({ annotation_date: '', type: 'promocion', title: '', detail: '' })
    if (report) await fetchSupportingData(report)
  }

  const spend = metaCurrent?.totals?.spend ?? null
  const previousSpend = metaPrevious?.totals?.spend ?? null
  const mer = spend && report ? report.current.netSales / spend : null
  const previousMer = previousSpend && report ? report.previous.netSales / previousSpend : null
  const marketingPct = spend && report?.current.netSales ? spend / report.current.netSales : null
  const conversion = ga4Current?.totals?.sessions && report ? report.current.orders / ga4Current.totals.sessions : null
  const previousConversion = ga4Previous?.totals?.sessions && report ? report.previous.orders / ga4Previous.totals.sessions : null
  const minOrders = objectives.minOrdersForDecision
  const sufficient = report ? minOrders === undefined || report.current.orders >= minOrders : false
  const tolerance = objectives.warningTolerancePct === undefined ? undefined : objectives.warningTolerancePct / 100

  const filteredCampaigns = (metaCurrent?.items || []).filter(item => (!campaignFilter || item.campaign_id === campaignFilter) && (!tableSearch || (item.campaign_name || '').toLowerCase().includes(tableSearch.toLowerCase())))
  const filteredAds = (metaAds?.items || []).filter(item => (!campaignFilter || item.campaign_id === campaignFilter) && (!adsetFilter || item.adset_id === adsetFilter) && (!adFilter || item.ad_id === adFilter) && (!tableSearch || `${item.ad_name || ''} ${item.campaign_name || ''}`.toLowerCase().includes(tableSearch.toLowerCase())))
  const spendToReview = metaAds?.items?.reduce((sum, item) => {
    const noPurchases = item.purchases === 0
    const belowRoas = objectives.roasMin !== undefined && item.roas !== null && item.roas < objectives.roasMin
    return sum + (noPurchases || belowRoas ? item.spend : 0)
  }, 0) ?? null
  const previousSpendToReview = metaAdsPrevious?.items?.reduce((sum, item) => {
    const noPurchases = item.purchases === 0
    const belowRoas = objectives.roasMin !== undefined && item.roas !== null && item.roas < objectives.roasMin
    return sum + (noPurchases || belowRoas ? item.spend : 0)
  }, 0) ?? null
  const chartData = report?.current.daily.map(point => ({ ...point, spend: metaCurrent?.daily?.find(metaPoint => metaPoint.date === point.date)?.spend ?? null })) || []
  const salesGrowth = report?.comparisons.netSales.change ?? null
  const spendGrowth = spend !== null && previousSpend ? (spend - previousSpend) / previousSpend : null
  const growthGapAlert = objectives.growthGapAlertPct !== undefined && salesGrowth !== null && spendGrowth !== null
    ? spendGrowth - salesGrowth >= objectives.growthGapAlertPct / 100
    : false

  const insights: string[] = []
  if (report) {
    const salesChange = report.comparisons.netSales.change
    if (salesChange !== null) insights.push(`Ventas netas ${salesChange >= 0 ? 'aumentaron' : 'cayeron'} ${Math.abs(salesChange * 100).toFixed(1)}% frente al periodo anterior.`)
    if (spend !== null && previousSpend !== null && previousSpend > 0 && salesChange !== null) {
      const spendChange = (spend - previousSpend) / previousSpend
      insights.push(`El gasto Meta cambió ${spendChange >= 0 ? '+' : ''}${(spendChange * 100).toFixed(1)}% frente a ${salesChange >= 0 ? '+' : ''}${(salesChange * 100).toFixed(1)}% en ventas Shopify.`)
    }
    const growingProduct = [...report.current.products].filter(item => item.variation !== null && item.variation > 0).sort((a, b) => (b.variation || 0) - (a.variation || 0))[0]
    if (growingProduct) insights.push(`${growingProduct.reference} fue la referencia con mayor crecimiento comparable: +${((growingProduct.variation || 0) * 100).toFixed(1)}%, con ${currency(growingProduct.sales)} en ventas.`)
    const outOfStock = report.current.sizes.filter(item => item.units > 0 && item.stock !== null && item.stock <= 0)
    if (outOfStock.length > 0) insights.push(`${outOfStock.length} combinaciones referencia-talla vendieron en el periodo y aparecen agotadas en el stock propio actual.`)
    if (!report.availability.meta) insights.push('Meta Ads no está conectado en la base actual; gasto, MER, ROAS, CPA y decisiones de pauta no se pueden concluir.')
  }

  return <div className="min-h-screen bg-[#f4f6f8] text-slate-900">
    <DashboardHeader />
    <main className="container mx-auto space-y-6 px-4 py-7">
      <section className="overflow-hidden rounded-2xl bg-[#172239] text-white shadow-sm"><div className="grid gap-6 px-6 py-7 lg:grid-cols-[1fr_auto] lg:items-end"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#54c3f1]">Panel ejecutivo</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Marketing</h1><p className="mt-2 max-w-2xl text-sm text-slate-300">Resultado, eficiencia, clientes, producto e inventario. Shopify siempre se presenta como venta real; Meta como atribución publicitaria.</p></div><div className="flex flex-wrap gap-2"><Button onClick={() => setShowAnnotation(true)} variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10"><Plus className="mr-2 h-4 w-4" />Anotación</Button><Button onClick={() => setShowSettings(true)} className="bg-[#26a9e8] text-white hover:bg-[#1598d7]"><Target className="mr-2 h-4 w-4" />Objetivos</Button></div></div></section>
      <FilterBar view={view} setView={setView} startDate={startDate} setStartDate={setStartDate} endDate={endDate} setEndDate={setEndDate} channel={channel} setChannel={setChannel} product={product} setProduct={setProduct} size={size} setSize={setSize} customerType={customerType} setCustomerType={setCustomerType} report={report} loading={loading} refresh={fetchReport} />

      {loading ? <div className="flex items-center justify-center py-24 text-slate-500"><Loader2 className="mr-3 h-7 w-7 animate-spin" />Construyendo reporte…</div> : error ? <Card className="border-rose-200 bg-rose-50"><CardContent className="p-6 text-rose-800">{error}</CardContent></Card> : report && <>
        <section id="gerencia" className="space-y-4"><SectionTitle eyebrow="01 · Resultado" title="Gerencia en 30 segundos" badge={report.periods.current.label} /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Ventas netas Shopify" source="Shopify" value={report.current.netSales} previous={report.previous.netSales} change={report.comparisons.netSales.change} format={currency} sufficient={sufficient} />
          <KpiCard label="Gasto Meta" source="Meta Ads" value={spend} previous={previousSpend} change={spend !== null && previousSpend ? (spend - previousSpend) / previousSpend : null} format={currency} sufficient={sufficient} />
          <KpiCard label="MER" source="Shopify ÷ Meta" value={mer} previous={previousMer} change={mer !== null && previousMer ? (mer - previousMer) / previousMer : null} target={objectives.merMin} tolerancePct={tolerance} format={ratio} sufficient={sufficient} />
          <KpiCard label="ROAS Meta" source="Atribución Meta" value={metaCurrent?.totals?.roas ?? null} previous={metaPrevious?.totals?.roas ?? null} change={metaCurrent?.totals?.roas != null && metaPrevious?.totals?.roas ? (metaCurrent.totals.roas - metaPrevious.totals.roas) / metaPrevious.totals.roas : null} target={objectives.roasMin} tolerancePct={tolerance} format={ratio} sufficient={sufficient} />
          <KpiCard label="CAC cliente nuevo" source="Meta + primer pedido Shopify" value={null} previous={null} change={null} target={objectives.cacMax} direction="lower" tolerancePct={tolerance} format={currency} sufficient={false} />
          <KpiCard label="CPA" source="Meta Ads" value={metaCurrent?.totals?.cpa ?? null} previous={metaPrevious?.totals?.cpa ?? null} change={metaCurrent?.totals?.cpa != null && metaPrevious?.totals?.cpa ? (metaCurrent.totals.cpa - metaPrevious.totals.cpa) / metaPrevious.totals.cpa : null} target={objectives.cpaMax} direction="lower" tolerancePct={tolerance} format={currency} sufficient={sufficient} />
          <KpiCard label="Conversión Shopify" source="Pedidos Shopify ÷ sesiones GA4" value={conversion} previous={previousConversion} change={conversion !== null && previousConversion ? (conversion - previousConversion) / previousConversion : null} target={objectives.conversionMin === undefined ? undefined : objectives.conversionMin / 100} tolerancePct={tolerance} format={percent} sufficient={sufficient} />
          <KpiCard label="AOV / ticket promedio" source="Shopify" value={report.current.aov} previous={report.previous.aov} change={report.comparisons.aov.change} target={objectives.aovMin} tolerancePct={tolerance} format={currency} sufficient={sufficient} />
          <KpiCard label="Pedidos" source="Shopify" value={report.current.orders} previous={report.previous.orders} change={report.comparisons.orders.change} format={number} sufficient={sufficient} />
          <KpiCard label="Unidades vendidas" source="Shopify" value={report.current.units} previous={report.previous.units} change={report.comparisons.units.change} format={number} sufficient={sufficient} />
          <KpiCard label="Clientes nuevos" source="Shopify customer.created_at" value={report.current.customers.new} previous={report.previous.customers.new} change={report.comparisons.newCustomers.change} format={number} sufficient={sufficient} />
          <KpiCard label="Gasto publicitario a revisar" source="Meta Ads" value={spendToReview} previous={previousSpendToReview} change={spendToReview !== null && previousSpendToReview ? (spendToReview - previousSpendToReview) / previousSpendToReview : null} direction="lower" format={currency} sufficient={sufficient} />
        </div><Card className="border-0 bg-[#eaf6fb] shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-lg text-[#172239]"><Gauge className="h-5 w-5 text-[#168fc6]" />Resumen ejecutivo</CardTitle></CardHeader><CardContent><ol className="space-y-2">{insights.slice(0, 5).map((item, index) => <li key={item} className="flex gap-3 text-sm text-slate-700"><span className="font-bold text-[#168fc6]">{index + 1}.</span>{item}</li>)}</ol></CardContent></Card></section>

        <section id="ventas-inversion" className="grid gap-5 xl:grid-cols-[1.5fr_1fr]"><SalesSpendChart data={chartData} metaAvailable={report.availability.meta} annotations={annotations} growthGapAlert={growthGapAlert} salesGrowth={salesGrowth} spendGrowth={spendGrowth} /><MetaVsShopify sales={report.current.netSales} metaSales={metaCurrent?.totals?.purchase_value ?? null} /></section>
        <ProfitabilitySection report={report} spend={spend} mer={mer} meta={metaCurrent} marketingPct={marketingPct} />
        <FunnelCustomers report={report} ga4={ga4Current} previousGa4={ga4Previous} />
        <ProductsSection report={report} objectives={objectives} search={tableSearch} setSearch={setTableSearch} selectedProduct={product} selectProduct={setProduct} />

        <section id="meta" className="space-y-4"><SectionTitle eyebrow="04 · Diagnóstico" title="Campañas y anuncios Meta" />{report.availability.meta ? <><div className="flex flex-wrap gap-3 rounded-xl border bg-white p-3"><select value={campaignFilter} onChange={event => setCampaignFilter(event.target.value)} className="h-9 rounded-md border px-3 text-sm"><option value="">Todas las campañas</option>{metaCurrent?.items?.map(item => <option key={item.key} value={item.campaign_id}>{item.campaign_name}</option>)}</select><select value={adsetFilter} onChange={event => setAdsetFilter(event.target.value)} className="h-9 rounded-md border px-3 text-sm"><option value="">Todos los ad sets</option>{metaAdsets?.items?.filter(item => !campaignFilter || item.campaign_id === campaignFilter).map(item => <option key={item.key} value={item.adset_id}>{item.adset_name}</option>)}</select><select value={adFilter} onChange={event => setAdFilter(event.target.value)} className="h-9 rounded-md border px-3 text-sm"><option value="">Todos los anuncios</option>{metaAds?.items?.filter(item => !campaignFilter || item.campaign_id === campaignFilter).map(item => <option key={item.key} value={item.ad_id}>{item.ad_name}</option>)}</select></div><AdHighlights items={filteredAds} /><MetaTable title="Campañas" items={filteredCampaigns} previous={metaPrevious} objectives={objectives} enoughVolume={sufficient} showCampaign={false} /><MetaTable title="Anuncios / creativos" items={filteredAds} previous={metaAdsPrevious} objectives={objectives} enoughVolume={sufficient} showCampaign /></> : <Unavailable label="Meta Ads" reason="Las columnas de credenciales no están aplicadas en Supabase y no existe una cuenta Meta configurada." />}</section>

        <ReviewAndConcentration report={report} spendToReview={spendToReview} />
        {view === 'monthly' && <MonthlySection report={report} annotations={annotations} />}
        <section id="alertas" className="space-y-4"><SectionTitle eyebrow="05 · Decisiones" title="Alertas y oportunidades" /><AlertGrid report={report} metaAds={metaAds} objectives={objectives} sufficient={sufficient} /><Decisions report={report} meta={metaCurrent} objectives={objectives} sufficient={sufficient} /></section>
        <QualitySection report={report} annotations={annotations} annotationsAvailable={annotationsAvailable} />
      </>}
    </main>
    {showSettings && <SettingsPanel objectives={objectives} setObjectives={setObjectives} available={settingsAvailable} onClose={() => setShowSettings(false)} onSave={saveObjectives} />}
    {showAnnotation && <AnnotationPanel form={annotationForm} setForm={setAnnotationForm} available={annotationsAvailable} onClose={() => setShowAnnotation(false)} onSave={createAnnotation} />}
  </div>
}

function DashboardHeader() {
  const nav = [
    ['/dashboard', 'Ventas', BarChart3], ['/dashboard/shopify', 'Shopify', ShoppingCart], ['/dashboard/whatsapp', 'WhatsApp', MessageCircle],
    ['/dashboard/tiendas', 'Tiendas', Store], ['/dashboard/ferias', 'Ferias', Tent], ['/dashboard/conciliacion', 'Conciliación', FileText],
    ['/dashboard/analitica', 'Analítica', TrendingUp], ['/dashboard/productos', 'Productos', Package], ['/dashboard/inventario', 'Inventario', Boxes],
  ] as const
  return <><header className="border-b border-[#28344f] bg-[#172239] text-white"><div className="container mx-auto flex items-center justify-between px-4 py-4"><div className="flex items-center gap-3"><span className="text-2xl font-bold tracking-tight text-[#26a9e8]">shuless</span><span className="rounded-full bg-[#26a9e8] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">Admin</span></div><Link href="/"><Button variant="ghost" className="text-slate-300 hover:bg-[#26334e] hover:text-white"><LogOut className="mr-2 h-4 w-4" />Cerrar sesión</Button></Link></div></header><div className="border-b bg-white"><div className="container mx-auto px-4"><nav className="flex gap-2 overflow-x-auto">{nav.slice(0, 5).map(([href, label, Icon]) => <Link href={href} key={href}><Button variant="ghost" className="rounded-none py-4"><Icon className="mr-2 h-4 w-4" />{label}</Button></Link>)}<Button variant="ghost" className="rounded-none border-b-2 border-[#26a9e8] py-4 text-[#172239]"><Megaphone className="mr-2 h-4 w-4" />Marketing</Button>{nav.slice(5).map(([href, label, Icon]) => <Link href={href} key={href}><Button variant="ghost" className="rounded-none py-4"><Icon className="mr-2 h-4 w-4" />{label}</Button></Link>)}</nav></div></div></>
}

function SectionTitle({ eyebrow, title, badge }: { eyebrow: string; title: string; badge?: string }) {
  return <div className="flex items-end justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#168fc6]">{eyebrow}</p><h2 className="text-2xl font-bold text-[#172239]">{title}</h2></div>{badge && <Badge variant="outline">{badge}</Badge>}</div>
}

function FilterBar(props: {
  view: MarketingView; setView: (value: MarketingView) => void
  startDate: string; setStartDate: (value: string) => void; endDate: string; setEndDate: (value: string) => void
  channel: string; setChannel: (value: string) => void; product: string; setProduct: (value: string) => void
  size: string; setSize: (value: string) => void; customerType: string; setCustomerType: (value: string) => void
  report: MarketingExecutiveReport | null; loading: boolean; refresh: () => void
}) {
  return <section className="rounded-2xl border bg-white p-4 shadow-sm"><div className="flex flex-wrap items-end gap-3"><div className="flex rounded-lg bg-slate-100 p-1"><button onClick={() => { props.setView('weekly'); props.setStartDate(''); props.setEndDate('') }} className={`rounded-md px-4 py-2 text-sm font-semibold ${props.view === 'weekly' ? 'bg-white text-[#172239] shadow-sm' : 'text-slate-500'}`}>Reporte semanal</button><button onClick={() => { props.setView('monthly'); props.setStartDate(''); props.setEndDate('') }} className={`rounded-md px-4 py-2 text-sm font-semibold ${props.view === 'monthly' ? 'bg-white text-[#172239] shadow-sm' : 'text-slate-500'}`}>Reporte mensual</button></div><label className="text-xs font-medium text-slate-500">Desde<Input type="date" value={props.startDate} onChange={event => props.setStartDate(event.target.value)} className="mt-1 w-40" /></label><label className="text-xs font-medium text-slate-500">Hasta<Input type="date" value={props.endDate} onChange={event => props.setEndDate(event.target.value)} className="mt-1 w-40" /></label><label className="text-xs font-medium text-slate-500">Canal<select value={props.channel} onChange={event => props.setChannel(event.target.value)} className="mt-1 block h-9 min-w-32 rounded-md border bg-white px-3 text-sm"><option value="">Todos</option>{props.report?.filters.channels.map(item => <option key={item}>{item}</option>)}</select></label><label className="text-xs font-medium text-slate-500">Referencia<select value={props.product} onChange={event => props.setProduct(event.target.value)} className="mt-1 block h-9 max-w-52 rounded-md border bg-white px-3 text-sm"><option value="">Todas</option>{props.report?.filters.products.map(item => <option key={item}>{item}</option>)}</select></label><label className="text-xs font-medium text-slate-500">Talla<select value={props.size} onChange={event => props.setSize(event.target.value)} className="mt-1 block h-9 min-w-24 rounded-md border bg-white px-3 text-sm"><option value="">Todas</option>{props.report?.filters.sizes.map(item => <option key={item}>{item}</option>)}</select></label><label className="text-xs font-medium text-slate-500">Cliente<select value={props.customerType} onChange={event => props.setCustomerType(event.target.value)} className="mt-1 block h-9 rounded-md border bg-white px-3 text-sm"><option value="all">Todos</option><option value="new">Nuevo</option><option value="returning">Recurrente</option></select></label><Button onClick={props.refresh} disabled={props.loading}><RefreshCw className={`mr-2 h-4 w-4 ${props.loading ? 'animate-spin' : ''}`} />Actualizar</Button></div>{props.report && <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500"><span>Actual: {props.report.periods.current.start} a {props.report.periods.current.end}</span><span>Comparación: {props.report.periods.previous.start} a {props.report.periods.previous.end}</span><span>Zona horaria: {props.report.timeZone}</span></div>}</section>
}

function SalesSpendChart({ data, metaAvailable, annotations, growthGapAlert, salesGrowth, spendGrowth }: { data: Array<{ date: string; sales: number; spend: number | null }>; metaAvailable: boolean; annotations: Annotation[]; growthGapAlert: boolean; salesGrowth: number | null; spendGrowth: number | null }) {
  return <Card><CardHeader><CardTitle>Ventas reales vs inversión</CardTitle><p className="text-xs text-slate-500">Ventas netas Shopify y gasto Meta por día. Ejes separados.</p></CardHeader><CardContent><div className="h-80"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={data}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis yAxisId="sales" tickFormatter={compactCurrency} tick={{ fontSize: 11 }} /><YAxis yAxisId="spend" orientation="right" tickFormatter={compactCurrency} tick={{ fontSize: 11 }} /><Tooltip formatter={(value) => currency(Number(value))} /><Bar yAxisId="spend" dataKey="spend" name="Gasto Meta" fill="#f59e0b" radius={[4, 4, 0, 0]} /><Line yAxisId="sales" type="monotone" dataKey="sales" name="Ventas Shopify" stroke="#168fc6" strokeWidth={3} dot={false} />{annotations.filter(item => data.some(point => point.date === item.annotation_date)).map(item => <ReferenceLine key={item.id} x={item.annotation_date} yAxisId="sales" stroke="#64748b" strokeDasharray="3 3" label={{ value: item.title, position: 'insideTopRight', fontSize: 10 }} />)}</ComposedChart></ResponsiveContainer></div><div className="mt-3 flex flex-wrap gap-2 text-xs"><Badge variant="outline">Ventas {salesGrowth === null ? 'sin comparación' : `${salesGrowth >= 0 ? '+' : ''}${(salesGrowth * 100).toFixed(1)}%`}</Badge><Badge variant="outline">Gasto {spendGrowth === null ? 'N/D' : `${spendGrowth >= 0 ? '+' : ''}${(spendGrowth * 100).toFixed(1)}%`}</Badge></div>{growthGapAlert && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">El gasto está creciendo por encima de ventas más allá de la brecha configurada. Revisa eficiencia y atribución.</div>}{!metaAvailable && <p className="mt-2 text-xs text-amber-700">Gasto Meta: Dato no disponible. El gráfico muestra únicamente Shopify.</p>}</CardContent></Card>
}

function MetaVsShopify({ sales, metaSales }: { sales: number; metaSales: number | null }) {
  return <Card><CardHeader><CardTitle>Meta vs Shopify</CardTitle></CardHeader><CardContent className="space-y-4"><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Ventas reales Shopify</p><p className="mt-1 text-2xl font-bold text-[#172239]">{currency(sales)}</p></div><div className="rounded-xl bg-blue-50 p-4"><p className="text-xs text-blue-700">Ventas atribuidas por Meta</p><p className="mt-1 text-2xl font-bold text-blue-900">{metaSales === null ? 'Dato no disponible' : currency(metaSales)}</p></div><div className="flex items-center justify-between border-t pt-4 text-sm"><span>Meta / Shopify</span><strong>{metaSales !== null && sales > 0 ? percent(metaSales / sales) : 'Dato no disponible'}</strong></div><p className="text-xs text-slate-500">La atribución de Meta no reemplaza ni se suma a las ventas reales de Shopify.</p></CardContent></Card>
}

function ProfitabilitySection({ report, spend, mer, meta, marketingPct }: { report: MarketingExecutiveReport; spend: number | null; mer: number | null; meta: MetaResponse | null; marketingPct: number | null }) {
  const values = [['Gasto Meta', spend, 'Fuente Meta Ads'], ['MER', mer, 'Ventas Shopify / gasto Meta'], ['ROAS Meta', meta?.totals?.roas ?? null, 'Ventas atribuidas / gasto'], ['CPA', meta?.totals?.cpa ?? null, 'Gasto / compras Meta'], ['Marketing % ventas', marketingPct, 'Gasto Meta / ventas Shopify']] as const
  return <section id="rentabilidad" className="space-y-4"><SectionTitle eyebrow="02 · Rentabilidad" title="Eficiencia de marketing" /><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">{values.map(([label, value, note]) => <Card key={label}><CardContent className="p-5"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-3 text-xl font-bold text-[#172239]">{value === null ? 'Dato no disponible' : label === 'Gasto Meta' || label === 'CPA' ? currency(value) : label === 'Marketing % ventas' ? percent(value) : ratio(value)}</p><p className="mt-2 text-xs text-slate-400">{note}</p></CardContent></Card>)}</div>{!report.availability.cogs && <Unavailable label="Margen bruto y margen después de marketing" reason="No existe COGS ni el conjunto completo de costos variables por pedido/producto." />}</section>
}

function FunnelCustomers({ report, ga4, previousGa4 }: { report: MarketingExecutiveReport; ga4: GA4Response | null; previousGa4: GA4Response | null }) {
  const funnel = [['Sesiones', ga4?.totals?.sessions], ['Add to cart', ga4?.totals?.addToCarts], ['Checkout', ga4?.totals?.checkouts], ['Compra', ga4?.totals?.ecommercePurchases]] as const
  const previousFunnel = [previousGa4?.totals?.sessions, previousGa4?.totals?.addToCarts, previousGa4?.totals?.checkouts, previousGa4?.totals?.ecommercePurchases]
  const rateChanges = funnel.slice(1).map(([, value], index) => {
    const currentBase = Number(funnel[index][1] || 0)
    const previousBase = Number(previousFunnel[index] || 0)
    const currentRate = currentBase > 0 ? Number(value || 0) / currentBase : null
    const previousRate = previousBase > 0 ? Number(previousFunnel[index + 1] || 0) / previousBase : null
    return currentRate !== null && previousRate !== null ? currentRate - previousRate : null
  })
  const worstIndex = rateChanges.reduce<number>((worst, value, index) => {
    if (value === null) return worst
    const worstValue = worst >= 0 ? rateChanges[worst] : null
    return worst === -1 || worstValue === null || value < worstValue ? index : worst
  }, -1)
  const knownCustomers = report.current.customers.new + report.current.customers.returning
  return <section id="funnel" className="grid gap-5 lg:grid-cols-2"><Card><CardHeader><CardTitle>Funnel e-commerce</CardTitle><p className="text-xs text-slate-500">Una sola fuente para todas las etapas: GA4.</p></CardHeader><CardContent>{ga4?.available && ga4.totals ? <><div className="grid grid-cols-4 gap-2">{funnel.map(([label, value], index) => { const base = index > 0 ? Number(funnel[index - 1][1] || 0) : 0; const rateChange = index > 0 ? rateChanges[index - 1] : null; return <div key={label} className="relative rounded-xl bg-slate-50 p-3 text-center"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-xl font-bold">{number(Number(value || 0))}</p>{index > 0 && <><p className="mt-1 text-[11px] text-slate-500">{base > 0 ? percent(Number(value || 0) / base) : 'Sin tasa'}</p><p className={`text-[10px] ${rateChange !== null && rateChange < 0 ? 'text-rose-600' : 'text-slate-400'}`}>{rateChange === null ? 'Sin comparación' : `${rateChange >= 0 ? '+' : ''}${(rateChange * 100).toFixed(1)} pp`}</p></>}{index < 3 && <ChevronRight className="absolute -right-3 top-1/2 z-10 h-5 w-5 text-slate-300" />}</div> })}</div>{worstIndex >= 0 && rateChanges[worstIndex] !== null && rateChanges[worstIndex]! < 0 && <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">La mayor pérdida adicional ocurrió entre {funnel[worstIndex][0]} y {funnel[worstIndex + 1][0]}: {(rateChanges[worstIndex]! * 100).toFixed(1)} puntos porcentuales vs el periodo anterior.</p>}</> : <p className="text-sm text-slate-500">Dato no disponible. Falta configurar GA4 y validar eventos `add_to_cart`, `begin_checkout` y `purchase`.</p>}</CardContent></Card><Card><CardHeader><CardTitle>Clientes</CardTitle></CardHeader><CardContent><div className="grid grid-cols-2 gap-3">{[['Nuevos', report.current.customers.new], ['Recurrentes', report.current.customers.returning], ['% nuevos', knownCustomers > 0 ? report.current.customers.new / knownCustomers : null], ['% recurrentes', knownCustomers > 0 ? report.current.customers.returning / knownCustomers : null], ['Ventas nuevos', report.current.customers.newSales], ['Ventas recurrentes', report.current.customers.returningSales], ['AOV nuevos', report.current.customers.newAov], ['AOV recurrentes', report.current.customers.returningAov]].map(([label, value]) => <div key={String(label)} className="rounded-xl border p-3"><p className="text-xs text-slate-500">{String(label)}</p><p className="mt-1 font-bold text-[#172239]">{value === null ? 'Dato no disponible' : String(label).startsWith('%') ? percent(Number(value)) : String(label).includes('Ventas') || String(label).includes('AOV') ? currency(Number(value)) : number(Number(value))}</p></div>)}</div><div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm"><span>Nuevos por cada $1.000 Meta: </span><strong>Dato no disponible</strong><p className="mt-1 text-xs text-slate-500">Falta atribución confiable entre gasto Meta y primer pedido Shopify.</p></div></CardContent></Card></section>
}

function ProductsSection({ report, objectives, search, setSearch, selectedProduct, selectProduct }: { report: MarketingExecutiveReport; objectives: Objectives; search: string; setSearch: (value: string) => void; selectedProduct: string; selectProduct: (value: string) => void }) {
  const topSales = report.current.products[0]
  const topUnits = [...report.current.products].sort((a, b) => b.units - a.units)[0]
  const growth = [...report.current.products].filter(item => item.variation !== null).sort((a, b) => (b.variation || 0) - (a.variation || 0))[0]
  const decline = [...report.current.products].filter(item => item.variation !== null).sort((a, b) => (a.variation || 0) - (b.variation || 0))[0]
  return <section id="productos" className="space-y-4"><SectionTitle eyebrow="03 · Producto e inventario" title="Referencias y tallas" /><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{[
    ['Top por ventas', topSales?.reference, topSales ? currency(topSales.sales) : 'Datos insuficientes'],
    ['Top por unidades', topUnits?.reference, topUnits ? `${number(topUnits.units)} unidades` : 'Datos insuficientes'],
    ['Mayor crecimiento', growth?.reference, growth?.variation == null ? 'Sin comparación' : `${growth.variation >= 0 ? '+' : ''}${(growth.variation * 100).toFixed(1)}%`],
    ['Mayor caída', decline?.reference, decline?.variation == null ? 'Sin comparación' : `${(decline.variation * 100).toFixed(1)}%`],
  ].map(([label, title, detail]) => <Card key={label}><CardContent className="p-4"><p className="text-xs uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 font-bold text-[#172239]">{title || 'Datos insuficientes'}</p><p className="text-xs text-slate-500">{detail}</p></CardContent></Card>)}</div><Card><CardHeader className="flex-row items-center justify-between"><div><CardTitle>Productos</CardTitle><p className="mt-1 text-xs text-slate-500">Ventas Shopify; stock propio actual de Siigo. Top 10 por ventas.</p></div><Input placeholder="Buscar referencia…" value={search} onChange={event => setSearch(event.target.value)} className="w-64" /></CardHeader><CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Referencia</TableHead><TableHead className="text-right">Ventas</TableHead><TableHead className="text-right">% ventas</TableHead><TableHead className="text-right">Unidades</TableHead><TableHead className="text-right">Pedidos</TableHead><TableHead className="text-right">AOV</TableHead><TableHead className="text-right">Stock propio</TableHead><TableHead className="text-right">Variación</TableHead></TableRow></TableHeader><TableBody>{report.current.products.filter(item => !search || item.reference.toLowerCase().includes(search.toLowerCase())).slice(0, 10).map(item => <TableRow id={`product-${slug(item.reference)}`} key={item.key} className="cursor-pointer" onClick={() => selectProduct(item.reference)}><TableCell className="font-semibold text-[#172239]">{item.reference}</TableCell><TableCell className="text-right">{currency(item.sales)}</TableCell><TableCell className="text-right">{percent(item.share)}</TableCell><TableCell className="text-right">{number(item.units)}</TableCell><TableCell className="text-right">{number(item.orders)}</TableCell><TableCell className="text-right">{currency(item.aov)}</TableCell><TableCell className="text-right">{item.stock === null ? 'N/D' : number(item.stock)}</TableCell><TableCell className="text-right"><ChangeBadge value={item.variation} /></TableCell></TableRow>)}</TableBody></Table></CardContent></Card><Card><CardHeader><CardTitle>Matriz referencia × talla</CardTitle><p className="text-xs text-slate-500">Sell-through no se calcula: falta inventario inicial e historial de movimientos.</p></CardHeader><CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Referencia</TableHead><TableHead>Talla</TableHead><TableHead>SKU</TableHead><TableHead className="text-right">Unidades</TableHead><TableHead className="text-right">Ventas</TableHead><TableHead className="text-right">Stock propio</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader><TableBody>{report.current.sizes.filter(item => !selectedProduct || item.reference === selectedProduct).slice(0, 30).map(item => { const status = stockStatus(item, objectives); return <TableRow id={`size-${slug(item.key)}`} key={item.key}><TableCell className="font-medium">{item.reference}</TableCell><TableCell>{item.size}</TableCell><TableCell className="text-xs text-slate-500">{item.sku || 'Sin SKU'}</TableCell><TableCell className="text-right">{number(item.units)}</TableCell><TableCell className="text-right">{currency(item.sales)}</TableCell><TableCell className="text-right">{item.stock === null ? 'N/D' : number(item.stock)}</TableCell><TableCell><Badge className={status.style}>{status.label}</Badge></TableCell></TableRow>})}</TableBody></Table></CardContent></Card></section>
}

function AdHighlights({ items }: { items: MetaItem[] }) {
  const topSales = [...items].sort((a, b) => b.purchase_value - a.purchase_value)[0]
  const topRoas = [...items].filter(item => item.purchases > 0 && item.roas !== null).sort((a, b) => (b.roas || 0) - (a.roas || 0))[0]
  const topSpend = [...items].sort((a, b) => b.spend - a.spend)[0]
  const zeroPurchase = items.filter(item => item.spend > 0 && item.purchases === 0)
  return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{[
    ['Top por ventas Meta', topSales?.ad_name, topSales ? currency(topSales.purchase_value) : 'Datos insuficientes'],
    ['Top por ROAS', topRoas?.ad_name, topRoas?.roas == null ? 'Datos insuficientes' : ratio(topRoas.roas)],
    ['Mayor gasto', topSpend?.ad_name, topSpend ? currency(topSpend.spend) : 'Datos insuficientes'],
    ['Gasto y cero compras', `${zeroPurchase.length} anuncios`, currency(zeroPurchase.reduce((sum, item) => sum + item.spend, 0))],
  ].map(([label, title, detail]) => <Card key={label}><CardContent className="p-4"><p className="text-xs uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 truncate font-bold text-[#172239]">{title || 'Datos insuficientes'}</p><p className="text-xs text-slate-500">{detail}</p></CardContent></Card>)}</div>
}

function MetaTable({ title, items, previous, objectives, enoughVolume, showCampaign }: { title: string; items: MetaItem[]; previous: MetaResponse | null; objectives: Objectives; enoughVolume: boolean; showCampaign: boolean }) {
  return <Card><CardHeader><CardTitle>{title}</CardTitle><p className="text-xs text-slate-500">Ventas y compras son atribuidas por Meta. CTR y CPC corresponden a clics de enlace. Ordenado por gasto.</p></CardHeader><CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>{title === 'Campañas' ? 'Campaña' : 'Anuncio'}</TableHead>{showCampaign && <TableHead>Campaña</TableHead>}<TableHead className="text-right">Gasto</TableHead><TableHead className="text-right">Ventas atrib.</TableHead><TableHead className="text-right">Compras</TableHead><TableHead className="text-right">ROAS</TableHead><TableHead className="text-right">CPA</TableHead><TableHead className="text-right">CTR link</TableHead><TableHead className="text-right">CPC link</TableHead><TableHead className="text-right">CPM</TableHead><TableHead className="text-right">Frecuencia</TableHead><TableHead>Decisión</TableHead></TableRow></TableHeader><TableBody>{items.slice(0, 30).map(item => { const decision = classification(item, objectives, enoughVolume); const old = previousMetaItem(item, previous); const possibleFatigue = Boolean(old && old.frequency !== null && item.frequency !== null && item.frequency > old.frequency && item.ctr_link < old.ctr_link); return <TableRow key={item.key}><TableCell className="max-w-64 font-semibold">{item.ad_name || item.campaign_name || item.key}{old && <div className="text-[11px] font-normal text-slate-400">Gasto anterior {currency(old.spend)}</div>}{possibleFatigue && <Badge className="mt-1 bg-amber-100 text-amber-800">Posible fatiga: frecuencia ↑ y CTR ↓</Badge>}</TableCell>{showCampaign && <TableCell className="max-w-48 text-xs">{item.campaign_name}</TableCell>}<TableCell className="text-right">{currency(item.spend)}</TableCell><TableCell className="text-right">{currency(item.purchase_value)}</TableCell><TableCell className="text-right">{number(item.purchases)}</TableCell><TableCell className="text-right">{item.roas === null ? 'N/D' : ratio(item.roas)}</TableCell><TableCell className="text-right">{item.cpa === null ? 'N/D' : currency(item.cpa)}</TableCell><TableCell className="text-right">{percent(item.ctr_link)}</TableCell><TableCell className="text-right">{item.cpc_link === null ? 'N/D' : currency(item.cpc_link)}</TableCell><TableCell className="text-right">{currency(item.cpm)}</TableCell><TableCell className="text-right">{item.frequency === null ? 'N/D' : `${item.frequency.toFixed(2)}x`}</TableCell><TableCell><Badge className={actionStyle(decision.action)}>{decision.action}</Badge><p className="mt-1 max-w-52 text-[10px] text-slate-500">{decision.reason}</p></TableCell></TableRow>})}</TableBody></Table></CardContent></Card>
}

function ReviewAndConcentration({ report, spendToReview }: { report: MarketingExecutiveReport; spendToReview: number | null }) {
  return <section id="dinero-revisar" className="grid gap-5 lg:grid-cols-2"><Card className="border-amber-200 bg-amber-50/60"><CardHeader><CardTitle className="flex items-center gap-2"><CircleDollarSign className="h-5 w-5 text-amber-700" />Gasto publicitario a revisar</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold text-amber-900">{spendToReview === null ? 'Dato no disponible' : currency(spendToReview)}</p><p className="mt-2 text-sm text-amber-800">Incluye anuncios con gasto y cero compras, y anuncios por debajo del ROAS objetivo cuando esté configurado. Es posible ineficiencia, no pérdida confirmada.</p><div className="mt-4 border-t border-amber-200 pt-3"><p className="text-xs font-semibold uppercase text-amber-900">Pérdida confirmada</p><p className="text-sm text-amber-800">Dato no disponible. Se requieren costos y validación financiera de cada resultado.</p></div></CardContent></Card><Card><CardHeader><CardTitle>Concentración de ventas</CardTitle></CardHeader><CardContent className="space-y-4">{[['Top 5 referencias', report.current.concentration.top5, '#168fc6'], ['Top 10 referencias', report.current.concentration.top10, '#172239']].map(([label, value, color]) => <div key={String(label)}><div className="flex justify-between text-sm"><span>{String(label)}</span><strong>{value === null ? 'N/D' : percent(Number(value))}</strong></div><div className="mt-2 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full" style={{ width: `${Math.min(100, Number(value || 0) * 100)}%`, backgroundColor: String(color) }} /></div></div>)}</CardContent></Card></section>
}

function MonthlySection({ report, annotations }: { report: MarketingExecutiveReport; annotations: Annotation[] }) {
  const yearAgo = report.yearAgo
  const yoySales = yearAgo && yearAgo.netSales > 0 ? (report.current.netSales - yearAgo.netSales) / yearAgo.netSales : null
  const yoyOrders = yearAgo && yearAgo.orders > 0 ? (report.current.orders - yearAgo.orders) / yearAgo.orders : null
  const monthlyAnnotations = Array.from(new Map(annotations.map(item => [item.annotation_date.slice(0, 7), item])).values())
  return <section className="space-y-4"><SectionTitle eyebrow="Tendencia" title="Últimos 12 meses" /><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{[
    ['Ventas MoM', report.comparisons.netSales.change], ['Ventas YoY', yoySales], ['Pedidos MoM', report.comparisons.orders.change], ['Pedidos YoY', yoyOrders],
  ].map(([label, value]) => <Card key={String(label)}><CardContent className="p-4"><p className="text-xs uppercase tracking-wide text-slate-500">{String(label)}</p><p className="mt-2 text-xl font-bold text-[#172239]">{value === null ? 'Dato no disponible' : `${Number(value) >= 0 ? '+' : ''}${(Number(value) * 100).toFixed(1)}%`}</p></CardContent></Card>)}</div><Card><CardContent className="pt-6"><div className="h-80"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={report.trend}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="month" tick={{ fontSize: 11 }} /><YAxis yAxisId="sales" tickFormatter={compactCurrency} tick={{ fontSize: 11 }} /><YAxis yAxisId="customers" orientation="right" tick={{ fontSize: 11 }} /><Tooltip formatter={(value, name) => name === 'Ventas Shopify' ? currency(Number(value)) : number(Number(value))} /><Bar yAxisId="customers" dataKey="newCustomers" name="Clientes nuevos" fill="#93c5fd" /><Line yAxisId="sales" type="monotone" dataKey="sales" name="Ventas Shopify" stroke="#172239" strokeWidth={3} />{monthlyAnnotations.filter(item => report.trend.some(point => point.month === item.annotation_date.slice(0, 7))).map(item => <ReferenceLine key={item.id} x={item.annotation_date.slice(0, 7)} yAxisId="sales" stroke="#64748b" strokeDasharray="3 3" label={{ value: item.title, position: 'insideTopRight', fontSize: 10 }} />)}</ComposedChart></ResponsiveContainer></div><p className="mt-2 text-xs text-slate-500">Gasto, MER, CAC y conversión históricos: Dato no disponible hasta configurar Meta y GA4.</p></CardContent></Card><Unavailable label="Cohortes, retención 30/60/90, LTV y LTV:CAC" reason="El cache Shopify comienza en junio de 2025 y no existe todavía un modelo de cohortes validado ni CAC atribuible." /></section>
}

function AlertGrid({ report, metaAds, objectives, sufficient }: { report: MarketingExecutiveReport; metaAds: MetaResponse | null; objectives: Objectives; sufficient: boolean }) {
  const outOfStock = report.current.sizes.filter(item => item.units > 0 && item.stock !== null && item.stock <= 0)
  const reviewAds = (metaAds?.items || []).filter(item => ['REVISAR', 'PAUSAR'].includes(classification(item, objectives, sufficient).action))
  const scaleAds = (metaAds?.items || []).filter(item => classification(item, objectives, sufficient).action === 'ESCALAR')
  const growth = report.current.products.filter(item => item.variation !== null && item.variation > 0 && (item.stock || 0) > 0).sort((a, b) => (b.variation || 0) - (a.variation || 0))
  const blocks = [
    { title: 'REQUIERE ACCIÓN', style: 'border-rose-200 bg-rose-50', items: [...outOfStock.slice(0, 3).map(item => ({ href: `#size-${slug(item.key)}`, title: `${item.reference} talla ${item.size} agotada`, detail: `${item.units} unidades vendidas · stock propio ${item.stock}` })), ...reviewAds.filter(item => classification(item, objectives, sufficient).action === 'PAUSAR').slice(0, 2).map(item => ({ href: '#meta', title: item.ad_name || 'Anuncio', detail: classification(item, objectives, sufficient).reason }))] },
    { title: 'VIGILAR', style: 'border-amber-200 bg-amber-50', items: reviewAds.filter(item => classification(item, objectives, sufficient).action === 'REVISAR').slice(0, 4).map(item => ({ href: '#meta', title: item.ad_name || 'Anuncio', detail: classification(item, objectives, sufficient).reason })) },
    { title: 'ESCALAR', style: 'border-emerald-200 bg-emerald-50', items: scaleAds.slice(0, 4).map(item => ({ href: '#meta', title: item.ad_name || 'Anuncio', detail: classification(item, objectives, sufficient).reason })) },
    { title: 'OPORTUNIDAD', style: 'border-sky-200 bg-sky-50', items: growth.slice(0, 4).map(item => ({ href: `#product-${slug(item.reference)}`, title: item.reference, detail: `Ventas crecieron ${((item.variation || 0) * 100).toFixed(1)}% y tiene ${item.stock} unidades de stock propio.` })) },
  ]
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{blocks.map(block => <Card key={block.title} className={block.style}><CardHeader><CardTitle className="text-sm">{block.title}</CardTitle></CardHeader><CardContent>{block.items.length === 0 ? <p className="text-sm text-slate-500">Datos insuficientes para concluir.</p> : <div className="space-y-3">{block.items.map(item => <a key={`${item.href}-${item.title}`} href={item.href} className="block rounded-lg bg-white/70 p-3 transition hover:bg-white"><p className="text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs text-slate-500">{item.detail}</p></a>)}</div>}</CardContent></Card>)}</div>
}

function Decisions({ report, meta, objectives, sufficient }: { report: MarketingExecutiveReport; meta: MetaResponse | null; objectives: Objectives; sufficient: boolean }) {
  return <Card><CardHeader><CardTitle>Decisiones del periodo</CardTitle></CardHeader><CardContent><div className="grid gap-4 md:grid-cols-4">{['ESCALAR', 'MANTENER', 'REVISAR', 'PAUSAR'].map(action => { const matching = (meta?.items || []).filter(item => classification(item, objectives, sufficient).action === action); return <div key={action} className="rounded-xl border p-4"><Badge className={actionStyle(action)}>{action}</Badge>{matching.length === 0 ? <p className="mt-3 text-sm text-slate-500">{report.availability.meta && Object.keys(objectives).length > 0 ? 'Sin elementos con evidencia suficiente.' : 'Dato no disponible hasta configurar Meta y objetivos.'}</p> : <ul className="mt-3 space-y-2">{matching.slice(0, 4).map(item => <li key={item.key} className="text-sm"><p className="font-semibold">{item.campaign_name}</p><p className="text-xs text-slate-500">{classification(item, objectives, sufficient).reason}</p></li>)}</ul>}</div> })}</div></CardContent></Card>
}

function QualitySection({ report, annotations, annotationsAvailable }: { report: MarketingExecutiveReport; annotations: Annotation[]; annotationsAvailable: boolean }) {
  return <section className="grid gap-5 lg:grid-cols-2"><Card><CardHeader><CardTitle>Anotaciones</CardTitle></CardHeader><CardContent>{!annotationsAvailable ? <p className="text-sm text-slate-500">Dato no disponible hasta aplicar la migración de Marketing.</p> : annotations.length === 0 ? <p className="text-sm text-slate-500">No hay anotaciones en el rango.</p> : <div className="space-y-3">{annotations.slice(0, 10).map(item => <div key={item.id} className="border-l-2 border-[#26a9e8] pl-3"><p className="text-xs text-slate-400">{item.annotation_date} · {item.type}</p><p className="font-semibold">{item.title}</p>{item.detail && <p className="text-sm text-slate-500">{item.detail}</p>}</div>)}</div>}</CardContent></Card><Card><CardHeader><CardTitle>Calidad y fórmulas</CardTitle></CardHeader><CardContent><ul className="space-y-2 text-sm text-slate-600">{report.formulas.map(item => <li key={item.metric}><strong>{item.metric}:</strong> {item.formula} <span className="text-xs text-slate-400">({item.source})</span></li>)}</ul><div className="mt-4 border-t pt-4"><p className="text-xs font-semibold uppercase text-slate-500">Limitaciones</p><ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-500">{report.limitations.map(item => <li key={item}>{item}</li>)}</ul></div></CardContent></Card></section>
}

function SettingsPanel({ objectives, setObjectives, available, onClose, onSave }: { objectives: Objectives; setObjectives: (value: Objectives) => void; available: boolean; onClose: () => void; onSave: () => void }) {
  return <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40"><div className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl"><div className="flex items-center justify-between"><div><h2 className="text-2xl font-bold text-[#172239]">Objetivos y umbrales</h2><p className="text-sm text-slate-500">No hay valores predeterminados. Gerencia define cada objetivo.</p></div><Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5" /></Button></div>{!available && <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Debes aplicar la migración `026_marketing_executive.sql` en Supabase para guardar objetivos.</div>}<div className="mt-6 grid gap-4 sm:grid-cols-2">{objectiveFields.map(field => <label key={field.key} className="text-sm font-medium text-slate-700">{field.label}<div className="relative mt-1"><Input type="number" min="0" step="any" value={objectives[field.key] ?? ''} onChange={event => { const raw = event.target.value; const next = { ...objectives }; if (raw === '') delete next[field.key]; else next[field.key] = Number(raw); setObjectives(next) }} /><span className="absolute right-3 top-2.5 text-xs text-slate-400">{field.suffix}</span></div></label>)}</div><div className="mt-8 flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={!available} onClick={onSave}>Guardar objetivos</Button></div></div></div>
}

function AnnotationPanel({ form, setForm, available, onClose, onSave }: { form: { annotation_date: string; type: string; title: string; detail: string }; setForm: (value: { annotation_date: string; type: string; title: string; detail: string }) => void; available: boolean; onClose: () => void; onSave: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><Card className="w-full max-w-lg"><CardHeader className="flex-row items-center justify-between"><CardTitle>Nueva anotación</CardTitle><Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5" /></Button></CardHeader><CardContent className="space-y-4">{!available && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Aplica la migración de Marketing para guardar anotaciones.</p>}<label className="block text-sm font-medium">Fecha<Input type="date" className="mt-1" value={form.annotation_date} onChange={event => setForm({ ...form, annotation_date: event.target.value })} /></label><label className="block text-sm font-medium">Tipo<select className="mt-1 h-9 w-full rounded-md border px-3" value={form.type} onChange={event => setForm({ ...form, type: event.target.value })}>{['promocion', 'descuento', 'lanzamiento', 'precio', 'coleccion', 'campana', 'web', 'inventario', 'otro'].map(type => <option key={type}>{type}</option>)}</select></label><label className="block text-sm font-medium">Título<Input className="mt-1" value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></label><label className="block text-sm font-medium">Detalle<textarea className="mt-1 min-h-24 w-full rounded-md border p-3 text-sm" value={form.detail} onChange={event => setForm({ ...form, detail: event.target.value })} /></label><div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={!available || !form.annotation_date || !form.title} onClick={onSave}>Guardar</Button></div></CardContent></Card></div>
}
