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
} from 'lucide-react'
import { Input } from '@/components/ui/input'

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

function getInventoryBadge(cantidad: number) {
  if (cantidad === 0) {
    return <Badge className="bg-red-500">0</Badge>
  }
  if (cantidad <= 5) {
    return <Badge className="bg-yellow-500">{cantidad}</Badge>
  }
  return <Badge className="bg-green-500">{cantidad}</Badge>
}

export default function InventarioPage() {
  const [data, setData] = useState<InventarioData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filter, setFilter] = useState<'all' | 'low' | 'out'>('all')

  useEffect(() => {
    async function fetchData() {
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
        setData(json)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F7F4] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#00D47F]" />
        <span className="ml-2 text-[#71828A]">Cargando inventario...</span>
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

  const inventario = data?.inventario || []
  const tiendas = data?.tiendas || []
  const totales = data?.totales || { bodega: 0, consignado: 0, total: 0 }

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

  // Calculate filtered totals
  const filteredTotales = {
    bodega: filteredInventario.reduce((sum, i) => sum + i.bodega, 0),
    consignado: filteredInventario.reduce((sum, i) => sum + i.totalConsignado, 0),
    total: filteredInventario.reduce((sum, i) => sum + i.total, 0),
  }

  const lowStockCount = inventario.filter(i => i.total > 0 && i.total <= 5).length
  const outOfStockCount = inventario.filter(i => i.total === 0).length

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
            <Link href="/dashboard">
              <Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#00D47F] py-4">
                <BarChart3 className="h-4 w-4 mr-2" />
                Ventas
              </Button>
            </Link>
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
            <Button variant="ghost" className="rounded-none border-b-2 border-[#00D47F] text-[#00D47F] py-4">
              <Boxes className="h-4 w-4 mr-2" />
              Inventario
            </Button>
          </nav>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-[#233037]">Inventario Consolidado</h1>
        </div>

        {/* KPIs */}
        <div className="grid gap-4 md:grid-cols-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-[#71828A]">Total Empresa</CardTitle>
              <Boxes className="h-4 w-4 text-[#00D47F]" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-[#233037]">{totales.total.toLocaleString()}</div>
              <p className="text-xs text-[#71828A]">unidades totales</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-[#71828A]">En Bodega</CardTitle>
              <Warehouse className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-[#233037]">{totales.bodega.toLocaleString()}</div>
              <p className="text-xs text-[#71828A]">{totales.total > 0 ? ((totales.bodega / totales.total) * 100).toFixed(0) : 0}% del total</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-[#71828A]">Consignado</CardTitle>
              <Store className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-[#233037]">{totales.consignado.toLocaleString()}</div>
              <p className="text-xs text-[#71828A]">en {tiendas.length} tiendas</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-[#71828A]">Alertas</CardTitle>
              <Package className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-[#233037]">{lowStockCount + outOfStockCount}</div>
              <p className="text-xs text-[#71828A]">{outOfStockCount} agotados, {lowStockCount} stock bajo</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Search */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[#71828A]" />
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
                  className={filter === 'all' ? 'bg-[#00D47F] hover:bg-[#00D47F]/90 text-[#233037]' : ''}
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
                <span className="ml-2 text-sm font-normal text-[#71828A]">
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
                      <TableCell colSpan={4 + tiendas.length} className="text-center py-8 text-[#71828A]">
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
                              <div className="font-medium text-[#233037]">{item.producto}</div>
                              {item.variante && (
                                <div className="text-sm text-[#71828A]">{item.variante}</div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm text-[#71828A]">{item.sku}</TableCell>
                        <TableCell className="text-center bg-blue-50/50">
                          {getInventoryBadge(item.bodega)}
                        </TableCell>
                        {tiendas.map(tienda => (
                          <TableCell key={tienda.id} className="text-center bg-purple-50/50">
                            {item.tiendas[tienda.id] > 0 ? (
                              <Badge variant="secondary">{item.tiendas[tienda.id]}</Badge>
                            ) : (
                              <span className="text-[#71828A]">-</span>
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

            {/* Totals Row */}
            {filteredInventario.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <div className="flex justify-end gap-8 text-sm">
                  <div>
                    <span className="text-[#71828A]">Bodega: </span>
                    <span className="font-bold text-blue-600">{filteredTotales.bodega.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-[#71828A]">Consignado: </span>
                    <span className="font-bold text-purple-600">{filteredTotales.consignado.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-[#71828A]">Total: </span>
                    <span className="font-bold text-green-600">{filteredTotales.total.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
