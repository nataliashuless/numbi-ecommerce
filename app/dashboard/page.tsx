'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DateRange } from 'react-day-picker'
import { format, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DollarSign,
  ShoppingCart,
  Package,
  Loader2,
  LogOut,
  RefreshCw,
  Box,
  Boxes,
  BarChart3,
  MessageCircle,
  Store,
  TrendingUp,
  Settings,
  FileText,
  Tent,
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
  PieChart,
  Pie,
  Cell,
} from 'recharts'

interface ChannelStats {
  ventas: number
  ordenes: number
  unidades: number
}

interface ChartPoint {
  date: string
  shopify_ventas: number
  whatsapp_ventas: number
  tiendas_ventas: number
  ferias_ventas: number
  shopify_ordenes: number
  whatsapp_ordenes: number
  tiendas_ordenes: number
  ferias_ordenes: number
  shopify_unidades: number
  whatsapp_unidades: number
  tiendas_unidades: number
  ferias_unidades: number
}

type Metric = 'ventas' | 'ordenes' | 'unidades'

interface ConsolidatedData {
  shopify: ChannelStats
  whatsapp: ChannelStats
  tiendas: ChannelStats
  ferias: ChannelStats
  total: ChannelStats
  chartData: ChartPoint[]
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value)
}

const COLORS = ['#1A2238', '#14B8A6', '#1DA9EF', '#F59E0B']

const FERIA_COLOR = '#F59E0B'

