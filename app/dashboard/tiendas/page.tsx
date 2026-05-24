'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DateRange } from 'react-day-picker'
import { format, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Store,
  Package,
  DollarSign,
  Loader2,
  Plus,
  ChevronRight,
  BarChart3,
  MessageCircle,
  Building2,
  ShoppingCart,
  Boxes,
  TrendingUp,
  Settings,
  LogOut,
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
} from 'recharts'

interface TiendaConStats {
  id: string
  nombre: string
  contacto_nombre: string | null
  contacto_telefono: string | null
  contacto_email: string | null
  direccion: string | null
  comision_tipo: 'porcentaje' | 'fijo' | 'mixto'
  comision_porcentaje: number | null
  comision_fijo: number | null
  notas: string | null
  activa: boolean
  inventarioActual: number
  ventasPendientes: number
  montoPendiente: number
}

interface Stats {
  totalTiendas: number
  tiendasActivas: number
  inventarioTotal: number
  montoPendienteTotal: number
}

interface ChartDataItem {
  date: string
  ventas: number
  neto: number
  comision: number
  unidades: number
}

interface VentasStats {
  totalVentas: number
  totalNeto: number
  totalComision: number
  totalUnidades: number
  totalTransacciones: number
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value)
}

function formatComision(tienda: TiendaConStats): string {
  if (tienda.comision_tipo === 'porcentaje' && tienda.comision_porcentaje) {
    return `${tienda.comision_porcentaje}%`
  }
  if (tienda.comision_tipo === 'fijo' && tienda.comision_fijo) {
    return formatCurrency(tienda.comision_fijo) + '/unidad'
  }
  if (tienda.comision_tipo === 'mixto') {
    const parts = []
    if (tienda.comision_porcentaje) parts.push(`${tienda.comision_porcentaje}%`)
    if (tienda.comision_fijo) parts.push(formatCurrency(tienda.comision_fijo) + '/u')
    return parts.join(' + ')
  }
  return '-'
}

function formatDisplayDate(dateStr: string, groupBy: string): string {
  if (groupBy === 'month') {
    const [year, month] = dateStr.split('-')
    const date = new Date(parseInt(year), parseInt(month) - 1, 1)
    return format(date, 'MMM yyyy', { locale: es })
  }
  if (groupBy === 'week') {
    return dateStr.replace('-W', ' Sem ')
  }
  return format(new Date(dateStr + 'T12:00:00'), 'dd MMM', { locale: es })
}

