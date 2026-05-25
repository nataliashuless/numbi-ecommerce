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

interface ConsolidatedData {
  shopify: ChannelStats
  whatsapp: ChannelStats
  tiendas: ChannelStats
  total: ChannelStats
  chartData: { date: string; shopify: number; whatsapp: number; tiendas: number }[]
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value)
}

const COLORS = ['#96bf48', '#25D366', '#1DA9EF']

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

  useEffect(() => {
    setDateRange({ from: subMonths(new Date(), 6), to: new Date() })
  }, [])

  async function fetchData() {
    if (!dateRange?.from || !dateRange?.to) return

    setLoading(true)
    try {
      const startDate = format(dateRange.from, 'yyyy-MM-dd')
      const endDate = format(dateRange.to, 'yyyy-MM-dd')

      // Shopify orders for matching + their own totals; Siigo invoices for tiendas + whatsapp
      const [shopifyRes, siigoRes] = await Promise.all([
        fetch(`/api/shopify/orders?start_date=${startDate}&end_date=${endDate}&group_by=day`),
        fetch(`/api/siigo/invoices?start_date=${startDate}&end_date=${endDate}`),
      ])

      const shopifyData = shopifyRes.ok ? await shopifyRes.json() : null
      const siigoData = siigoRes.ok ? await siigoRes.json() : null

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
      const whatsappInvoices = siigoInvoices.filter(i => {
        if (i.tienda_id) return false
        const orderNum = extractOrderNum(i.observations)
        if (orderNum && shopifyOrderNumbers.has(orderNum)) return false
        return true
      })

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

      const totalStats: ChannelStats = {
        ventas: shopifyStats.ventas + whatsappStats.ventas + tiendasStats.ventas,
        ordenes: shopifyStats.ordenes + whatsappStats.ordenes + tiendasStats.ordenes,
        unidades: shopifyStats.unidades + whatsappStats.unidades + tiendasStats.unidades,
      }

      const chartDataMap: Record<string, { shopify: number; whatsapp: number; tiendas: number }> = {}

      shopifyData?.chartData?.forEach((d: { date: string; sales: number }) => {
        const key = getGroupKey(d.date, groupBy)
        if (!chartDataMap[key]) {
          chartDataMap[key] = { shopify: 0, whatsapp: 0, tiendas: 0 }
        }
        chartDataMap[key].shopify += d.sales
      })

      tiendaInvoices.forEach(inv => {
        const key = getGroupKey(inv.date, groupBy)
        if (!chartDataMap[key]) {
          chartDataMap[key] = { shopify: 0, whatsapp: 0, tiendas: 0 }
        }
        chartDataMap[key].tiendas += inv.total || 0
      })

      whatsappInvoices.forEach(inv => {
        const key = getGroupKey(inv.date, groupBy)
        if (!chartDataMap[key]) {
          chartDataMap[key] = { shopify: 0, whatsapp: 0, tiendas: 0 }
        }
        chartDataMap[key].whatsapp += inv.total || 0
      })

      const chartData = Object.entries(chartDataMap)
        .map(([date, values]) => ({ date, ...values }))
        .sort((a, b) => a.date.localeCompare(b.date))

      setData({
        shopify: shopifyStats,
        whatsapp: whatsappStats,
        tiendas: tiendasStats,
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
    { name: 'Shopify', value: data.shopify.ventas, color: '#96bf48' },
    { name: 'WhatsApp', value: data.whatsapp.ventas, color: '#25D366' },
    { name: 'Tiendas', value: data.tiendas.ventas, color: '#1DA9EF' },
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
            {/* Total KPIs */}
            <div className="grid gap-4 md:grid-cols-3 mb-8">
              <Card className="border-t-4 border-t-[#1DA9EF]">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-[#545454]">Ventas Totales</CardTitle>
                  <DollarSign className="h-4 w-4 text-[#1DA9EF]" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-[#1DA9EF]">{formatCurrency(data?.total.ventas || 0)}</div>
                  <p className="text-xs text-[#545454] mt-1">Todos los canales</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-[#545454]">Total Órdenes</CardTitle>
                  <ShoppingCart className="h-4 w-4 text-[#545454]" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-[#1A2238]">{data?.total.ordenes || 0}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-[#545454]">Unidades Vendidas</CardTitle>
                  <Box className="h-4 w-4 text-[#545454]" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-[#1A2238]">{data?.total.unidades || 0}</div>
                </CardContent>
              </Card>
            </div>

            {/* Channel Breakdown */}
            <div className="grid gap-4 md:grid-cols-3 mb-8">
              <Link href="/dashboard/shopify">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer border-l-4 border-l-[#96bf48]">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-[#545454]">Shopify</CardTitle>
                    <ShoppingCart className="h-4 w-4 text-[#96bf48]" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-[#1A2238]">{formatCurrency(data?.shopify.ventas || 0)}</div>
                    <p className="text-xs text-[#545454]">{data?.shopify.ordenes || 0} órdenes · {data?.shopify.unidades || 0} unidades</p>
                  </CardContent>
                </Card>
              </Link>

              <Link href="/dashboard/whatsapp">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer border-l-4 border-l-[#25D366]">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-[#545454]">WhatsApp</CardTitle>
                    <MessageCircle className="h-4 w-4 text-[#25D366]" />
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
            </div>

            {/* Charts */}
            <div className="grid gap-4 md:grid-cols-3 mb-8">
              {/* Stacked Bar Chart */}
              <Card className="md:col-span-2">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-lg">Ventas por Canal</CardTitle>
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
                          <YAxis tick={{ fontSize: 12 }} stroke="#545454" tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                          <Tooltip
                            formatter={(value) => [formatCurrency(Number(value)), '']}
                            contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
                          />
                          <Legend />
                          <Bar dataKey="shopify" name="Shopify" stackId="a" fill="#96bf48" />
                          <Bar dataKey="whatsapp" name="WhatsApp" stackId="a" fill="#25D366" />
                          <Bar dataKey="tiendas" name="Tiendas" stackId="a" fill="#1DA9EF" />
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