function getGroupKey(dateStr: string, groupBy: 'day' | 'week' | 'month' | 'quarter'): string {
  const date = new Date(dateStr + 'T12:00:00')
  if (groupBy === 'month') {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  } else if (groupBy === 'week') {
    const tempDate = new Date(date.getTime())
    tempDate.setHours(0, 0, 0, 0)
    tempDate.setDate(tempDate.getDate() + 3 - (tempDate.getDay() + 6) % 7)
    const week1 = new Date(tempDate.getFullYear(), 0, 4)
    const weekNum = 1 + Math.round(((tempDate.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)
    return `${tempDate.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
  } else if (groupBy === 'quarter') {
    const quarter = Math.floor(date.getMonth() / 3) + 1
    return `${date.getFullYear()}-Q${quarter}`
  }
  return dateStr
}

export default function DashboardPage() {
  const [data, setData] = useState<ConsolidatedData | null>(null)
  const [loading, setLoading] = useState(true)
  const [shop, setShop] = useState('')
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month' | 'quarter'>('month')
  const [metric, setMetric] = useState<Metric>('ventas')

  useEffect(() => {
    setDateRange({ from: subMonths(new Date(), 6), to: new Date() })
  }, [])

  async function fetchData() {
    if (!dateRange?.from || !dateRange?.to) return

    setLoading(true)
    try {
      const startDate = format(dateRange.from, 'yyyy-MM-dd')
      const endDate = format(dateRange.to, 'yyyy-MM-dd')

      // Shopify orders for matching + their own totals; Siigo invoices for tiendas + whatsapp;
      // ferias for date-window classification (Siigo invoices in a feria window become 'feria')
      const [shopifyRes, siigoRes, feriasRes] = await Promise.all([
        fetch(`/api/shopify/orders?start_date=${startDate}&end_date=${endDate}&group_by=day`),
        fetch(`/api/siigo/invoices?start_date=${startDate}&end_date=${endDate}`),
        fetch('/api/ferias'),
      ])

      const shopifyData = shopifyRes.ok ? await shopifyRes.json() : null
      const siigoData = siigoRes.ok ? await siigoRes.json() : null
      const feriasData = feriasRes.ok ? await feriasRes.json() : null

      type FeriaWindow = { id: string; nombre: string; fecha_inicio: string; fecha_fin: string; activa: boolean }
      const feriaWindows: FeriaWindow[] = (feriasData?.ferias || []).filter((f: FeriaWindow) => f.activa)
      const isFeriaDate = (dateStr: string): boolean => {
        const d = dateStr.slice(0, 10)
        return feriaWindows.some(f => d >= f.fecha_inicio && d <= f.fecha_fin)
      }

      if (shopifyData?.shop) {
        setShop(shopifyData.shop)
      }

      type ShopOrder = { orderNumber: number; createdAt: string; totalPrice: number; itemCount: number }
      const shopOrders: ShopOrder[] = shopifyData?.orders || []
      const shopifyOrderNumbers = new Set<number>(shopOrders.map(o => o.orderNumber))

      const shopifyStats: ChannelStats = {
        ventas: shopifyData?.stats?.totalRevenue || 0,
        ordenes: shopifyData?.stats?.totalOrders || 0,
        unidades: shopifyData?.stats?.totalUnits || 0,
      }

      type SiigoItem = { code: string; quantity: number }
      type SiigoInv = {
        date: string
        total: number
        tienda_id: string | null
        observations: string
        items: SiigoItem[]
      }
      const siigoInvoices: SiigoInv[] = siigoData?.invoices || []

      const extractOrderNum = (obs: string): number | null => {
        if (!obs) return null
        const m = obs.match(/#(\d+)/)
        return m ? parseInt(m[1], 10) : null
      }

      const tiendaInvoices = siigoInvoices.filter(i => i.tienda_id)
      // "Direct" sales = not tienda, not shopify-matched. These split into feria vs whatsapp by date.
      const directInvoices = siigoInvoices.filter(i => {
        if (i.tienda_id) return false
        const orderNum = extractOrderNum(i.observations)
        if (orderNum && shopifyOrderNumbers.has(orderNum)) return false
        return true
      })
      const feriaInvoices = directInvoices.filter(i => isFeriaDate(i.date))
      const whatsappInvoices = directInvoices.filter(i => !isFeriaDate(i.date))

      const sumUnits = (invs: SiigoInv[]) =>
        invs.reduce(
          (s, i) =>
            s +
            (i.items || [])
              .filter(it => it.code !== 'ENVIO')
              .reduce((u, it) => u + (it.quantity || 0), 0),
          0
        )

      const tiendasStats: ChannelStats = {
        ventas: tiendaInvoices.reduce((s, i) => s + (i.total || 0), 0),
        ordenes: tiendaInvoices.length,
        unidades: sumUnits(tiendaInvoices),
      }

      const whatsappStats: ChannelStats = {
        ventas: whatsappInvoices.reduce((s, i) => s + (i.total || 0), 0),
        ordenes: whatsappInvoices.length,
        unidades: sumUnits(whatsappInvoices),
      }

      const feriasStats: ChannelStats = {
        ventas: feriaInvoices.reduce((s, i) => s + (i.total || 0), 0),
        ordenes: feriaInvoices.length,
        unidades: sumUnits(feriaInvoices),
      }

      const totalStats: ChannelStats = {
        ventas: shopifyStats.ventas + whatsappStats.ventas + tiendasStats.ventas + feriasStats.ventas,
        ordenes: shopifyStats.ordenes + whatsappStats.ordenes + tiendasStats.ordenes + feriasStats.ordenes,
        unidades: shopifyStats.unidades + whatsappStats.unidades + tiendasStats.unidades + feriasStats.unidades,
      }

      type Bucket = {
        shopify_ventas: number; shopify_ordenes: number; shopify_unidades: number
        whatsapp_ventas: number; whatsapp_ordenes: number; whatsapp_unidades: number
        tiendas_ventas: number; tiendas_ordenes: number; tiendas_unidades: number
        ferias_ventas: number; ferias_ordenes: number; ferias_unidades: number
      }
      const empty = (): Bucket => ({
        shopify_ventas: 0, shopify_ordenes: 0, shopify_unidades: 0,
        whatsapp_ventas: 0, whatsapp_ordenes: 0, whatsapp_unidades: 0,
        tiendas_ventas: 0, tiendas_ordenes: 0, tiendas_unidades: 0,
        ferias_ventas: 0, ferias_ordenes: 0, ferias_unidades: 0,
      })
      const chartDataMap: Record<string, Bucket> = {}

      shopifyData?.chartData?.forEach((d: { date: string; sales: number; orders: number; units: number }) => {
        const key = getGroupKey(d.date, groupBy)
        if (!chartDataMap[key]) chartDataMap[key] = empty()
        chartDataMap[key].shopify_ventas += d.sales || 0
        chartDataMap[key].shopify_ordenes += d.orders || 0
        chartDataMap[key].shopify_unidades += d.units || 0
      })

      const itemUnits = (items: SiigoItem[]) =>
        items.filter(it => it.code !== 'ENVIO').reduce((u, it) => u + (it.quantity || 0), 0)

      tiendaInvoices.forEach(inv => {
        const key = getGroupKey(inv.date, groupBy)
        if (!chartDataMap[key]) chartDataMap[key] = empty()
        chartDataMap[key].tiendas_ventas += inv.total || 0
        chartDataMap[key].tiendas_ordenes += 1
        chartDataMap[key].tiendas_unidades += itemUnits(inv.items || [])
      })

      whatsappInvoices.forEach(inv => {
        const key = getGroupKey(inv.date, groupBy)
        if (!chartDataMap[key]) chartDataMap[key] = empty()
        chartDataMap[key].whatsapp_ventas += inv.total || 0
        chartDataMap[key].whatsapp_ordenes += 1
        chartDataMap[key].whatsapp_unidades += itemUnits(inv.items || [])
      })

      feriaInvoices.forEach(inv => {
        const key = getGroupKey(inv.date, groupBy)
        if (!chartDataMap[key]) chartDataMap[key] = empty()
        chartDataMap[key].ferias_ventas += inv.total || 0
        chartDataMap[key].ferias_ordenes += 1
        chartDataMap[key].ferias_unidades += itemUnits(inv.items || [])
      })

      const chartData: ChartPoint[] = Object.entries(chartDataMap)
        .map(([date, values]) => ({ date, ...values }))
        .sort((a, b) => a.date.localeCompare(b.date))

      setData({
        shopify: shopifyStats,
        whatsapp: whatsappStats,
        tiendas: tiendasStats,
        ferias: feriasStats,
        total: totalStats,
        chartData,
      })
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (dateRange?.from && dateRange?.to) {
      fetchData()
    }
  }, [dateRange, groupBy])

  const pieData = data ? [
    { name: 'Shopify', value: data.shopify.ventas, color: '#1A2238' },
    { name: 'WhatsApp', value: data.whatsapp.ventas, color: '#14B8A6' },
    { name: 'Tiendas', value: data.tiendas.ventas, color: '#1DA9EF' },
    { name: 'Ferias', value: data.ferias.ventas, color: FERIA_COLOR },
  ].filter(d => d.value > 0) : []

  const formattedChartData = data?.chartData.map(d => {
    let displayDate = d.date
    if (groupBy === 'day') {
      displayDate = format(new Date(d.date), 'dd MMM', { locale: es })
    } else if (groupBy === 'week') {
      displayDate = d.date // e.g., "2024-W01"
    } else if (groupBy === 'month') {
      const [year, month] = d.date.split('-')
      displayDate = format(new Date(parseInt(year), parseInt(month) - 1, 1), 'MMM yyyy', { locale: es })
    } else if (groupBy === 'quarter') {
      displayDate = d.date // e.g., "2024-Q1"
    }
    return { ...d, displayDate }
  }) || []

  return (
    <div className="min-h-screen bg-[#FFFFFF]">
      {/* Header */}
      <header className="bg-[#1A2238] border-b border-[#2A3550]">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold tracking-tight text-[#1DA9EF]">shuless</span>
              <span className="text-[10px] text-white font-bold bg-[#1DA9EF] px-2 py-0.5 rounded-full uppercase tracking-wider">Admin</span>
            </div>
            {shop && (
              <div className="flex items-center gap-2 text-[#9CA3AF] text-sm">
                <Store className="h-4 w-4" />
                <span>{shop}</span>
              </div>
            )}
          </div>
          <Link href="/">
            <Button variant="ghost" className="text-[#9CA3AF] hover:text-white hover:bg-[#2A3550]">
              <LogOut className="h-4 w-4 mr-2" />
              Cerrar sesión
            </Button>
          </Link>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="bg-white border-b">
        <div className="container mx-auto px-4">
          <nav className="flex gap-4">
            <Button variant="ghost" className="rounded-none border-b-2 border-[#1DA9EF] text-[#1A2238] py-4">
              <BarChart3 className="h-4 w-4 mr-2" />
              Ventas
            </Button>
            <Link href="/dashboard/shopify">
              <Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4">
                <ShoppingCart className="h-4 w-4 mr-2" />
                Shopify
              </Button>
            </Link>
            <Link href="/dashboard/whatsapp">
              <Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4">
                <MessageCircle className="h-4 w-4 mr-2" />
                WhatsApp
              </Button>
            </Link>
            <Link href="/dashboard/tiendas">
              <Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4">
                <Store className="h-4 w-4 mr-2" />
                Tiendas
              </Button>
            </Link>
            <Link href="/dashboard/ferias">
              <Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4">
                <Tent className="h-4 w-4 mr-2" />
                Ferias
              </Button>
            </Link>
            <Link href="/dashboard/conciliacion">
              <Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4">
                <FileText className="h-4 w-4 mr-2" />
                Conciliación
              </Button>
            </Link>
            <Link href="/dashboard/analitica">
              <Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4">
                <TrendingUp className="h-4 w-4 mr-2" />
                Analítica
              </Button>
            </Link>
            <Link href="/dashboard/productos">
              <Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4">
                <Package className="h-4 w-4 mr-2" />
                Productos
              </Button>
            </Link>
            <Link href="/dashboard/inventario">
              <Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4">
                <Boxes className="h-4 w-4 mr-2" />
                Inventario
              </Button>
            </Link>
            <Link href="/dashboard/configuracion">
              <Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4">
                <Settings className="h-4 w-4 mr-2" />
                Configuración
              </Button>
            </Link>
          </nav>
        </div>
      </div>

      {/* Main */}
      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-[#1A2238] mb-2">Ventas Consolidadas</h1>
            <p className="text-[#545454]">Resumen de todos los canales de venta</p>
          </div>
          <div className="flex items-center gap-2 mt-4 md:mt-0">
            <DateRangePicker date={dateRange} onDateChange={setDateRange} />
            <Button
              variant="outline"
              size="icon"
              onClick={() => fetchData()}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-[#1A2238]" />
            <span className="ml-2 text-[#545454]">Cargando datos...</span>
          </div>
        ) : (
          <>
            {/* Total KPIs (click to switch chart metric) */}
            <div className="grid gap-4 md:grid-cols-3 mb-8">
              <button
                type="button"
                onClick={() => setMetric('ventas')}
                className={`text-left rounded-xl border bg-white transition-all ${
                  metric === 'ventas'
                    ? 'border-t-4 border-t-[#1DA9EF] shadow-md ring-1 ring-[#1DA9EF]/20'
                    : 'border-t-4 border-t-transparent hover:border-t-[#1DA9EF]/40 hover:shadow-sm'
                }`}
              >
                <div className="p-6">
                  <div className="flex items-center justify-between pb-2">
                    <span className="text-sm font-medium text-[#545454]">Ventas Totales</span>
                    <DollarSign className={`h-4 w-4 ${metric === 'ventas' ? 'text-[#1DA9EF]' : 'text-[#545454]'}`} />
                  </div>
                  <div className={`text-3xl font-bold ${metric === 'ventas' ? 'text-[#1DA9EF]' : 'text-[#1A2238]'}`}>
                    {formatCurrency(data?.total.ventas || 0)}
                  </div>
                  <p className="text-xs text-[#545454] mt-1">Todos los canales</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setMetric('ordenes')}
                className={`text-left rounded-xl border bg-white transition-all ${
                  metric === 'ordenes'
                    ? 'border-t-4 border-t-[#1DA9EF] shadow-md ring-1 ring-[#1DA9EF]/20'
                    : 'border-t-4 border-t-transparent hover:border-t-[#1DA9EF]/40 hover:shadow-sm'
                }`}
              >
                <div className="p-6">
                  <div className="flex items-center justify-between pb-2">
                    <span className="text-sm font-medium text-[#545454]">Total Órdenes</span>
                    <ShoppingCart className={`h-4 w-4 ${metric === 'ordenes' ? 'text-[#1DA9EF]' : 'text-[#545454]'}`} />
                  </div>
                  <div className={`text-3xl font-bold ${metric === 'ordenes' ? 'text-[#1DA9EF]' : 'text-[#1A2238]'}`}>
                    {(data?.total.ordenes || 0).toLocaleString()}
                  </div>
                  <p className="text-xs text-[#545454] mt-1">Facturas + órdenes</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setMetric('unidades')}
                className={`text-left rounded-xl border bg-white transition-all ${
                  metric === 'unidades'
                    ? 'border-t-4 border-t-[#1DA9EF] shadow-md ring-1 ring-[#1DA9EF]/20'
                    : 'border-t-4 border-t-transparent hover:border-t-[#1DA9EF]/40 hover:shadow-sm'
                }`}
              >
                <div className="p-6">
                  <div className="flex items-center justify-between pb-2">
                    <span className="text-sm font-medium text-[#545454]">Unidades Vendidas</span>
                    <Box className={`h-4 w-4 ${metric === 'unidades' ? 'text-[#1DA9EF]' : 'text-[#545454]'}`} />
                  </div>
                  <div className={`text-3xl font-bold ${metric === 'unidades' ? 'text-[#1DA9EF]' : 'text-[#1A2238]'}`}>
                    {(data?.total.unidades || 0).toLocaleString()}
                  </div>
                  <p className="text-xs text-[#545454] mt-1">Productos despachados</p>
                </div>
              </button>
            </div>

            {/* Channel Breakdown */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
              <Link href="/dashboard/shopify">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer border-l-4 border-l-[#1A2238]">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-[#545454]">Shopify</CardTitle>
                    <ShoppingCart className="h-4 w-4 text-[#1A2238]" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-[#1A2238]">{formatCurrency(data?.shopify.ventas || 0)}</div>
                    <p className="text-xs text-[#545454]">{data?.shopify.ordenes || 0} órdenes · {data?.shopify.unidades || 0} unidades</p>
                  </CardContent>
                </Card>
              </Link>

              <Link href="/dashboard/whatsapp">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer border-l-4 border-l-[#14B8A6]">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-[#545454]">WhatsApp</CardTitle>
                    <MessageCircle className="h-4 w-4 text-[#14B8A6]" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-[#1A2238]">{formatCurrency(data?.whatsapp.ventas || 0)}</div>
                    <p className="text-xs text-[#545454]">{data?.whatsapp.ordenes || 0} ventas · {data?.whatsapp.unidades || 0} unidades</p>
                  </CardContent>
                </Card>
              </Link>

              <Link href="/dashboard/tiendas">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer border-l-4 border-l-[#1DA9EF]">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-[#545454]">Tiendas Terceros</CardTitle>
                    <Store className="h-4 w-4 text-[#1DA9EF]" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-[#1A2238]">{formatCurrency(data?.tiendas.ventas || 0)}</div>
                    <p className="text-xs text-[#545454]">{data?.tiendas.ordenes || 0} ventas pendientes</p>
                  </CardContent>
                </Card>
              </Link>

              <Link href="/dashboard/ferias">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer border-l-4 border-l-[#F59E0B]">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-[#545454]">Ferias</CardTitle>
                    <Tent className="h-4 w-4 text-[#F59E0B]" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-[#1A2238]">{formatCurrency(data?.ferias.ventas || 0)}</div>
                    <p className="text-xs text-[#545454]">{data?.ferias.ordenes || 0} ventas · {data?.ferias.unidades || 0} unidades</p>
                  </CardContent>
                </Card>
              </Link>
            </div>

            {/* Charts */}
            <div className="grid gap-4 md:grid-cols-3 mb-8">
              {/* Stacked Bar Chart */}
              <Card className="md:col-span-2">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-lg">
                    {metric === 'ventas' && 'Ventas por Canal'}
                    {metric === 'ordenes' && 'Órdenes por Canal'}
                    {metric === 'unidades' && 'Unidades por Canal'}
                  </CardTitle>
                  <div className="flex gap-1">
                    <Button
                      variant={groupBy === 'day' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setGroupBy('day')}
                      className={groupBy === 'day' ? 'bg-[#1DA9EF] text-[#1A2238] hover:bg-[#1DA9EF]/90' : ''}
                    >
                      Día
                    </Button>
                    <Button
                      variant={groupBy === 'week' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setGroupBy('week')}
                      className={groupBy === 'week' ? 'bg-[#1DA9EF] text-[#1A2238] hover:bg-[#1DA9EF]/90' : ''}
                    >
                      Semana
                    </Button>
                    <Button
                      variant={groupBy === 'month' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setGroupBy('month')}
                      className={groupBy === 'month' ? 'bg-[#1DA9EF] text-[#1A2238] hover:bg-[#1DA9EF]/90' : ''}
                    >
                      Mes
                    </Button>
                    <Button
                      variant={groupBy === 'quarter' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setGroupBy('quarter')}
                      className={groupBy === 'quarter' ? 'bg-[#1DA9EF] text-[#1A2238] hover:bg-[#1DA9EF]/90' : ''}
                    >
                      Trimestre
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    {formattedChartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={formattedChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="displayDate" tick={{ fontSize: 12 }} stroke="#545454" />
                          <YAxis
                            tick={{ fontSize: 12 }}
                            stroke="#545454"
                            tickFormatter={(value) =>
                              metric === 'ventas'
                                ? `$${(value / 1000).toFixed(0)}k`
                                : Number(value).toLocaleString()
                            }
                          />
                          <Tooltip
                            content={(props) => {
                              const { active, payload, label } = props as unknown as { active?: boolean; payload?: Array<{ name: string; value: number; color: string; dataKey: string }>; label?: string }
                              if (!active || !payload || payload.length === 0) return null
                              const formatVal = (v: number) =>
                                metric === 'ventas' ? formatCurrency(v) : v.toLocaleString()
                              const total = payload.reduce((s, p) => s + (Number(p.value) || 0), 0)
                              return (
                                <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-md text-sm">
                                  <div className="font-semibold text-[#1A2238] mb-2">{label}</div>
                                  {payload.map(p => (
                                    <div key={p.dataKey} className="flex items-center justify-between gap-6 py-0.5">
                                      <div className="flex items-center gap-2">
                                        <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: p.color }} />
                                        <span style={{ color: p.color }}>{p.name}</span>
                                      </div>
                                      <span className="font-mono">{formatVal(Number(p.value) || 0)}</span>
                                    </div>
                                  ))}
                                  <div className="border-t border-gray-200 mt-2 pt-2 flex items-center justify-between gap-6 font-bold text-[#1A2238]">
                                    <span>Total</span>
                                    <span className="font-mono">{formatVal(total)}</span>
                                  </div>
                                </div>
                              )
                            }}
                          />
                          <Legend />
                          <Bar dataKey={`shopify_${metric}`} name="Shopify" stackId="a" fill="#1A2238" />
                          <Bar dataKey={`whatsapp_${metric}`} name="WhatsApp" stackId="a" fill="#14B8A6" />
                          <Bar dataKey={`tiendas_${metric}`} name="Tiendas" stackId="a" fill="#1DA9EF" />
                          <Bar dataKey={`ferias_${metric}`} name="Ferias" stackId="a" fill="#F59E0B" />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-[#545454]">
                        No hay datos para mostrar
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Pie Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Distribución</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    {pieData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={2}
                            dataKey="value"
                            label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                            labelLine={false}
                          >
                            {pieData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-[#545454]">
                        No hay datos
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
