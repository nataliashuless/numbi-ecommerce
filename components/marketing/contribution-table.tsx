'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { contributionCosts, divide, periodMonths, sumKnown, type CostField, type MonthlyCostUpdates, type MonthlyCosts } from '@/lib/marketing/contribution'
import type { MarketingExecutiveReport, PeriodMetrics } from '@/lib/marketing/metrics'
import { SALES_RECONCILIATION_PENDING } from '@/lib/sales/reconciliation-status'

type Traffic = { available: boolean; totals?: { totalUsers?: number } | null } | null
type Ads = { error?: string; totals?: { spend?: number; impressions?: number } } | null
const money = (value: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value)
const number = (value: number) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value)
const percentage = (value: number) => `${(value * 100).toFixed(1)}%`
const ratio = (value: number) => `${value.toFixed(2)}x`
const labels: Record<CostField, string> = { agencyFee: 'Fee mensual agencia', agencyVariable: 'Variable agencia (COP/mes)', natiFee: 'Nati · agencia', servers: 'Servidores', unitCost: 'Costo por par' }
const sourceUrl = 'https://docs.google.com/spreadsheets/d/18PIYecGjCDSN4aUYgP8vyrPPg0c877FNeEakqKlH2OU/edit?gid=2090211788'

export function ContributionTable({ report, currentAds, previousAds, currentTraffic, previousTraffic, costs, settingsAvailable, onSave }: {
  report: MarketingExecutiveReport
  currentAds: Ads; previousAds: Ads; currentTraffic: Traffic; previousTraffic: Traffic
  costs: MonthlyCosts; settingsAvailable: boolean
  onSave: (costs: MonthlyCostUpdates) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [month, setMonth] = useState(report.periods.current.end.slice(0, 7))
  const [draft, setDraft] = useState<Partial<Record<CostField, string>>>({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const comparison = report.filters.comparisonMode !== 'none'
  const months = Array.from(new Set([...periodMonths(report.periods.current), ...(comparison ? periodMonths(report.periods.previous) : [])])).sort().reverse()
  const selectedMonth = months.includes(month) ? month : report.periods.current.end.slice(0, 7)
  const periodValues = (metrics: PeriodMetrics, period: typeof report.periods.current, ads: Ads, traffic: Traffic) => {
    const spend = ads?.error ? null : ads?.totals?.spend ?? null
    const impressions = ads?.error ? null : ads?.totals?.impressions ?? null
    const users = traffic?.available ? traffic.totals?.totalUsers ?? null : null
    const fees = contributionCosts(period, metrics, costs)
    const marketing = sumKnown([spend, fees.agencyFee, fees.agencyVariable, fees.natiFee, fees.servers])
    const webOrders = metrics.channels.filter(channel => channel.key === 'web').reduce((sum, channel) => sum + channel.orders, 0)
    return { spend, impressions, users, ...fees, marketing, cvr: divide(webOrders, users), cpa: divide(spend, metrics.onlineOrders), marketingShare: divide(spend, metrics.netSales), ticket: divide(metrics.netSales, metrics.onlineOrders), costPerView: divide(spend, impressions), unitCost: divide(fees.shoes, metrics.units), contribution: marketing !== null && fees.shoes !== null ? metrics.netSales - marketing - fees.shoes : null }
  }
  const current = periodValues(report.current, report.periods.current, currentAds, currentTraffic)
  const previous = periodValues(report.previous, report.periods.previous, previousAds, previousTraffic)
  const salesComparable = comparison && !SALES_RECONCILIATION_PENDING && report.comparability.netSales
  const salesDelta = salesComparable ? report.current.netSales - report.previous.netSales : null
  const spendDelta = comparison && current.spend !== null && previous.spend !== null ? current.spend - previous.spend : null
  const marginal = salesDelta !== null && spendDelta !== null && spendDelta !== 0 ? salesDelta / spendDelta : null
  const rows: Array<{ label: string; current: number | null; previous: number | null; format: (n: number) => string; formula: string; highlight?: boolean }> = [
    { label: 'Usuarios', current: current.users, previous: previous.users, format: number, formula: 'Usuarios únicos GA4 del período' },
    { label: 'Pedidos online', current: report.current.onlineOrders, previous: report.previous.onlineOrders, format: number, formula: 'Pedidos del histórico compartido, contados una vez' },
    { label: 'Ventas brutas', current: report.commercialGrossSales?.current ?? null, previous: report.commercialGrossSales?.previous ?? null, format: money, formula: 'Valor de producto antes de descuentos e IVA, cuando todas las fuentes lo documentan' },
    { label: 'Crecimiento ventas netas', current: salesComparable ? divide(salesDelta, report.previous.netSales) : null, previous: null, format: percentage, formula: 'Ventas netas actuales ÷ comparadas − 1' },
    { label: 'CVR web', current: current.cvr, previous: previous.cvr, format: percentage, formula: 'Pedidos web (WooCommerce + Shopify) ÷ usuarios GA4' },
    { label: 'Impresiones', current: current.impressions, previous: previous.impressions, format: number, formula: 'Impresiones registradas por Meta' },
    { label: 'Importe gastado', current: current.spend, previous: previous.spend, format: money, formula: 'Publicidad Meta en las fechas seleccionadas' },
    { label: 'Costo por pedido', current: current.cpa, previous: previous.cpa, format: money, formula: 'Publicidad Meta ÷ pedidos online' },
    { label: 'Mkt / ventas netas', current: current.marketingShare, previous: previous.marketingShare, format: percentage, formula: 'Publicidad Meta ÷ ventas netas' },
    { label: 'Fee mensual agencia', current: current.agencyFee, previous: previous.agencyFee, format: money, formula: 'Costo del mes, prorrateado por días seleccionados' },
    { label: 'Variable agencia', current: current.agencyVariable, previous: previous.agencyVariable, format: money, formula: 'Variable mensual registrada, prorrateada por días' },
    { label: 'Nati · agencia', current: current.natiFee, previous: previous.natiFee, format: money, formula: 'Costo mensual registrado, prorrateado por días' },
    { label: 'Ticket medio neto', current: current.ticket, previous: previous.ticket, format: money, formula: 'Ventas netas ÷ pedidos online' },
    { label: 'Costo servidores', current: current.servers, previous: previous.servers, format: money, formula: 'Costo mensual registrado, prorrateado por días' },
    { label: 'Cost per view · impresión', current: current.costPerView, previous: previous.costPerView, format: value => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 1 }).format(value), formula: 'Publicidad Meta ÷ impresiones, como en el archivo' },
    { label: 'Variación ventas netas (COP)', current: salesDelta, previous: null, format: money, formula: 'Ventas netas actuales − comparadas' },
    { label: 'Variación publicidad (COP)', current: spendDelta, previous: null, format: money, formula: 'Publicidad actual − comparada' },
    { label: 'Retorno marginal', current: marginal, previous: null, format: ratio, formula: 'Variación ventas netas ÷ variación publicidad' },
    { label: 'Ventas netas', current: report.current.netSales, previous: report.previous.netSales, format: money, formula: 'Ventas de producto antes de IVA del tablero', highlight: true },
    { label: 'Pares vendidos', current: report.current.units, previous: report.previous.units, format: number, formula: 'Unidades del histórico compartido', highlight: true },
    { label: 'Costo promedio por par', current: current.unitCost, previous: previous.unitCost, format: money, formula: 'Costo total de pares ÷ unidades del período' },
    { label: 'Total gastos de marketing', current: current.marketing, previous: previous.marketing, format: money, formula: 'Publicidad + fee + variable + Nati + servidores', highlight: true },
    { label: 'Costo total de los pares', current: current.shoes, previous: previous.shoes, format: money, formula: 'Σ unidades de cada mes × costo por par de ese mes' },
    { label: 'CPA', current: current.cpa, previous: previous.cpa, format: money, formula: 'Publicidad Meta ÷ pedidos online' },
    { label: 'Contribución estimada', current: current.contribution, previous: previous.contribution, format: money, formula: 'Ventas netas − gastos de marketing − costo de pares', highlight: true },
  ]
  async function saveCosts() {
    setSaving(true); setMessage('')
    const values: Partial<Record<CostField, number | null>> = {}
    for (const [field, value] of Object.entries(draft)) values[field as CostField] = value === '' ? null : Number(value)
    try {
      await onSave({ [selectedMonth]: values })
      setDraft({}); setMessage('Costos guardados')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudieron guardar los costos') }
    finally { setSaving(false) }
  }
  const missingMonths = Array.from(new Set(current.missing.map(key => key.slice(0, 7))))
  return <Card className="border-0 shadow-sm" aria-label="Cálculo de marketing y contribución">
    <CardHeader className="flex flex-wrap flex-row items-start justify-between gap-3">
      <div><CardTitle className="text-xl text-[#172239]">Marketing y contribución</CardTitle><p className="mt-2 text-sm text-slate-500">{report.periods.current.start} al {report.periods.current.end}{comparison ? ` · comparado con ${report.periods.previous.start} al ${report.periods.previous.end}` : ''}</p></div>
      <Button variant="outline" onClick={() => { setEditing(!editing); setMessage('') }}>Costos mensuales</Button>
    </CardHeader>
    <CardContent className="space-y-4">
      <p className="text-xs text-slate-500">Ventas y pares usan las fuentes del tablero. Costos importados de la hoja <a href={sourceUrl} target="_blank" rel="noreferrer" className="underline">Monthly</a> hasta agosto de 2026. Los campos vacíos requieren un importe. Los costos fijos se prorratean por días.</p>
      {SALES_RECONCILIATION_PENDING && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Ventas, unidades y contribución son provisionales mientras se cierra la conciliación. Las variaciones de ventas y el retorno marginal quedan pendientes.</p>}
      {missingMonths.length > 0 && <p className="text-sm text-amber-800">Completa los costos de {missingMonths.join(', ')} para calcular toda la contribución.</p>}
      {editing && <div className="rounded-xl border bg-slate-50 p-4">
        <label className="text-sm font-medium">Mes<select value={selectedMonth} onChange={event => { setMonth(event.target.value); setDraft({}); setMessage('') }} className="ml-3 rounded border bg-white p-2">{months.map(month => <option key={month}>{month}</option>)}</select></label>
        <div className="my-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{(Object.entries(labels) as Array<[CostField, string]>).map(([field, label]) => <label key={field} className="text-sm">{label}<Input aria-label={`${label} ${selectedMonth}`} type="number" min="0" step="0.01" value={draft[field] ?? costs[selectedMonth]?.[field] ?? ''} placeholder="Pendiente" onChange={event => setDraft({ ...draft, [field]: event.target.value })} /></label>)}</div>
        <p className="mb-3 text-xs text-slate-500">Al vaciar un campo se restaura el importe del archivo, si existe.</p>
        <Button disabled={!settingsAvailable || saving || Object.keys(draft).length === 0} onClick={saveCosts}>{saving ? 'Guardando…' : 'Guardar costos del mes'}</Button>
        {!settingsAvailable && <p className="mt-2 text-sm text-amber-800">La configuración de costos aún no está disponible para guardar.</p>}
        {message && <p className="mt-2 text-sm" role="status">{message}</p>}
      </div>}
      <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Indicador</TableHead><TableHead className="text-right">Período actual</TableHead>{comparison && <TableHead className="text-right">Período comparado</TableHead>}<TableHead>Cálculo / fuente</TableHead></TableRow></TableHeader><TableBody>{rows.map(row => <TableRow key={row.label} className={row.highlight ? 'bg-slate-50 font-semibold' : ''}><TableCell>{row.label}</TableCell><TableCell className="whitespace-nowrap text-right">{row.current === null ? 'Pendiente / sin base' : row.format(row.current)}</TableCell>{comparison && <TableCell className="whitespace-nowrap text-right">{row.previous === null ? '—' : row.format(row.previous)}</TableCell>}<TableCell className="min-w-56 text-xs font-normal text-slate-500">{row.formula}</TableCell></TableRow>)}</TableBody></Table></div>
    </CardContent>
  </Card>
}
