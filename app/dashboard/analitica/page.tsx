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
  Tent,
  Megaphone,
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

interface YtdBucket { unidades: number; monto: number; ordenes: number }
interface YtdFamilyRow { family: string; current: YtdBucket; previous: YtdBucket }
interface YtdDesignBucket extends YtdBucket { byFamily: Record<string, YtdBucket> }
interface YtdDesignRow { design: string; current: YtdDesignBucket; previous: YtdDesignBucket }
interface YtdResponse {
  asOf: string
  currentRange: { start: string; end: string }
  previousRange: { start: string; end: string }
  families: YtdFamilyRow[]
  designs: YtdDesignRow[]
  sizeRules?: Array<{ min: number; max: number; family: string }>
  unmappedExamples?: Array<{ reference: string; sku?: string; size?: string; count: number; unidades: number; monto: number }>
  shopify?: { productTypes: string[]; skuCount: number }
}

function pctChange(curr: number, prev: number): number | null {
  if (prev === 0) return curr > 0 ? Infinity : 0
  return ((curr - prev) / prev) * 100
}
function fmtPct(v: number | null): string {
  if (v === null) return '—'
  if (!isFinite(v)) return v > 0 ? '+∞' : '—'
  const sign = v >= 0 ? '+' : ''
  return `${sign}${v.toFixed(1)}%`
}
function pctColor(v: number | null): string {
  if (v === null || v === 0) return 'text-[#6B7280]'
  if (!isFinite(v)) return v > 0 ? 'text-green-600' : 'text-red-600'
  return v > 0 ? 'text-green-600' : 'text-red-600'
}

// ── Mes vs año anterior ────────────────────────────────────────────────────
interface MesBucket { ventas: number; unidades: number; ordenes: number }
interface MesDesignBucket extends MesBucket { byFamily: Record<string, MesBucket> }
interface MesResponse {
  currentMonth: string
  previousMonth: string
  currentRange: { start: string; end: string }
  previousRange: { start: string; end: string }
  total: { current: MesBucket; previous: MesBucket }
  byChannel: Array<{ channel: string; current: MesBucket; previous: MesBucket }>
  byTienda: Array<{ tienda: string; current: MesBucket; previous: MesBucket }>
  families: Array<{ family: string; current: MesBucket; previous: MesBucket }>
  designs: Array<{ design: string; current: MesDesignBucket; previous: MesDesignBucket }>
}

const MONTH_LABELS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return `${MONTH_LABELS[m - 1]} ${y}`
}

const CHANNEL_META: Record<string, { label: string; color: string }> = {
  shopify: { label: 'Shopify', color: '#1A2238' },
  whatsapp: { label: 'WhatsApp', color: '#14B8A6' },
  online: { label: 'Online', color: '#1A2238' },
  tiendas: { label: 'Tiendas', color: '#1DA9EF' },
  ferias: { label: 'Ferias', color: '#F59E0B' },
}

