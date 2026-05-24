'use client'

import { useEffect, useState, useMemo, use } from 'react'
import Link from 'next/link'
import { DateRange } from 'react-day-picker'
import { subDays, format } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ShoppingCart,
  Package,
  Loader2,
  LogOut,
  RefreshCw,
  Boxes,
  BarChart3,
  MessageCircle,
  Settings,
  FileText,
  Store,
  ChevronLeft,
  DollarSign,
  TrendingUp,
  Calendar,
  Pencil,
} from 'lucide-react'
import { DateRangePicker } from '@/components/ui/date-range-picker'

interface Tienda {
  id: string
  nombre: string
  nombre_corto: string | null
  contacto_nombre: string | null
  contacto_telefono: string | null
  direccion: string | null
  activa: boolean
  siigo_customer_identification: string | null
}

interface SiigoItem {
  code: string
  description: string
  quantity: number
  price: number
  total?: number
}

interface SiigoInvoice {
  id: string
  number: number
  name: string
  date: string
  total: number
  observations: string
  customer: { id: string; identification: string }
  customer_name: string | null
  tienda_id: string | null
  items: SiigoItem[]
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export default function TiendaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const [tienda, setTienda] = useState<Tienda | null>(null)
  const [invoices, setInvoices] = useState<SiigoInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 90),
    to: new Date(),
  })

  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({
    nombre: '',
    nombre_corto: '',
    siigo_customer_identification: '',
  })
  const [saving, setSaving] = useState(false)

  async function fetchTienda() {
    try {
      const res = await fetch(`/api/tiendas/${id}`)
      if (!res.ok) {
        setError('Tienda no encontrada')
        return
      }
      const data = await res.json()
      setTienda(data.tienda)
    } catch {
      setError('Error cargando tienda')
    }
  }

  async function fetchInvoices() {
    if (!dateRange?.from || !dateRange?.to) return
    try {
      const start = format(dateRange.from, 'yyyy-MM-dd')
      const end = format(dateRange.to, 'yyyy-MM-dd')
      const res = await fetch(`/api/siigo/invoices?start_date=${start}&end_date=${end}`)
      if (!res.ok) return
      const data = await res.json()
      const filtered = (data.invoices || []).filter((i: SiigoInvoice) => i.tienda_id === id)
      setInvoices(filtered)
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchTienda(), fetchInvoices()]).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, dateRange])

  function openEdit() {
    if (!tienda) return
    setEditForm({
      nombre: tienda.nombre,
      nombre_corto: tienda.nombre_corto || '',
      siigo_customer_identification: tienda.siigo_customer_identification || '',
    })
    setEditOpen(true)
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch(`/api/tiendas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      if (!res.ok) throw new Error('Error guardando')
      setEditOpen(false)
      await fetchTienda()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  const stats = useMemo(() => {
    const totalVentas = invoices.reduce((s, i) => s + i.total, 0)
    const totalUnidades = invoices.reduce(
      (s, i) =>
        s +
        (i.items || [])
          .filter(it => it.code !== 'ENVIO')
          .reduce((u, it) => u + (it.quantity || 0), 0),
      0
    )
    const ultimaFactura =
      invoices.length > 0 ? invoices.map(i => i.date).sort().reverse()[0] : null
    return {
      facturas: invoices.length,
      totalVentas,
      totalUnidades,
      ultimaFactura,
    }
  }, [invoices])

  const productosPorSku = useMemo(() => {
    const map = new Map<
      string,
      { code: string; description: string; quantity: number; total: number }
    >()
    for (const inv of invoices) {
      for (const it of inv.items || []) {
        if (it.code === 'ENVIO') continue
        const existing = map.get(it.code)
        const itemTotal = it.total ?? it.quantity * it.price
        if (existing) {
          existing.quantity += it.quantity
          existing.total += itemTotal
        } else {
          map.set(it.code, {
            code: it.code,
            description: it.description,
            quantity: it.quantity,
            total: itemTotal,
          })
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.quantity - a.quantity)
  }, [invoices])

  const displayName = tienda?.nombre_corto || tienda?.nombre || ''

  return (
    <div className="min-h-screen bg-[#FFFFFF]">
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
              <LogOut className="h-4 w-4 mr-2" />Cerrar sesión
            </Button>
          </Link>
        </div>
      </header>

      <div className="bg-white border-b">
        <div className="container mx-auto px-4">
          <nav className="flex gap-4 overflow-x-auto">
            <Link href="/dashboard"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><BarChart3 className="h-4 w-4 mr-2" />Ventas</Button></Link>
            <Link href="/dashboard/shopify"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><ShoppingCart className="h-4 w-4 mr-2" />Shopify</Button></Link>
            <Link href="/dashboard/whatsapp"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><MessageCircle className="h-4 w-4 mr-2" />WhatsApp</Button></Link>
            <Link href="/dashboard/tiendas"><Button variant="ghost" className="rounded-none border-b-2 border-[#1DA9EF] text-[#1A2238] py-4"><Store className="h-4 w-4 mr-2" />Tiendas</Button></Link>
            <Link href="/dashboard/conciliacion"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><FileText className="h-4 w-4 mr-2" />Conciliación</Button></Link>
            <Link href="/dashboard/analitica">
              <Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4">
                <TrendingUp className="h-4 w-4 mr-2" />
                Analítica
              </Button>
            </Link>
            <Link href="/dashboard/productos"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><Package className="h-4 w-4 mr-2" />Productos</Button></Link>
            <Link href="/dashboard/inventario"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><Boxes className="h-4 w-4 mr-2" />Inventario</Button></Link>
            <Link href="/dashboard/configuracion"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><Settings className="h-4 w-4 mr-2" />Configuración</Button></Link>
          </nav>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8">
        <Link href="/dashboard/tiendas" className="inline-flex items-center text-sm text-[#545454] hover:text-[#1DA9EF] mb-4">
          <ChevronLeft className="h-4 w-4 mr-1" /> Volver a tiendas
        </Link>

        {loading && !tienda ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-[#1DA9EF]" />
          </div>
        ) : error ? (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6 text-red-700 text-sm">{error}</CardContent>
          </Card>
        ) : tienda ? (
          <>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-3xl font-bold text-[#1A2238]">{displayName}</h1>
                  {!tienda.activa && <Badge variant="secondary">Inactiva</Badge>}
                  {!tienda.siigo_customer_identification && (
                    <Badge variant="outline" className="text-amber-700 border-amber-300">Sin NIT Siigo</Badge>
                  )}
                </div>
                <p className="text-[#545454] text-sm">
                  {tienda.nombre_corto && tienda.nombre !== tienda.nombre_corto ? `${tienda.nombre} · ` : ''}
                  <span className="font-mono">{tienda.siigo_customer_identification || 'Sin NIT'}</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <DateRangePicker date={dateRange} onDateChange={setDateRange} />
                <Button variant="outline" size="icon" onClick={fetchInvoices} disabled={loading}>
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
                <Button variant="outline" onClick={openEdit}>
                  <Pencil className="h-4 w-4 mr-2" />Editar
                </Button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-4 mb-8">
              <Card className="border-t-4 border-t-[#1DA9EF]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-[#545454] flex items-center gap-1">
                    <DollarSign className="h-4 w-4" /> Ventas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-[#1A2238]">{formatCurrency(stats.totalVentas)}</div>
                  <p className="text-xs text-[#545454]">total facturado</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-[#545454] flex items-center gap-1">
                    <FileText className="h-4 w-4" /> Facturas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-[#1A2238]">{stats.facturas}</div>
                  <p className="text-xs text-[#545454]">en el período</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-[#545454] flex items-center gap-1">
                    <Boxes className="h-4 w-4" /> Unidades
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-[#1A2238]">{stats.totalUnidades}</div>
                  <p className="text-xs text-[#545454]">vendidas</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-[#545454] flex items-center gap-1">
                    <Calendar className="h-4 w-4" /> Última factura
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-[#1A2238]">{stats.ultimaFactura || '—'}</div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2 mb-8">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" /> Productos vendidos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {productosPorSku.length === 0 ? (
                    <p className="text-center text-[#545454] py-8 text-sm">Sin productos en este período</p>
                  ) : (
                    <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                      <Table>
                        <TableHeader className="sticky top-0 bg-white">
                          <TableRow>
                            <TableHead>SKU</TableHead>
                            <TableHead>Producto</TableHead>
                            <TableHead className="text-right">Cant.</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {productosPorSku.map(p => (
                            <TableRow key={p.code}>
                              <TableCell className="font-mono text-xs">{p.code}</TableCell>
                              <TableCell className="text-sm">{p.description}</TableCell>
                              <TableCell className="text-right">{p.quantity}</TableCell>
                              <TableCell className="text-right font-mono text-sm">{formatCurrency(p.total)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" /> Facturas Siigo
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {invoices.length === 0 ? (
                    <p className="text-center text-[#545454] py-8 text-sm">Sin facturas en este período</p>
                  ) : (
                    <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                      <Table>
                        <TableHeader className="sticky top-0 bg-white">
                          <TableRow>
                            <TableHead>Fecha</TableHead>
                            <TableHead>Factura</TableHead>
                            <TableHead className="text-right">Items</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {invoices
                            .slice()
                            .sort((a, b) => b.date.localeCompare(a.date))
                            .map(inv => {
                              const itemCount = (inv.items || []).filter(it => it.code !== 'ENVIO').length
                              return (
                                <TableRow key={inv.id}>
                                  <TableCell className="text-sm text-[#545454]">{inv.date}</TableCell>
                                  <TableCell className="font-mono text-xs">{inv.name}</TableCell>
                                  <TableCell className="text-right text-sm">{itemCount}</TableCell>
                                  <TableCell className="text-right font-mono text-sm">{formatCurrency(inv.total)}</TableCell>
                                </TableRow>
                              )
                            })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        ) : null}

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar tienda</DialogTitle>
            </DialogHeader>
            <form onSubmit={submitEdit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="edit-corto">Nombre corto *</Label>
                  <Input
                    id="edit-corto"
                    value={editForm.nombre_corto}
                    onChange={e => setEditForm({ ...editForm, nombre_corto: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="edit-nombre">Razón social *</Label>
                  <Input
                    id="edit-nombre"
                    value={editForm.nombre}
                    onChange={e => setEditForm({ ...editForm, nombre: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="edit-nit">NIT en Siigo</Label>
                <Input
                  id="edit-nit"
                  value={editForm.siigo_customer_identification}
                  onChange={e => setEditForm({ ...editForm, siigo_customer_identification: e.target.value })}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>Cancelar</Button>
                <Button type="submit" disabled={saving} className="bg-[#1DA9EF] hover:bg-[#0073D1]">
                  {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Guardando</> : 'Guardar'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}
