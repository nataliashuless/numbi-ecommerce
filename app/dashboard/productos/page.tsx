'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
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
  AlertTriangle,
  PackageX,
  Boxes,
  ShoppingBag,
  BarChart3
} from 'lucide-react'

interface Variant {
  id: number
  title: string
  price: number
  sku: string
  inventory: number
  tracked: boolean
}

interface Product {
  id: number
  title: string
  handle: string
  status: string
  vendor: string
  productType: string
  image: string | null
  createdAt: string
  updatedAt: string
  totalInventory: number
  hasInventoryTracking: boolean
  variantCount: number
  variants: Variant[]
  minPrice: number
  maxPrice: number
}

interface Stats {
  totalProducts: number
  activeProducts: number
  totalInventory: number
  outOfStock: number
  lowStock: number
}

interface ProductsData {
  products: Product[]
  stats: Stats
  shop: string
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value)
}

function getStatusBadge(status: string) {
  const config = status === 'active'
    ? { label: 'Activo', className: 'bg-green-500' }
    : { label: 'Borrador', className: 'bg-gray-500' }
  return <Badge className={config.className}>{config.label}</Badge>
}

function getInventoryBadge(product: Product) {
  if (!product.hasInventoryTracking) {
    return <Badge variant="secondary">Sin seguimiento</Badge>
  }
  if (product.totalInventory === 0) {
    return <Badge className="bg-red-500">Agotado</Badge>
  }
  if (product.totalInventory <= 5) {
    return <Badge className="bg-yellow-500">Stock bajo</Badge>
  }
  return <Badge className="bg-green-500">{product.totalInventory} uds</Badge>
}

export default function ProductsPage() {
  const [data, setData] = useState<ProductsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'low' | 'out'>('all')

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/api/shopify/products')
        if (res.status === 401) {
          window.location.href = '/api/auth/shopify'
          return
        }
        if (!res.ok) {
          throw new Error('Error al cargar productos')
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
        <span className="ml-2 text-[#71828A]">Cargando productos...</span>
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

  const stats = data?.stats || { totalProducts: 0, activeProducts: 0, totalInventory: 0, outOfStock: 0, lowStock: 0 }
  const products = data?.products || []
  const shop = data?.shop || ''

  // Filter products
  const filteredProducts = products.filter(p => {
    if (filter === 'low') return p.hasInventoryTracking && p.totalInventory > 0 && p.totalInventory <= 5
    if (filter === 'out') return p.hasInventoryTracking && p.totalInventory === 0
    return true
  })

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
            <Button variant="ghost" className="rounded-none border-b-2 border-[#00D47F] text-[#00D47F] py-4">
              <Package className="h-4 w-4 mr-2" />
              Productos
            </Button>
          </nav>
        </div>
      </div>

      {/* Main */}
      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-[#233037] mb-2">Productos</h1>
            <p className="text-[#71828A]">Inventario de tu tienda Shopify</p>
          </div>
          <div className="flex gap-1 mt-4 md:mt-0 border rounded-md p-1">
            <Button
              variant={filter === 'all' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setFilter('all')}
              className={filter === 'all' ? 'bg-[#00D47F] hover:bg-[#00D47F]/90 text-[#233037]' : ''}
            >
              Todos
            </Button>
            <Button
              variant={filter === 'low' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setFilter('low')}
              className={filter === 'low' ? 'bg-yellow-500 hover:bg-yellow-500/90 text-white' : ''}
            >
              Stock Bajo
            </Button>
            <Button
              variant={filter === 'out' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setFilter('out')}
              className={filter === 'out' ? 'bg-red-500 hover:bg-red-500/90 text-white' : ''}
            >
              Agotados
            </Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-[#71828A]">Total Productos</CardTitle>
              <ShoppingBag className="h-4 w-4 text-[#71828A]" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-[#233037]">{stats.totalProducts}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-[#71828A]">Activos</CardTitle>
              <Package className="h-4 w-4 text-[#71828A]" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-[#00D47F]">{stats.activeProducts}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-[#71828A]">Inventario Total</CardTitle>
              <Boxes className="h-4 w-4 text-[#71828A]" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-[#233037]">{stats.totalInventory.toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-[#71828A]">Stock Bajo</CardTitle>
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-500">{stats.lowStock}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-[#71828A]">Agotados</CardTitle>
              <PackageX className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-500">{stats.outOfStock}</div>
            </CardContent>
          </Card>
        </div>

        {/* Products Table */}
        <Card>
          <CardHeader>
            <CardTitle>
              {filter === 'all' && 'Todos los Productos'}
              {filter === 'low' && 'Productos con Stock Bajo'}
              {filter === 'out' && 'Productos Agotados'}
              <span className="text-sm font-normal text-[#71828A] ml-2">({filteredProducts.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filteredProducts.length === 0 ? (
              <p className="text-[#71828A] text-center py-8">No hay productos en esta categoría</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Inventario</TableHead>
                    <TableHead>Variantes</TableHead>
                    <TableHead className="text-right">Precio</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {product.image ? (
                            <img
                              src={product.image}
                              alt={product.title}
                              className="w-10 h-10 object-cover rounded"
                            />
                          ) : (
                            <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center">
                              <Package className="h-5 w-5 text-gray-400" />
                            </div>
                          )}
                          <div>
                            <div className="font-medium">{product.title}</div>
                            {product.vendor && (
                              <div className="text-xs text-[#71828A]">{product.vendor}</div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-[#71828A]">
                        {product.variants[0]?.sku || '-'}
                      </TableCell>
                      <TableCell>{getStatusBadge(product.status)}</TableCell>
                      <TableCell>{getInventoryBadge(product)}</TableCell>
                      <TableCell className="text-[#71828A]">
                        {product.variantCount} {product.variantCount === 1 ? 'variante' : 'variantes'}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {product.minPrice === product.maxPrice
                          ? formatCurrency(product.minPrice)
                          : `${formatCurrency(product.minPrice)} - ${formatCurrency(product.maxPrice)}`
                        }
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
