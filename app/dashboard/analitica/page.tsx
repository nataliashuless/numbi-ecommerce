'use client'

import { useEffect, useState, useMemo, Fragment } from 'react'
import Link from 'next/link'
import { DateRange } from 'react-day-picker'
import { subMonths, format } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  TrendingUp,
  Search,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react'
import { DateRangePicker } from '@/components/ui/date-range-picker'

interface ChannelStats { qty: number; amount: number; invoices: number }
interface VariantStat {
  code: string
  size: string | null
  description: string
  totalQty: number
  totalAmount: number
  byChannel: {
    shopify: ChannelStats
    whatsapp: ChannelStats
    tiendas: Record<string, ChannelStats>
  }
}
interface ReferenceStat {
  reference: string
  totalQty: number
  totalAmount: number
  byChannel: {
    shopify: ChannelStats
    whatsapp: ChannelStats
    tiendas: Record<string, ChannelStats>
  }
  variantCount: number
  variants: VariantStat[]
}
interface TiendaRef { id: string; nombre: string }
interface AnalyticsResponse {
  tiendas: TiendaRef[]
  references: ReferenceStat[]
  totals: {
    referencias: number
    productos: number
    unidades: number
    monto: number
    facturas: number
    byChannel: { shopify: number; whatsapp: number; tienda: number }
  }
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

const EMPTY_STATS: ChannelStats = { qty: 0, amount: 0, invoices: 0 }

function sumTiendasStats(tiendas: Record<string, ChannelStats>): ChannelStats {
  let qty = 0, amount = 0, invoices = 0
  for (const k in tiendas) {
    qty += tiendas[k].qty
    amount += tiendas[k].amount
    invoices += tiendas[k].invoices
  }
  return { qty, amount, invoices }
}

export default function AnaliticaPage() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)

  useEffect(() => {
    setDateRange({ from: subMonths(new Date(), 6), to: new Date() })
  }, [])

  const [data, setData] = useState<AnalyticsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showAmount, setShowAmount] = useState(false)
  const [sortKey, setSortKey] = useState<string>('total')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [expandedRefs, setExpandedRefs] = useState<Set<string>>(new Set())
  const [tiendasExpanded, setTiendasExpanded] = useState(false)

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  function toggleRef(reference: string) {
    setExpandedRefs(prev => {
      const next = new Set(prev)
      if (next.has(reference)) next.delete(reference)
      else next.add(reference)
      return next
    })
  }

  async function fetchData() {
    if (!dateRange?.from || !dateRange?.to) return
    setLoading(true)
    setError(null)
    try {
      const start = format(dateRange.from, 'yyyy-MM-dd')
      const end = format(dateRange.to, 'yyyy-MM-dd')
      const res = await fetch(`/api/analitica/productos?start_date=${start}&end_date=${end}`)
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e.error || 'Error')
      }
      setData(await res.json())
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

  const filteredRefs = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    const base = q
      ? data.references.filter(r =>
          r.reference.toLowerCase().includes(q) ||
          r.variants.some(v => v.code.toLowerCase().includes(q) || v.description.toLowerCase().includes(q))
        )
      : data.references
    const dir = sortDir === 'asc' ? 1 : -1
    const valueOf = (r: ReferenceStat): number | string => {
      if (sortKey === 'referencia') return r.reference.toLowerCase()
      if (sortKey === 'total') return showAmount ? r.totalAmount : r.totalQty
      if (sortKey === 'shopify') return showAmount ? r.byChannel.shopify.amount : r.byChannel.shopify.qty
      if (sortKey === 'whatsapp') return showAmount ? r.byChannel.whatsapp.amount : r.byChannel.whatsapp.qty
      if (sortKey === 'tiendas') {
        const s = sumTiendasStats(r.byChannel.tiendas)
        return showAmount ? s.amount : s.qty
      }
      if (sortKey.startsWith('tienda:')) {
        const id = sortKey.slice(7)
        const t = r.byChannel.tiendas[id]
        return showAmount ? t?.amount || 0 : t?.qty || 0
      }
      return 0
    }
    return [...base].sort((a, b) => {
      const va = valueOf(a)
      const vb = valueOf(b)
      if (va < vb) return -1 * dir
      if (va > vb) return 1 * dir
      return 0
    })
  }, [data, search, sortKey, sortDir, showAmount])

  function SortHead({ k, label, className }: { k: string; label: string; className?: string }) {
    const active = sortKey === k
    return (
      <TableHead className={className}>
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

  const tiendas = data?.tiendas || []
  const totals = data?.totals

  const renderStat = (s: ChannelStats | undefined) => {
    const safe = s || EMPTY_STATS
    if (safe.qty === 0) return <span className="text-[#D1D5DB]">—</span>
    return showAmount ? formatCurrency(safe.amount) : safe.qty.toLocaleString()
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
            <Link href="/dashboard"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><BarChart3 className="h-4 w-4 mr-2" />Ventas</Button></Link>
            <Link href="/dashboard/shopify"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><ShoppingCart className="h-4 w-4 mr-2" />Shopify</Button></Link>
            <Link href="/dashboard/whatsapp"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><MessageCircle className="h-4 w-4 mr-2" />WhatsApp</Button></Link>
            <Link href="/dashboard/tiendas"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><Store className="h-4 w-4 mr-2" />Tiendas</Button></Link>
            <Link href="/dashboard/conciliacion"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><FileText className="h-4 w-4 mr-2" />Conciliación</Button></Link>
            <Button variant="ghost" className="rounded-none border-b-2 border-[#1DA9EF] text-[#1A2238] py-4"><TrendingUp className="h-4 w-4 mr-2" />Analítica</Button>
            <Link href="/dashboard/productos"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><Package className="h-4 w-4 mr-2" />Productos</Button></Link>
            <Link href="/dashboard/inventario"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><Boxes className="h-4 w-4 mr-2" />Inventario</Button></Link>
            <Link href="/dashboard/configuracion"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><Settings className="h-4 w-4 mr-2" />Configuración</Button></Link>
          </nav>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[#1A2238] mb-2">Analítica por producto y canal</h1>
            <p className="text-[#545454]">Referencias agrupadas. Click una fila para ver las tallas; usá el botón a la derecha de Tiendas para desplegar/contraer todas las tiendas en columnas.</p>
          </div>
          <div className="flex items-center gap-2">
            <DateRangePicker date={dateRange} onDateChange={setDateRange} />
            <Button variant="outline" size="icon" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {error && (
          <Card className="mb-6 border-red-200 bg-red-50">
            <CardContent className="pt-6 text-red-700 text-sm">{error}</CardContent>
          </Card>
        )}

        {totals && (
          <div className="grid gap-4 md:grid-cols-4 mb-6">
            <Card className="border-t-4 border-t-[#1DA9EF]">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-[#545454]">Referencias</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-[#1A2238]">{totals.referencias.toLocaleString()}</div>
                <p className="text-xs text-[#545454]">{totals.productos} SKUs distintos</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-[#545454]">Unidades</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-[#1A2238]">{totals.unidades.toLocaleString()}</div>
                <p className="text-xs text-[#545454]">en {totals.facturas} facturas</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-[#545454]">Monto total</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-[#1A2238]">{formatCurrency(totals.monto)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-[#545454]">Por canal</CardTitle></CardHeader>
              <CardContent className="text-xs space-y-1">
                <div className="flex justify-between"><span className="text-[#1A2238]">Shopify</span><span className="font-mono">{formatCurrency(totals.byChannel.shopify)}</span></div>
                <div className="flex justify-between"><span className="text-[#0F766E]">WhatsApp</span><span className="font-mono">{formatCurrency(totals.byChannel.whatsapp)}</span></div>
                <div className="flex justify-between"><span className="text-[#0073D1]">Tiendas</span><span className="font-mono">{formatCurrency(totals.byChannel.tienda)}</span></div>
              </CardContent>
            </Card>
          </div>
        )}

        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <CardTitle>Productos por canal</CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                  <Input
                    placeholder="Buscar referencia, SKU o producto..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-8 w-64"
                  />
                </div>
                <div className="flex border rounded-md text-sm">
                  <button
                    onClick={() => setShowAmount(false)}
                    className={`px-3 py-1 ${!showAmount ? 'bg-[#1DA9EF] text-white' : 'text-[#545454]'}`}
                  >
                    Unidades
                  </button>
                  <button
                    onClick={() => setShowAmount(true)}
                    className={`px-3 py-1 ${showAmount ? 'bg-[#1DA9EF] text-white' : 'text-[#545454]'}`}
                  >
                    $
                  </button>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-[#1DA9EF]" />
              </div>
            ) : filteredRefs.length === 0 ? (
              <p className="text-center text-[#545454] py-12 text-sm">Sin productos en este período</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-white z-10">
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <SortHead k="referencia" label="Referencia" />
                      <SortHead k="total" label="Total" className="text-right" />
                      <SortHead k="shopify" label="Shopify" className="text-right bg-[#1A2238]/5 text-[#1A2238]" />
                      <SortHead k="whatsapp" label="WhatsApp" className="text-right bg-[#14B8A6]/5 text-[#0F766E]" />
                      {tiendasExpanded ? (
                        <>
                          {tiendas.map(t => (
                            <SortHead key={t.id} k={`tienda:${t.id}`} label={t.nombre} className="text-right bg-[#1DA9EF]/5 text-[#0073D1]" />
                          ))}
                          <TableHead className="w-8 bg-[#1DA9EF]/5 text-[#0073D1]">
                            <button
                              type="button"
                              onClick={() => setTiendasExpanded(false)}
                              title="Colapsar tiendas"
                              className="hover:text-[#1DA9EF]"
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </button>
                          </TableHead>
                        </>
                      ) : (
                        <TableHead className="text-right bg-[#1DA9EF]/5 text-[#0073D1]">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => toggleSort('tiendas')}
                              className={`inline-flex items-center gap-1 ${sortKey === 'tiendas' ? 'font-semibold' : ''}`}
                            >
                              Tiendas ({tiendas.length})
                              {sortKey === 'tiendas' && (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                            </button>
                            <button
                              type="button"
                              onClick={() => setTiendasExpanded(true)}
                              title="Expandir tiendas"
                              className="hover:text-[#1DA9EF]"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </button>
                          </div>
                        </TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRefs.map(r => {
                      const tiendasSum = sumTiendasStats(r.byChannel.tiendas)
                      const isExpanded = expandedRefs.has(r.reference)
                      return (
                        <Fragment key={r.reference}>
                          <TableRow
                            className={`cursor-pointer hover:bg-gray-50 ${isExpanded ? 'bg-gray-50' : ''}`}
                            onClick={() => toggleRef(r.reference)}
                          >
                            <TableCell className="w-8">
                              {r.variantCount > 1 && (
                                isExpanded
                                  ? <ChevronDown className="h-4 w-4 text-[#545454]" />
                                  : <ChevronRight className="h-4 w-4 text-[#545454]" />
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="font-medium text-[#1A2238]">{r.reference}</div>
                              {r.variantCount > 1 && (
                                <div className="text-xs text-[#545454]">{r.variantCount} tallas</div>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-bold text-[#1A2238]">
                              {showAmount ? formatCurrency(r.totalAmount) : r.totalQty.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">{renderStat(r.byChannel.shopify)}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{renderStat(r.byChannel.whatsapp)}</TableCell>
                            {tiendasExpanded ? (
                              <>
                                {tiendas.map(t => (
                                  <TableCell key={t.id} className="text-right font-mono text-sm">
                                    {renderStat(r.byChannel.tiendas[t.id])}
                                  </TableCell>
                                ))}
                                <TableCell></TableCell>
                              </>
                            ) : (
                              <TableCell className="text-right font-mono text-sm">
                                {renderStat(tiendasSum)}
                              </TableCell>
                            )}
                          </TableRow>

                          {isExpanded && r.variants.map(v => {
                            const vTiendasSum = sumTiendasStats(v.byChannel.tiendas)
                            return (
                              <TableRow key={`${r.reference}-${v.code}`} className="bg-gray-50/40">
                                <TableCell></TableCell>
                                <TableCell className="pl-8">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs bg-white border rounded px-1.5 py-0.5 font-mono text-[#545454]">{v.code}</span>
                                    <span className="text-sm text-[#1A2238]">
                                      {v.size ? `Talla ${v.size}` : v.description}
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-right font-mono text-sm text-[#1A2238]">
                                  {showAmount ? formatCurrency(v.totalAmount) : v.totalQty.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right font-mono text-xs">{renderStat(v.byChannel.shopify)}</TableCell>
                                <TableCell className="text-right font-mono text-xs">{renderStat(v.byChannel.whatsapp)}</TableCell>
                                {tiendasExpanded ? (
                                  <>
                                    {tiendas.map(t => (
                                      <TableCell key={t.id} className="text-right font-mono text-xs">
                                        {renderStat(v.byChannel.tiendas[t.id])}
                                      </TableCell>
                                    ))}
                                    <TableCell></TableCell>
                                  </>
                                ) : (
                                  <TableCell className="text-right font-mono text-xs">
                                    {renderStat(vTiendasSum)}
                                  </TableCell>
                                )}
                              </TableRow>
                            )
                          })}
                        </Fragment>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
