'use client'

import { useEffect, useState, useCallback, use } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Loader2,
  LogOut,
  ArrowLeft,
  Tent,
  Plus,
  X,
  Calendar,
  MapPin,
  ShoppingCart,
  Package,
  Boxes,
  BarChart3,
  MessageCircle,
  Settings,
  FileText,
  Store,
  TrendingUp,
  Sparkles,
  Megaphone,
} from 'lucide-react'

interface Feria {
  id: string
  nombre: string
  ubicacion: string | null
  fecha_inicio: string
  fecha_fin: string
  notas: string | null
  activa: boolean
}

interface FeriaInvoice {
  id: string
  number: number
  prefix: string
  name: string
  date: string
  total: number
  units: number
  customer_name: string | null
  customer_identification: string | null
  observations: string
  has_eva: boolean
  tienda_id: string | null
  tienda_nombre: string | null
  shopify_order_number: number | null
  assigned_feria_id: string | null
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export default function FeriaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [feria, setFeria] = useState<Feria | null>(null)
  const [assigned, setAssigned] = useState<FeriaInvoice[]>([])
  const [candidates, setCandidates] = useState<FeriaInvoice[]>([])
  const [totals, setTotals] = useState({ facturas: 0, unidades: 0, monto: 0 })
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [onlyEva, setOnlyEva] = useState(true)
  const [showShopify, setShowShopify] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/ferias/${id}`)
      if (!res.ok) return
      const d = await res.json()
      setFeria(d.feria)
      setAssigned(d.assigned || [])
      setCandidates(d.candidates || [])
      setTotals(d.assignedTotals || { facturas: 0, unidades: 0, monto: 0 })
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function assignInvoice(invoiceId: string, toFeriaId: string | null) {
    setWorking(invoiceId)
    try {
      await fetch(`/api/siigo/invoices/${invoiceId}/feria`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feria_id: toFeriaId }),
      })
      await fetchData()
    } finally {
      setWorking(null)
    }
  }

  const filteredCandidates = candidates.filter(c => {
    if (onlyEva && !c.has_eva) return false
    if (!showShopify && c.shopify_order_number) return false
    if (search) {
      const q = search.toLowerCase()
      const hay = `${c.number} ${c.prefix} ${c.customer_name || ''} ${c.customer_identification || ''} ${c.observations || ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#1A2238]" />
      </div>
    )
  }

  if (!feria) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4">
        <p className="text-[#545454]">Feria no encontrada</p>
        <Link href="/dashboard/ferias"><Button variant="outline">Volver</Button></Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="bg-[#1A2238] border-b border-[#2A3550]">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold tracking-tight text-[#1DA9EF]">shuless</span>
            <span className="text-[10px] text-white font-bold bg-[#1DA9EF] px-2 py-0.5 rounded-full uppercase tracking-wider">Admin</span>
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
            <Link href="/dashboard/tiendas"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><Store className="h-4 w-4 mr-2" />Tiendas</Button></Link>
            <Button variant="ghost" className="rounded-none border-b-2 border-[#1DA9EF] text-[#1A2238] py-4"><Tent className="h-4 w-4 mr-2" />Ferias</Button>
                        <Link href="/dashboard/marketing"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><Megaphone className="h-4 w-4 mr-2" />Marketing</Button></Link>
            <Link href="/dashboard/conciliacion"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><FileText className="h-4 w-4 mr-2" />Conciliación</Button></Link>
            <Link href="/dashboard/analitica"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><TrendingUp className="h-4 w-4 mr-2" />Analítica</Button></Link>
            <Link href="/dashboard/productos"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><Package className="h-4 w-4 mr-2" />Productos</Button></Link>
            <Link href="/dashboard/inventario"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><Boxes className="h-4 w-4 mr-2" />Inventario</Button></Link>
            <Link href="/dashboard/configuracion"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><Settings className="h-4 w-4 mr-2" />Configuración</Button></Link>
          </nav>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8">
        <Link href="/dashboard/ferias" className="inline-flex items-center text-sm text-[#545454] hover:text-[#1A2238] mb-4">
          <ArrowLeft className="h-4 w-4 mr-1" />Volver a Ferias
        </Link>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#1A2238] mb-2 flex items-center gap-3">
            <Tent className="h-7 w-7 text-[#F59E0B]" />{feria.nombre}
          </h1>
          <div className="flex flex-wrap gap-4 text-sm text-[#545454]">
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {format(new Date(feria.fecha_inicio + 'T12:00:00'), 'dd MMM yyyy', { locale: es })}
              {' → '}
              {format(new Date(feria.fecha_fin + 'T12:00:00'), 'dd MMM yyyy', { locale: es })}
            </span>
            {feria.ubicacion && (
              <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{feria.ubicacion}</span>
            )}
          </div>
          {feria.notas && <p className="text-sm text-[#545454] mt-2">{feria.notas}</p>}
        </div>

        <div className="grid gap-4 md:grid-cols-3 mb-8">
          <Card className="border-l-4 border-l-[#F59E0B]">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-[#545454]">Facturas asignadas</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-[#1A2238]">{totals.facturas}</div></CardContent>
          </Card>
          <Card className="border-l-4 border-l-[#1DA9EF]">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-[#545454]">Unidades</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-[#1A2238]">{totals.unidades.toLocaleString()}</div></CardContent>
          </Card>
          <Card className="border-l-4 border-l-[#1A2238]">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-[#545454]">Monto total</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-[#1A2238]">{formatCurrency(totals.monto)}</div></CardContent>
          </Card>
        </div>

        {/* Asignadas */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Tent className="h-5 w-5 text-[#F59E0B]" />
              Facturas asignadas a esta feria ({assigned.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {assigned.length === 0 ? (
              <p className="text-sm text-[#545454] py-4">Aún no hay facturas asignadas. Agregalas desde las candidatas abajo ↓</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Factura</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Unidades</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead className="text-right">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assigned.map(inv => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">{inv.prefix}-{inv.number}</TableCell>
                      <TableCell className="text-sm">{format(new Date(inv.date + 'T12:00:00'), 'dd MMM yyyy', { locale: es })}</TableCell>
                      <TableCell className="text-sm">
                        <div className="text-[#1A2238]">{inv.customer_name || inv.name}</div>
                        {inv.customer_identification && <div className="text-xs text-[#545454]">NIT: {inv.customer_identification}</div>}
                      </TableCell>
                      <TableCell className="text-right">{inv.units}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(inv.total)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => assignInvoice(inv.id, null)}
                          disabled={working === inv.id}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          {working === inv.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3 mr-1" />}
                          Quitar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Candidatas */}
        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-[#1DA9EF]" />
                Facturas candidatas ({filteredCandidates.length})
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  placeholder="Buscar #factura / cliente / NIT…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="max-w-xs"
                />
                <Button
                  size="sm"
                  variant={onlyEva ? 'default' : 'outline'}
                  onClick={() => setOnlyEva(!onlyEva)}
                  className={onlyEva ? 'bg-[#F59E0B] hover:bg-[#D97706]' : ''}
                >
                  Solo EVA
                </Button>
                <Button
                  size="sm"
                  variant={showShopify ? 'default' : 'outline'}
                  onClick={() => setShowShopify(!showShopify)}
                >
                  Incluir Shopify
                </Button>
              </div>
            </div>
            <p className="text-xs text-[#545454] mt-2">
              Facturas Siigo en ventana ±21 días, sin asignación a feria. Por defecto solo se muestran las que contienen items EVA (Blanco/Elefante/Globo/Niña/Niño/Jirafa/Espacio/Rosa/Chocolate).
            </p>
          </CardHeader>
          <CardContent>
            {filteredCandidates.length === 0 ? (
              <p className="text-sm text-[#545454] py-4">No hay candidatas con los filtros actuales.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Factura</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Señales</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead className="text-right">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCandidates.map(inv => {
                    const inExact = inv.date >= feria.fecha_inicio && inv.date <= feria.fecha_fin
                    return (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">{inv.prefix}-{inv.number}</TableCell>
                        <TableCell className="text-sm">
                          {format(new Date(inv.date + 'T12:00:00'), 'dd MMM yyyy', { locale: es })}
                          {inExact && <Badge className="ml-1 bg-[#F59E0B]/15 text-[#D97706] text-[10px]">en feria</Badge>}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="text-[#1A2238]">{inv.customer_name || inv.name}</div>
                          {inv.customer_identification && <div className="text-xs text-[#545454]">NIT: {inv.customer_identification}</div>}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {inv.has_eva && <Badge className="bg-[#F59E0B]/15 text-[#D97706] text-[10px]">EVA</Badge>}
                            {inv.shopify_order_number && <Badge className="bg-[#1A2238]/15 text-[#1A2238] text-[10px]">#{inv.shopify_order_number}</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{inv.units}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(inv.total)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            onClick={() => assignInvoice(inv.id, id)}
                            disabled={working === inv.id}
                            className="bg-[#F59E0B] hover:bg-[#D97706] text-white"
                          >
                            {working === inv.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
                            Asignar
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