export default function TiendasPage() {
  const [tiendas, setTiendas] = useState<TiendaConStats[]>([])
  const [stats, setStats] = useState<Stats>({ totalTiendas: 0, tiendasActivas: 0, inventarioTotal: 0, montoPendienteTotal: 0 })
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)

  // Chart state
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date(),
  })
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day')
  const [chartData, setChartData] = useState<ChartDataItem[]>([])
  const [ventasStats, setVentasStats] = useState<VentasStats | null>(null)
  const [chartLoading, setChartLoading] = useState(false)

  // Form state
  const [formData, setFormData] = useState({
    nombre: '',
    contacto_nombre: '',
    contacto_telefono: '',
    contacto_email: '',
    direccion: '',
    comision_tipo: 'porcentaje' as 'porcentaje' | 'fijo' | 'mixto',
    comision_porcentaje: '',
    comision_fijo: '',
    notas: '',
  })

  async function fetchData() {
    setLoading(true)
    try {
      const res = await fetch('/api/tiendas')
      if (res.ok) {
        const data = await res.json()
        setTiendas(data.tiendas)
        setStats(data.stats)
      }
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  async function fetchChartData() {
    if (!dateRange?.from || !dateRange?.to) return

    setChartLoading(true)
    try {
      const startDate = format(dateRange.from, 'yyyy-MM-dd')
      const endDate = format(dateRange.to, 'yyyy-MM-dd')

      const res = await fetch(`/api/tiendas/ventas?start_date=${startDate}&end_date=${endDate}&group_by=${groupBy}`)
      if (res.ok) {
        const data = await res.json()
        setChartData(data.chartData)
        setVentasStats(data.stats)
      }
    } catch (error) {
      console.error('Error fetching chart data:', error)
    } finally {
      setChartLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    if (dateRange?.from && dateRange?.to) {
      fetchChartData()
    }
  }, [dateRange, groupBy])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      const res = await fetch('/api/tiendas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          comision_porcentaje: formData.comision_porcentaje ? parseFloat(formData.comision_porcentaje) : null,
          comision_fijo: formData.comision_fijo ? parseFloat(formData.comision_fijo) : null,
        }),
      })
      if (res.ok) {
        setDialogOpen(false)
        setFormData({
          nombre: '',
          contacto_nombre: '',
          contacto_telefono: '',
          contacto_email: '',
          direccion: '',
          comision_tipo: 'porcentaje',
          comision_porcentaje: '',
          comision_fijo: '',
          notas: '',
        })
        fetchData()
      }
    } catch (error) {
      console.error('Error creating store:', error)
    }
  }

  const formattedChartData = chartData.map(d => ({
    ...d,
    displayDate: formatDisplayDate(d.date, groupBy),
  }))

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
            <Link href="/dashboard">
              <Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4">
                <BarChart3 className="h-4 w-4 mr-2" />
                Ventas
              </Button>
            </Link>
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
            <Button variant="ghost" className="rounded-none border-b-2 border-[#1DA9EF] text-[#1A2238] py-4">
              <Store className="h-4 w-4 mr-2" />
              Tiendas
            </Button>
            <Link href="/dashboard/conciliacion">
              <Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4">
                <FileText className="h-4 w-4 mr-2" />
                Conciliación
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
            <h1 className="text-3xl font-bold text-[#1A2238] mb-2">Tiendas de Terceros</h1>
            <p className="text-[#545454]">Gestiona consignaciones y ventas en tiendas aliadas</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-[#1DA9EF] hover:bg-[#1DA9EF]/90 text-[#1A2238] mt-4 md:mt-0">
                <Plus className="h-4 w-4 mr-2" />
                Nueva Tienda
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Agregar Tienda</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="nombre">Nombre de la Tienda *</Label>
                  <Input
                    id="nombre"
                    value={formData.nombre}
                    onChange={e => setFormData({ ...formData, nombre: e.target.value })}
                    placeholder="Ej: Boutique Centro"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="contacto_nombre">Contacto</Label>
                    <Input
                      id="contacto_nombre"
                      value={formData.contacto_nombre}
                      onChange={e => setFormData({ ...formData, contacto_nombre: e.target.value })}
                      placeholder="Nombre"
                    />
                  </div>
                  <div>
                    <Label htmlFor="contacto_telefono">Telefono</Label>
                    <Input
                      id="contacto_telefono"
                      value={formData.contacto_telefono}
                      onChange={e => setFormData({ ...formData, contacto_telefono: e.target.value })}
                      placeholder="+57..."
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="contacto_email">Email</Label>
                  <Input
                    id="contacto_email"
                    type="email"
                    value={formData.contacto_email}
                    onChange={e => setFormData({ ...formData, contacto_email: e.target.value })}
                    placeholder="tienda@email.com"
                  />
                </div>
                <div>
                  <Label htmlFor="direccion">Direccion</Label>
                  <Input
                    id="direccion"
                    value={formData.direccion}
                    onChange={e => setFormData({ ...formData, direccion: e.target.value })}
                    placeholder="Direccion de la tienda"
                  />
                </div>

                <div className="border-t pt-4">
                  <Label className="text-base font-semibold">Configuracion de Comision</Label>
                  <div className="mt-2 space-y-4">
                    <div>
                      <Label htmlFor="comision_tipo">Tipo de Comision</Label>
                      <Select
                        value={formData.comision_tipo}
                        onValueChange={(value: 'porcentaje' | 'fijo' | 'mixto') =>
                          setFormData({ ...formData, comision_tipo: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="porcentaje">Porcentaje (%)</SelectItem>
                          <SelectItem value="fijo">Monto Fijo por Unidad</SelectItem>
                          <SelectItem value="mixto">Mixto (% + Fijo)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {(formData.comision_tipo === 'porcentaje' || formData.comision_tipo === 'mixto') && (
                      <div>
                        <Label htmlFor="comision_porcentaje">Porcentaje (%)</Label>
                        <Input
                          id="comision_porcentaje"
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={formData.comision_porcentaje}
                          onChange={e => setFormData({ ...formData, comision_porcentaje: e.target.value })}
                          placeholder="Ej: 30"
                        />
                      </div>
                    )}
                    {(formData.comision_tipo === 'fijo' || formData.comision_tipo === 'mixto') && (
                      <div>
                        <Label htmlFor="comision_fijo">Monto Fijo por Unidad (COP)</Label>
                        <Input
                          id="comision_fijo"
                          type="number"
                          min="0"
                          value={formData.comision_fijo}
                          onChange={e => setFormData({ ...formData, comision_fijo: e.target.value })}
                          placeholder="Ej: 5000"
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <Label htmlFor="notas">Notas</Label>
                  <Textarea
                    id="notas"
                    value={formData.notas}
                    onChange={e => setFormData({ ...formData, notas: e.target.value })}
                    placeholder="Observaciones sobre el acuerdo..."
                  />
                </div>

                <div className="flex justify-end pt-4 border-t">
                  <Button type="submit" className="bg-[#1DA9EF] hover:bg-[#1DA9EF]/90 text-[#1A2238]">
                    Guardar Tienda
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-[#1A2238]" />
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-[#545454]">Total Tiendas</CardTitle>
                  <Building2 className="h-4 w-4 text-[#545454]" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-[#1A2238]">{stats.totalTiendas}</div>
                  <p className="text-xs text-[#545454]">{stats.tiendasActivas} activas</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-[#545454]">Inventario Consignado</CardTitle>
                  <Package className="h-4 w-4 text-[#545454]" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-[#1A2238]">{stats.inventarioTotal}</div>
                  <p className="text-xs text-[#545454]">unidades en tiendas</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-[#545454]">Por Liquidar</CardTitle>
                  <DollarSign className="h-4 w-4 text-[#545454]" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-[#1A2238]">{formatCurrency(stats.montoPendienteTotal)}</div>
                  <p className="text-xs text-[#545454]">ventas pendientes</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-[#545454]">Ventas (Periodo)</CardTitle>
                  <TrendingUp className="h-4 w-4 text-[#545454]" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-[#1A2238]">
                    {ventasStats ? formatCurrency(ventasStats.totalNeto) : '-'}
                  </div>
                  <p className="text-xs text-[#545454]">
                    {ventasStats ? `${ventasStats.totalUnidades} unidades` : 'neto a recibir'}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Chart Section */}
            <Card className="mb-8">
              <CardHeader>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <CardTitle className="text-lg">Ventas por Periodo</CardTitle>
                  <div className="flex items-center gap-2">
                    <DateRangePicker date={dateRange} onDateChange={setDateRange} />
                    <div className="flex gap-1 border rounded-md p-1 bg-white">
                      <Button
                        variant={groupBy === 'day' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setGroupBy('day')}
                        className={groupBy === 'day' ? 'bg-[#1DA9EF] hover:bg-[#1DA9EF]/90 text-[#1A2238]' : ''}
                      >
                        Dia
                      </Button>
                      <Button
                        variant={groupBy === 'week' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setGroupBy('week')}
                        className={groupBy === 'week' ? 'bg-[#1DA9EF] hover:bg-[#1DA9EF]/90 text-[#1A2238]' : ''}
                      >
                        Semana
                      </Button>
                      <Button
                        variant={groupBy === 'month' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setGroupBy('month')}
                        className={groupBy === 'month' ? 'bg-[#1DA9EF] hover:bg-[#1DA9EF]/90 text-[#1A2238]' : ''}
                      >
                        Mes
                      </Button>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  {chartLoading ? (
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="h-8 w-8 animate-spin text-[#1A2238]" />
                    </div>
                  ) : formattedChartData.length > 0 ? (
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
                        <Bar dataKey="neto" name="Neto" fill="#1DA9EF" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="comision" name="Comision" fill="#1DA9EF" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-[#545454]">
                      No hay ventas en este periodo
                    </div>
                  )}
                </div>
                {ventasStats && ventasStats.totalTransacciones > 0 && (
                  <div className="mt-4 pt-4 border-t flex justify-end gap-8 text-sm">
                    <div>
                      <span className="text-[#545454]">Ventas brutas: </span>
                      <span className="font-bold">{formatCurrency(ventasStats.totalVentas)}</span>
                    </div>
                    <div>
                      <span className="text-[#545454]">Comision: </span>
                      <span className="font-bold text-purple-600">{formatCurrency(ventasStats.totalComision)}</span>
                    </div>
                    <div>
                      <span className="text-[#545454]">Neto: </span>
                      <span className="font-bold text-[#1A2238]">{formatCurrency(ventasStats.totalNeto)}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Store List */}
            <Card>
              <CardHeader>
                <CardTitle>Tiendas Aliadas</CardTitle>
              </CardHeader>
              <CardContent>
                {tiendas.length === 0 ? (
                  <div className="text-center py-12">
                    <Store className="h-12 w-12 mx-auto text-[#545454] mb-4" />
                    <p className="text-[#545454] mb-4">No hay tiendas registradas</p>
                    <Button
                      onClick={() => setDialogOpen(true)}
                      className="bg-[#1DA9EF] hover:bg-[#1DA9EF]/90 text-[#1A2238]"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Agregar Primera Tienda
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {tiendas.map((tienda) => (
                      <Link key={tienda.id} href={`/dashboard/tiendas/${tienda.id}`}>
                        <div className="border rounded-lg p-4 hover:bg-gray-50 transition-colors cursor-pointer">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="h-10 w-10 rounded-full bg-[#1DA9EF] flex items-center justify-center">
                                <Store className="h-5 w-5 text-[#1A2238]" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-[#1A2238]">{tienda.nombre}</span>
                                  {!tienda.activa && (
                                    <Badge variant="secondary">Inactiva</Badge>
                                  )}
                                </div>
                                <div className="text-sm text-[#545454]">
                                  Comision: {formatComision(tienda)}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-6">
                              <div className="text-right">
                                <div className="text-sm text-[#545454]">Inventario</div>
                                <div className="font-semibold">{tienda.inventarioActual} uds</div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm text-[#545454]">Por Liquidar</div>
                                <div className="font-semibold text-[#1A2238]">
                                  {formatCurrency(tienda.montoPendiente)}
                                </div>
                              </div>
                              <ChevronRight className="h-5 w-5 text-[#545454]" />
                            </div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  )
}
