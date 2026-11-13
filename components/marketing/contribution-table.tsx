'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { contributionCosts, divide, periodMonths, sumKnown, type CostField, type MonthlyCostUpdates, type MonthlyCosts } from '@/lib/marketing/contribution'
import type { MarketingExecutiveReport, PeriodMetrics } from '@/lib/marketing/metrics'
import type { DesignCostEstimate } from '@/lib/marketing/design-costs'
import { SALES_RECONCILIATION_PENDING } from '@/lib/sales/reconciliation-status'

type Traffic = { available: boolean; source?: string; totals?: { totalUsers?: number; conversionRate?: number | null } | null } | null
type Ads = { error?: string; totals?: { spend?: number; impressions?: number } } | null
const money = (value: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value)
const number = (value: number) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value)
const percentage = (value: number) => `${(value * 100).toFixed(1)}%`
const ratio = (value: number) => `${value.toFixed(2)}x`
const labels: Record<CostField, string> = { agencyFee: 'Fee mensual agencia', agencyVariable: 'Variable agencia (COP/mes)', natiFee: 'Nati · agencia', servers: 'Servidores', unitCost: 'Costo por par', contentFee: 'Contenido digital · agencia + Nati', platformFee: 'Plataforma Shopify' }
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
  const accountingDocuments = periodMonths(report.periods.current).flatMap(month => costs[month]?.platformAccounting?.documents ?? []).filter(document => document.date >= report.periods.current.start && document.date <= report.periods.current.end)
  const contentDocuments = periodMonths(report.periods.current).flatMap(month => costs[month]?.contentAccounting?.documents ?? []).filter(document => document.date >= report.periods.current.start && document.date <= report.periods.current.end)
  const periodValues = (metrics: PeriodMetrics, period: typeof report.periods.current, ads: Ads, traffic: Traffic, gross: number | null, estimate?: DesignCostEstimate) => {
    const spend = ads?.error ? null : ads?.totals?.spend ?? null
    const impressions = ads?.error ? null : ads?.totals?.impressions ?? null
    const users = traffic?.available ? traffic.totals?.totalUsers ?? null : null
    const fees = contributionCosts(period, metrics, costs, estimate)
    const marketing = sumKnown([spend, fees.agencyTotal, fees.servers, fees.platformFee])
    const webOrders = metrics.channels.filter(channel => channel.key === 'web').reduce((sum, channel) => sum + channel.orders, 0)
    return { spend, impressions, users, ...fees, marketing, cvr: traffic?.source === 'shopify' ? traffic.totals?.conversionRate ?? null : divide(webOrders, users), cpa: divide(spend, metrics.onlineOrders), marketingShare: divide(spend, gross), ticket: divide(gross, metrics.onlineOrders), costPerView: divide(spend, impressions), unitCost: divide(fees.shoes, metrics.units), contribution: marketing !== null && fees.shoes !== null ? metrics.netSales - marketing - fees.shoes : null }
  }
  const current = periodValues(report.current, report.periods.current, currentAds, currentTraffic, report.commercialGrossSales?.current ?? null, report.designCostEstimate?.current)
  const previous = periodValues(report.previous, report.periods.previous, previousAds, previousTraffic, report.commercialGrossSales?.previous ?? null, report.designCostEstimate?.previous)
  const salesComparable = comparison && !SALES_RECONCILIATION_PENDING && report.comparability.netSales
  const grossCurrent = report.commercialGrossSales?.current ?? null
  const grossPrevious = report.commercialGrossSales?.previous ?? null
  const salesDelta = salesComparable && grossCurrent !== null && grossPrevious !== null ? grossCurrent - grossPrevious : null
  const spendDelta = comparison && current.spend !== null && previous.spend !== null ? current.spend - previous.spend : null
  const marginal = salesDelta !== null && spendDelta !== null && spendDelta !== 0 ? salesDelta / spendDelta : null
  const rows: Array<{ label: string; current: number | null; previous: number | null; format: (n: number) => string; formula: string; highlight?: boolean }> = [
    { label: 'Usuarios', current: current.users, previous: previous.users, format: number, formula: 'Visitantes únicos Shopify del período; GA4 si Shopify no está disponible' },
    { label: 'Pedidos online', current: report.current.onlineOrders, previous: report.previous.onlineOrders, format: number, formula: 'Pedidos del histórico compartido, contados una vez' },
    { label: 'Ventas brutas', current: report.commercialGrossSales?.current ?? null, previous: report.commercialGrossSales?.previous ?? null, format: money, formula: 'Valor de producto antes de descuentos e IVA, cuando todas las fuentes lo documentan' },
    { label: 'Crecimiento ventas brutas', current: salesComparable ? divide(salesDelta, grossPrevious) : null, previous: null, format: percentage, formula: 'Ventas brutas actuales ÷ comparadas − 1' },
    { label: 'CVR web', current: current.cvr, previous: previous.cvr, format: percentage, formula: 'Shopify: sesiones con compra ÷ sesiones. En GA4: pedidos web ÷ usuarios' },
    { label: 'Impresiones', current: current.impressions, previous: previous.impressions, format: number, formula: 'Impresiones registradas por Meta' },
    { label: 'Importe gastado', current: current.spend, previous: previous.spend, format: money, formula: 'Publicidad Meta en las fechas seleccionadas' },
    { label: 'Costo por pedido', current: current.cpa, previous: previous.cpa, format: money, formula: 'Publicidad Meta ÷ pedidos online' },
    { label: 'Mkt / ventas brutas', current: current.marketingShare, previous: previous.marketingShare, format: percentage, formula: 'Publicidad Meta ÷ ventas brutas' },
    { label: 'Agencia + Nati · total', current: current.agencyTotal, previous: previous.agencyTotal, format: money, formula: 'Contenido digital contable; reemplaza fee + variable + Nati. Desde septiembre 2026: base antes de IVA y retenciones por fecha del documento Siigo' },
    { label: 'Agencia y contenido · subtotal documentado', current: current.agencyDocumented, previous: previous.agencyDocumented, format: money, formula: 'Gastos con soporte en las fechas elegidas; subtotal informativo, sin sumarlo dos veces. Noviembre solo cubre documentos revisados hasta el 12/11/2026' },
    { label: 'Plataforma Shopify', current: current.platformFee, previous: previous.platformFee, format: money, formula: 'Hasta agosto 2026: informe contable mensual. Septiembre y octubre: documentos Siigo por fecha contable, base antes de IVA, descontando reversiones. Noviembre pendiente' },
    { label: 'Shopify · subtotal documentado', current: current.platformDocumented, previous: previous.platformDocumented, format: money, formula: 'Importes contables disponibles + cargos bancarios identificados; subtotal informativo, sin sumarlo de nuevo a gastos. Puede faltar información' },
    { label: 'Fee mensual agencia', current: current.agencyFee, previous: previous.agencyFee, format: money, formula: 'Costo del mes, prorrateado por días seleccionados' },
    { label: 'Variable agencia', current: current.agencyVariable, previous: previous.agencyVariable, format: money, formula: 'Variable mensual registrada, prorrateada por días' },
    { label: 'Nati · agencia', current: current.natiFee, previous: previous.natiFee, format: money, formula: 'Costo mensual registrado, prorrateado por días' },
    { label: 'Ticket medio', current: current.ticket, previous: previous.ticket, format: money, formula: 'Ventas brutas ÷ pedidos online' },
    { label: 'Costo servidores', current: current.servers, previous: previous.servers, format: money, formula: 'Renovación HostGator: $305.400 ÷ 365 días de servicio, del 04/08/2026 al 03/08/2027. Reemplaza el cargo anual de agosto' },
    { label: 'Cost per view · impresión', current: current.costPerView, previous: previous.costPerView, format: value => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 1 }).format(value), formula: 'Publicidad Meta ÷ impresiones, como en el archivo' },
    { label: 'Variación ventas brutas (COP)', current: salesDelta, previous: null, format: money, formula: 'Ventas brutas actuales − comparadas' },
    { label: 'Variación publicidad (COP)', current: spendDelta, previous: null, format: money, formula: 'Publicidad actual − comparada' },
    { label: 'Retorno marginal', current: marginal, previous: null, format: ratio, formula: 'Variación ventas brutas ÷ variación publicidad' },
    { label: 'Ventas netas', current: report.current.netSales, previous: report.previous.netSales, format: money, formula: 'Ventas de producto antes de IVA del tablero', highlight: true },
    { label: 'Pares vendidos', current: report.current.units, previous: report.previous.units, format: number, formula: 'Unidades del histórico compartido', highlight: true },
    { label: 'Costo promedio por par', current: current.unitCost, previous: previous.unitCost, format: money, formula: 'Costo total de pares ÷ unidades del período' },
    { label: 'Total gastos de marketing', current: current.marketing, previous: previous.marketing, format: money, formula: 'Publicidad Meta + agencia/Nati total + servidores + plataforma registrada', highlight: true },
    { label: 'Costo total de los pares', current: current.shoes, previous: previous.shoes, format: money, formula: 'Hasta agosto: costo mensual. Desde septiembre 2026: OC 32 por diseño; faltantes de septiembre y octubre: costo promedio mensual Siigo por SKU y talla. Requiere cobertura completa' },
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
  const missingCosts = Array.from(new Set(current.missing.map(key => {
    const [month, field] = key.split(':')
    return `${month}: ${field === 'agencyTotal' ? 'agencia y contenido' : field === 'unitCost' ? 'costo de pares' : field === 'platformFee' ? 'Shopify' : field === 'servers' ? 'hosting' : 'honorarios'}`
  })))
  return <Card className="border-0 shadow-sm" aria-label="Cálculo de marketing y contribución">
    <CardHeader className="flex flex-wrap flex-row items-start justify-between gap-3">
      <div><CardTitle className="text-xl text-[#172239]">Marketing y contribución</CardTitle><p className="mt-2 text-sm text-slate-500">{report.periods.current.start} al {report.periods.current.end}{comparison ? ` · comparado con ${report.periods.previous.start} al ${report.periods.previous.end}` : ''}</p></div>
      <Button variant="outline" onClick={() => { setEditing(!editing); setMessage('') }}>Costos mensuales</Button>
    </CardHeader>
    <CardContent className="space-y-4">
      <p className="text-xs text-slate-500">Visitantes y conversión provienen de Shopify y solo cubren su tienda, incluido 2025 desde la migración; no el tráfico antiguo de WooCommerce. Publicidad e impresiones provienen de Meta.</p>
      <p className="text-xs text-slate-500">Ventas y pares usan las fuentes del tablero. Costos importados de la hoja <a href={sourceUrl} target="_blank" rel="noreferrer" className="underline">Monthly</a> hasta agosto de 2026. Los campos vacíos requieren un importe. Los costos fijos se prorratean por días.</p>
      <p className="text-xs text-slate-500">El <a href="https://docs.google.com/spreadsheets/d/1AOLNHHLWNzdz8LW-zC62sqqLnw5U2QC_/edit" target="_blank" rel="noreferrer" className="underline">modelo contable</a> completa contenido digital (agencia + Nati juntos), plataforma Shopify, hosting Hostgator y costo promedio por par hasta agosto de 2026. El total contable de contenido reemplaza los honorarios separados, sin sumarlos dos veces. El costo por par es una estimación general del modelo; mayo de 2026 conserva Monthly porque el modelo usa unidades presupuestadas. Las proyecciones posteriores no se toman como gastos reales.</p>
      {contentDocuments.length > 0 && <details className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm" open>
        <summary className="cursor-pointer font-semibold">Agencia y contenido digital · gastos de Siigo</summary>
        <p className="my-2">Revisión al 12/11/2026, cuenta 52356004. Septiembre: $2.061.189,90; octubre: $1.429.333; noviembre: $1.000.000 registrado hasta el corte, no una proyección del mes completo. Se toma la base del gasto antes de IVA y retenciones por fecha contable. Este total reemplaza agencia + variable + Nati, sin añadir sus pagos de nuevo. No se encontraron reversiones en las fuentes consultadas.</p>
        <Table><TableHeader><TableRow><TableHead>Fecha contable</TableHead><TableHead>Documento</TableHead><TableHead>Concepto</TableHead><TableHead className="text-right">Base del gasto COP</TableHead></TableRow></TableHeader><TableBody>{contentDocuments.sort((a, b) => a.date.localeCompare(b.date)).map(document => <TableRow key={document.id}><TableCell>{document.date}</TableCell><TableCell>{document.name}</TableCell><TableCell>{document.description}</TableCell><TableCell className="text-right">{new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 2 }).format(document.amount)}</TableCell></TableRow>)}</TableBody></Table>
        <p className="mt-2 text-xs">FC-1-618 corresponde a comisiones de ventas de agosto, contabilizadas el 7 de octubre: se conserva en octubre según Siigo. El importe pagado puede diferir por IVA y retenciones. No se suman los comprobantes de pago como otro gasto.</p>
      </details>}
      <p className="rounded-lg bg-sky-50 p-3 text-sm text-slate-700">Hosting verificado: factura HostGator 6685364, pago de $305.400 el 4 de agosto de 2026. Se distribuye por días de servicio hasta el 3 de agosto de 2027 (equivalente promedio: $25.450/mes). Agosto ya no carga el año completo. Los períodos parciales solo incluyen sus días de servicio; no incluye intereses de financiación.</p>
      <p className="text-xs text-slate-500">Shopify en el <a href="https://docs.google.com/spreadsheets/d/1GGxFjVCULalQy8scTBDMGTnj54s0SgyD/edit" target="_blank" rel="noreferrer" className="underline">informe contable</a>, ER 2026, C113:J113: $5.715.254,14 registrados de enero a agosto de 2026. Se conservan esos importes en pesos, prorrateados si seleccionas parte de un mes. Septiembre a noviembre están vacíos en el archivo; no se interpretan como cero ni como cobros verificados.</p>
      {accountingDocuments.length > 0 && <details className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm" open>
        <summary className="cursor-pointer font-semibold">Shopify · gastos contables de Siigo</summary>
        <p className="my-2">Consulta al 12/11/2026, cuenta 52356005. Septiembre: $1.351.041,07; octubre: $1.261.548,47. Se usa la fecha del documento Siigo, sin prorratear el gasto ni añadir el IVA descontable del exterior. La reversión CC-7-4 resta $145.275 de septiembre. El cargo bancario de $151.439 ya está incluido en DS-1-314 y no se suma nuevamente. Estos son gastos contabilizados, no una certificación de todos los cobros bancarios.</p>
        <Table><TableHeader><TableRow><TableHead>Fecha contable</TableHead><TableHead>Documento Siigo</TableHead><TableHead className="text-right">Gasto / reversión COP</TableHead></TableRow></TableHeader><TableBody>{accountingDocuments.sort((a, b) => a.date.localeCompare(b.date)).map(document => <TableRow key={document.id}><TableCell>{document.date}</TableCell><TableCell>{document.name}</TableCell><TableCell className="text-right">{new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 2 }).format(document.amount)}</TableCell></TableRow>)}</TableBody></Table>
        <p className="mt-2 text-xs">Siigo registra también los débitos antes pendientes de identificar en el banco. Se incluyen bajo su clasificación contable Shopify; la asignación de cada uno a una factura del proveedor sigue pendiente. DS-1-310 y DS-1-311 tienen el mismo importe, pero son documentos distintos en fechas diferentes: no se eliminan solo por coincidir el valor.</p>
      </details>}
      {periodMonths(report.periods.current).some(month => costs[month]?.platformReview) && <details className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm" open>
        <summary className="cursor-pointer font-semibold">Shopify · cobros en pesos y conciliación pendiente</summary>
        <p className="my-2">Noviembre: no se encontraron compras, documentos soporte ni gastos en comprobantes contables de Shopify hasta el 12/11/2026. Hay facturas del proveedor aún sin cruce completo: se conserva pendiente, no cero. No se suma un pago de noviembre otra vez si su gasto ya quedó registrado en octubre. Mientras falten importes del período, el total Shopify y la contribución quedan pendientes.</p>
        <Table><TableHeader><TableRow><TableHead>Fecha factura / cargo</TableHead><TableHead>Factura Shopify</TableHead><TableHead>USD</TableHead><TableHead>Cobro COP verificado</TableHead></TableRow></TableHeader><TableBody>{periodMonths(report.periods.current).flatMap(month => costs[month]?.platformReview?.charges ?? []).filter(charge => charge.date >= report.periods.current.start && charge.date <= report.periods.current.end).map(charge => <TableRow key={charge.invoice}><TableCell>{charge.date}</TableCell><TableCell>{charge.invoice}</TableCell><TableCell>{charge.usd.toFixed(2)}</TableCell><TableCell>{charge.cop === null ? 'Pendiente de cruce bancario' : money(charge.cop)}</TableCell></TableRow>)}</TableBody></Table>
        <p className="mt-2 text-xs">Los importes en USD son informativos: no se convierten con una TRM estimada ni se agregan a los documentos de Siigo.</p>
      </details>}
      {report.designCostEstimate && report.designCostEstimate.current.units > 0 && <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-slate-700">
        <p><a href={report.designCostEstimate.current.sourceUrl} target="_blank" rel="noreferrer" className="font-semibold underline">Costo de pares · OC 32 + costeo mensual Siigo</a>. Tienen costo válido {number(report.designCostEstimate.current.coveredUnits)} de {number(report.designCostEstimate.current.units)} unidades del período. Subtotal de unidades con costo: {money(report.designCostEstimate.current.knownCost)}. Este subtotal no representa el costo total si quedan diseños pendientes.</p>
        {report.designCostEstimate.current.siigo && report.designCostEstimate.current.months.some(row => ['2026-09', '2026-10'].includes(row.month)) && <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-slate-800">
          <p className="font-semibold">Pares pendientes completados con Siigo · septiembre y octubre de 2026</p>
          <p className="mt-1">Los informes de costeo mensual de Siigo de septiembre y octubre, revisados el 12/11/2026, completan Silver, Plateado y Colegial Azul por SKU y talla. Se aplica el costo promedio de la columna D del informe del mismo mes de la venta. OC 32 conserva sus estimados válidos: no se reemplazan ni se suman dos veces.</p>
          <p className="mt-2">En estas fechas y filtros, Siigo completa {number(report.designCostEstimate.current.siigo.units)} pares por {money(report.designCostEstimate.current.siigo.cost)}. Básico Niña WC-1112 y Colegial Negro 181/183 conservan el estimado de OC 32. Los costos Siigo de septiembre y octubre no se trasladan a noviembre.</p>
          <Table><TableHeader><TableRow><TableHead>Mes</TableHead><TableHead>Unidades</TableHead><TableHead>Con costo válido</TableHead><TableHead>Pendientes</TableHead><TableHead>Costo total de pares</TableHead></TableRow></TableHeader><TableBody>{report.designCostEstimate.current.months.filter(row => ['2026-09', '2026-10'].includes(row.month)).map(row => <TableRow key={row.month}><TableCell>{row.month}</TableCell><TableCell>{number(row.units)}</TableCell><TableCell>{number(row.coveredUnits)}</TableCell><TableCell>{number(row.units - row.coveredUnits)}</TableCell><TableCell>{row.units === row.coveredUnits ? money(row.knownCost) : 'Pendiente'}</TableCell></TableRow>)}</TableBody></Table>
          <details className="mt-2"><summary className="cursor-pointer font-medium">Ver costos Siigo por SKU y mes</summary><Table><TableHeader><TableRow><TableHead>Mes / SKU</TableHead><TableHead>Producto</TableHead><TableHead>Pares online</TableHead><TableHead>Costo promedio Siigo</TableHead><TableHead>Subtotal</TableHead><TableHead>Celda origen</TableHead></TableRow></TableHeader><TableBody>{report.designCostEstimate.current.siigo.entries.map(row => <TableRow key={`${row.month}:${row.sku}`}><TableCell>{row.month} · {row.sku}</TableCell><TableCell>{row.product}</TableCell><TableCell>{number(row.units)}</TableCell><TableCell>{money(row.unitCost)}</TableCell><TableCell>{money(row.cost)}</TableCell><TableCell>{row.sheet}!{row.cell}</TableCell></TableRow>)}</TableBody></Table></details>
        </div>}
        <details className="mt-2"><summary className="cursor-pointer font-medium">Ver costo y cobertura por diseño</summary><Table><TableHeader><TableRow><TableHead>Diseño / categoría</TableHead><TableHead>Unidades</TableHead><TableHead>Costo estimado por par</TableHead></TableRow></TableHeader><TableBody>{report.designCostEstimate.current.designs.map(row => <TableRow key={`${row.category}:${row.design}`}><TableCell>{row.design} · {row.category}</TableCell><TableCell>{number(row.units)}</TableCell><TableCell>{row.unitCost === null ? 'Pendiente: sin costo válido' : money(row.unitCost)}</TableCell></TableRow>)}</TableBody></Table></details>
      </div>}
      {(grossCurrent === null || comparison && grossPrevious === null) && <p className="text-xs text-slate-500">El importe bruto y sus ratios requieren precios anteriores a descuentos en todas las ventas del período. El histórico con solo importe neto queda pendiente en esas filas.</p>}
      {SALES_RECONCILIATION_PENDING && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Ventas, unidades y contribución son provisionales mientras se cierra la conciliación. Las variaciones de ventas y el retorno marginal quedan pendientes.</p>}
      {missingCosts.length > 0 && <p className="text-sm text-amber-800">La contribución completa sigue pendiente por: {missingCosts.join('; ')}.</p>}
      {editing && <div className="rounded-xl border bg-slate-50 p-4">
        <label className="text-sm font-medium">Mes<select value={selectedMonth} onChange={event => { setMonth(event.target.value); setDraft({}); setMessage('') }} className="ml-3 rounded border bg-white p-2">{months.map(month => <option key={month}>{month}</option>)}</select></label>
        <div className="my-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{(Object.entries(labels) as Array<[CostField, string]>).map(([field, label]) => <label key={field} className="text-sm">{label}<Input aria-label={`${label} ${selectedMonth}`} type="number" min="0" step="0.01" disabled={field === 'unitCost' && selectedMonth >= '2026-09' || field === 'servers' && !!costs[selectedMonth]?.hostingService || ['agencyFee', 'agencyVariable', 'natiFee', 'contentFee'].includes(field) && !!costs[selectedMonth]?.contentAccounting || field === 'platformFee' && (!!costs[selectedMonth]?.platformReview || !!costs[selectedMonth]?.platformAccounting)} value={draft[field] ?? costs[selectedMonth]?.[field] ?? ''} placeholder="Pendiente" onChange={event => setDraft({ ...draft, [field]: event.target.value })} /></label>)}</div>
        <p className="mb-3 text-xs text-slate-500">Al vaciar un campo se restaura el importe del archivo, si existe. Desde septiembre de 2026 el costo por par se calcula por diseño con OC 32. El hosting con soporte se calcula por contrato; agencia y contenido con soporte usan los documentos de Siigo. Shopify pendiente requiere conciliación.</p>
        <Button disabled={!settingsAvailable || saving || Object.keys(draft).length === 0} onClick={saveCosts}>{saving ? 'Guardando…' : 'Guardar costos del mes'}</Button>
        {!settingsAvailable && <p className="mt-2 text-sm text-amber-800">La configuración de costos aún no está disponible para guardar.</p>}
        {message && <p className="mt-2 text-sm" role="status">{message}</p>}
      </div>}
      <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Indicador</TableHead><TableHead className="text-right">Período actual</TableHead>{comparison && <TableHead className="text-right">Período comparado</TableHead>}<TableHead>Cálculo / fuente</TableHead></TableRow></TableHeader><TableBody>{rows.filter(row => !Object.values(costs).some(month => month.contentFee !== undefined) || !['Fee mensual agencia', 'Variable agencia', 'Nati · agencia'].includes(row.label)).map(row => <TableRow key={row.label} className={row.highlight ? 'bg-slate-50 font-semibold' : ''}><TableCell>{row.label}</TableCell><TableCell className="whitespace-nowrap text-right">{row.current === null ? 'Pendiente / sin base' : row.format(row.current)}</TableCell>{comparison && <TableCell className="whitespace-nowrap text-right">{row.previous === null ? '—' : row.format(row.previous)}</TableCell>}<TableCell className="min-w-56 text-xs font-normal text-slate-500">{row.formula}</TableCell></TableRow>)}</TableBody></Table></div>
    </CardContent>
  </Card>
}
