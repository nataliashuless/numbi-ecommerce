'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DateRange } from 'react-day-picker'
import { format, subDays, startOfMonth } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DollarSign,
  ShoppingCart,
  Package,
  Clock,
  Store,
  Loader2,
  LogOut,
  RefreshCw
} from 'lucide-react'
import { DateRangePicker } from '@/components/ui/date-range-picker'

interface Order {
  id: number
  orderNumber: number
  name: string
  createdAt: string
  totalPrice: number
  currency: string
  financialStatus: string
  fulfillmentStatus: string | null
  customerName: string
  customerEmail: string | null
  itemCount: number
}

interface Stats {
  totalRevenue: number
  totalOrders: number
  paidOrders: number
  pendingOrders: number
  averageOrderValue: number
}

interface DashboardData {
  orders: Order[]
  stats: Stats
  shop: string
}

function formatCurrency(value: number, currency: string = 'COP'): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function getStatusBadge(status: string) {
  const statusConfig: Record<string, { label: string; className: string }> = {
    paid: { label: 'Pagado', className: 'bg-green-500' },
    pending: { label: 'Pendiente', className: 'bg-yellow-500' },
    refunded: { label: 'Reembolsado', className: 'bg-red-500' },
    voided: { label: 'Anulado', className: 'bg-gray-500' },
    partially_refunded: { label: 'Reembolso parcial', className: 'bg-orange-500' },
  }
  const config = statusConfig[status] || { label: status, className: 'bg-gray-500' }
  return <Badge className={config.className}>{config.label}</Badge>
}

function getFulfillmentBadge(status: string | null) {
  if (!status) return <Badge variant="secondary">Sin enviar</Badge>
  const statusConfig: Record<string, { label: string; className: string }> = {
    fulfilled: { label: 'Enviado', className: 'bg-green-500' },
    partial: { label: 'Parcial', className: 'bg-yellow-500' },
    unfulfilled: { label: 'Sin enviar', className: 'bg-gray-500' },
  }
  const config = statusConfig[status] || { label: status, className: 'bg-gray-500' }
  return <Badge className={config.className}>{config.label}</Badge>
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: new Date(),
  })

  async function fetchData() {
    setLoading(true)
    try {
      let url = '/api/shopify/orders'
      if (dateRange?.from && dateRange?.to) {
        const startDate = format(dateRange.from, 'yyyy-MM-dd')
        const endDate = format(dateRange.to, 'yyyy-MM-dd')
        url += `?start_date=${startDate}&end_date=${endDate}`
      }
      const res = await fetch(url)
      if (res.status === 401) {
        window.location.href = '/api/auth/shopify'
        return
      }
      if (!res.ok) {
        throw new Error('Error al cargar datos')
      }
      const json = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [dateRange])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F7F4] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#00D47F]" />
        <span className="ml-2 text-[#71828A]">Cargando datos de Shopify...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#F5F7F4] flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <Link href="/api/auth/shopify">
            <Button className="bg-[#00D47F] hover:bg-[#00D47F]/90 text-[#233037]">
              Reconectar Shopify
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  const stats = data?.stats || { totalRevenue: 0, totalOrders: 0, paidOrders: 0, pendingOrders: 0, averageOrderValue: 0 }
  const orders = data?.orders || []
  const shop = data?.shop || ''

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
            <div className="flex items-center gap-2 text-[#99C3D2] text-sm">
              <Store className="h-4 w-4" />
              <span>{shop}</span>
            </div>
          </div>
          <Link href="/">
            <Button variant="ghost" className="text-[#99C3D2] hover:text-white hover:bg-[#334047]">
              <LogOut className="h-4 w-4 mr-2" />
              Desconectar
            </Button>
          </Link>
        </div>
      </header>

      {/* Main */}
      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-[#233037] mb-2">Dashboard</h1>
            <p className="text-[#71828A]">Resumen de ventas de tu tienda Shopify</p>
          </div>
          <div className="flex items-center gap-2 mt-4 md:mt-0">
            <DateRangePicker
              date={dateRange}
              onDateChange={setDateRange}
            />
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

        {/* KPIs */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-[#71828A]">Ventas Totales</CardTitle>
              <DollarSign className="h-4 w-4 text-[#71828A]" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-[#233037]">{formatCurrency(stats.totalRevenue)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-[#71828A]">Órdenes</CardTitle>
              <ShoppingCart className="h-4 w-4 text-[#71828A]" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-[#233037]">{stats.totalOrders}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-[#71828A]">Pagadas</CardTitle>
              <Package className="h-4 w-4 text-[#71828A]" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-[#00D47F]">{stats.paidOrders}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-[#71828A]">Pendientes</CardTitle>
              <Clock className="h-4 w-4 text-[#71828A]" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-500">{stats.pendingOrders}</div>
            </CardContent>
          </Card>
        </div>

        {/* Orders Table */}
        <Card>
          <CardHeader>
            <CardTitle>Órdenes Recientes</CardTitle>
          </CardHeader>
          <CardContent>
            {orders.length === 0 ? (
              <p className="text-[#71828A] text-center py-8">No hay órdenes todavía</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Orden</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Estado Pago</TableHead>
                    <TableHead>Envío</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">{order.name}</TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{order.customerName}</div>
                          {order.customerEmail && (
                            <div className="text-xs text-[#71828A]">{order.customerEmail}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-[#71828A]">{formatDate(order.createdAt)}</TableCell>
                      <TableCell>{getStatusBadge(order.financialStatus)}</TableCell>
                      <TableCell>{getFulfillmentBadge(order.fulfillmentStatus)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(order.totalPrice, order.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