function MesComparacionView() {
  // Build a list of selectable months (last 24, current-first)
  const monthOptions = useMemo(() => {
    const opts: string[] = []
    const today = new Date()
    for (let i = 0; i < 24; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
      opts.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    return opts
  }, [])

  const [month, setMonth] = useState<string>(monthOptions[0])
  const [data, setData] = useState<MesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [tiendasExpanded, setTiendasExpanded] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/analitica/mes?month=${month}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !d.error) setData(d) })
      .finally(() => setLoading(false))
  }, [month])

  const kpi = (label: string, cur: number, prev: number, isMoney: boolean) => {
    const delta = pctChange(cur, prev)
    return (
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm text-[#545454]">{label}</CardTitle></CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-[#1A2238]">
            {isMoney ? formatCurrency(cur) : cur.toLocaleString()}
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs">
            <span className="text-[#6B7280]">vs {isMoney ? formatCurrency(prev) : prev.toLocaleString()}</span>
            <span className={pctColor(delta)}>{fmtPct(delta)}</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
        <label className="text-sm font-medium text-[#1A2238]">Mes a comparar:</label>
        <select
          value={month}
          onChange={e => setMonth(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm min-w-[180px]"
        >
          {monthOptions.map(m => (
            <option key={m} value={m}>{monthLabel(m)}</option>
          ))}
        </select>
        {data && (
          <span className="text-sm text-[#6B7280]">
            comparando <b className="text-[#1A2238]">{monthLabel(data.currentMonth)}</b> vs <b className="text-[#1A2238]">{monthLabel(data.previousMonth)}</b>
          </span>
        )}
      </div>

      {loading || !data ? (
        <div className="flex items-center justify-center py-12 text-[#545454]">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />Cargando comparación…
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid gap-4 md:grid-cols-3 mb-6">
            {kpi('Ventas', data.total.current.ventas, data.total.previous.ventas, true)}
            {kpi('Unidades', data.total.current.unidades, data.total.previous.unidades, false)}
            {kpi('Órdenes', data.total.current.ordenes, data.total.previous.ordenes, false)}
          </div>

          {/* Por canal */}
          <Card className="mb-6">
            <CardHeader><CardTitle className="text-lg">Por canal</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm tabular-nums">
                  <thead>
                    <tr className="border-b border-[#E5E7EB]">
                      <th className="text-left py-3 px-3 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Canal</th>
                      <th className="text-right py-3 px-3 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">{monthLabel(data.previousMonth)}</th>
                      <th className="text-right py-3 px-3 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">{monthLabel(data.currentMonth)}</th>
                      <th className="text-right py-3 px-3 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Δ Ventas</th>
                      <th className="text-right py-3 px-3 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Δ Unidades</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      // Merge Shopify + WhatsApp into a single "Online" row
                      const sumB = (a: MesBucket, b: MesBucket): MesBucket => ({
                        ventas: a.ventas + b.ventas,
                        unidades: a.unidades + b.unidades,
                        ordenes: a.ordenes + b.ordenes,
                      })
                      const find = (ch: string) => data.byChannel.find(c => c.channel === ch)
                      const sh = find('shopify')
                      const wa = find('whatsapp')
                      const onlineRow = {
                        channel: 'online',
                        current: sumB(sh?.current || { ventas: 0, unidades: 0, ordenes: 0 }, wa?.current || { ventas: 0, unidades: 0, ordenes: 0 }),
                        previous: sumB(sh?.previous || { ventas: 0, unidades: 0, ordenes: 0 }, wa?.previous || { ventas: 0, unidades: 0, ordenes: 0 }),
                      }
                      const rows = [
                        onlineRow,
                        ...data.byChannel.filter(c => c.channel !== 'shopify' && c.channel !== 'whatsapp'),
                      ]
                      return rows.map(c => {
                        const meta = CHANNEL_META[c.channel] || { label: c.channel, color: '#6B7280' }
                        const dV = pctChange(c.current.ventas, c.previous.ventas)
                        const dU = pctChange(c.current.unidades, c.previous.unidades)
                        const isTiendas = c.channel === 'tiendas'
                        const canExpand = isTiendas && data.byTienda.length > 0
                        return (
                        <Fragment key={c.channel}>
                        <tr
                          className={`border-b border-[#F3F4F6] ${canExpand ? 'cursor-pointer hover:bg-[#F9FAFB]' : ''}`}
                          onClick={canExpand ? () => setTiendasExpanded(v => !v) : undefined}
                        >
                          <td className="py-3 px-3">
                            <span className="inline-flex items-center gap-2">
                              {canExpand ? (
                                tiendasExpanded ? <ChevronDown className="h-4 w-4 text-[#9CA3AF]" /> : <ChevronRight className="h-4 w-4 text-[#9CA3AF]" />
                              ) : (
                                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: meta.color }} />
                              )}
                              <span className="text-[#1A2238]">{meta.label}</span>
                              {canExpand && <span className="text-xs text-[#9CA3AF]">({data.byTienda.length})</span>}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right text-[#6B7280]">
                            <div>{formatCurrency(c.previous.ventas)}</div>
                            <div className="text-xs">{c.previous.unidades.toLocaleString()}u</div>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="text-[#1A2238]">{formatCurrency(c.current.ventas)}</div>
                            <div className="text-xs text-[#6B7280]">{c.current.unidades.toLocaleString()}u</div>
                          </td>
                          <td className={`py-3 px-3 text-right ${pctColor(dV)}`}>{fmtPct(dV)}</td>
                          <td className={`py-3 px-3 text-right ${pctColor(dU)}`}>{fmtPct(dU)}</td>
                        </tr>
                        {isTiendas && tiendasExpanded && data.byTienda.map(t => {
                          const tV = pctChange(t.current.ventas, t.previous.ventas)
                          const tU = pctChange(t.current.unidades, t.previous.unidades)
                          return (
                            <tr key={`tienda-${t.tienda}`} className="border-b border-[#F3F4F6] bg-[#F9FAFB]/50">
                              <td className="py-2.5 px-3 pl-9 text-sm text-[#1A2238]">
                                <span className="text-[#6B7280] mr-1">↳</span>{t.tienda}
                              </td>
                              <td className="py-2.5 px-3 text-right text-[#6B7280] text-sm">
                                <div>{formatCurrency(t.previous.ventas)}</div>
                                <div className="text-xs">{t.previous.unidades.toLocaleString()}u</div>
                              </td>
                              <td className="py-2.5 px-3 text-right text-sm">
                                <div className="text-[#1A2238]">{formatCurrency(t.current.ventas)}</div>
                                <div className="text-xs text-[#6B7280]">{t.current.unidades.toLocaleString()}u</div>
                              </td>
                              <td className={`py-2.5 px-3 text-right text-sm ${pctColor(tV)}`}>{fmtPct(tV)}</td>
                              <td className={`py-2.5 px-3 text-right text-sm ${pctColor(tU)}`}>{fmtPct(tU)}</td>
                            </tr>
                          )
                        })}
                        </Fragment>
                        )
                      })
                    })()}
                    {(() => {
                      const dV = pctChange(data.total.current.ventas, data.total.previous.ventas)
                      const dU = pctChange(data.total.current.unidades, data.total.previous.unidades)
                      return (
                        <tr className="font-semibold bg-[#F9FAFB] border-t-2 border-[#E5E7EB]">
                          <td className="py-3 px-3 text-[#1A2238]">Total</td>
                          <td className="py-3 px-3 text-right text-[#6B7280]">
                            <div>{formatCurrency(data.total.previous.ventas)}</div>
                            <div className="text-xs">{data.total.previous.unidades.toLocaleString()}u</div>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="text-[#1A2238]">{formatCurrency(data.total.current.ventas)}</div>
                            <div className="text-xs text-[#6B7280]">{data.total.current.unidades.toLocaleString()}u</div>
                          </td>
                          <td className={`py-3 px-3 text-right ${pctColor(dV)}`}>{fmtPct(dV)}</td>
                          <td className={`py-3 px-3 text-right ${pctColor(dU)}`}>{fmtPct(dU)}</td>
                        </tr>
                      )
                    })()}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Por familia */}
          <Card className="mb-6">
            <CardHeader><CardTitle className="text-lg">Por familia</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm tabular-nums">
                  <thead>
                    <tr className="border-b border-[#E5E7EB]">
                      <th className="text-left py-3 px-3 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Familia</th>
                      <th className="text-right py-3 px-3 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">{monthLabel(data.previousMonth)}</th>
                      <th className="text-right py-3 px-3 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">{monthLabel(data.currentMonth)}</th>
                      <th className="text-right py-3 px-3 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Δ Ventas</th>
                      <th className="text-right py-3 px-3 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Δ Unidades</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.families.map(f => {
                      const dV = pctChange(f.current.ventas, f.previous.ventas)
                      const dU = pctChange(f.current.unidades, f.previous.unidades)
                      return (
                        <tr key={f.family} className="border-b border-[#F3F4F6]">
                          <td className="py-3 px-3 font-medium text-[#1A2238]">{f.family}</td>
                          <td className="py-3 px-3 text-right text-[#6B7280]">
                            <div>{formatCurrency(f.previous.ventas)}</div>
                            <div className="text-xs">{f.previous.unidades.toLocaleString()}u</div>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="text-[#1A2238]">{formatCurrency(f.current.ventas)}</div>
                            <div className="text-xs text-[#6B7280]">{f.current.unidades.toLocaleString()}u</div>
                          </td>
                          <td className={`py-3 px-3 text-right ${pctColor(dV)}`}>{fmtPct(dV)}</td>
                          <td className={`py-3 px-3 text-right ${pctColor(dU)}`}>{fmtPct(dU)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Por diseño */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Por diseño</CardTitle>
              <p className="text-xs text-[#545454]">Ordenado por ventas de {monthLabel(data.currentMonth)}.</p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm tabular-nums">
                  <thead>
                    <tr className="border-b border-[#E5E7EB]">
                      <th className="text-left py-3 px-3 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Diseño</th>
                      <th className="text-right py-3 px-3 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">{monthLabel(data.previousMonth)}</th>
                      <th className="text-right py-3 px-3 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">{monthLabel(data.currentMonth)}</th>
                      <th className="text-right py-3 px-3 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Δ Ventas</th>
                      <th className="text-right py-3 px-3 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Δ Unidades</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.designs.filter(d => d.current.ventas > 0 || d.previous.ventas > 0).map(d => {
                      const dV = pctChange(d.current.ventas, d.previous.ventas)
                      const dU = pctChange(d.current.unidades, d.previous.unidades)
                      return (
                        <tr key={d.design} className="border-b border-[#F3F4F6]">
                          <td className="py-2.5 px-3 font-medium text-[#1A2238]">{d.design}</td>
                          <td className="py-2.5 px-3 text-right text-[#6B7280]">
                            <div>{formatCurrency(d.previous.ventas)}</div>
                            <div className="text-xs">{d.previous.unidades.toLocaleString()}u</div>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <div className="text-[#1A2238]">{formatCurrency(d.current.ventas)}</div>
                            <div className="text-xs text-[#6B7280]">{d.current.unidades.toLocaleString()}u</div>
                          </td>
                          <td className={`py-2.5 px-3 text-right ${pctColor(dV)}`}>{fmtPct(dV)}</td>
                          <td className={`py-2.5 px-3 text-right ${pctColor(dU)}`}>{fmtPct(dU)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function YtdFamiliasView() {
  const [data, setData] = useState<YtdResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedFamily, setExpandedFamily] = useState<Set<string>>(new Set())

  useEffect(() => {
    setLoading(true)
    fetch('/api/analitica/familias')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d) })
      .finally(() => setLoading(false))
  }, [])

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-12 text-[#545454]">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Cargando YTD…
      </div>
    )
  }

  // For the expandable view inside each family row: only include designs that
  // have sales in THAT family (using the byFamily breakdown). Each row's
  // numbers reflect ONLY the slice belonging to that family.
  const allDesigns = data.designs
  function designsInFamily(family: string): Array<{ design: string; current: YtdBucket; previous: YtdBucket }> {
    const out: Array<{ design: string; current: YtdBucket; previous: YtdBucket }> = []
    for (const d of allDesigns) {
      const cur = d.current.byFamily[family]
      const prev = d.previous.byFamily[family]
      if (!cur && !prev) continue
      out.push({
        design: d.design,
        current: cur || { unidades: 0, monto: 0, ordenes: 0 },
        previous: prev || { unidades: 0, monto: 0, ordenes: 0 },
      })
    }
    return out.sort((a, b) => b.current.monto - a.current.monto)
  }

  const totals = data.families.reduce(
    (acc, f) => ({
      curUnits: acc.curUnits + f.current.unidades,
      prevUnits: acc.prevUnits + f.previous.unidades,
      curMonto: acc.curMonto + f.current.monto,
      prevMonto: acc.prevMonto + f.previous.monto,
    }),
    { curUnits: 0, prevUnits: 0, curMonto: 0, prevMonto: 0 },
  )

  const yyyyThis = new Date(data.asOf + 'T12:00:00').getFullYear()
  const yyyyPrev = yyyyThis - 1

  function toggleFamily(name: string) {
    setExpandedFamily(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  return (
    <div>
      <div className="text-xs text-[#6B7280] mb-4">
        YTD: {data.currentRange.start} → {data.currentRange.end} vs {data.previousRange.start} → {data.previousRange.end}.
        {data.sizeRules && (
          <span className="ml-2">
            {' · '}Categorización por talla:{' '}
            {data.sizeRules.map((r, i) => (
              <span key={i}>
                <code className="bg-gray-100 px-1 rounded text-[10px]">T{r.min}–{r.max} → {r.family}</code>
                {i < data.sizeRules!.length - 1 ? ' · ' : ''}
              </span>
            ))}
          </span>
        )}
      </div>

      {(data.unmappedExamples && data.unmappedExamples.length > 0) && (
        <Card className="mb-6 border-l-4 border-l-[#F59E0B]">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2 text-[#1A2238]">
              ⚠ Descripciones sin familia ({data.unmappedExamples.length})
            </CardTitle>
            <p className="text-xs text-[#545454]">
              Estos items cayeron en &quot;Otros&quot; porque su talla no está en los rangos definidos (19-22 o 23-29).
              Pueden ser accesorios, productos especiales o errores en la descripción de Siigo.
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="border-b border-[#E5E7EB]">
                    <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Descripción</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Talla</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Unidades</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {data.unmappedExamples.slice(0, 25).map((u, i) => (
                    <tr key={`${u.sku || ''}-${u.reference}-${i}`} className="border-b border-[#F3F4F6]">
                      <td className="py-2 px-3 text-[#1A2238]">
                        <div className="font-medium">{u.reference}</div>
                        {u.sku && <div className="text-xs font-mono text-[#6B7280]">SKU: {u.sku}</div>}
                      </td>
                      <td className="py-2 px-3 text-[#6B7280]">{u.size || '—'}</td>
                      <td className="py-2 px-3 text-right">{u.unidades.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right">${u.monto.toLocaleString('es-CO')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Resumen por familia</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b border-[#E5E7EB]">
                  <th className="text-left py-3 px-3 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Familia</th>
                  <th className="text-right py-3 px-3 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">YTD {yyyyPrev}</th>
                  <th className="text-right py-3 px-3 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">YTD {yyyyThis}</th>
                  <th className="text-right py-3 px-3 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Δ Monto</th>
                  <th className="text-right py-3 px-3 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Δ Unidades</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {data.families.map(f => {
                  const designs = designsInFamily(f.family)
                  const expanded = expandedFamily.has(f.family)
                  const dMon = pctChange(f.current.monto, f.previous.monto)
                  const dUni = pctChange(f.current.unidades, f.previous.unidades)
                  return (
                    <Fragment key={f.family}>
                      <tr
                        className="border-b border-[#F3F4F6] hover:bg-[#F9FAFB] cursor-pointer"
                        onClick={() => toggleFamily(f.family)}
                      >
                        <td className="py-3 px-3 font-medium text-[#1A2238]">{f.family}</td>
                        <td className="py-3 px-3 text-right text-[#6B7280]">
                          <div>{formatCurrency(f.previous.monto)}</div>
                          <div className="text-xs">{f.previous.unidades.toLocaleString()}u</div>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="text-[#1A2238]">{formatCurrency(f.current.monto)}</div>
                          <div className="text-xs text-[#6B7280]">{f.current.unidades.toLocaleString()}u</div>
                        </td>
                        <td className={`py-3 px-3 text-right ${pctColor(dMon)}`}>{fmtPct(dMon)}</td>
                        <td className={`py-3 px-3 text-right ${pctColor(dUni)}`}>{fmtPct(dUni)}</td>
                        <td className="py-3 px-3 text-right text-[#9CA3AF]">
                          {expanded ? <ChevronDown className="h-4 w-4 inline" /> : <ChevronRight className="h-4 w-4 inline" />}
                        </td>
                      </tr>
                      {expanded && designs.map(d => {
                        const dDmon = pctChange(d.current.monto, d.previous.monto)
                        const dDuni = pctChange(d.current.unidades, d.previous.unidades)
                        return (
                          <tr key={`${f.family}-${d.design}`} className="border-b border-[#F3F4F6] bg-[#F9FAFB]/50">
                            <td className="py-2.5 px-3 pl-8 text-sm text-[#1A2238]">
                              <span className="text-[#6B7280] mr-1">↳</span>{d.design}
                            </td>
                            <td className="py-2.5 px-3 text-right text-[#6B7280] text-sm">
                              <div>{formatCurrency(d.previous.monto)}</div>
                              <div className="text-xs">{d.previous.unidades.toLocaleString()}u</div>
                            </td>
                            <td className="py-2.5 px-3 text-right text-sm">
                              <div className="text-[#1A2238]">{formatCurrency(d.current.monto)}</div>
                              <div className="text-xs text-[#6B7280]">{d.current.unidades.toLocaleString()}u</div>
                            </td>
                            <td className={`py-2.5 px-3 text-right text-sm ${pctColor(dDmon)}`}>{fmtPct(dDmon)}</td>
                            <td className={`py-2.5 px-3 text-right text-sm ${pctColor(dDuni)}`}>{fmtPct(dDuni)}</td>
                            <td></td>
                          </tr>
                        )
                      })}
                    </Fragment>
                  )
                })}
                {(() => {
                  const dMon = pctChange(totals.curMonto, totals.prevMonto)
                  const dUni = pctChange(totals.curUnits, totals.prevUnits)
                  return (
                    <tr className="font-semibold bg-[#F9FAFB] border-t-2 border-[#E5E7EB]">
                      <td className="py-3 px-3 text-[#1A2238]">Total</td>
                      <td className="py-3 px-3 text-right text-[#6B7280]">
                        <div>{formatCurrency(totals.prevMonto)}</div>
                        <div className="text-xs">{totals.prevUnits.toLocaleString()}u</div>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="text-[#1A2238]">{formatCurrency(totals.curMonto)}</div>
                        <div className="text-xs text-[#6B7280]">{totals.curUnits.toLocaleString()}u</div>
                      </td>
                      <td className={`py-3 px-3 text-right ${pctColor(dMon)}`}>{fmtPct(dMon)}</td>
                      <td className={`py-3 px-3 text-right ${pctColor(dUni)}`}>{fmtPct(dUni)}</td>
                      <td></td>
                    </tr>
                  )
                })()}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Detalle por diseño (consolidado)</CardTitle>
          <p className="text-xs text-[#545454]">
            Cada diseño en una sola fila con su total YTD; el desglose por familia (PC/E) muestra cuánto vendió en talla 19-22 vs 23-29.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b border-[#E5E7EB]">
                  <th className="text-left py-3 px-3 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Diseño</th>
                  <th className="text-right py-3 px-3 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">YTD {yyyyPrev}</th>
                  <th className="text-right py-3 px-3 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">YTD {yyyyThis}</th>
                  <th className="text-right py-3 px-3 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Δ Monto</th>
                  <th className="text-right py-3 px-3 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Δ Unidades</th>
                  <th className="text-right py-3 px-3 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Split (YTD {yyyyThis})</th>
                </tr>
              </thead>
              <tbody>
                {data.designs.map(d => {
                  const dMon = pctChange(d.current.monto, d.previous.monto)
                  const dUni = pctChange(d.current.unidades, d.previous.unidades)
                  const pc = d.current.byFamily['Pequeños Caminantes']?.unidades || 0
                  const ex = d.current.byFamily['Exploradores']?.unidades || 0
                  const ot = d.current.byFamily['Otros']?.unidades || 0
                  const total = pc + ex + ot
                  return (
                    <tr key={d.design} className="border-b border-[#F3F4F6]">
                      <td className="py-2.5 px-3 font-medium text-[#1A2238]">{d.design}</td>
                      <td className="py-2.5 px-3 text-right text-[#6B7280]">
                        <div>{formatCurrency(d.previous.monto)}</div>
                        <div className="text-xs">{d.previous.unidades.toLocaleString()}u</div>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="text-[#1A2238]">{formatCurrency(d.current.monto)}</div>
                        <div className="text-xs text-[#6B7280]">{d.current.unidades.toLocaleString()}u</div>
                      </td>
                      <td className={`py-2.5 px-3 text-right ${pctColor(dMon)}`}>{fmtPct(dMon)}</td>
                      <td className={`py-2.5 px-3 text-right ${pctColor(dUni)}`}>{fmtPct(dUni)}</td>
                      <td className="py-2.5 px-3 text-right text-xs">
                        {total > 0 ? (
                          <div className="inline-flex items-center gap-2 whitespace-nowrap">
                            <span className="text-[#1DA9EF]">PC {pc.toLocaleString()}u</span>
                            <span className="text-[#6B7280]">·</span>
                            <span className="text-[#F59E0B]">E {ex.toLocaleString()}u</span>
                            {ot > 0 && <><span className="text-[#6B7280]">·</span><span className="text-[#6B7280]">Otr {ot.toLocaleString()}u</span></>}
                          </div>
                        ) : <span className="text-[#9CA3AF]">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function AnaliticaPage() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)

  useEffect(() => {
    setDateRange({ from: subMonths(new Date(), 6), to: new Date() })
  }, [])

  const [activeTab, setActiveTab] = useState<'canal' | 'ytd' | 'mes'>('canal')
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
            <Link href="/dashboard/ferias">
              <Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4">
                <Tent className="h-4 w-4 mr-2" />
                Ferias
              </Button>
            </Link>
                        <Link href="/dashboard/marketing"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><Megaphone className="h-4 w-4 mr-2" />Marketing</Button></Link>
            <Link href="/dashboard/conciliacion"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><FileText className="h-4 w-4 mr-2" />Conciliación</Button></Link>
            <Button variant="ghost" className="rounded-none border-b-2 border-[#1DA9EF] text-[#1A2238] py-4"><TrendingUp className="h-4 w-4 mr-2" />Analítica</Button>
            <Link href="/dashboard/productos"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><Package className="h-4 w-4 mr-2" />Productos</Button></Link>
            <Link href="/dashboard/inventario"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><Boxes className="h-4 w-4 mr-2" />Inventario</Button></Link>
            <Link href="/dashboard/configuracion"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><Settings className="h-4 w-4 mr-2" />Configuración</Button></Link>
          </nav>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[#1A2238] mb-2">Analítica</h1>
            <p className="text-[#545454]">Productos por canal y comparativo YTD por familia/diseño.</p>
          </div>
          <div className="flex items-center gap-2">
            {activeTab === 'canal' && (
              <>
                <DateRangePicker date={dateRange} onDateChange={setDateRange} />
                <Button variant="outline" size="icon" onClick={fetchData} disabled={loading}>
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-[#E5E7EB] mb-6">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('canal')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'canal'
                  ? 'border-[#1DA9EF] text-[#1A2238]'
                  : 'border-transparent text-[#6B7280] hover:text-[#1A2238] hover:border-[#1DA9EF]/30'
              }`}
            >
              Productos por canal
            </button>
            <button
              onClick={() => setActiveTab('ytd')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'ytd'
                  ? 'border-[#1DA9EF] text-[#1A2238]'
                  : 'border-transparent text-[#6B7280] hover:text-[#1A2238] hover:border-[#1DA9EF]/30'
              }`}
            >
              YTD por familia y diseño
            </button>
            <button
              onClick={() => setActiveTab('mes')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'mes'
                  ? 'border-[#1DA9EF] text-[#1A2238]'
                  : 'border-transparent text-[#6B7280] hover:text-[#1A2238] hover:border-[#1DA9EF]/30'
              }`}
            >
              Mes vs año anterior
            </button>
          </div>
        </div>

        {activeTab === 'ytd' && <YtdFamiliasView />}
        {activeTab === 'mes' && <MesComparacionView />}

        {activeTab === 'canal' && <>

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
        </>}
      </main>
    </div>
  )
}
