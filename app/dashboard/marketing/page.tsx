'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { DateRange } from 'react-day-picker'
import { format, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Loader2,
  LogOut,
  RefreshCw,
  ShoppingCart,
  Package,
  Boxes,
  BarChart3,
  MessageCircle,
  Settings,
  FileText,
  Store,
  TrendingUp,
  Tent,
  Megaphone,
  DollarSign,
  Users,
  Repeat,
  Tag,
  Globe,
  MapPin,
} from 'lucide-react'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line,
} from 'recharts'

interface KPIs {
  orders: number
  revenue: number
  units: number
  aov: number
  ordersWithDiscount: number
  discountUsageRate: number
  totalDiscountUsed: number
  newCustomerOrders: number
  newCustomerRevenue: number
  returningCustomerOrders: number
  returningCustomerRevenue: number
  returningRate: number
  gclidOrders: number
  fbclidOrders: number
}

interface Bucket { key: string; orders: number; revenue: number; units: number }
interface DiscountBucket extends Bucket { total_discount: number }
interface SkuBucket extends Bucket { title: string }
interface TimePoint { date: string; source: string; revenue: number; orders: number; units: number }

interface AnalyticsData {
  asOf: string
  range: { start: string; end: string }
  kpis: KPIs
  sources: Bucket[]
  referrers: Bucket[]
  discounts: DiscountBucket[]
  utm: { source: Bucket[]; medium: Bucket[]; campaign: Bucket[] }
  geography: { cities: Bucket[]; provinces: Bucket[] }
  topSkus: SkuBucket[]
  timeSeries: TimePoint[]
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function formatPct(v: number) {
  return `${(v * 100).toFixed(1)}%`
}

interface QlData {
  available: boolean
  error?: string
  code?: string
  hint?: string | null
  range?: { start: string; end: string }
  totals?: { total_sessions?: number; online_store_visitors?: number } | null
  daily?: Array<{ day: string; total_sessions?: number; online_store_visitors?: number }>
  bySource?: Array<{ referrer_source: string; total_sessions?: number }>
}

export default function MarketingPage() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [ql, setQl] = useState<QlData | null>(null)
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)

  useEffect(() => {
    setDateRange({ from: subMonths(new Date(), 6), to: new Date() })
  }, [])

  const fetchData = useCallback(async () => {
    if (!dateRange?.from || !dateRange?.to) return
    setLoading(true)
    try {
      const s = format(dateRange.from, 'yyyy-MM-dd')
      const e = format(dateRange.to, 'yyyy-MM-dd')
      const [resOrders, resQl] = await Promise.all([
        fetch(`/api/shopify/analytics?start_date=${s}&end_date=${e}`),
        fetch(`/api/shopify/analytics-ql?start_date=${s}&end_date=${e}`),
      ])
      if (resOrders.ok) setData(await resOrders.json())
      if (resQl.ok) setQl(await resQl.json())
    } finally {
      setLoading(false)
    }
  }, [dateRange])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Time series aggregated by month for the chart
  const monthlySeries = (() => {
    if (!data) return [] as Array<{ month: string; revenue: number; orders: number }>
    const byMonth = new Map<string, { revenue: number; orders: number }>()
    for (const p of data.timeSeries) {
      const k = p.date.slice(0, 7)
      const cur = byMonth.get(k) || { revenue: 0, orders: 0 }
      cur.revenue += p.revenue
      cur.orders += p.orders
      byMonth.set(k, cur)
    }
    return Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({
        month: format(new Date(month + '-01T12:00:00'), 'MMM yyyy', { locale: es }),
        ...v,
      }))
  })()

  return (
    <div className="min-h-screen bg-[#FFFFFF]">
      <header className="bg-[#1A2238] border-b border-[#2A3550]">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold tracking-tight text-[#1DA9EF]">shuless</span>
            <span className="text-[10px] text-white font-bold bg-[#1DA9EF] px-2 py-0.5 rounded-full uppercase tracking-wider">Admin</span>
          </div>
          <Link href="/">
            <Button variant="ghost" className="text-[#9CA3AF] hover:text-white hover:bg-[#2A3550]">
              <LogOut className="h-4 w-4 mr-2" />Cerrar sesión
            </Button>
          </Link>
        </div>
      </header>

      <div className="bg-white border-b">
        <div className="container mx-auto px-4">
          <nav className="flex gap-4 overflow-x-auto">
            <Link href="/dashboard"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><BarChart3 className="h-4 w-4 mr-2" />Ventas</Button></Link>
            <Link href="/dashboard/shopify"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><ShoppingCart className="h-4 w-4 mr-2" />Shopify</Button></Link>
            <Link href="/dashboard/whatsapp"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><MessageCircle className="h-4 w-4 mr-2" />WhatsApp</Button></Link>
            <Link href="/dashboard/tiendas"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><Store className="h-4 w-4 mr-2" />Tiendas</Button></Link>
            <Link href="/dashboard/ferias"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><Tent className="h-4 w-4 mr-2" />Ferias</Button></Link>
            <Button variant="ghost" className="rounded-none border-b-2 border-[#1DA9EF] text-[#1A2238] py-4"><Megaphone className="h-4 w-4 mr-2" />Marketing</Button>
            <Link href="/dashboard/conciliacion"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><FileText className="h-4 w-4 mr-2" />Conciliación</Button></Link>
            <Link href="/dashboard/analitica"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><TrendingUp className="h-4 w-4 mr-2" />Analítica</Button></Link>
            <Link href="/dashboard/productos"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><Package className="h-4 w-4 mr-2" />Productos</Button></Link>
            <Link href="/dashboard/inventario"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><Boxes className="h-4 w-4 mr-2" />Inventario</Button></Link>
            <Link href="/dashboard/configuracion"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><Settings className="h-4 w-4 mr-2" />Configuración</Button></Link>
          </nav>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-[#1A2238] mb-2">Marketing Shopify</h1>
            <p className="text-[#545454]">Sources, campañas y atribución desde el cache de órdenes Shopify.</p>
            <p className="text-xs text-[#9CA3AF] mt-1">
              Nota: Shopify Admin API no expone visits/sessions/CVR. Lo que ves acá es atribución a nivel orden
              (source_name, referente, UTM, código de descuento, cliente).
            </p>
          </div>
          <div className="flex items-center gap-2 mt-4 md:mt-0">
            <DateRangePicker date={dateRange} onDateChange={setDateRange} />
            <Button variant="outline" size="icon" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {loading || !data ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-[#1A2238]" />
            <span className="ml-2 text-[#545454]">Cargando datos…</span>
          </div>
        ) : (
          <>
            {/* ShopifyQL: visits / CVR (real Shopify Analytics) */}
            {ql && (() => {
              const orders = data?.kpis?.orders || 0
              const visitors = Number(ql.totals?.online_store_visitors || 0)
              const sessions = Number(ql.totals?.total_sessions || 0)
              const cvr = visitors > 0 ? orders / visitors : 0
              if (!ql.available) {
                return (
                  <Card className="mb-8 border-l-4 border-l-[#F59E0B]">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-[#F59E0B]" />
                        Visits &amp; CVR — Acción requerida
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-[#1A2238] mb-3">
                        El access token actual de Shopify no tiene permiso para leer Analytics (ShopifyQL).
                      </p>
                      {ql.hint && (
                        <div className="bg-[#FEF3C7] border border-[#F59E0B]/30 rounded-md p-3 mb-3 text-sm text-[#92400E]">
                          {ql.hint}
                        </div>
                      )}
                      <details className="text-xs text-[#545454]">
                        <summary className="cursor-pointer">Detalle técnico ({ql.code})</summary>
                        <pre className="mt-2 bg-gray-50 p-2 rounded overflow-x-auto">{ql.error}</pre>
                      </details>
                    </CardContent>
                  </Card>
                )
              }
              return (
                <>
                  <Card className="mb-8 border-l-4 border-l-[#14B8A6]">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-[#14B8A6]" />
                        Visits &amp; CVR — Shopify Analytics
                      </CardTitle>
                      <p className="text-xs text-[#545454]">
                        Datos en vivo desde ShopifyQL (sessions, visitors). CVR se calcula contra órdenes Shopify del mismo rango.
                      </p>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-4 md:grid-cols-4 mb-6">
                        <div className="rounded-xl border bg-white p-4">
                          <p className="text-sm text-[#545454]">Visitors únicos</p>
                          <p className="text-2xl font-bold text-[#1A2238]">{visitors.toLocaleString()}</p>
                        </div>
                        <div className="rounded-xl border bg-white p-4">
                          <p className="text-sm text-[#545454]">Sessions</p>
                          <p className="text-2xl font-bold text-[#1A2238]">{sessions.toLocaleString()}</p>
                        </div>
                        <div className="rounded-xl border bg-white p-4">
                          <p className="text-sm text-[#545454]">Órdenes Shopify</p>
                          <p className="text-2xl font-bold text-[#1A2238]">{orders.toLocaleString()}</p>
                        </div>
                        <div className="rounded-xl border bg-white p-4 ring-1 ring-[#14B8A6]/20">
                          <p className="text-sm text-[#545454]">CVR (órdenes / visitors)</p>
                          <p className="text-2xl font-bold text-[#14B8A6]">{formatPct(cvr)}</p>
                        </div>
                      </div>

                      <div className="grid gap-6 md:grid-cols-3">
                        <div className="md:col-span-2">
                          <h4 className="text-sm font-semibold text-[#1A2238] mb-2">Visitors &amp; Sessions por día</h4>
                          <div className="h-[240px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={ql.daily || []}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="#545454" />
                                <YAxis tick={{ fontSize: 11 }} stroke="#545454" />
                                <Tooltip />
                                <Legend />
                                <Line type="monotone" dataKey="online_store_visitors" name="Visitors" stroke="#1A2238" strokeWidth={2} dot={false} />
                                <Line type="monotone" dataKey="total_sessions" name="Sessions" stroke="#14B8A6" strokeWidth={2} dot={false} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-[#1A2238] mb-2">Sessions por fuente</h4>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Fuente</TableHead>
                                <TableHead className="text-right">Sessions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(ql.bySource || []).slice(0, 12).map((s, i) => (
                                <TableRow key={`${s.referrer_source}-${i}`}>
                                  <TableCell className="font-medium">{s.referrer_source || '(direct)'}</TableCell>
                                  <TableCell className="text-right tabular-nums">{Number(s.total_sessions || 0).toLocaleString()}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )
            })()}

            {/* KPIs */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-[#545454]">Revenue</CardTitle>
                  <DollarSign className="h-4 w-4 text-[#1A2238]" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-[#1A2238]">{formatCurrency(data.kpis.revenue)}</div>
                  <p className="text-xs text-[#545454]">AOV: {formatCurrency(data.kpis.aov)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-[#545454]">Órdenes</CardTitle>
                  <ShoppingCart className="h-4 w-4 text-[#1A2238]" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-[#1A2238]">{data.kpis.orders.toLocaleString()}</div>
                  <p className="text-xs text-[#545454]">{data.kpis.units.toLocaleString()} unidades</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-[#545454]">Returning Rate</CardTitle>
                  <Repeat className="h-4 w-4 text-[#14B8A6]" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-[#1A2238]">{formatPct(data.kpis.returningRate)}</div>
                  <p className="text-xs text-[#545454]">
                    {data.kpis.returningCustomerOrders.toLocaleString()} recurrentes · {data.kpis.newCustomerOrders.toLocaleString()} nuevos
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-[#545454]">Uso de descuento</CardTitle>
                  <Tag className="h-4 w-4 text-[#F59E0B]" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-[#1A2238]">{formatPct(data.kpis.discountUsageRate)}</div>
                  <p className="text-xs text-[#545454]">{formatCurrency(data.kpis.totalDiscountUsed)} descontado</p>
                </CardContent>
              </Card>
            </div>

            {/* Trend chart */}
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="text-lg">Revenue por mes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={monthlySeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#545454" />
                      <YAxis tick={{ fontSize: 12 }} stroke="#545454" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                      <Legend />
                      <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#1A2238" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Sources & Referrers */}
            <div className="grid gap-4 md:grid-cols-2 mb-8">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Globe className="h-5 w-5 text-[#1DA9EF]" />
                    Sources de orden
                  </CardTitle>
                  <p className="text-xs text-[#545454]">Channel desde el que se creó la orden Shopify (web, POS, draft, etc.)</p>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Source</TableHead>
                        <TableHead className="text-right">Órdenes</TableHead>
                        <TableHead className="text-right">Units</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.sources.map(s => (
                        <TableRow key={s.key}>
                          <TableCell className="font-medium">{s.key}</TableCell>
                          <TableCell className="text-right tabular-nums">{s.orders.toLocaleString()}</TableCell>
                          <TableCell className="text-right tabular-nums">{s.units.toLocaleString()}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(s.revenue)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Globe className="h-5 w-5 text-[#14B8A6]" />
                    Referrers (dominio)
                  </CardTitle>
                  <p className="text-xs text-[#545454]">De dónde llegó el usuario antes de comprar. &quot;direct&quot; = sin referente.</p>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Referrer</TableHead>
                        <TableHead className="text-right">Órdenes</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.referrers.slice(0, 15).map(s => (
                        <TableRow key={s.key}>
                          <TableCell className="font-medium">{s.key}</TableCell>
                          <TableCell className="text-right tabular-nums">{s.orders.toLocaleString()}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(s.revenue)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>

            {/* UTM */}
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="text-lg">Campañas — UTM &amp; Click IDs</CardTitle>
                <p className="text-xs text-[#545454]">
                  Parseado de los parámetros del landing_site. {data.kpis.gclidOrders} órdenes con gclid (Google Ads) ·{' '}
                  {data.kpis.fbclidOrders} con fbclid (Meta).
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 md:grid-cols-3">
                  <div>
                    <h4 className="text-sm font-semibold text-[#1A2238] mb-2">utm_source</h4>
                    <Table>
                      <TableHeader><TableRow><TableHead>Source</TableHead><TableHead className="text-right">Órdenes</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {data.utm.source.length === 0 ? (
                          <TableRow><TableCell colSpan={3} className="text-center text-[#9CA3AF] text-xs py-4">Sin UTMs</TableCell></TableRow>
                        ) : data.utm.source.slice(0, 10).map(s => (
                          <TableRow key={s.key}>
                            <TableCell className="font-medium">{s.key}</TableCell>
                            <TableCell className="text-right tabular-nums">{s.orders.toLocaleString()}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatCurrency(s.revenue)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-[#1A2238] mb-2">utm_medium</h4>
                    <Table>
                      <TableHeader><TableRow><TableHead>Medium</TableHead><TableHead className="text-right">Órdenes</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {data.utm.medium.length === 0 ? (
                          <TableRow><TableCell colSpan={3} className="text-center text-[#9CA3AF] text-xs py-4">Sin UTMs</TableCell></TableRow>
                        ) : data.utm.medium.slice(0, 10).map(s => (
                          <TableRow key={s.key}>
                            <TableCell className="font-medium">{s.key}</TableCell>
                            <TableCell className="text-right tabular-nums">{s.orders.toLocaleString()}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatCurrency(s.revenue)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-[#1A2238] mb-2">utm_campaign</h4>
                    <Table>
                      <TableHeader><TableRow><TableHead>Campaign</TableHead><TableHead className="text-right">Órdenes</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {data.utm.campaign.length === 0 ? (
                          <TableRow><TableCell colSpan={3} className="text-center text-[#9CA3AF] text-xs py-4">Sin UTMs</TableCell></TableRow>
                        ) : data.utm.campaign.slice(0, 15).map(s => (
                          <TableRow key={s.key}>
                            <TableCell className="font-medium truncate max-w-[200px]">{s.key}</TableCell>
                            <TableCell className="text-right tabular-nums">{s.orders.toLocaleString()}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatCurrency(s.revenue)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Discount codes */}
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Tag className="h-5 w-5 text-[#F59E0B]" />
                  Códigos de descuento usados
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.discounts.length === 0 ? (
                  <p className="text-sm text-[#9CA3AF] py-4">Ninguna orden usó código de descuento en el rango.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead className="text-right">Órdenes</TableHead>
                        <TableHead className="text-right">Units</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                        <TableHead className="text-right">Descontado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.discounts.slice(0, 20).map(d => (
                        <TableRow key={d.key}>
                          <TableCell><Badge className="bg-[#F59E0B]/15 text-[#D97706] font-mono">{d.key}</Badge></TableCell>
                          <TableCell className="text-right tabular-nums">{d.orders.toLocaleString()}</TableCell>
                          <TableCell className="text-right tabular-nums">{d.units.toLocaleString()}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(d.revenue)}</TableCell>
                          <TableCell className="text-right tabular-nums text-[#D97706]">−{formatCurrency(d.total_discount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Geo + Customer mix */}
            <div className="grid gap-4 md:grid-cols-2 mb-8">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-[#1DA9EF]" />
                    Top ciudades
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ciudad</TableHead>
                        <TableHead className="text-right">Órdenes</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.geography.cities.slice(0, 15).map(c => (
                        <TableRow key={c.key}>
                          <TableCell className="font-medium">{c.key}</TableCell>
                          <TableCell className="text-right tabular-nums">{c.orders.toLocaleString()}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(c.revenue)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="h-5 w-5 text-[#14B8A6]" />
                    Customer mix
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={[
                          { label: 'Órdenes', nuevos: data.kpis.newCustomerOrders, recurrentes: data.kpis.returningCustomerOrders },
                        ]}
                        layout="vertical"
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis type="number" tick={{ fontSize: 12 }} />
                        <YAxis dataKey="label" type="category" tick={{ fontSize: 12 }} width={70} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="nuevos" name="Nuevos" stackId="a" fill="#1DA9EF" />
                        <Bar dataKey="recurrentes" name="Recurrentes" stackId="a" fill="#14B8A6" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <div className="border rounded-lg p-3">
                      <p className="text-xs text-[#545454]">Revenue nuevos</p>
                      <p className="text-lg font-bold text-[#1A2238]">{formatCurrency(data.kpis.newCustomerRevenue)}</p>
                    </div>
                    <div className="border rounded-lg p-3">
                      <p className="text-xs text-[#545454]">Revenue recurrentes</p>
                      <p className="text-lg font-bold text-[#1A2238]">{formatCurrency(data.kpis.returningCustomerRevenue)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Top SKUs */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Package className="h-5 w-5 text-[#1A2238]" />
                  Top productos vendidos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU / Producto</TableHead>
                      <TableHead className="text-right">Órdenes</TableHead>
                      <TableHead className="text-right">Units</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.topSkus.slice(0, 20).map(s => (
                      <TableRow key={s.key}>
                        <TableCell>
                          <div className="font-medium text-[#1A2238]">{s.title}</div>
                          {s.key !== s.title && <div className="text-xs text-[#545454]">{s.key}</div>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{s.orders.toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.units.toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(s.revenue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  )
}
