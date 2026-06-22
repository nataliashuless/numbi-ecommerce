'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { DateRange } from 'react-day-picker'
import { subMonths, format } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Loader2, LogOut, RefreshCw, ArrowLeft, ShoppingCart, Package, Boxes,
  BarChart3, MessageCircle, Settings, FileText, Store, TrendingUp, Tent,
  Megaphone, DollarSign,
} from 'lucide-react'
import { DateRangePicker } from '@/components/ui/date-range-picker'

interface GmroiRow {
  id: string
  tienda: string
  tieneWarehouse: boolean
  ventas: number
  unidades: number
  facturas: number
  primeraFactura: string | null
  diasActivos: number | null
  cogs: number
  margen: number
  margenPct: number | null
  invUnits: number
  invCost: number
  gmroi: number | null
  rentPeriodo: number | null
  rentEA: number | null
  rotacion: number | null
  recomendacion: string
  tone: 'good' | 'ok' | 'warn' | 'bad'
}
interface GmroiData {
  range: { start: string; end: string }
  periodDays: number
  unitCost: number
  rows: GmroiRow[]
  totals: {
    ventas: number; unidades: number; cogs: number; margen: number
    invUnits: number; invCost: number; gmroi: number | null
    rentPeriodo: number | null; rentEA: number | null
    margenPct: number | null; rotacion: number | null
  }
}

function fmtMoney(v: number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)
}
function fmtPct(v: number | null): string {
  if (v === null) return '—'
  return `${(v * 100).toFixed(0)}%`
}
// EA can be large; show 1 decimal under 1000%, else round.
function fmtEA(v: number | null): string {
  if (v === null) return '—'
  const pct = v * 100
  if (Math.abs(pct) >= 1000) return `${Math.round(pct).toLocaleString('es-CO')}%`
  return `${pct.toFixed(1)}%`
}
const TONE_BADGE: Record<string, string> = {
  good: 'bg-green-100 text-green-700',
  ok: 'bg-green-100 text-green-700',
  warn: 'bg-yellow-100 text-yellow-700',
  bad: 'bg-red-100 text-red-700',
}
// Color by EA: ≥30% green, ≥15% yellow, else red
function eaColor(v: number | null): string {
  if (v === null) return 'text-[#9CA3AF]'
  if (v >= 0.30) return 'text-green-600'
  if (v >= 0.15) return 'text-yellow-600'
  return 'text-red-600'
}

