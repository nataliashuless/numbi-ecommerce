'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Store,
  Package,
  DollarSign,
  Loader2,
  Plus,
  ArrowLeft,
  Truck,
  ShoppingCart,
  FileText,
  CheckCircle,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react'

interface Tienda {
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
}

interface Consignacion {
  id: string
  fecha: string
  tipo: 'envio' | 'devolucion'
  producto_nombre: string
  producto_sku: string | null
  cantidad: number
  precio_unitario: number
  notas: string | null
}

interface Venta {
  id: string
  fecha: string
  producto_nombre: string
  producto_sku: string | null
  cantidad: number
  precio_venta: number
  comision: number
  neto: number
  liquidacion_id: string | null
}

interface Liquidacion {
  id: string
  fecha: string
  periodo_inicio: string
  periodo_fin: string
  total_ventas: number
  total_comisiones: number
  total_neto: number
  estado: 'pendiente' | 'pagada'
  notas: string | null
}

interface InventarioItem {
  producto: string
  sku: string | null
  cantidad: number
  precio: number
}

interface Stats {
  inventarioActual: number
  totalConsignado: number
  totalDevuelto: number
  totalVendido: number
  ventasPendientes: number
  montoPendiente: number
  totalVentas: number
  totalComisiones: number
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value)
}

