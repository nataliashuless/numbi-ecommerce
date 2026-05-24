'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Package,
  Store,
  Loader2,
  LogOut,
  Warehouse,
  BarChart3,
  MessageCircle,
  ShoppingCart,
  Boxes,
  Search,
  TrendingUp,
  AlertTriangle,
  Clock,
  Factory,
  Settings,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Tienda {
  id: string
  nombre: string
}

interface InventarioItem {
  sku: string
  producto: string
  variante: string
  imagen: string | null
  bodega: number
  tiendas: { [tiendaId: string]: number }
  totalConsignado: number
  total: number
}

interface InventarioData {
  inventario: InventarioItem[]
  tiendas: Tienda[]
  totales: {
    bodega: number
    consignado: number
    total: number
  }
}

interface ForecastItem {
  sku: string
  producto: string
  variante: string
  imagen: string | null
  stockBodega: number
  stockConsignado: number
  stockTotal: number
  ventasShopify: number
  ventasWhatsApp: number
  ventasTiendas: number
  ventasTotal: number
  velocidadDiaria: number
  velocidadSemanal: number
  diasHastaAgotamiento: number | null
  sugerenciaProduccion: number
  prioridad: 'critica' | 'alta' | 'media' | 'baja'
}

interface ForecastData {
  forecast: ForecastItem[]
  resumen: {
    totalSkus: number
    criticos: number
    altos: number
    medios: number
    bajos: number
    totalProducirSugerido: number
    totalVentasPeriodo: number
  }
  parametros: {
    diasAnalisis: number
    leadTimeDias: number
    stockSeguridad: number
    fechaInicio: string
    fechaFin: string
  }
}

function getInventoryBadge(cantidad: number) {
  if (cantidad === 0) {
    return <Badge className="bg-red-500">0</Badge>
  }
  if (cantidad <= 5) {
    return <Badge className="bg-yellow-500">{cantidad}</Badge>
  }
  return <Badge className="bg-green-500">{cantidad}</Badge>
}

function getPriorityBadge(prioridad: string) {
  switch (prioridad) {
    case 'critica':
      return <Badge className="bg-red-600">Urgente</Badge>
    case 'alta':
      return <Badge className="bg-orange-500">Alta</Badge>
    case 'media':
      return <Badge className="bg-yellow-500">Media</Badge>
    default:
      return <Badge variant="secondary">Baja</Badge>
  }
}