export default function GmroiPage() {
  const [data, setData] = useState<GmroiData | null>(null)
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)
  const [unitCost, setUnitCost] = useState('57000')

  useEffect(() => {
    setDateRange({ from: subMonths(new Date(), 12), to: new Date() })
  }, [])

  const fetchData = useCallback(async () => {
    if (!dateRange?.from || !dateRange?.to) return
    setLoading(true)
    try {
      const s = format(dateRange.from, 'yyyy-MM-dd')
      const e = format(dateRange.to, 'yyyy-MM-dd')
      const res = await fetch(`/api/tiendas/gmroi?start_date=${s}&end_date=${e}&unit_cost=${unitCost || 57000}`)
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [dateRange, unitCost])

  useEffect(() => { fetchData() }, [dateRange]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-[#FFFFFF]">
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
            <Button variant="ghost" className="rounded-none border-b-2 border-[#1DA9EF] text-[#1A2238] py-4"><Store className="h-4 w-4 mr-2" />Tiendas</Button>
            <Link href="/dashboard/ferias"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><Tent className="h-4 w-4 mr-2" />Ferias</Button></Link>
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
        <Link href="/dashboard/tiendas" className="inline-flex items-center text-sm text-[#545454] hover:text-[#1A2238] mb-4">
          <ArrowLeft className="h-4 w-4 mr-1" />Volver a Tiendas
        </Link>

        <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-6 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[#1A2238] mb-2">Rentabilidad por tienda (EA)</h1>
            <p className="text-[#545454] max-w-2xl">
              Cuánto rinde cada peso invertido en inventario consignado, anualizado. Rentabilidad del período = Margen ÷ Inventario a costo; se convierte a efectiva anual (EA).
            </p>
          </div>
          <div className="flex items-end gap-2">
            <div>
              <label className="text-xs text-[#545454] block mb-1">Costo unitario (par)</label>
              <Input
                type="number"
                value={unitCost}
                onChange={e => setUnitCost(e.target.value)}
                className="w-32"
              />
            </div>
            <DateRangePicker date={dateRange} onDateChange={setDateRange} />
            <Button variant="outline" size="icon" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {loading || !data ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-[#1A2238]" />
            <span className="ml-2 text-[#545454]">Calculando GMROI…</span>
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid gap-4 md:grid-cols-4 mb-6">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm text-[#545454]">Ventas a tiendas</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-[#1A2238]">{fmtMoney(data.totals.ventas)}</div>
                  <p className="text-xs text-[#545454]">{data.totals.unidades.toLocaleString()} pares</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm text-[#545454]">Margen bruto</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-[#1A2238]">{fmtMoney(data.totals.margen)}</div>
                  <p className="text-xs text-[#545454]">{fmtPct(data.totals.margenPct)} sobre ventas</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm text-[#545454]">Inventario a costo</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-[#1A2238]">{fmtMoney(data.totals.invCost)}</div>
                  <p className="text-xs text-[#545454]">{data.totals.invUnits.toLocaleString()} pares en tiendas</p>
                </CardContent>
              </Card>
              <Card className="ring-1 ring-[#1DA9EF]/20">
                <CardHeader className="pb-2"><CardTitle className="text-sm text-[#545454]">Rentabilidad EA</CardTitle></CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${eaColor(data.totals.rentEA)}`}>{fmtEA(data.totals.rentEA)}</div>
                  <p className="text-xs text-[#545454]">{fmtPct(data.totals.rentPeriodo)} en {data.periodDays} días</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-[#1DA9EF]" />
                  Detalle por tienda
                </CardTitle>
                <p className="text-xs text-[#545454]">
                  Costo unitario asumido: {fmtMoney(data.unitCost)}/par · Período {data.range.start} → {data.range.end} ({data.periodDays} días).
                  Ordenado por rentabilidad EA descendente.
                </p>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tienda</TableHead>
                        <TableHead className="text-right">Ventas</TableHead>
                        <TableHead className="text-right">Pares vend.</TableHead>
                        <TableHead className="text-right">Margen</TableHead>
                        <TableHead className="text-right">Inv. (pares)</TableHead>
                        <TableHead className="text-right">Inv. a costo</TableHead>
                        <TableHead className="text-right">Rotación</TableHead>
                        <TableHead className="text-right">Días activa</TableHead>
                        <TableHead className="text-right">Rent. EA</TableHead>
                        <TableHead>Recomendación</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.rows.map(r => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium text-[#1A2238]">
                            {r.tienda}
                            {!r.tieneWarehouse && (
                              <span className="block text-[10px] text-[#F59E0B]">⚠ sin bodega Siigo asignada</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{fmtMoney(r.ventas)}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.unidades.toLocaleString()}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            <div>{fmtMoney(r.margen)}</div>
                            <div className="text-xs text-[#545454]">{fmtPct(r.margenPct)}</div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{r.invUnits.toLocaleString()}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtMoney(r.invCost)}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.rotacion === null ? '—' : `${r.rotacion.toFixed(1)}x`}</TableCell>
                          <TableCell className="text-right tabular-nums text-[#545454]">
                            {r.diasActivos === null ? '—' : `${r.diasActivos}d`}
                            {r.primeraFactura && <div className="text-[10px] text-[#9CA3AF]">desde {r.primeraFactura}</div>}
                          </TableCell>
                          <TableCell className={`text-right tabular-nums font-bold ${eaColor(r.rentEA)}`}>
                            {fmtEA(r.rentEA)}
                            <div className="text-[10px] text-[#9CA3AF] font-normal">{fmtPct(r.rentPeriodo)} período</div>
                          </TableCell>
                          <TableCell><Badge className={`${TONE_BADGE[r.tone]} font-medium`}>{r.recomendacion}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-xs text-[#9CA3AF] mt-4">
                  Rent. período = Margen ÷ Inventario a costo. Rent. EA = (1 + rent. período)^(365÷días activos) − 1,
                  donde &quot;días activos&quot; cuenta <b>desde la primera factura de cada tienda</b> (no desde el inicio del rango),
                  así una tienda nueva no se castiga al elegir un rango largo. Mínimo 30 días.
                  Umbrales EA: ≥30% saludable · 15–30% aceptable · &lt;15% bajo (costo de capital ~15-20% EA en Colombia).
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  )
}
