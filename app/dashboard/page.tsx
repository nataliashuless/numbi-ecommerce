'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DateRange } from 'react-day-picker'
import { format, subDays } from 'date-fns'
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

const COLORS = ['#96bf48', '#25D366', '#6366f1']

export default function DashboardPage() {
  const [data, setData] = useState<ConsolidatedData | null>(null)
  const [loading, setLoading] = useState(true)
  const [shop, setShop] = useState('')
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date(),
  })

  async function fetchData() {
    if (!dateRange?.from || !dateRange?.to) return

    setLoading(true)
    try {
      const startDate = format(dateRange.from, 'yyyy-MM-dd')
      const endDate = format(dateRange.to, 'yyyy-MM-dd')

      // Fetch all channels in parallel
      const [shopifyRes, whatsappRes, tiendasRes] = await Promise.all([
        fetch(`/api/shopify/orders?start_date=${startDate}&end_date=${endDate}&group_by=day`),
        fetch(`/api/whatsapp?start_date=${startDate}&end_date=${endDate}`),
        fetch('/api/tiendas'),
      ])

      // Parse responses
      const shopifyData = shopifyRes.ok ? await shopifyRes.json() : null
      const whatsappData = whatsappRes.ok ? await whatsappRes.json() : null
      const tiendasData = tiendasRes.ok ? await tiendasRes.json() : null

      if (shopifyData?.shop) {
        setShop(shopifyData.shop)
      }

      // Calculate stats per channel
      const shopifyStats: ChannelStats = {
        ventas: shopifyData?.stats?.totalRevenue || 0,
        ordenes: shopifyData?.stats?.totalOrders || 0,
        unidades: shopifyData?.stats?.totalUnits || 0,
      }

      const whatsappStats: ChannelStats = {
        ventas: whatsappData?.stats?.totalVentas || 0,
        ordenes: whatsappData?.stats?.numVentas || 0,
        unidades: whatsappData?.stats?.totalUnidades || 0,
      }

      // For tiendas, we need to calculate from ventas_terceros
      // For now, use the pending amount as an approximation
      const tiendasStats: ChannelStats = {
        ventas: tiendasData?.stats?.montoPendienteTotal || 0,
        ordenes: tiendasData?.tiendas?.reduce((sum: number, t: { ventasPendientes: number }) => sum + t.ventasPendientes, 0) || 0,
        unidades: 0, // Would need separate query
      }

      const totalStats: ChannelStats = {
        ventas: shopifyStats.ventas + whatsappStats.ventas + tiendasStats.ventas,
        ordenes: shopifyStats.ordenes + whatsappStats.ordenes + tiendasStats.ordenes,
        unidades: shopifyStats.unidades + whatsappStats.unidades + tiendasStats.unidades,
      }

      // Combine chart data
      const chartDataMap: Record<string, { shopify: number; whatsapp: number; tiendas: number }> = {}

      // Add Shopify data
      shopifyData?.chartData?.forEach((d: { date: string; sales: number }) => {
        if (!chartDataMap[d.date]) {
          chartDataMap[d.date] = { shopify: 0, whatsapp: 0, tiendas: 0 }
        }
        chartDataMap[d.date].shopify = d.sales
      })

      // Add WhatsApp data
      whatsappData?.chartData?.forEach((d: { date: string; sales: number }) => {
        if (!chartDataMap[d.date]) {
          chartDataMap[d.date] = { shopify: 0, whatsapp: 0, tiendas: 0 }
        }
        chartDataMap[d.date].whatsapp = d.sales
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
  }, [dateRange])

  const pieData = data ? [
    { name: 'Shopify', value: data.shopify.ventas, color: '#96bf48' },
    { name: 'WhatsApp', value: data.whatsapp.ventas, color: '#25D366' },
    { name: 'Tiendas', value: data.tiendas.ventas, color: '#6366f1' },
  ].filter(d => d.value > 0) : []

  const formattedChartData = data?.chartData.map(d => ({
    ...d,
    displayDate: format(new Date(d.date), 'dd MMM', { locale: es })
  })) || []

  return (
    <div className="min-h-screen bg-[#F5F7F4]">
      {/* Header */}
      <header className="bg-[#233037] border-b border-[#334047]">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-semibold text-white tracking-tight">numbi</span>
              <span className="text-xs text-[#00D47F] font-medium bg-[#334047] px-2 py-1 rounded">E-commerce</span>
            </div>
            {shop && (
              <div className="flex items-center gap-2 text-[#99C3D2] text-sm">
                <Store className="h-4 w-4" />
                <span>{shop}</span>
              </div>
            )}
          </div>
          <Link href="/">
            <Button variant="ghost" className="text-[#99C3D2] hover:text-white hover:bg-[#334047]">
              <LogOut className="h-4 w-4 mr-2" />
              Desconectar
            </Button>
          </Link>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="bg-white border-b">
        <div className="container mx-auto px-4">
          <nav className="flex gap-4">
            <Button variant="ghost" className="rounded-none border-b-2 border-[#00D47F] text-[#00D47F] py-4">
              <BarChart3 className="h-4 w-4 mr-2" />
              Ventas
            </Button>
            <Link href="/dashboard/shopify">
              <Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#00D47F] py-4">
                <ShoppingCart className="h-4 w-4 mr-2" />
                Shopify
              </Button>
            </Link>
            <Link href="/dashboard/whatsapp">
              <Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#00D47F] py-4">
                <MessageCircle className="h-4 w-4 mr-2" />
                WhatsApp
              </Button>
            </Link>
            <Link href="/dashboard/tiendas">
              <Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#00D47F] py-4">
                <Store className="h-4 w-4 mr-2" />
                Tiendas
              </Button>
            </Link>
            <Link href="/dashboard/productos">
              <Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#00D47F] py-4">
                <Package className="h-4 w-4 mr-2" />
                Productos
              </Button>
            </Link>
            <Link href="/dashboard/inventario">
              <Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#00D47F] py-4">
                <Boxes className="h-4 w-4 mr-2" />
                Inventario
              </Button>
            </Link>
          </nav>
        </div>
      </div>

      {/* Main */}
      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-[#233037] mb-2">Ventas Consolidadas</h1>
            <p className="text-[#71828A]">Resumen de todos los canales de venta</p>
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
            <Loader2 className="h-8 w-8 animate-spin text-[#00D47F]" />
            <span className="ml-2 text-[#71828A]">Cargando datos...</span>
          </div>
        ) : (
          <>
            {/* Total KPIs */}
            <div className="grid gap-4 md:grid-cols-3 mb-8">
              <Card className="bg-[#233037] text-white">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-[#99C3D2]">Ventas Totales</CardTitle>
                  <DollarSign className="h-4 w-4 text-[#00D47F]" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-[#00D47F]">{formatCurrency(data?.total.ventas || 0)}</div>
                  <p className="text-xs text-[#99C3D2] mt-1">Todos los canales</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-[#71828A]">Total Órdenes</CardTitle>
                  <ShoppingCart className="h-4 w-4 text-[#71828A]" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-[#233037]">{data?.total.ordenes || 0}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-[#71828A]">Unidades Vendidas</CardTitle>
                  <Box className="h-4 w-4 text-[#71828A]" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-[#233037]">{data?.total.unidades || 0}</div>
                </CardContent>
              </Card>
            </div>

            {/* Channel Breakdown */}
            <div className="grid gap-4 md:grid-cols-3 mb-8">
              <Link href="/dashboard/shopify">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer border-l-4 border-l-[#96bf48]">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-[#71828A]">Shopify</CardTitle>
                    <ShoppingCart className="h-4 w-4 text-[#96bf48]" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-[#233037]">{formatCurrency(data?.shopify.ventas || 0)}</div>
                    <p className="text-xs text-[#71828A]">{data?.shopify.ordenes || 0} órdenes · {data?.shopify.unidades || 0} unidades</p>
                  </CardContent>
                </Card>
              </Link>

              <Link href="/dashboard/whatsapp">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer border-l-4 border-l-[#25D366]">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-[#71828A]">WhatsApp</CardTitle>
                    <MessageCircle className="h-4 w-4 text-[#25D366]" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-[#233037]">{formatCurrency(data?.whatsapp.ventas || 0)}</div>
                    <p className="text-xs text-[#71828A]">{data?.whatsapp.ordenes || 0} ventas · {data?.whatsapp.unidades || 0} unidades</p>
                  </CardContent>
                </Card>
              </Link>

              <Link href="/dashboard/tiendas">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer border-l-4 border-l-[#6366f1]">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-[#71828A]">Tiendas Terceros</CardTitle>
                    <Store className="h-4 w-4 text-[#6366f1]" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-[#233037]">{formatCurrency(data?.tiendas.ventas || 0)}</div>
                    <p className="text-xs text-[#71828A]">{data?.tiendas.ordenes || 0} ventas pendientes</p>
                  </CardContent>
                </Card>
              </Link>
            </div>

            {/* Charts */}
            <div className="grid gap-4 md:grid-cols-3 mb-8">
              {/* Stacked Bar Chart */}
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle className="text-lg">Ventas por Canal</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    {formattedChartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={formattedChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="displayDate" tick={{ fontSize: 12 }} stroke="#71828A" />
                          <YAxis tick={{ fontSize: 12 }} stroke="#71828A" tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                          <Tooltip
                            formatter={(value) => [formatCurrency(Number(value)), '']}
                            contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
                          />
                          <Legend />
                          <Bar dataKey="shopify" name="Shopify" stackId="a" fill="#96bf48" />
                          <Bar dataKey="whatsapp" name="WhatsApp" stackId="a" fill="#25D366" />
                          <Bar dataKey="tiendas" name="Tiendas" stackId="a" fill="#6366f1" />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-[#71828A]">
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
                      <div className="flex items-center justify-center h-full text-[#71828A]">
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