export default function TiendaDetallePage() {
  const params = useParams()
  const tiendaId = params.id as string

  const [tienda, setTienda] = useState<Tienda | null>(null)
  const [consignaciones, setConsignaciones] = useState<Consignacion[]>([])
  const [ventas, setVentas] = useState<Venta[]>([])
  const [liquidaciones, setLiquidaciones] = useState<Liquidacion[]>([])
  const [inventario, setInventario] = useState<InventarioItem[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  // Dialog states
  const [consignacionDialog, setConsignacionDialog] = useState(false)
  const [ventaDialog, setVentaDialog] = useState(false)
  const [liquidacionDialog, setLiquidacionDialog] = useState(false)

  // Form states
  const [consignacionForm, setConsignacionForm] = useState({
    fecha: format(new Date(), 'yyyy-MM-dd'),
    tipo: 'envio' as 'envio' | 'devolucion',
    producto_nombre: '',
    producto_sku: '',
    cantidad: 1,
    precio_unitario: 0,
    notas: '',
  })

  const [ventaForm, setVentaForm] = useState({
    fecha: format(new Date(), 'yyyy-MM-dd'),
    producto_nombre: '',
    producto_sku: '',
    cantidad: 1,
    precio_venta: 0,
  })

  const [liquidacionForm, setLiquidacionForm] = useState({
    periodo_inicio: format(new Date(new Date().setDate(1)), 'yyyy-MM-dd'),
    periodo_fin: format(new Date(), 'yyyy-MM-dd'),
    notas: '',
  })

  async function fetchData() {
    setLoading(true)
    try {
      const res = await fetch(`/api/tiendas/${tiendaId}`)
      if (res.ok) {
        const data = await res.json()
        setTienda(data.tienda)
        setConsignaciones(data.consignaciones)
        setVentas(data.ventas)
        setLiquidaciones(data.liquidaciones)
        setInventario(data.inventario)
        setStats(data.stats)
      }
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (tiendaId) {
      fetchData()
    }
  }, [tiendaId])

  async function handleConsignacion(e: React.FormEvent) {
    e.preventDefault()
    try {
      const res = await fetch(`/api/tiendas/${tiendaId}/consignaciones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(consignacionForm),
      })
      if (res.ok) {
        setConsignacionDialog(false)
        setConsignacionForm({
          fecha: format(new Date(), 'yyyy-MM-dd'),
          tipo: 'envio',
          producto_nombre: '',
          producto_sku: '',
          cantidad: 1,
          precio_unitario: 0,
          notas: '',
        })
        fetchData()
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }

  async function handleVenta(e: React.FormEvent) {
    e.preventDefault()
    try {
      const res = await fetch(`/api/tiendas/${tiendaId}/ventas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ventaForm),
      })
      if (res.ok) {
        setVentaDialog(false)
        setVentaForm({
          fecha: format(new Date(), 'yyyy-MM-dd'),
          producto_nombre: '',
          producto_sku: '',
          cantidad: 1,
          precio_venta: 0,
        })
        fetchData()
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }

  async function handleLiquidacion(e: React.FormEvent) {
    e.preventDefault()
    try {
      const res = await fetch(`/api/tiendas/${tiendaId}/liquidaciones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(liquidacionForm),
      })
      if (res.ok) {
        setLiquidacionDialog(false)
        setLiquidacionForm({
          periodo_inicio: format(new Date(new Date().setDate(1)), 'yyyy-MM-dd'),
          periodo_fin: format(new Date(), 'yyyy-MM-dd'),
          notas: '',
        })
        fetchData()
      } else {
        const error = await res.json()
        alert(error.error)
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }

  async function marcarPagada(liquidacionId: string) {
    try {
      const res = await fetch(`/api/tiendas/${tiendaId}/liquidaciones`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ liquidacion_id: liquidacionId, estado: 'pagada' }),
      })
      if (res.ok) {
        fetchData()
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F7F4] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#00D47F]" />
      </div>
    )
  }

  if (!tienda) {
    return (
      <div className="min-h-screen bg-[#F5F7F4] flex items-center justify-center">
        <p>Tienda no encontrada</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F5F7F4]">
      {/* Header */}
      <header className="bg-[#233037] border-b border-[#334047]">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/dashboard/tiendas">
              <Button variant="ghost" size="icon" className="text-white hover:bg-[#334047]">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-white">{tienda.nombre}</h1>
              <p className="text-sm text-[#99C3D2]">
                Comisión: {tienda.comision_tipo === 'porcentaje' && tienda.comision_porcentaje
                  ? `${tienda.comision_porcentaje}%`
                  : tienda.comision_tipo === 'fijo' && tienda.comision_fijo
                  ? formatCurrency(tienda.comision_fijo) + '/u'
                  : 'Mixto'}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="container mx-auto px-4 py-8">
        {/* KPIs */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-[#71828A]">Inventario Actual</CardTitle>
              <Package className="h-4 w-4 text-[#71828A]" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-[#233037]">{stats?.inventarioActual || 0}</div>
              <p className="text-xs text-[#71828A]">unidades en tienda</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-[#71828A]">Ventas Totales</CardTitle>
              <ShoppingCart className="h-4 w-4 text-[#71828A]" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-[#233037]">{formatCurrency(stats?.totalVentas || 0)}</div>
              <p className="text-xs text-[#71828A]">{stats?.totalVendido || 0} unidades</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-[#71828A]">Por Liquidar</CardTitle>
              <DollarSign className="h-4 w-4 text-[#71828A]" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-[#00D47F]">{formatCurrency(stats?.montoPendiente || 0)}</div>
              <p className="text-xs text-[#71828A]">{stats?.ventasPendientes || 0} ventas</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-[#71828A]">Comisiones</CardTitle>
              <FileText className="h-4 w-4 text-[#71828A]" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-[#233037]">{formatCurrency(stats?.totalComisiones || 0)}</div>
              <p className="text-xs text-[#71828A]">total acumulado</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="inventario" className="space-y-4">
          <TabsList className="bg-white">
            <TabsTrigger value="inventario">Inventario</TabsTrigger>
            <TabsTrigger value="consignaciones">Consignaciones</TabsTrigger>
            <TabsTrigger value="ventas">Ventas</TabsTrigger>
            <TabsTrigger value="liquidaciones">Liquidaciones</TabsTrigger>
          </TabsList>

          {/* Inventario Tab */}
          <TabsContent value="inventario">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Stock en Tienda</CardTitle>
                <Dialog open={consignacionDialog} onOpenChange={setConsignacionDialog}>
                  <DialogTrigger asChild>
                    <Button className="bg-[#00D47F] hover:bg-[#00D47F]/90 text-[#233037]">
                      <Plus className="h-4 w-4 mr-2" />
                      Consignar
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Registrar Consignación</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleConsignacion} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Fecha</Label>
                          <Input
                            type="date"
                            value={consignacionForm.fecha}
                            onChange={e => setConsignacionForm({ ...consignacionForm, fecha: e.target.value })}
                            required
                          />
                        </div>
                        <div>
                          <Label>Tipo</Label>
                          <Select
                            value={consignacionForm.tipo}
                            onValueChange={(v: 'envio' | 'devolucion') => setConsignacionForm({ ...consignacionForm, tipo: v })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="envio">Envío a tienda</SelectItem>
                              <SelectItem value="devolucion">Devolución</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div>
                        <Label>Producto *</Label>
                        <Input
                          value={consignacionForm.producto_nombre}
                          onChange={e => setConsignacionForm({ ...consignacionForm, producto_nombre: e.target.value })}
                          placeholder="Nombre del producto"
                          required
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <Label>SKU</Label>
                          <Input
                            value={consignacionForm.producto_sku}
                            onChange={e => setConsignacionForm({ ...consignacionForm, producto_sku: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>Cantidad *</Label>
                          <Input
                            type="number"
                            min="1"
                            value={consignacionForm.cantidad}
                            onChange={e => setConsignacionForm({ ...consignacionForm, cantidad: parseInt(e.target.value) || 1 })}
                            required
                          />
                        </div>
                        <div>
                          <Label>Precio Unit. *</Label>
                          <Input
                            type="number"
                            min="0"
                            value={consignacionForm.precio_unitario}
                            onChange={e => setConsignacionForm({ ...consignacionForm, precio_unitario: parseFloat(e.target.value) || 0 })}
                            required
                          />
                        </div>
                      </div>
                      <div>
                        <Label>Notas</Label>
                        <Textarea
                          value={consignacionForm.notas}
                          onChange={e => setConsignacionForm({ ...consignacionForm, notas: e.target.value })}
                        />
                      </div>
                      <div className="flex justify-end">
                        <Button type="submit" className="bg-[#00D47F] hover:bg-[#00D47F]/90 text-[#233037]">
                          Guardar
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {inventario.length === 0 ? (
                  <p className="text-[#71828A] text-center py-8">No hay inventario en esta tienda</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-center">Cantidad</TableHead>
                        <TableHead className="text-right">Precio Unit.</TableHead>
                        <TableHead className="text-right">Valor Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inventario.map((item, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{item.producto}</TableCell>
                          <TableCell className="text-[#71828A]">{item.sku || '-'}</TableCell>
                          <TableCell className="text-center">{item.cantidad}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.precio)}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(item.cantidad * item.precio)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Consignaciones Tab */}
          <TabsContent value="consignaciones">
            <Card>
              <CardHeader>
                <CardTitle>Historial de Consignaciones</CardTitle>
              </CardHeader>
              <CardContent>
                {consignaciones.length === 0 ? (
                  <p className="text-[#71828A] text-center py-8">No hay consignaciones registradas</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Producto</TableHead>
                        <TableHead className="text-center">Cantidad</TableHead>
                        <TableHead className="text-right">Precio Unit.</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {consignaciones.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="text-[#71828A]">
                            {format(new Date(c.fecha), 'dd MMM yyyy', { locale: es })}
                          </TableCell>
                          <TableCell>
                            <Badge className={c.tipo === 'envio' ? 'bg-blue-500' : 'bg-orange-500'}>
                              {c.tipo === 'envio' ? (
                                <><ArrowUpRight className="h-3 w-3 mr-1" />Envío</>
                              ) : (
                                <><ArrowDownLeft className="h-3 w-3 mr-1" />Devolución</>
                              )}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{c.producto_nombre}</div>
                            {c.producto_sku && <div className="text-xs text-[#71828A]">SKU: {c.producto_sku}</div>}
                          </TableCell>
                          <TableCell className="text-center">{c.cantidad}</TableCell>
                          <TableCell className="text-right">{formatCurrency(c.precio_unitario)}</TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(c.cantidad * c.precio_unitario)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Ventas Tab */}
          <TabsContent value="ventas">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Ventas Reportadas</CardTitle>
                <Dialog open={ventaDialog} onOpenChange={setVentaDialog}>
                  <DialogTrigger asChild>
                    <Button className="bg-[#00D47F] hover:bg-[#00D47F]/90 text-[#233037]">
                      <Plus className="h-4 w-4 mr-2" />
                      Registrar Venta
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Registrar Venta</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleVenta} className="space-y-4">
                      <div>
                        <Label>Fecha</Label>
                        <Input
                          type="date"
                          value={ventaForm.fecha}
                          onChange={e => setVentaForm({ ...ventaForm, fecha: e.target.value })}
                          required
                        />
                      </div>
                      <div>
                        <Label>Producto *</Label>
                        <Input
                          value={ventaForm.producto_nombre}
                          onChange={e => setVentaForm({ ...ventaForm, producto_nombre: e.target.value })}
                          placeholder="Nombre del producto"
                          required
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <Label>SKU</Label>
                          <Input
                            value={ventaForm.producto_sku}
                            onChange={e => setVentaForm({ ...ventaForm, producto_sku: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>Cantidad *</Label>
                          <Input
                            type="number"
                            min="1"
                            value={ventaForm.cantidad}
                            onChange={e => setVentaForm({ ...ventaForm, cantidad: parseInt(e.target.value) || 1 })}
                            required
                          />
                        </div>
                        <div>
                          <Label>Precio Venta *</Label>
                          <Input
                            type="number"
                            min="0"
                            value={ventaForm.precio_venta}
                            onChange={e => setVentaForm({ ...ventaForm, precio_venta: parseFloat(e.target.value) || 0 })}
                            required
                          />
                        </div>
                      </div>
                      <p className="text-sm text-[#71828A]">
                        La comisión se calculará automáticamente según la configuración de la tienda.
                      </p>
                      <div className="flex justify-end">
                        <Button type="submit" className="bg-[#00D47F] hover:bg-[#00D47F]/90 text-[#233037]">
                          Guardar
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {ventas.length === 0 ? (
                  <p className="text-[#71828A] text-center py-8">No hay ventas registradas</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Producto</TableHead>
                        <TableHead className="text-center">Cant.</TableHead>
                        <TableHead className="text-right">Venta</TableHead>
                        <TableHead className="text-right">Comisión</TableHead>
                        <TableHead className="text-right">Neto</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ventas.map((v) => (
                        <TableRow key={v.id}>
                          <TableCell className="text-[#71828A]">
                            {format(new Date(v.fecha), 'dd MMM yyyy', { locale: es })}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{v.producto_nombre}</div>
                            {v.producto_sku && <div className="text-xs text-[#71828A]">SKU: {v.producto_sku}</div>}
                          </TableCell>
                          <TableCell className="text-center">{v.cantidad}</TableCell>
                          <TableCell className="text-right">{formatCurrency(v.precio_venta)}</TableCell>
                          <TableCell className="text-right text-red-500">-{formatCurrency(v.comision)}</TableCell>
                          <TableCell className="text-right font-medium text-[#00D47F]">{formatCurrency(v.neto)}</TableCell>
                          <TableCell>
                            {v.liquidacion_id ? (
                              <Badge className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />Liquidada</Badge>
                            ) : (
                              <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pendiente</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Liquidaciones Tab */}
          <TabsContent value="liquidaciones">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Liquidaciones</CardTitle>
                <Dialog open={liquidacionDialog} onOpenChange={setLiquidacionDialog}>
                  <DialogTrigger asChild>
                    <Button
                      className="bg-[#00D47F] hover:bg-[#00D47F]/90 text-[#233037]"
                      disabled={stats?.ventasPendientes === 0}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Nueva Liquidación
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Crear Liquidación</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleLiquidacion} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Desde</Label>
                          <Input
                            type="date"
                            value={liquidacionForm.periodo_inicio}
                            onChange={e => setLiquidacionForm({ ...liquidacionForm, periodo_inicio: e.target.value })}
                            required
                          />
                        </div>
                        <div>
                          <Label>Hasta</Label>
                          <Input
                            type="date"
                            value={liquidacionForm.periodo_fin}
                            onChange={e => setLiquidacionForm({ ...liquidacionForm, periodo_fin: e.target.value })}
                            required
                          />
                        </div>
                      </div>
                      <div>
                        <Label>Notas</Label>
                        <Textarea
                          value={liquidacionForm.notas}
                          onChange={e => setLiquidacionForm({ ...liquidacionForm, notas: e.target.value })}
                          placeholder="Observaciones de la liquidación..."
                        />
                      </div>
                      <p className="text-sm text-[#71828A]">
                        Se liquidarán todas las ventas pendientes en el período seleccionado.
                      </p>
                      <div className="flex justify-end">
                        <Button type="submit" className="bg-[#00D47F] hover:bg-[#00D47F]/90 text-[#233037]">
                          Crear Liquidación
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {liquidaciones.length === 0 ? (
                  <p className="text-[#71828A] text-center py-8">No hay liquidaciones registradas</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Período</TableHead>
                        <TableHead className="text-right">Ventas</TableHead>
                        <TableHead className="text-right">Comisiones</TableHead>
                        <TableHead className="text-right">Neto a Pagar</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {liquidaciones.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell className="text-[#71828A]">
                            {format(new Date(l.fecha), 'dd MMM yyyy', { locale: es })}
                          </TableCell>
                          <TableCell>
                            {format(new Date(l.periodo_inicio), 'dd MMM', { locale: es })} - {format(new Date(l.periodo_fin), 'dd MMM yyyy', { locale: es })}
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(l.total_ventas)}</TableCell>
                          <TableCell className="text-right text-red-500">-{formatCurrency(l.total_comisiones)}</TableCell>
                          <TableCell className="text-right font-medium text-[#00D47F]">{formatCurrency(l.total_neto)}</TableCell>
                          <TableCell>
                            {l.estado === 'pagada' ? (
                              <Badge className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />Pagada</Badge>
                            ) : (
                              <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pendiente</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {l.estado === 'pendiente' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => marcarPagada(l.id)}
                              >
                                Marcar Pagada
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
