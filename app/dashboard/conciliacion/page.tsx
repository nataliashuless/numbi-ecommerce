'use client'

import { useEffect, useState, useMemo } from 'react'
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
  CheckCircle2,
  AlertCircle,
  XCircle,
  Plus,
  TrendingUp,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'
import { DateRangePicker } from '@/components/ui/date-range-picker'

interface ShopifyOrder {
  id: number
  orderNumber: number
  name: string
  createdAt: string
  totalPrice: number
  customerName: string
}

interface SiigoInvoiceItem {
  code: string
  description: string
  quantity: number
  price: number
  total?: number
  discount?: { percentage?: number; value?: number }
}

interface SiigoInvoice {
  id: string
  number: number
  name: string
  prefix: string
  date: string
  total: number
  customer: { id: string; identification: string }
  customer_name: string | null
  source: 'whatsapp' | 'tienda' | 'unknown'
  tienda_id: string | null
  tienda_nombre: string | null
  observations: string
  items: SiigoInvoiceItem[]
}

type MatchStatus = 'matched' | 'shopify_only' | 'siigo_only'
type InvoiceSource = 'shopify' | 'whatsapp' | 'tienda' | 'otra'

interface Row {
  status: MatchStatus
  source: InvoiceSource
  tiendaNombre: string | null
  date: string
  orderNumber: number | null
  shopify: ShopifyOrder | null
  siigo: SiigoInvoice | null
  diff: number
  clientName: string
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function extractOrderNumber(observations: string): number | null {
  if (!observations) return null
  const match = observations.match(/#(\d+)/)
  return match ? parseInt(match[1], 10) : null
}

export default function ConciliacionPage() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date(),
  })
  const [orders, setOrders] = useState<ShopifyOrder[]>([])
  const [invoices, setInvoices] = useState<SiigoInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | MatchStatus>('all')

  type SortKey = 'date' | 'source' | 'status' | 'orderNumber' | 'clientName' | 'shopifyTotal' | 'siigoTotal' | 'diff'
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'date' ? 'desc' : 'asc')
    }
  }

  function SortHead({ k, label, align }: { k: SortKey; label: string; align?: 'right' }) {
    const active = sortKey === k
    return (
      <TableHead className={align === 'right' ? 'text-right' : ''}>
        <button
          type="button"
          onClick={() => toggleSort(k)}
          className={`inline-flex items-center gap-1 hover:text-[#1DA9EF] ${active ? 'text-[#1DA9EF] font-semibold' : ''}`}
        >
          {label}
          {active && (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
        </button>
      </TableHead>
    )
  }

  const [syncing, setSyncing] = useState<null | 'siigo' | 'shopify'>(null)
  const [siigoStatus, setSiigoStatus] = useState<{ cached: number; earliest: string | null; latest: string | null; last_sync: string | null } | null>(null)
  const [shopifyStatus, setShopifyStatus] = useState<{ cached: number; earliest: string | null; latest: string | null; last_sync: string | null } | null>(null)

  async function fetchSyncStatus() {
    try {
      const [s, sh] = await Promise.all([
        fetch('/api/siigo/sync-invoices'),
        fetch('/api/shopify/sync-orders'),
      ])
      if (s.ok) setSiigoStatus(await s.json())
      if (sh.ok) setShopifyStatus(await sh.json())
    } catch {}
  }

  async function runSiigoSync(startOverride?: string) {
    if (syncing || !dateRange?.from || !dateRange?.to) return
    setSyncing('siigo')
    setError(null)
    try {
      const start = startOverride || format(dateRange.from, 'yyyy-MM-dd')
      const end = format(dateRange.to, 'yyyy-MM-dd')
      const res = await fetch('/api/siigo/sync-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_date: start, end_date: end }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error sincronizando')
      await Promise.all([fetchData(), fetchSyncStatus()])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error sincronizando')
    } finally {
      setSyncing(null)
    }
  }

  async function runShopifySync(startOverride?: string) {
    if (syncing || !dateRange?.from || !dateRange?.to) return
    setSyncing('shopify')
    setError(null)
    try {
      const start = startOverride || format(dateRange.from, 'yyyy-MM-dd')
      const end = format(dateRange.to, 'yyyy-MM-dd')
      const res = await fetch('/api/shopify/sync-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_date: start, end_date: end }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error sincronizando Shopify')
      await Promise.all([fetchData(), fetchSyncStatus()])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error sincronizando Shopify')
    } finally {
      setSyncing(null)
    }
  }

  const [createTiendaOpen, setCreateTiendaOpen] = useState(false)
  const [tiendaForm, setTiendaForm] = useState({
    nombre: '',
    nombre_corto: '',
    siigo_customer_identification: '',
  })
  const [tiendaInvoiceContext, setTiendaInvoiceContext] = useState<SiigoInvoice | null>(null)
  const [tiendaSaving, setTiendaSaving] = useState(false)
  const [tiendaError, setTiendaError] = useState<string | null>(null)

  function openCreateTienda(invoice: SiigoInvoice) {
    const legalName = invoice.customer_name || ''
    const firstWord = legalName.split(/\s+/)[0] || ''
    setTiendaForm({
      nombre: legalName,
      nombre_corto: firstWord,
      siigo_customer_identification: invoice.customer.identification || '',
    })
    setTiendaInvoiceContext(invoice)
    setTiendaError(null)
    setCreateTiendaOpen(true)
  }

  async function submitCreateTienda(e: React.FormEvent) {
    e.preventDefault()
    setTiendaSaving(true)
    setTiendaError(null)
    try {
      const res = await fetch('/api/tiendas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: tiendaForm.nombre,
          nombre_corto: tiendaForm.nombre_corto,
          siigo_customer_identification: tiendaForm.siigo_customer_identification,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error creando tienda')
      setCreateTiendaOpen(false)
      await fetchData()
    } catch (e) {
      setTiendaError(e instanceof Error ? e.message : 'Error')
    } finally {
      setTiendaSaving(false)
    }
  }

  async function fetchData() {
    if (!dateRange?.from || !dateRange?.to) return
    setLoading(true)
    setError(null)
    try {
      const start = format(dateRange.from, 'yyyy-MM-dd')
      const end = format(dateRange.to, 'yyyy-MM-dd')
      const [shopRes, siigoRes] = await Promise.all([
        fetch(`/api/shopify/orders?start_date=${start}&end_date=${end}&group_by=day`),
        fetch(`/api/siigo/invoices?start_date=${start}&end_date=${end}`),
      ])

      if (!shopRes.ok) throw new Error('Error obteniendo órdenes Shopify')
      const shopData = await shopRes.json()
      setOrders(shopData.orders || [])

      if (!siigoRes.ok) {
        const e = await siigoRes.json().catch(() => ({}))
        throw new Error(e.error || 'Error obteniendo facturas Siigo')
      }
      const siigoData = await siigoRes.json()
      setInvoices(siigoData.invoices || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange])

  useEffect(() => {
    fetchSyncStatus()
  }, [])

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = []
    const invoicesByOrderNumber = new Map<number, SiigoInvoice>()
    const usedInvoiceIds = new Set<string>()

    for (const inv of invoices) {
      const orderNum = extractOrderNumber(inv.observations)
      if (orderNum && !invoicesByOrderNumber.has(orderNum)) {
        invoicesByOrderNumber.set(orderNum, inv)
      }
    }

    for (const order of orders) {
      const inv = invoicesByOrderNumber.get(order.orderNumber)
      if (inv) {
        usedInvoiceIds.add(inv.id)
        out.push({
          status: 'matched',
          source: 'shopify',
          tiendaNombre: null,
          date: order.createdAt.slice(0, 10),
          orderNumber: order.orderNumber,
          shopify: order,
          siigo: inv,
          diff: order.totalPrice - inv.total,
          clientName: order.customerName || inv.customer_name || inv.customer.identification,
        })
      } else {
        out.push({
          status: 'shopify_only',
          source: 'shopify',
          tiendaNombre: null,
          date: order.createdAt.slice(0, 10),
          orderNumber: order.orderNumber,
          shopify: order,
          siigo: null,
          diff: order.totalPrice,
          clientName: order.customerName || '—',
        })
      }
    }

    for (const inv of invoices) {
      if (usedInvoiceIds.has(inv.id)) continue
      let source: InvoiceSource = 'otra'
      if (inv.source === 'whatsapp') source = 'whatsapp'
      else if (inv.source === 'tienda') source = 'tienda'
      out.push({
        status: 'siigo_only',
        source,
        tiendaNombre: inv.tienda_nombre,
        date: inv.date,
        orderNumber: extractOrderNumber(inv.observations),
        shopify: null,
        siigo: inv,
        diff: -inv.total,
        clientName: inv.customer_name || inv.customer.identification,
      })
    }

    out.sort((a, b) => b.date.localeCompare(a.date))
    return out
  }, [orders, invoices])

  const visibleRows = useMemo(() => {
    const filtered = rows.filter(r => filter === 'all' || r.status === filter)
    const dir = sortDir === 'asc' ? 1 : -1
    const valueOf = (r: Row) => {
      switch (sortKey) {
        case 'date': return r.date
        case 'source': return r.source
        case 'status': return r.status
        case 'orderNumber': return r.orderNumber ?? -Infinity
        case 'clientName': return r.clientName.toLowerCase()
        case 'shopifyTotal': return r.shopify?.totalPrice ?? -Infinity
        case 'siigoTotal': return r.siigo?.total ?? -Infinity
        case 'diff': return r.status === 'matched' ? r.diff : -Infinity
      }
    }
    return [...filtered].sort((a, b) => {
      const va = valueOf(a)
      const vb = valueOf(b)
      if (va < vb) return -1 * dir
      if (va > vb) return 1 * dir
      return 0
    })
  }, [rows, filter, sortKey, sortDir])

  const stats = useMemo(() => {
    const totalShopify = orders.reduce((s, o) => s + o.totalPrice, 0)
    const totalSiigo = invoices.reduce((s, i) => s + i.total, 0)
    const matched = rows.filter(r => r.status === 'matched').length
    const shopifyOnly = rows.filter(r => r.status === 'shopify_only').length
    const siigoOnly = rows.filter(r => r.status === 'siigo_only').length
    const siigoBySource = {
      whatsapp: rows.filter(r => r.status === 'siigo_only' && r.source === 'whatsapp').length,
      tienda: rows.filter(r => r.status === 'siigo_only' && r.source === 'tienda').length,
      otra: rows.filter(r => r.status === 'siigo_only' && r.source === 'otra').length,
    }
    return { totalShopify, totalSiigo, matched, shopifyOnly, siigoOnly, siigoBySource }
  }, [orders, invoices, rows])

  const sourceBadge = (source: InvoiceSource, tiendaNombre: string | null) => {
    if (source === 'shopify') return <Badge className="bg-[#96bf48]/15 text-[#5a7a2a] hover:bg-[#96bf48]/15">Shopify</Badge>
    if (source === 'whatsapp') return <Badge className="bg-[#25D366]/15 text-[#0e7a3e] hover:bg-[#25D366]/15">WhatsApp</Badge>
    if (source === 'tienda') return <Badge className="bg-[#1DA9EF]/15 text-[#0073D1] hover:bg-[#1DA9EF]/15">Tienda: {tiendaNombre}</Badge>
    return <Badge className="bg-[#1A2238]/10 text-[#1A2238] hover:bg-[#1A2238]/10">Otra</Badge>
  }

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
            <Link href="/dashboard">
              <Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4">
                <BarChart3 className="h-4 w-4 mr-2" />Ventas
              </Button>
            </Link>
            <Link href="/dashboard/shopify">
              <Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4">
                <ShoppingCart className="h-4 w-4 mr-2" />Shopify
              </Button>
            </Link>
            <Link href="/dashboard/whatsapp">
              <Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4">
                <MessageCircle className="h-4 w-4 mr-2" />WhatsApp
              </Button>
            </Link>
            <Link href="/dashboard/tiendas">
              <Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4">
                <Store className="h-4 w-4 mr-2" />Tiendas
              </Button>
            </Link>
            <Button variant="ghost" className="rounded-none border-b-2 border-[#1DA9EF] text-[#1A2238] py-4">
              <FileText className="h-4 w-4 mr-2" />Conciliación
            </Button>
            <Link href="/dashboard/analitica">
              <Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4">
                <TrendingUp className="h-4 w-4 mr-2" />
                Analítica
              </Button>
            </Link>
            <Link href="/dashboard/productos">
              <Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4">
                <Package className="h-4 w-4 mr-2" />Productos
              </Button>
            </Link>
            <Link href="/dashboard/inventario">
              <Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4">
                <Boxes className="h-4 w-4 mr-2" />Inventario
              </Button>
            </Link>
            <Link href="/dashboard/configuracion">
              <Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4">
                <Settings className="h-4 w-4 mr-2" />Configuración
              </Button>
            </Link>
          </nav>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-[#1A2238] mb-2">Conciliación Shopify ↔ Siigo</h1>
            <p className="text-[#545454]">Órdenes Shopify cruzadas con facturas Siigo por # de pedido. Facturas sin orden Shopify se categorizan por fuente (WhatsApp o Otra).</p>
          </div>
          <div className="flex items-center gap-2 mt-4 md:mt-0 flex-wrap">
            <DateRangePicker date={dateRange} onDateChange={setDateRange} />
            <Button variant="outline" size="icon" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="outline" onClick={() => runSiigoSync()} disabled={!!syncing || loading}>
              {syncing === 'siigo' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              {syncing === 'siigo' ? 'Sync Siigo...' : 'Sync Siigo'}
            </Button>
            <Button variant="outline" onClick={() => runShopifySync()} disabled={!!syncing || loading}>
              {syncing === 'shopify' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              {syncing === 'shopify' ? 'Sync Shopify...' : 'Sync Shopify'}
            </Button>
          </div>
        </div>
        <div className="text-xs text-[#545454] mb-4 space-y-1">
          {siigoStatus && (
            <div>
              <strong>Siigo:</strong> {siigoStatus.cached.toLocaleString()} facturas · {siigoStatus.earliest || '—'} → {siigoStatus.latest || '—'}
              {siigoStatus.last_sync && ` · sync ${new Date(siigoStatus.last_sync).toLocaleString('es-CO')}`}
            </div>
          )}
          {shopifyStatus && (
            <div>
              <strong>Shopify:</strong> {shopifyStatus.cached.toLocaleString()} órdenes
              {shopifyStatus.earliest && ` · ${shopifyStatus.earliest.slice(0,10)}`}
              {shopifyStatus.latest && ` → ${shopifyStatus.latest.slice(0,10)}`}
              {shopifyStatus.last_sync && ` · sync ${new Date(shopifyStatus.last_sync).toLocaleString('es-CO')}`}
            </div>
          )}
        </div>

        {error && (
          <Card className="mb-6 border-red-200 bg-red-50">
            <CardContent className="pt-6 text-red-700 text-sm">{error}</CardContent>
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-5 mb-8">
          <Card className="border-t-4 border-t-[#96bf48]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-[#545454] font-medium">Total Shopify</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-[#1A2238]">{formatCurrency(stats.totalShopify)}</div>
              <p className="text-xs text-[#545454]">{orders.length} órdenes</p>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-[#1DA9EF]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-[#545454] font-medium">Total Siigo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-[#1A2238]">{formatCurrency(stats.totalSiigo)}</div>
              <p className="text-xs text-[#545454]">{invoices.length} facturas</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-[#545454] font-medium flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4 text-green-600" /> Pareadas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-700">{stats.matched}</div>
              <p className="text-xs text-[#545454]">Shopify con factura</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-[#545454] font-medium flex items-center gap-1">
                <XCircle className="h-4 w-4 text-red-600" /> Sin facturar
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-700">{stats.shopifyOnly}</div>
              <p className="text-xs text-[#545454]">Shopify pendientes</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-[#545454] font-medium flex items-center gap-1">
                <AlertCircle className="h-4 w-4 text-amber-600" /> Facturas otras
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-700">{stats.siigoOnly}</div>
              <p className="text-xs text-[#545454]">
                {stats.siigoBySource.tienda} tienda · {stats.siigoBySource.whatsapp} WA · {stats.siigoBySource.otra} otras
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle>Detalle</CardTitle>
              <div className="flex gap-1 flex-wrap">
                {([
                  ['all', `Todas (${rows.length})`],
                  ['matched', `Pareadas (${stats.matched})`],
                  ['shopify_only', `Sin facturar (${stats.shopifyOnly})`],
                  ['siigo_only', `Facturas otras (${stats.siigoOnly})`],
                ] as const).map(([key, label]) => (
                  <Button
                    key={key}
                    size="sm"
                    variant={filter === key ? 'default' : 'outline'}
                    onClick={() => setFilter(key)}
                    className={filter === key ? 'bg-[#1DA9EF] hover:bg-[#0073D1]' : ''}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-[#1DA9EF]" />
              </div>
            ) : visibleRows.length === 0 ? (
              <p className="text-center text-[#545454] py-8">Sin datos en este período</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortHead k="date" label="Fecha" />
                      <SortHead k="source" label="Fuente" />
                      <SortHead k="status" label="Estado" />
                      <SortHead k="orderNumber" label="Orden / Factura" />
                      <SortHead k="clientName" label="Cliente" />
                      <SortHead k="shopifyTotal" label="Shopify" align="right" />
                      <SortHead k="siigoTotal" label="Siigo" align="right" />
                      <SortHead k="diff" label="Diferencia" align="right" />
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleRows.map((row, idx) => (
                      <TableRow key={`${row.shopify?.id || ''}-${row.siigo?.id || ''}-${idx}`}>
                        <TableCell className="text-sm text-[#545454]">{row.date}</TableCell>
                        <TableCell>{sourceBadge(row.source, row.tiendaNombre)}</TableCell>
                        <TableCell>
                          {row.status === 'matched' && (
                            <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Pareada</Badge>
                          )}
                          {row.status === 'shopify_only' && (
                            <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Sin facturar</Badge>
                          )}
                          {row.status === 'siigo_only' && (
                            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Solo Siigo</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="font-mono">
                            {row.orderNumber ? `#${row.orderNumber}` : '—'}
                          </div>
                          {row.siigo && (
                            <div className="text-xs text-[#545454] font-mono">{row.siigo.name}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{row.clientName}</TableCell>
                        <TableCell className="text-right font-mono">
                          {row.shopify ? formatCurrency(row.shopify.totalPrice) : '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {row.siigo ? formatCurrency(row.siigo.total) : '—'}
                        </TableCell>
                        <TableCell className={`text-right font-mono ${
                          row.status === 'matched' && Math.abs(row.diff) > 1
                            ? 'text-red-700 font-semibold'
                            : 'text-[#545454]'
                        }`}>
                          {row.status === 'matched' ? formatCurrency(row.diff) : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.status === 'siigo_only' && row.source === 'otra' && row.siigo && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openCreateTienda(row.siigo!)}
                              className="text-[#1DA9EF] border-[#1DA9EF] hover:bg-[#1DA9EF]/10"
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Crear tienda
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={createTiendaOpen} onOpenChange={setCreateTiendaOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Crear tienda desde factura Siigo</DialogTitle>
            </DialogHeader>
            <form onSubmit={submitCreateTienda} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="tienda-nombre-corto">Nombre corto *</Label>
                  <Input
                    id="tienda-nombre-corto"
                    value={tiendaForm.nombre_corto}
                    onChange={e => setTiendaForm({ ...tiendaForm, nombre_corto: e.target.value })}
                    placeholder="Ej: TITI"
                    required
                  />
                  <p className="text-xs text-[#545454] mt-1">Cómo se muestra en listas y badges</p>
                </div>
                <div>
                  <Label htmlFor="tienda-nit">NIT en Siigo *</Label>
                  <Input
                    id="tienda-nit"
                    value={tiendaForm.siigo_customer_identification}
                    onChange={e => setTiendaForm({ ...tiendaForm, siigo_customer_identification: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="tienda-nombre">Razón social (Siigo)</Label>
                <Input
                  id="tienda-nombre"
                  value={tiendaForm.nombre}
                  onChange={e => setTiendaForm({ ...tiendaForm, nombre: e.target.value })}
                  placeholder="Ej: TITI AND VAL SAS"
                  required
                />
              </div>
              <p className="text-xs text-[#545454]">
                Facturas Siigo (pasadas y futuras) con este NIT se asocian automáticamente a esta tienda. Cada factura representa una entrega/venta de productos a esta tienda con sus precios negociados.
              </p>

              {tiendaInvoiceContext && tiendaInvoiceContext.items?.length > 0 && (
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-base font-semibold">
                      Productos en esta factura ({tiendaInvoiceContext.name})
                    </Label>
                    <span className="text-xs text-[#545454]">{tiendaInvoiceContext.date}</span>
                  </div>
                  <div className="border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-[#F4F8FA]">
                        <TableRow>
                          <TableHead className="h-9">SKU</TableHead>
                          <TableHead className="h-9">Producto</TableHead>
                          <TableHead className="h-9 text-right">Cant.</TableHead>
                          <TableHead className="h-9 text-right">Precio</TableHead>
                          <TableHead className="h-9 text-right">Subtotal</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tiendaInvoiceContext.items
                          .filter(it => it.code !== 'ENVIO')
                          .map((it, i) => {
                            const subtotal = it.total ?? (it.quantity * it.price)
                            return (
                              <TableRow key={i}>
                                <TableCell className="font-mono text-xs">{it.code}</TableCell>
                                <TableCell className="text-sm">
                                  {it.description}
                                  {it.discount?.percentage ? (
                                    <span className="ml-1 text-xs text-amber-700">−{it.discount.percentage}%</span>
                                  ) : null}
                                </TableCell>
                                <TableCell className="text-right text-sm">{it.quantity}</TableCell>
                                <TableCell className="text-right font-mono text-xs">{formatCurrency(it.price)}</TableCell>
                                <TableCell className="text-right font-mono text-xs">{formatCurrency(subtotal)}</TableCell>
                              </TableRow>
                            )
                          })}
                      </TableBody>
                    </Table>
                  </div>
                  <p className="text-xs text-[#545454] mt-2">
                    Estos precios son los que esta tienda paga por cada producto. Se mantienen por factura — Shuless aún no centraliza catálogo por tienda (próximo paso).
                  </p>
                </div>
              )}

              {tiendaError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
                  {tiendaError}
                </div>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateTiendaOpen(false)} disabled={tiendaSaving}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={tiendaSaving} className="bg-[#1DA9EF] hover:bg-[#0073D1]">
                  {tiendaSaving ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Guardando...</>
                  ) : (
                    'Crear tienda'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}
