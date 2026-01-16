'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { format, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { DateRange } from 'react-day-picker'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  DollarSign,
  ShoppingCart,
  Package,
  TrendingUp,
  Loader2,
  Plus,
  Trash2,
  MessageCircle,
  BarChart3,
  Store,
  Boxes,
  FileText,
  ChevronDown,
  ChevronRight,
  Truck,
  Clock,
} from 'lucide-react'
// ShoppingCart already imported
import { DateRangePicker } from '@/components/ui/date-range-picker'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface VentaWA {
  id: string
  fecha: string
  cliente_nombre: string | null
  cliente_telefono: string | null
  cliente_cedula: string | null
  cliente_email: string | null
  cliente_direccion: string | null
  cliente_ciudad: string | null
  producto_nombre: string
  producto_variante: string | null
  producto_sku: string | null
  cantidad: number
  precio_unitario: number
  total: number
  notas: string | null
  enviado: boolean
}

interface Stats {
  totalVentas: number
  totalUnidades: number
  numVentas: number
  promedioVenta: number
}

interface ChartDataPoint {
  date: string
  sales: number
  orders: number
  units: number
}

interface ProductVariant {
  id: number
  title: string
  price: number
  sku: string
  inventory: number
}

interface Product {
  id: number
  title: string
  variants: ProductVariant[]
  minPrice: number
  maxPrice: number
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value)
}

