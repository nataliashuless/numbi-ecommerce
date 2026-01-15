'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
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
} from 'lucide-react'

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

export default function TiendasPage() {
  const [tiendas, setTiendas] = useState<TiendaConStats[]>([])
  const [stats, setStats] = useState<Stats>({ totalTiendas: 0, tiendasActivas: 0, inventarioTotal: 0, montoPendienteTotal: 0 })
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)

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

  useEffect(() => {
    fetchData()
  }, [])

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
            <Link href="/dashboard/whatsapp">
              <Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#00D47F] py-4">
                <MessageCircle className="h-4 w-4 mr-2" />
                WhatsApp
              </Button>
            </Link>
            <Button variant="ghost" className="rounded-none border-b-2 border-[#00D47F] text-[#00D47F] py-4">
              <Store className="h-4 w-4 mr-2" />
              Tiendas
            </Button>
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
            <h1 className="text-3xl font-bold text-[#233037] mb-2">Tiendas de Terceros</h1>
            <p className="text-[#71828A]">Gestiona consignaciones y ventas en tiendas aliadas</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-[#00D47F] hover:bg-[#00D47F]/90 text-[#233037] mt-4 md:mt-0">
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
                    <Label htmlFor="contacto_telefono">Teléfono</Label>
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
                  <Label htmlFor="direccion">Dirección</Label>
                  <Input
                    id="direccion"
                    value={formData.direccion}
                    onChange={e => setFormData({ ...formData, direccion: e.target.value })}
                    placeholder="Dirección de la tienda"
                  />
                </div>

                <div className="border-t pt-4">
                  <Label className="text-base font-semibold">Configuración de Comisión</Label>
                  <div className="mt-2 space-y-4">
                    <div>
                      <Label htmlFor="comision_tipo">Tipo de Comisión</Label>
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
                  <Button type="submit" className="bg-[#00D47F] hover:bg-[#00D47F]/90 text-[#233037]">
                    Guardar Tienda
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
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
                  <CardTitle className="text-sm font-medium text-[#71828A]">Total Tiendas</CardTitle>
                  <Building2 className="h-4 w-4 text-[#71828A]" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-[#233037]">{stats.totalTiendas}</div>
                  <p className="text-xs text-[#71828A]">{stats.tiendasActivas} activas</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-[#71828A]">Inventario Consignado</CardTitle>
                  <Package className="h-4 w-4 text-[#71828A]" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-[#233037]">{stats.inventarioTotal}</div>
                  <p className="text-xs text-[#71828A]">unidades en tiendas</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-[#71828A]">Por Liquidar</CardTitle>
                  <DollarSign className="h-4 w-4 text-[#71828A]" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-[#00D47F]">{formatCurrency(stats.montoPendienteTotal)}</div>
                  <p className="text-xs text-[#71828A]">ventas pendientes</p>
                </CardContent>
              </Card>

              <Card className="bg-[#233037] text-white">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-[#99C3D2]">Acciones Rápidas</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Button variant="secondary" size="sm" className="w-full justify-start" disabled>
                      <Package className="h-4 w-4 mr-2" />
                      Registrar Consignación
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Store List */}
            <Card>
              <CardHeader>
                <CardTitle>Tiendas Aliadas</CardTitle>
              </CardHeader>
              <CardContent>
                {tiendas.length === 0 ? (
                  <div className="text-center py-12">
                    <Store className="h-12 w-12 mx-auto text-[#71828A] mb-4" />
                    <p className="text-[#71828A] mb-4">No hay tiendas registradas</p>
                    <Button
                      onClick={() => setDialogOpen(true)}
                      className="bg-[#00D47F] hover:bg-[#00D47F]/90 text-[#233037]"
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
                              <div className="h-10 w-10 rounded-full bg-[#233037] flex items-center justify-center">
                                <Store className="h-5 w-5 text-[#00D47F]" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-[#233037]">{tienda.nombre}</span>
                                  {!tienda.activa && (
                                    <Badge variant="secondary">Inactiva</Badge>
                                  )}
                                </div>
                                <div className="text-sm text-[#71828A]">
                                  Comisión: {formatComision(tienda)}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-6">
                              <div className="text-right">
                                <div className="text-sm text-[#71828A]">Inventario</div>
                                <div className="font-semibold">{tienda.inventarioActual} uds</div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm text-[#71828A]">Por Liquidar</div>
                                <div className="font-semibold text-[#00D47F]">
                                  {formatCurrency(tienda.montoPendiente)}
                                </div>
                              </div>
                              <ChevronRight className="h-5 w-5 text-[#71828A]" />
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