export default function InventarioPage() {
  const [inventarioData, setInventarioData] = useState<InventarioData | null>(null)
  const [forecastData, setForecastData] = useState<ForecastData | null>(null)
  const [loading, setLoading] = useState(true)
  const [forecastLoading, setForecastLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [forecastSearchTerm, setForecastSearchTerm] = useState('')
  const [filter, setFilter] = useState<'all' | 'low' | 'out'>('all')
  const [forecastFilter, setForecastFilter] = useState<'all' | 'critica' | 'alta' | 'media'>('all')
  const [activeTab, setActiveTab] = useState('inventario')

  // Forecast parameters
  const [diasAnalisis, setDiasAnalisis] = useState('30')
  const [leadTime, setLeadTime] = useState('14')
  const [stockSeguridad, setStockSeguridad] = useState('7')

  useEffect(() => {
    async function fetchInventario() {
      try {
        const res = await fetch('/api/inventario')
        if (res.status === 401) {
          window.location.href = '/api/auth/shopify'
          return
        }
        if (!res.ok) {
          throw new Error('Error al cargar inventario')
        }
        const json = await res.json()
        setInventarioData(json)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido')
      } finally {
        setLoading(false)
      }
    }
    fetchInventario()
  }, [])

  const fetchForecast = async () => {
    setForecastLoading(true)
    try {
      const res = await fetch(`/api/forecast?dias=${diasAnalisis}&lead_time=${leadTime}&stock_seguridad=${stockSeguridad}`)
      if (!res.ok) {
        throw new Error('Error al cargar forecast')
      }
      const json = await res.json()
      setForecastData(json)
    } catch (err) {
      console.error('Error fetching forecast:', err)
    } finally {
      setForecastLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'forecast' && !forecastData) {
      fetchForecast()
    }
  }, [activeTab])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFFFFF] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#1A2238]" />
        <span className="ml-2 text-[#545454]">Cargando inventario...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#FFFFFF] flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <Link href="/api/auth/shopify">
            <Button className="bg-[#1DA9EF] hover:bg-[#1DA9EF]/90 text-[#1A2238]">
              Reconectar Shopify
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  const inventario = inventarioData?.inventario || []
  const tiendas = inventarioData?.tiendas || []
  const totales = inventarioData?.totales || { bodega: 0, consignado: 0, total: 0 }

  // Filter inventory
  let filteredInventario = inventario.filter(item => {
    const searchLower = searchTerm.toLowerCase()
    return (
      item.producto.toLowerCase().includes(searchLower) ||
      item.sku.toLowerCase().includes(searchLower) ||
      item.variante.toLowerCase().includes(searchLower)
    )
  })

  if (filter === 'low') {
    filteredInventario = filteredInventario.filter(item => item.total > 0 && item.total <= 5)
  } else if (filter === 'out') {
    filteredInventario = filteredInventario.filter(item => item.total === 0)
  }

  const filteredTotales = {
    bodega: filteredInventario.reduce((sum, i) => sum + i.bodega, 0),
    consignado: filteredInventario.reduce((sum, i) => sum + i.totalConsignado, 0),
    total: filteredInventario.reduce((sum, i) => sum + i.total, 0),
  }

  const lowStockCount = inventario.filter(i => i.total > 0 && i.total <= 5).length
  const outOfStockCount = inventario.filter(i => i.total === 0).length

  // Filter forecast
  let filteredForecast = forecastData?.forecast || []
  if (forecastSearchTerm) {
    const searchLower = forecastSearchTerm.toLowerCase()
    filteredForecast = filteredForecast.filter(item =>
      item.producto.toLowerCase().includes(searchLower) ||
      item.sku.toLowerCase().includes(searchLower) ||
      item.variante.toLowerCase().includes(searchLower)
    )
  }
  if (forecastFilter !== 'all') {
    filteredForecast = filteredForecast.filter(item => item.prioridad === forecastFilter)
  }

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
            <Link href="/dashboard/tiendas">
              <Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4">
                <Store className="h-4 w-4 mr-2" />
                Tiendas
              </Button>
            </Link>
            <Link href="/dashboard/productos">
              <Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4">
                <Package className="h-4 w-4 mr-2" />
                Productos
              </Button>
            </Link>
            <Button variant="ghost" className="rounded-none border-b-2 border-[#1DA9EF] text-[#1A2238] py-4">
              <Boxes className="h-4 w-4 mr-2" />
              Inventario
            </Button>
            <Link href="/dashboard/configuracion">
              <Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4">
                <Settings className="h-4 w-4 mr-2" />
                Configuración
              </Button>
            </Link>
          </nav>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-[#1A2238]">Inventario y Forecast</h1>
            <TabsList>
              <TabsTrigger value="inventario" className="flex items-center gap-2">
                <Boxes className="h-4 w-4" />
                Inventario
              </TabsTrigger>
              <TabsTrigger value="forecast" className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Forecast Produccion
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Inventario Tab */}
          <TabsContent value="inventario">
            {/* KPIs */}
            <div className="grid gap-4 md:grid-cols-4 mb-8">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-[#545454]">Total Empresa</CardTitle>
                  <Boxes className="h-4 w-4 text-[#1A2238]" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-[#1A2238]">{totales.total.toLocaleString()}</div>
                  <p className="text-xs text-[#545454]">unidades totales</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-[#545454]">En Bodega</CardTitle>
                  <Warehouse className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-[#1A2238]">{totales.bodega.toLocaleString()}</div>
                  <p className="text-xs text-[#545454]">{totales.total > 0 ? ((totales.bodega / totales.total) * 100).toFixed(0) : 0}% del total</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-[#545454]">Consignado</CardTitle>
                  <Store className="h-4 w-4 text-purple-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-[#1A2238]">{totales.consignado.toLocaleString()}</div>
                  <p className="text-xs text-[#545454]">en {tiendas.length} tiendas</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-[#545454]">Alertas</CardTitle>
                  <Package className="h-4 w-4 text-yellow-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-[#1A2238]">{lowStockCount + outOfStockCount}</div>
                  <p className="text-xs text-[#545454]">{outOfStockCount} agotados, {lowStockCount} stock bajo</p>
                </CardContent>
              </Card>
            </div>

            {/* Filters and Search */}
            <Card className="mb-6">
              <CardContent className="pt-6">
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[#545454]" />
                    <Input
                      placeholder="Buscar por producto, SKU o variante..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant={filter === 'all' ? 'default' : 'outline'}
                      onClick={() => setFilter('all')}
                      className={filter === 'all' ? 'bg-[#1DA9EF] hover:bg-[#1DA9EF]/90 text-[#1A2238]' : ''}
                    >
                      Todos ({inventario.length})
                    </Button>
                    <Button
                      variant={filter === 'low' ? 'default' : 'outline'}
                      onClick={() => setFilter('low')}
                      className={filter === 'low' ? 'bg-yellow-500 hover:bg-yellow-500/90 text-white' : ''}
                    >
                      Stock Bajo ({lowStockCount})
                    </Button>
                    <Button
                      variant={filter === 'out' ? 'default' : 'outline'}
                      onClick={() => setFilter('out')}
                      className={filter === 'out' ? 'bg-red-500 hover:bg-red-500/90 text-white' : ''}
                    >
                      Agotados ({outOfStockCount})
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Inventory Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  Detalle por Producto
                  {searchTerm && (
                    <span className="ml-2 text-sm font-normal text-[#545454]">
                      ({filteredInventario.length} resultados)
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[200px]">Producto</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-center bg-blue-50">Bodega</TableHead>
                        {tiendas.map(tienda => (
                          <TableHead key={tienda.id} className="text-center bg-purple-50 min-w-[80px]">
                            {tienda.nombre.length > 10 ? tienda.nombre.substring(0, 10) + '...' : tienda.nombre}
                          </TableHead>
                        ))}
                        <TableHead className="text-center bg-green-50">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredInventario.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4 + tiendas.length} className="text-center py-8 text-[#545454]">
                            {searchTerm ? 'No se encontraron productos' : 'No hay productos en inventario'}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredInventario.map((item) => (
                          <TableRow key={item.sku}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                {item.imagen && (
                                  <img
                                    src={item.imagen}
                                    alt={item.producto}
                                    className="w-10 h-10 object-cover rounded"
                                  />
                                )}
                                <div>
                                  <div className="font-medium text-[#1A2238]">{item.producto}</div>
                                  {item.variante && (
                                    <div className="text-sm text-[#545454]">{item.variante}</div>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-sm text-[#545454]">{item.sku}</TableCell>
                            <TableCell className="text-center bg-blue-50/50">
                              {getInventoryBadge(item.bodega)}
                            </TableCell>
                            {tiendas.map(tienda => (
                              <TableCell key={tienda.id} className="text-center bg-purple-50/50">
                                {item.tiendas[tienda.id] > 0 ? (
                                  <Badge variant="secondary">{item.tiendas[tienda.id]}</Badge>
                                ) : (
                                  <span className="text-[#545454]">-</span>
                                )}
                              </TableCell>
                            ))}
                            <TableCell className="text-center bg-green-50/50">
                              {getInventoryBadge(item.total)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                {filteredInventario.length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <div className="flex justify-end gap-8 text-sm">
                      <div>
                        <span className="text-[#545454]">Bodega: </span>
                        <span className="font-bold text-blue-600">{filteredTotales.bodega.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-[#545454]">Consignado: </span>
                        <span className="font-bold text-purple-600">{filteredTotales.consignado.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-[#545454]">Total: </span>
                        <span className="font-bold text-green-600">{filteredTotales.total.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Forecast Tab */}
          <TabsContent value="forecast">
            {forecastLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-[#1A2238]" />
                <span className="ml-2 text-[#545454]">Calculando forecast...</span>
              </div>
            ) : forecastData ? (
              <>
                {/* Forecast KPIs */}
                <div className="grid gap-4 md:grid-cols-5 mb-8">
                  <Card className="border-red-200 bg-red-50">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-red-700">Urgentes</CardTitle>
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-red-700">{forecastData.resumen.criticos}</div>
                      <p className="text-xs text-red-600">se agotan en 7 dias</p>
                    </CardContent>
                  </Card>
                  <Card className="border-orange-200 bg-orange-50">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-orange-700">Alta Prioridad</CardTitle>
                      <Clock className="h-4 w-4 text-orange-600" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-orange-700">{forecastData.resumen.altos}</div>
                      <p className="text-xs text-orange-600">se agotan en 14 dias</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-[#545454]">Media Prioridad</CardTitle>
                      <TrendingUp className="h-4 w-4 text-yellow-500" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-[#1A2238]">{forecastData.resumen.medios}</div>
                      <p className="text-xs text-[#545454]">se agotan en 30 dias</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-[#545454]">Producir Sugerido</CardTitle>
                      <Factory className="h-4 w-4 text-[#1A2238]" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-[#1A2238]">{forecastData.resumen.totalProducirSugerido.toLocaleString()}</div>
                      <p className="text-xs text-[#545454]">unidades totales</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-[#545454]">Ventas ({diasAnalisis}d)</CardTitle>
                      <ShoppingCart className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-[#1A2238]">{forecastData.resumen.totalVentasPeriodo.toLocaleString()}</div>
                      <p className="text-xs text-[#545454]">unidades vendidas</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Forecast Parameters */}
                <Card className="mb-6">
                  <CardContent className="pt-6">
                    <div className="flex flex-col md:flex-row gap-4 items-end">
                      <div className="flex-1">
                        <Label htmlFor="dias">Periodo de analisis</Label>
                        <Select value={diasAnalisis} onValueChange={setDiasAnalisis}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="7">Ultimos 7 dias</SelectItem>
                            <SelectItem value="14">Ultimos 14 dias</SelectItem>
                            <SelectItem value="30">Ultimos 30 dias</SelectItem>
                            <SelectItem value="60">Ultimos 60 dias</SelectItem>
                            <SelectItem value="90">Ultimos 90 dias</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex-1">
                        <Label htmlFor="leadtime">Lead time produccion (dias)</Label>
                        <Input
                          id="leadtime"
                          type="number"
                          min="1"
                          value={leadTime}
                          onChange={(e) => setLeadTime(e.target.value)}
                          placeholder="14"
                        />
                      </div>
                      <div className="flex-1">
                        <Label htmlFor="seguridad">Stock de seguridad (dias)</Label>
                        <Input
                          id="seguridad"
                          type="number"
                          min="0"
                          value={stockSeguridad}
                          onChange={(e) => setStockSeguridad(e.target.value)}
                          placeholder="7"
                        />
                      </div>
                      <Button onClick={fetchForecast} className="bg-[#1DA9EF] hover:bg-[#1DA9EF]/90 text-[#1A2238]">
                        Recalcular
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Filters */}
                <Card className="mb-6">
                  <CardContent className="pt-6">
                    <div className="flex flex-col md:flex-row gap-4">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[#545454]" />
                        <Input
                          placeholder="Buscar por producto, SKU o variante..."
                          value={forecastSearchTerm}
                          onChange={(e) => setForecastSearchTerm(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant={forecastFilter === 'all' ? 'default' : 'outline'}
                          onClick={() => setForecastFilter('all')}
                          className={forecastFilter === 'all' ? 'bg-[#1DA9EF] hover:bg-[#1DA9EF]/90 text-[#1A2238]' : ''}
                        >
                          Todos
                        </Button>
                        <Button
                          variant={forecastFilter === 'critica' ? 'default' : 'outline'}
                          onClick={() => setForecastFilter('critica')}
                          className={forecastFilter === 'critica' ? 'bg-red-500 hover:bg-red-500/90 text-white' : ''}
                        >
                          Urgentes ({forecastData.resumen.criticos})
                        </Button>
                        <Button
                          variant={forecastFilter === 'alta' ? 'default' : 'outline'}
                          onClick={() => setForecastFilter('alta')}
                          className={forecastFilter === 'alta' ? 'bg-orange-500 hover:bg-orange-500/90 text-white' : ''}
                        >
                          Alta ({forecastData.resumen.altos})
                        </Button>
                        <Button
                          variant={forecastFilter === 'media' ? 'default' : 'outline'}
                          onClick={() => setForecastFilter('media')}
                          className={forecastFilter === 'media' ? 'bg-yellow-500 hover:bg-yellow-500/90 text-white' : ''}
                        >
                          Media ({forecastData.resumen.medios})
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Forecast Table */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Forecast de Produccion</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="min-w-[200px]">Producto</TableHead>
                            <TableHead>SKU</TableHead>
                            <TableHead className="text-center">Stock Bodega</TableHead>
                            <TableHead className="text-center">Ventas ({diasAnalisis}d)</TableHead>
                            <TableHead className="text-center">Vel. Semanal</TableHead>
                            <TableHead className="text-center">Dias Restantes</TableHead>
                            <TableHead className="text-center">Prioridad</TableHead>
                            <TableHead className="text-center bg-green-50">Producir</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredForecast.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={8} className="text-center py-8 text-[#545454]">
                                No hay productos que mostrar
                              </TableCell>
                            </TableRow>
                          ) : (
                            filteredForecast.map((item) => (
                              <TableRow key={item.sku} className={item.prioridad === 'critica' ? 'bg-red-50' : item.prioridad === 'alta' ? 'bg-orange-50' : ''}>
                                <TableCell>
                                  <div className="flex items-center gap-3">
                                    {item.imagen && (
                                      <img
                                        src={item.imagen}
                                        alt={item.producto}
                                        className="w-10 h-10 object-cover rounded"
                                      />
                                    )}
                                    <div>
                                      <div className="font-medium text-[#1A2238]">{item.producto}</div>
                                      {item.variante && (
                                        <div className="text-sm text-[#545454]">{item.variante}</div>
                                      )}
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="font-mono text-sm text-[#545454]">{item.sku}</TableCell>
                                <TableCell className="text-center">
                                  {getInventoryBadge(item.stockBodega)}
                                </TableCell>
                                <TableCell className="text-center">
                                  <div className="text-sm">
                                    <span className="font-medium">{item.ventasTotal}</span>
                                    {item.ventasTotal > 0 && (
                                      <div className="text-xs text-[#545454]">
                                        S:{item.ventasShopify} W:{item.ventasWhatsApp} T:{item.ventasTiendas}
                                      </div>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-center">
                                  <span className="font-medium">{item.velocidadSemanal.toFixed(1)}</span>
                                  <span className="text-xs text-[#545454]"> uds/sem</span>
                                </TableCell>
                                <TableCell className="text-center">
                                  {item.diasHastaAgotamiento !== null ? (
                                    <span className={`font-bold ${item.diasHastaAgotamiento <= 7 ? 'text-red-600' : item.diasHastaAgotamiento <= 14 ? 'text-orange-600' : 'text-[#1A2238]'}`}>
                                      {item.diasHastaAgotamiento} dias
                                    </span>
                                  ) : (
                                    <span className="text-[#545454]">-</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-center">
                                  {getPriorityBadge(item.prioridad)}
                                </TableCell>
                                <TableCell className="text-center bg-green-50/50">
                                  {item.sugerenciaProduccion > 0 ? (
                                    <span className="font-bold text-green-700">{item.sugerenciaProduccion}</span>
                                  ) : (
                                    <span className="text-[#545454]">-</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>

                    {filteredForecast.length > 0 && (
                      <div className="mt-4 pt-4 border-t">
                        <div className="flex justify-between items-center text-sm">
                          <div className="text-[#545454]">
                            Formula: Producir = (Lead Time + Stock Seguridad) x Velocidad Diaria - Stock Actual
                          </div>
                          <div>
                            <span className="text-[#545454]">Total a producir: </span>
                            <span className="font-bold text-green-600">
                              {filteredForecast.reduce((sum, f) => sum + f.sugerenciaProduccion, 0).toLocaleString()} uds
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            ) : null}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