export default function WhatsAppPage() {
  const [ventas, setVentas] = useState<VentaWA[]>([])
  const [stats, setStats] = useState<Stats>({ totalVentas: 0, totalUnidades: 0, numVentas: 0, promedioVenta: 0 })
  const [chartData, setChartData] = useState<ChartDataPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date(),
  })
  const [products, setProducts] = useState<Product[]>([])
  const [selectedProduct, setSelectedProduct] = useState<string>('')
  const [selectedVariant, setSelectedVariant] = useState<string>('')

  // Form state
  const [formData, setFormData] = useState({
    fecha: format(new Date(), 'yyyy-MM-dd'),
    cliente_nombre: '',
    cliente_telefono: '',
    cliente_cedula: '',
    cliente_email: '',
    cliente_direccion: '',
    cliente_ciudad: '',
    producto_nombre: '',
    producto_variante: '',
    producto_sku: '',
    cantidad: 1,
    precio_unitario: 0,
    notas: '',
  })

  // Parse WhatsApp text block
  function parseWhatsAppText(text: string) {
    const lines = text.split('\n')
    const data: Record<string, string> = {}

    for (const line of lines) {
      // Try to find a separator (colon or space for specific fields)
      let key = ''
      let value = ''

      const colonIndex = line.indexOf(':')
      if (colonIndex > 0) {
        key = line.substring(0, colonIndex).trim().toLowerCase()
        value = line.substring(colonIndex + 1).trim()
      } else {
        // Handle lines without colon (e.g., "Celular 3175134486")
        const lineLower = line.toLowerCase().trim()
        if (lineLower.startsWith('celular ') || lineLower.startsWith('cel ') || lineLower.startsWith('telefono ') || lineLower.startsWith('teléfono ')) {
          const parts = line.trim().split(/\s+/)
          key = parts[0].toLowerCase()
          value = parts.slice(1).join(' ')
        }
      }

      if (!key) continue

      // Map common field names
      if (key.includes('nombre') && !key.includes('edificio') && !key.includes('conjunto')) {
        data.nombre = value
      } else if (key.includes('cédula') || key.includes('cedula') || key.includes('cc')) {
        data.cedula = value
      } else if (key.includes('dirección') || key.includes('direccion')) {
        data.direccion = value
      } else if (key.includes('barrio')) {
        data.barrio = value
      } else if (key.includes('edificio') || key.includes('conjunto')) {
        data.edificio = value
      } else if (key.includes('ciudad')) {
        data.ciudad = value
      } else if (key.includes('celular') || key.includes('teléfono') || key.includes('telefono') || key.includes('tel') || key.includes('cel')) {
        data.telefono = value.replace(/\D/g, '') // Remove non-digits
      } else if (key.includes('correo') || key.includes('email') || key.includes('mail')) {
        data.email = value
      } else if (key.includes('talla') || key.includes('size')) {
        data.talla = value
      } else if (key.includes('diseño') || key.includes('diseno') || key.includes('producto') || key.includes('referencia')) {
        data.diseno = value
      } else if (key.includes('color')) {
        data.color = value
      } else if (key.includes('cantidad')) {
        data.cantidad = value
      }
    }

    return data
  }

  function handleImportText() {
    const parsed = parseWhatsAppText(importText)

    // Build full address
    let direccionCompleta = parsed.direccion || ''
    if (parsed.barrio) {
      direccionCompleta += direccionCompleta ? `, Barrio ${parsed.barrio}` : `Barrio ${parsed.barrio}`
    }
    if (parsed.edificio) {
      direccionCompleta += direccionCompleta ? `, ${parsed.edificio}` : parsed.edificio
    }

    // Try to match product based on diseño/producto field
    let matchedProduct: Product | null = null
    let matchedVariant: ProductVariant | null = null
    const searchTerm = (parsed.diseno || parsed.producto || '').toLowerCase()

    if (searchTerm && products.length > 0) {
      // First try exact match on product title
      for (const product of products) {
        if (product.title.toLowerCase().includes(searchTerm)) {
          matchedProduct = product
          // If talla is specified, try to match variant
          if (parsed.talla) {
            const variant = product.variants.find(v =>
              v.title.toLowerCase().includes(parsed.talla!.toLowerCase())
            )
            if (variant) {
              matchedVariant = variant
            }
          }
          // If no talla match but product has only one variant, use it
          if (!matchedVariant && product.variants.length === 1) {
            matchedVariant = product.variants[0]
          }
          break
        }
      }
    }

    // Build additional notes (only for info not matched to product)
    const productInfo: string[] = []
    if (parsed.talla && !matchedVariant) productInfo.push(`Talla: ${parsed.talla}`)
    if (parsed.diseno && !matchedProduct) productInfo.push(`Diseño: ${parsed.diseno}`)
    if (parsed.color) productInfo.push(`Color: ${parsed.color}`)

    // Set form data with all matched info including price
    setFormData(prev => ({
      ...prev,
      cliente_nombre: parsed.nombre || prev.cliente_nombre,
      cliente_cedula: parsed.cedula || prev.cliente_cedula,
      cliente_telefono: parsed.telefono || prev.cliente_telefono,
      cliente_email: parsed.email || prev.cliente_email,
      cliente_direccion: direccionCompleta || prev.cliente_direccion,
      cliente_ciudad: parsed.ciudad || prev.cliente_ciudad,
      cantidad: parsed.cantidad ? parseInt(parsed.cantidad) || 1 : prev.cantidad,
      notas: productInfo.length > 0 ? productInfo.join(', ') : prev.notas,
      // Set product info if matched
      producto_nombre: matchedProduct?.title || prev.producto_nombre,
      producto_variante: matchedVariant && matchedVariant.title !== 'Default Title' ? matchedVariant.title : prev.producto_variante,
      producto_sku: matchedVariant?.sku || prev.producto_sku,
      precio_unitario: matchedVariant?.price || prev.precio_unitario,
    }))

    // Set selected product/variant for the dropdowns
    if (matchedProduct) {
      setSelectedProduct(matchedProduct.id.toString())
      if (matchedVariant) {
        setSelectedVariant(matchedVariant.id.toString())
      }
    }

    setImportDialogOpen(false)
    setDialogOpen(true)
    setImportText('')
  }

  async function fetchData() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (dateRange?.from && dateRange?.to) {
        params.set('start_date', format(dateRange.from, 'yyyy-MM-dd'))
        params.set('end_date', format(dateRange.to, 'yyyy-MM-dd'))
      }
      const res = await fetch(`/api/whatsapp?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setVentas(data.ventas)
        setStats(data.stats)
        setChartData(data.chartData)
      }
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

  async function fetchProducts() {
    try {
      const res = await fetch('/api/shopify/products')
      if (res.ok) {
        const data = await res.json()
        setProducts(data.products || [])
      }
    } catch (error) {
      console.error('Error fetching products:', error)
    }
  }

  useEffect(() => {
    fetchProducts()
  }, [])

  // Get current product and its variants
  const currentProduct = products.find(p => p.id.toString() === selectedProduct)
  const currentVariant = currentProduct?.variants.find(v => v.id.toString() === selectedVariant)

  function handleProductChange(productId: string) {
    setSelectedProduct(productId)
    setSelectedVariant('')
    const product = products.find(p => p.id.toString() === productId)
    if (product) {
      setFormData(prev => ({
        ...prev,
        producto_nombre: product.title,
        producto_variante: '',
        producto_sku: '',
        precio_unitario: product.variants.length === 1 ? product.variants[0].price : 0,
      }))
      // Auto-select variant if only one
      if (product.variants.length === 1) {
        const variant = product.variants[0]
        setSelectedVariant(variant.id.toString())
        setFormData(prev => ({
          ...prev,
          producto_variante: variant.title !== 'Default Title' ? variant.title : '',
          producto_sku: variant.sku || '',
          precio_unitario: variant.price,
        }))
      }
    }
  }

  function handleVariantChange(variantId: string) {
    setSelectedVariant(variantId)
    const variant = currentProduct?.variants.find(v => v.id.toString() === variantId)
    if (variant) {
      setFormData(prev => ({
        ...prev,
        producto_nombre: currentProduct!.title,
        producto_variante: variant.title !== 'Default Title' ? variant.title : '',
        producto_sku: variant.sku || '',
        precio_unitario: variant.price,
      }))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      const res = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          total: formData.cantidad * formData.precio_unitario,
        }),
      })
      if (res.ok) {
        setDialogOpen(false)
        setSelectedProduct('')
        setSelectedVariant('')
        setFormData({
          fecha: format(new Date(), 'yyyy-MM-dd'),
          cliente_nombre: '',
          cliente_telefono: '',
          cliente_cedula: '',
          cliente_email: '',
          cliente_direccion: '',
          cliente_ciudad: '',
          producto_nombre: '',
          producto_variante: '',
          producto_sku: '',
          cantidad: 1,
          precio_unitario: 0,
          notas: '',
        })
        fetchData()
      }
    } catch (error) {
      console.error('Error creating sale:', error)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta venta?')) return
    try {
      const res = await fetch(`/api/whatsapp?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        fetchData()
      }
    } catch (error) {
      console.error('Error deleting sale:', error)
    }
  }

  async function handleToggleEnviado(id: string, currentValue: boolean) {
    try {
      const res = await fetch(`/api/whatsapp?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enviado: !currentValue }),
      })
      if (res.ok) {
        setVentas(prev => prev.map(v =>
          v.id === id ? { ...v, enviado: !currentValue } : v
        ))
      }
    } catch (error) {
      console.error('Error updating enviado:', error)
    }
  }

  function toggleRowExpanded(id: string) {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const formattedChartData = chartData.map(d => ({
    ...d,
    displayDate: format(new Date(d.date), 'dd MMM', { locale: es })
  }))

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
            <Button variant="ghost" className="rounded-none border-b-2 border-[#00D47F] text-[#00D47F] py-4">
              <MessageCircle className="h-4 w-4 mr-2" />
              WhatsApp
            </Button>
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
            <h1 className="text-3xl font-bold text-[#233037] mb-2">Ventas WhatsApp</h1>
            <p className="text-[#71828A]">Registro manual de ventas por WhatsApp</p>
          </div>
          <div className="flex items-center gap-2 mt-4 md:mt-0">
            <DateRangePicker date={dateRange} onDateChange={setDateRange} />

            {/* Import from text dialog */}
            <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <FileText className="h-4 w-4 mr-2" />
                  Importar Texto
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Importar desde WhatsApp</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <p className="text-sm text-[#71828A]">
                    Pega el bloque de texto del cliente con los datos del pedido
                  </p>
                  <Textarea
                    value={importText}
                    onChange={e => setImportText(e.target.value)}
                    placeholder={`Ejemplo:
Nombre: Maria Moreno
Cédula: 22587285
Dirección: Cra 5 # 87-19
Barrio: Refugio
Ciudad: Bogota
Celular: 3175134486
Correo: cliente@email.com
Talla: 21
Diseño: chocolate`}
                    className="min-h-[200px] font-mono text-sm"
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button
                      onClick={handleImportText}
                      disabled={!importText.trim()}
                      className="bg-[#00D47F] hover:bg-[#00D47F]/90 text-[#233037]"
                    >
                      Procesar
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-[#00D47F] hover:bg-[#00D47F]/90 text-[#233037]">
                  <Plus className="h-4 w-4 mr-2" />
                  Nueva Venta
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Registrar Venta WhatsApp</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="fecha">Fecha</Label>
                      <Input
                        id="fecha"
                        type="date"
                        value={formData.fecha}
                        onChange={e => setFormData({ ...formData, fecha: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="cantidad">Cantidad</Label>
                      <Input
                        id="cantidad"
                        type="number"
                        min="1"
                        value={formData.cantidad}
                        onChange={e => setFormData({ ...formData, cantidad: parseInt(e.target.value) || 1 })}
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Producto *</Label>
                    <Select value={selectedProduct} onValueChange={handleProductChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar producto" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map(product => (
                          <SelectItem key={product.id} value={product.id.toString()}>
                            {product.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {currentProduct && currentProduct.variants.length > 1 && (
                    <div>
                      <Label>Variante *</Label>
                      <Select value={selectedVariant} onValueChange={handleVariantChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar variante" />
                        </SelectTrigger>
                        <SelectContent>
                          {currentProduct.variants.map(variant => (
                            <SelectItem key={variant.id} value={variant.id.toString()}>
                              {variant.title} - {formatCurrency(variant.price)} {variant.sku && `(${variant.sku})`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>SKU</Label>
                      <Input
                        value={formData.producto_sku}
                        disabled
                        className="bg-gray-50"
                      />
                    </div>
                    <div>
                      <Label>Precio Unitario *</Label>
                      <Input
                        type="number"
                        min="0"
                        value={formData.precio_unitario}
                        onChange={e => setFormData({ ...formData, precio_unitario: parseFloat(e.target.value) || 0 })}
                        required
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="cliente_nombre">Cliente</Label>
                      <Input
                        id="cliente_nombre"
                        value={formData.cliente_nombre}
                        onChange={e => setFormData({ ...formData, cliente_nombre: e.target.value })}
                        placeholder="Nombre"
                      />
                    </div>
                    <div>
                      <Label htmlFor="cliente_telefono">Teléfono</Label>
                      <Input
                        id="cliente_telefono"
                        value={formData.cliente_telefono}
                        onChange={e => setFormData({ ...formData, cliente_telefono: e.target.value })}
                        placeholder="+57..."
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="cliente_cedula">Cédula</Label>
                      <Input
                        id="cliente_cedula"
                        value={formData.cliente_cedula}
                        onChange={e => setFormData({ ...formData, cliente_cedula: e.target.value })}
                        placeholder="123456789"
                      />
                    </div>
                    <div>
                      <Label htmlFor="cliente_email">Email</Label>
                      <Input
                        id="cliente_email"
                        type="email"
                        value={formData.cliente_email}
                        onChange={e => setFormData({ ...formData, cliente_email: e.target.value })}
                        placeholder="cliente@email.com"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="cliente_ciudad">Ciudad</Label>
                      <Input
                        id="cliente_ciudad"
                        value={formData.cliente_ciudad}
                        onChange={e => setFormData({ ...formData, cliente_ciudad: e.target.value })}
                        placeholder="Bogotá"
                      />
                    </div>
                    <div>
                      <Label htmlFor="cliente_direccion">Dirección</Label>
                      <Input
                        id="cliente_direccion"
                        value={formData.cliente_direccion}
                        onChange={e => setFormData({ ...formData, cliente_direccion: e.target.value })}
                        placeholder="Calle 123 #45-67"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="notas">Notas</Label>
                    <Textarea
                      id="notas"
                      value={formData.notas}
                      onChange={e => setFormData({ ...formData, notas: e.target.value })}
                      placeholder="Observaciones..."
                    />
                  </div>
                  <div className="flex justify-between items-center pt-4 border-t">
                    <div className="text-lg font-semibold">
                      Total: {formatCurrency(formData.cantidad * formData.precio_unitario)}
                    </div>
                    <Button type="submit" className="bg-[#00D47F] hover:bg-[#00D47F]/90 text-[#233037]">
                      Guardar
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-[#00D47F]" />
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-[#71828A]">Ventas Totales</CardTitle>
                  <DollarSign className="h-4 w-4 text-[#71828A]" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-[#233037]">{formatCurrency(stats.totalVentas)}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-[#71828A]"># Ventas</CardTitle>
                  <ShoppingCart className="h-4 w-4 text-[#71828A]" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-[#233037]">{stats.numVentas}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-[#71828A]">Unidades</CardTitle>
                  <Package className="h-4 w-4 text-[#71828A]" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-[#233037]">{stats.totalUnidades}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-[#71828A]">Promedio/Venta</CardTitle>
                  <TrendingUp className="h-4 w-4 text-[#71828A]" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-[#233037]">{formatCurrency(stats.promedioVenta)}</div>
                </CardContent>
              </Card>
            </div>

            {/* Chart */}
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="text-lg">Ventas por Día</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[250px]">
                  {formattedChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={formattedChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="displayDate" tick={{ fontSize: 12 }} stroke="#71828A" />
                        <YAxis tick={{ fontSize: 12 }} stroke="#71828A" tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                        <Tooltip
                          formatter={(value) => [formatCurrency(Number(value)), 'Ventas']}
                          contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
                        />
                        <Bar dataKey="sales" fill="#25D366" radius={[4, 4, 0, 0]} />
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

            {/* Table */}
            <Card>
              <CardHeader>
                <CardTitle>Historial de Ventas</CardTitle>
              </CardHeader>
              <CardContent>
                {ventas.length === 0 ? (
                  <p className="text-[#71828A] text-center py-8">No hay ventas registradas</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8"></TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Producto</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead className="text-center">Cant.</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-center">Enviado</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ventas.map((venta) => (
                        <>
                          <TableRow key={venta.id} className="cursor-pointer hover:bg-gray-50">
                            <TableCell onClick={() => toggleRowExpanded(venta.id)}>
                              {expandedRows.has(venta.id) ? (
                                <ChevronDown className="h-4 w-4 text-[#71828A]" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-[#71828A]" />
                              )}
                            </TableCell>
                            <TableCell className="text-[#71828A]" onClick={() => toggleRowExpanded(venta.id)}>
                              {format(new Date(venta.fecha), 'dd MMM yyyy', { locale: es })}
                            </TableCell>
                            <TableCell onClick={() => toggleRowExpanded(venta.id)}>
                              <div className="font-medium">{venta.producto_nombre}</div>
                              {venta.producto_variante && (
                                <div className="text-xs text-[#71828A]">{venta.producto_variante}</div>
                              )}
                            </TableCell>
                            <TableCell onClick={() => toggleRowExpanded(venta.id)}>
                              {venta.cliente_nombre || '-'}
                            </TableCell>
                            <TableCell className="text-center" onClick={() => toggleRowExpanded(venta.id)}>
                              {venta.cantidad}
                            </TableCell>
                            <TableCell className="text-right font-medium" onClick={() => toggleRowExpanded(venta.id)}>
                              {formatCurrency(venta.total)}
                            </TableCell>
                            <TableCell className="text-center">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleToggleEnviado(venta.id, venta.enviado)}
                                className={venta.enviado ? 'text-green-600 hover:text-green-700' : 'text-orange-500 hover:text-orange-600'}
                              >
                                {venta.enviado ? (
                                  <Truck className="h-4 w-4" />
                                ) : (
                                  <Clock className="h-4 w-4" />
                                )}
                              </Button>
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDelete(venta.id)}
                                className="text-red-500 hover:text-red-700"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                          {expandedRows.has(venta.id) && (
                            <TableRow key={`${venta.id}-detail`} className="bg-gray-50">
                              <TableCell colSpan={8} className="py-4">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                  <div>
                                    <span className="text-[#71828A]">Teléfono:</span>
                                    <p className="font-medium">{venta.cliente_telefono || '-'}</p>
                                  </div>
                                  <div>
                                    <span className="text-[#71828A]">Cédula:</span>
                                    <p className="font-medium">{venta.cliente_cedula || '-'}</p>
                                  </div>
                                  <div>
                                    <span className="text-[#71828A]">Email:</span>
                                    <p className="font-medium">{venta.cliente_email || '-'}</p>
                                  </div>
                                  <div>
                                    <span className="text-[#71828A]">Ciudad:</span>
                                    <p className="font-medium">{venta.cliente_ciudad || '-'}</p>
                                  </div>
                                  <div className="md:col-span-2">
                                    <span className="text-[#71828A]">Dirección:</span>
                                    <p className="font-medium">{venta.cliente_direccion || '-'}</p>
                                  </div>
                                  <div>
                                    <span className="text-[#71828A]">SKU:</span>
                                    <p className="font-medium">{venta.producto_sku || '-'}</p>
                                  </div>
                                  <div>
                                    <span className="text-[#71828A]">Precio Unitario:</span>
                                    <p className="font-medium">{formatCurrency(venta.precio_unitario)}</p>
                                  </div>
                                  {venta.notas && (
                                    <div className="md:col-span-4">
                                      <span className="text-[#71828A]">Notas:</span>
                                      <p className="font-medium">{venta.notas}</p>
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  )
}
