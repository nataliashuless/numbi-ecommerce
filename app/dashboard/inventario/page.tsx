'use client'

import { useEffect, useState, useMemo, Fragment } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Package,
  Store,
  Loader2,
  LogOut,
  Warehouse,
  BarChart3,
  MessageCircle,
  ShoppingCart,
  Boxes,
  Search,
  TrendingUp,
  AlertTriangle,
  Clock,
  Factory,
  Settings,
  FileText,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Tent,
  Megaphone,
  Download,
  RefreshCw,
  Truck,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Tienda {
  id: string
  nombre: string
}

interface VariantItem {
  sku: string
  size: string | null
  description: string
  bodega: number
  bodegaCalera: number
  bodegaEkho: number
  tiendas: { [tiendaId: string]: number }
  totalConsignado: number
  total: number
}

interface ReferenceItem {
  reference: string
  variantCount: number
  bodega: number
  bodegaCalera: number
  bodegaEkho: number
  tiendas: { [tiendaId: string]: number }
  totalConsignado: number
  total: number
  variants: VariantItem[]
}

interface InventarioData {
  referencias: ReferenceItem[]
  tiendas: Tienda[]
  totales: {
    referencias: number
    skus: number
    bodega: number
    consignado: number
    total: number
  }
}

interface StoreDispatch {
  tiendaId: string
  nombre: string
  stockTienda: number
  demandaMes: number
  seguridad: number
  cantidad: number
}

interface ForecastItem {
  sku: string
  producto: string
  variante: string
  size: string | null
  description: string
  imagen: string | null
  stockBodega: number
  stockConsignado: number
  stockTotal: number
  enCamino: number
  ventasShopify: number
  ventasWhatsApp: number
  ventasTiendas: number
  ventasTotal: number
  ventasPeriodoEstacional: number
  velocidadDiariaReciente: number
  velocidadDiariaEstacional: number
  demandaFuente: 'reciente' | 'estacional'
  velocidadDiaria: number
  velocidadSemanal: number
  diasHastaAgotamiento: number | null
  enviarTiendas?: number
  enviosTiendas?: StoreDispatch[]
  faltanteAntesLlegada?: number
  primeraFechaFaltante?: string | null
  produccionSinReserva?: number
  produccionPorReserva?: number
  conciliacion?: { stockInicial: number; llegadaProduccion: string; entradas: Array<{ fecha: string; pares: number }>; necesidades: Array<{ fecha: string; pares: number; reservaRecuperable: number }> }
  sugerenciaProduccion: number
  prioridad: 'critica' | 'alta' | 'media' | 'baja'
}

interface ForecastReference {
  reference: string
  variantCount: number
  stockBodega: number
  stockConsignado: number
  stockTotal: number
  enCamino: number
  ventasTotal: number
  ventasTiendas: number
  ventasPeriodoEstacional: number
  velocidadDiaria: number
  enviarTiendas?: number
  faltanteAntesLlegada?: number
  primeraFechaFaltante?: string | null
  sugerenciaProduccion: number
  prioridad: 'critica' | 'alta' | 'media' | 'baja'
  variants: ForecastItem[]
}

interface ForecastData {
  feriaEva?: { incluida: boolean; demandaHistoricaComparable: number; demandaIncluida: number; supuesto: string }
  crecimientoObservado?: Array<{ canal: string; recent: number; previous: number; factor: number; observed: boolean; mesesActuales: string[]; mesesComparables: string[] }>
  validacion?: { revisionReferencias?: Array<{ referencia: string; produccion: number; error: number | null; errorAnterior?: number | null; errorBase: number | null; canalesEvaluados: number; canalesSinEvaluar: number }>; porCanal?: Array<{ canal: string; series: number; error: number | null; errorBase: number | null }>; horizonteMeses: number; errorAnterior?: number | null; errorModelo: number | null; errorBase: number | null; seriesEvaluadas: number; seriesSinEvaluar: number; observations: number; alcance: string }
  auditoria?: Array<{ referencia: string; canal: string; modelo: string; mesesHistoria: number; meses: string[]; fuentes: string[]; vendidoMes?: number; proyeccionCompleta?: number[]; demanda: number[]; reserva: number; evidencia: string; historial: Array<{ mes: string; pares: number }> }>

  cobertura?: { fechaLlegadaProduccion: string; faltanteAntesLlegada: number; distribucion: string }
  tiendasForecast?: Array<{ id: string; nombre: string; incluida: boolean; tieneBodega: boolean }>
  reposicionTiendas?: { mes: string; tiendasSinBodega: number }
  forecast: ForecastItem[]
  referencias: ForecastReference[]
  enCamino?: {
    totalUnidades: number
    matchUnidades: number
    sinMatch: Array<{ label: string; unidades: number }>
  }
  bodegas?: Array<{ id: number; name: string; bucket: 'bodega' | 'consignado'; units: number }>

  resumen: {
    totalSkus: number
    totalReferencias: number
    criticos: number
    altos: number
    medios: number
    bajos: number
    totalProduccionSinReserva?: number
    totalProduccionPorReserva?: number
    totalProducirSugerido: number
    totalVentasPeriodo: number
    totalVentasOnline: number
    totalVentasWhatsApp: number
    totalVentasTiendas: number
    totalVentasPeriodoEstacional: number
    skusConAjusteEstacional: number
  }
  parametros: {
    diasAnalisis: number
    leadTimeDias: number
    stockSeguridad: number
    fechaInicio: string
    fechaFin: string
    horizonteDias: number
    fechaInicioEstacional: string
    fechaFinEstacional: string
  }
}

function getInventoryBadge(cantidad: number) {
  if (cantidad === 0) {
    return <Badge className="bg-red-500">0</Badge>
  }
  if (cantidad <= 5) {
    return <Badge className="bg-yellow-500">{cantidad}</Badge>
  }
  return <Badge className="bg-green-500">{cantidad}</Badge>
}

function getPriorityBadge(prioridad: string) {
  switch (prioridad) {
    case 'critica':
      return <Badge className="bg-red-600">Urgente</Badge>
    case 'alta':
      return <Badge className="bg-orange-500">Alta</Badge>
    case 'media':
      return <Badge className="bg-yellow-500">Media</Badge>
    default:
      return <Badge variant="secondary">Baja</Badge>
  }
}

export default function InventarioPage() {
  const [inventarioData, setInventarioData] = useState<InventarioData | null>(null)
  const [forecastData, setForecastData] = useState<ForecastData | null>(null)
  const [loading, setLoading] = useState(true)
  const [forecastLoading, setForecastLoading] = useState(false)
  const [excludedStoreIds, setExcludedStoreIds] = useState<string[]>([])
  const [storeSelectionError, setStoreSelectionError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedRefs, setExpandedRefs] = useState<Set<string>>(new Set())
  const [tiendasExpanded, setTiendasExpanded] = useState(false)
  const [expandedForecastRefs, setExpandedForecastRefs] = useState<Set<string>>(new Set())
  // Per-variant "which tiendas have this" breakdown (keyed by SKU)
  const [expandedVariantSkus, setExpandedVariantSkus] = useState<Set<string>>(new Set())
  function toggleVariantSku(sku: string) {
    setExpandedVariantSkus(prev => {
      const next = new Set(prev)
      if (next.has(sku)) next.delete(sku)
      else next.add(sku)
      return next
    })
  }
  function toggleRef(reference: string) {
    setExpandedRefs(prev => {
      const next = new Set(prev)
      if (next.has(reference)) next.delete(reference)
      else next.add(reference)
      return next
    })
  }
  function toggleForecastRef(reference: string) {
    setExpandedForecastRefs(prev => {
      const next = new Set(prev)
      if (next.has(reference)) next.delete(reference)
      else next.add(reference)
      return next
    })
  }
  const [forecastSearchTerm, setForecastSearchTerm] = useState('')
  const [filter, setFilter] = useState<'all' | 'low' | 'out'>('all')
  const [forecastFilter, setForecastFilter] = useState<'all' | 'critica' | 'alta' | 'media'>('all')
  const [activeTab, setActiveTab] = useState('inventario')
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('tab') === 'forecast') setActiveTab('forecast')
  }, [])

  // Forecast parameters
  const [diasAnalisis, setDiasAnalisis] = useState('90')
  const [leadTime, setLeadTime] = useState('52')
  const [stockSeguridad, setStockSeguridad] = useState('0')
  // Store stock is already netted independently by location in the backend.
  // Never pool it here or subtract it a second time from production needs.
  const incluirConsignado = false

  const [lastStockSync, setLastStockSync] = useState<string | null>(null)
  const [syncingStock, setSyncingStock] = useState(false)

  // Backend is the single source of truth for production, coverage and priority.
  const forecastKpis = useMemo(() => {
    const empty = { totalProducir: 0, criticos: 0, altos: 0, medios: 0 }
    if (!forecastData) return empty
    const out = { ...empty }
    for (const r of forecastData.referencias) {
      for (const v of r.variants) {
        out.totalProducir += v.sugerenciaProduccion
        if (v.prioridad === 'critica') out.criticos += 1
        else if (v.prioridad === 'alta') out.altos += 1
        else if (v.prioridad === 'media') out.medios += 1
      }
    }
    return out
  }, [forecastData])
  const totalProducirToggle = forecastKpis.totalProducir
  const seasonalReview = (forecastData?.auditoria || []).filter(row => ['Shopify', 'WhatsApp'].includes(row.canal)).flatMap(row => row.meses.flatMap((month, i) => {
    if (!['11', '12', '01'].includes(month.slice(5))) return []
    const previousMonth = `${Number(month.slice(0, 4)) - 1}${month.slice(4)}`
    const previous = row.historial.find(item => item.mes === previousMonth)?.pares
    return previous != null && previous > row.demanda[i] ? [{ referencia: row.referencia, canal: row.canal, mes: month, anterior: previous, proyeccion: row.demanda[i] }] : []
  })).sort((a, b) => (b.anterior - b.proyeccion) - (a.anterior - a.proyeccion))


  async function fetchInventario() {
    try {
      const res = await fetch('/api/inventario')
      if (res.status === 401) {
        window.location.href = '/api/auth/shopify'
        return
      }
      if (!res.ok) {
        throw new Error('Error al cargar inventario')
      }
      const json = await res.json()
      setInventarioData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  // Pull fresh stock from Siigo into the cache, then re-read inventory
  // (and forecast if already computed) so the page reflects current numbers.
  async function syncStockFromSiigo() {
    setSyncingStock(true)
    try {
      const res = await fetch('/api/siigo/sync-stock', { method: 'POST' })
      if (res.ok) {
        const d = await res.json()
        setLastStockSync(d.synced_at || new Date().toISOString())
        await fetchInventario()
        if (forecastData) await fetchForecast()
      }
    } catch {}
    finally {
      setSyncingStock(false)
    }
  }

  useEffect(() => {
    ;(async () => {
      await fetchInventario()
      // Check cache freshness; if older than 1 hour (or never synced),
      // refresh from Siigo in the background.
      try {
        const res = await fetch('/api/siigo/sync-stock')
        if (res.ok) {
          const d = await res.json()
          setLastStockSync(d.last_sync)
          const ageMs = d.last_sync ? Date.now() - new Date(d.last_sync).getTime() : Infinity
          if (ageMs > 60 * 60 * 1000) {
            syncStockFromSiigo()
          }
        }
      } catch {}
    })()
  }, [])

  const fetchForecast = async () => {
    setForecastLoading(true)
    try {
      setStoreSelectionError(null)
      const saved: unknown = JSON.parse(localStorage.getItem('shuless.forecast.excludedStores') || '[]')
      const excluded = Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : []
      const eva = localStorage.getItem('shuless.forecast.eva.' + new Intl.DateTimeFormat('en', { timeZone: 'America/Bogota', year: 'numeric' }).format(new Date())) === 'true'
      const res = await fetch(`/api/forecast?incluir_eva=${eva}&dias=${diasAnalisis}&lead_time=${leadTime}&stock_seguridad=${stockSeguridad}&excluir_tiendas=${encodeURIComponent(excluded.join(','))}`)
      if (!res.ok) {
        const failure = await res.json().catch(() => null)
        throw new Error(failure?.error || 'Error al cargar forecast')
      }
      const json = await res.json()
      setForecastData(json)
      setExcludedStoreIds((json.tiendasForecast || []).filter((store: { incluida: boolean }) => !store.incluida).map((store: { id: string }) => store.id))
    } catch (err) {
      setForecastData(null)
      setStoreSelectionError(err instanceof Error ? err.message : 'No se pudo calcular el forecast')
      console.error('Error fetching forecast:', err)
    } finally {
      setForecastLoading(false)
    }
  }

  async function changeEvaAttendance(included: boolean) {
    try {
      const year = new Intl.DateTimeFormat('en', { timeZone: 'America/Bogota', year: 'numeric' }).format(new Date())
      localStorage.setItem('shuless.forecast.eva.' + year, String(included))
      await fetchForecast()
    } catch { setStoreSelectionError('No se pudo guardar la selección de EVA en este navegador.') }
  }

  async function applyStoreSelection() {
    try {
      localStorage.setItem('shuless.forecast.excludedStores', JSON.stringify(excludedStoreIds))
      await fetchForecast()
    } catch {
      setStoreSelectionError('No se pudo guardar la selección en este navegador. Habilita el almacenamiento y vuelve a intentar.')
    }
  }

  function downloadForecastExcel() {
    if (!forecastData) return
    const PRIORIDAD_LABEL: Record<string, string> = {
      critica: 'Crítica (≤7 días)',
      alta: 'Alta (≤14 días)',
      media: 'Media (≤30 días)',
      baja: 'Baja',
    }
    const suggestFor = (f: ForecastItem): number => f.sugerenciaProduccion

    // Export the production estimate for review: omit SKUs
    // that do not need units and sort references alphabetically.
    const orderedForecast = forecastData.forecast
      .filter(f => suggestFor(f) > 0)
      .sort((a, b) => {
        const byReference = a.producto.localeCompare(b.producto, 'es', { sensitivity: 'base' })
        if (byReference !== 0) return byReference
        return (a.size || '').localeCompare(b.size || '', 'es', { numeric: true })
      })

    // Sheet 1: Detalle por variante (SKU)
    const detalle = orderedForecast.map(f => ({
      'SKU': f.sku,
      'Producto': f.producto,
      'Variante': f.variante,
      'Talla': f.size || '',
      'Stock bodega': f.stockBodega,
      'Stock consignado': f.stockConsignado,
      'Stock total': f.stockTotal,
      'En camino': f.enCamino,
      'Faltante antes de llegada': f.faltanteAntesLlegada ?? 0,
      'Primera fecha de faltante': f.primeraFechaFaltante || '',
      'Enviar a tiendas': f.enviarTiendas ?? '',
      'Ventas Shopify': f.ventasShopify,
      'Ventas WhatsApp': f.ventasWhatsApp,
      'Ventas Tiendas': f.ventasTiendas,
      'Ventas totales': f.ventasTotal,
      'Ventas período estacional año anterior': f.ventasPeriodoEstacional,
      'Velocidad diaria reciente': f.velocidadDiariaReciente,
      'Velocidad diaria estacional': f.velocidadDiariaEstacional,
      'Demanda usada': f.demandaFuente === 'estacional' ? 'Estacionalidad año anterior' : 'Ventas recientes',
      'Velocidad diaria': Number(f.velocidadDiaria.toFixed(2)),
      'Velocidad semanal': Number(f.velocidadSemanal.toFixed(2)),
      'Días hasta agotamiento': f.diasHastaAgotamiento ?? '∞',
      'Producción sin reserva': f.produccionSinReserva ?? '',
      'Producción adicional por reserva': f.produccionPorReserva ?? '',
      'Sugerencia producción': suggestFor(f),
      'Prioridad': PRIORIDAD_LABEL[f.prioridad] || f.prioridad,
    }))

    // Sheet 2: Resumen por referencia
    const resumen = (forecastData.referencias || [])
      .map(r => ({
        reference: r,
        suggestion: r.variants.reduce((s, v) => s + suggestFor(v), 0),
      }))
      .filter(({ suggestion }) => suggestion > 0)
      .sort((a, b) => a.reference.reference.localeCompare(b.reference.reference, 'es', { sensitivity: 'base' }))
      .map(({ reference: r, suggestion }) => ({
      'Referencia': r.reference,
      'Variantes': r.variantCount,
      'Stock bodega': r.stockBodega,
      'Stock consignado': r.stockConsignado,
      'Stock total': r.stockTotal,
      'En camino': r.enCamino,
      'Enviar a tiendas': r.enviarTiendas ?? '',
      'Ventas totales': r.ventasTotal,
      'Ventas tiendas': r.ventasTiendas,
      'Ventas período estacional año anterior': r.ventasPeriodoEstacional,
      'Promedio mensual tiendas': Number((r.ventasTiendas * 30 / (parseInt(diasAnalisis) || 1)).toFixed(1)),
      'Velocidad diaria': Number(r.velocidadDiaria.toFixed(2)),
      'Sugerencia producción': suggestion,
      'Prioridad': PRIORIDAD_LABEL[r.prioridad] || r.prioridad,
      }))

    // Sheet 3: Parámetros usados
    const parametros = [
      { Parámetro: 'Asistencia a Feria EVA', Valor: forecastData.feriaEva?.incluida ? 'Sí' : 'No' },
      { Parámetro: 'Demanda EVA incluida (pares)', Valor: String(forecastData.feriaEva?.demandaIncluida || 0) },
      { Parámetro: 'Supuesto EVA', Valor: forecastData.feriaEva?.supuesto || '' },
      { Parámetro: 'Período de análisis (días)', Valor: diasAnalisis },
      { Parámetro: 'Lead time producción (días hábiles)', Valor: leadTime },
      { Parámetro: 'Stock de seguridad (días)', Valor: stockSeguridad },
      { Parámetro: 'Stock a descontar', Valor: incluirConsignado ? 'Bodega + Consignado' : 'Solo bodega' },
      { Parámetro: 'Total a producir sugerido', Valor: detalle.reduce((s, d) => s + (d['Sugerencia producción'] || 0), 0) },
      { Parámetro: 'Ventas en el período', Valor: forecastData.resumen.totalVentasPeriodo },
      { Parámetro: 'Período estacional comparado', Valor: `${forecastData.parametros.fechaInicioEstacional} a ${forecastData.parametros.fechaFinEstacional}` },
      { Parámetro: 'Productos/tallas ajustados por estacionalidad', Valor: forecastData.resumen.skusConAjusteEstacional },
      { Parámetro: 'Urgentes (≤7 días)', Valor: forecastKpis.criticos },
      { Parámetro: 'Alta prioridad (≤14 días)', Valor: forecastKpis.altos },
      { Parámetro: 'Media prioridad (≤30 días)', Valor: forecastKpis.medios },
      { Parámetro: 'Tiendas incluidas', Valor: forecastData.tiendasForecast?.filter(store => store.incluida).map(store => store.nombre).join(', ') || 'Ninguna' },
      { Parámetro: 'Generado', Valor: new Date().toLocaleString('es-CO') },
    ]

    // Includes store replenishment even when no new production is required.
    const envios = forecastData.forecast.flatMap(v => (v.enviosTiendas || []).map(store => ({
      'Tienda': store.nombre,
      'Referencia': v.producto,
      'Talla': v.size || '',
      'SKU': v.sku,
      'Mes de cobertura': forecastData.reposicionTiendas?.mes || '',
      'Stock en tienda': store.stockTienda,
      'Demanda mensual prevista': store.demandaMes,
      'Stock de seguridad': store.seguridad,
      'Enviar a tienda': store.cantidad,
    }))).sort((a, b) => a.Tienda.localeCompare(b.Tienda, 'es')
      || a.Referencia.localeCompare(b.Referencia, 'es') || a.Talla.localeCompare(b.Talla, 'es', { numeric: true }))

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), 'Por referencia')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalle), 'Detalle por SKU')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(forecastData.forecast.map(row => ({
      SKU: row.sku, Referencia: row.producto, Talla: row.size,
      'Stock inicial propio': row.conciliacion?.stockInicial ?? row.stockBodega,
      'Llegada producción': row.conciliacion?.llegadaProduccion || forecastData.cobertura?.fechaLlegadaProduccion,
      'Producción calculada': row.sugerenciaProduccion, 'Faltantes anteriores': row.faltanteAntesLlegada || 0,
    }))), 'Conciliación stock')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(forecastData.forecast.flatMap(row => [
      ...(row.conciliacion?.entradas || []).map(item => ({ SKU: row.sku, Fecha: item.fecha, Tipo: 'Entrada confirmada', Pares: item.pares, 'Reserva recuperable': 0 })),
      ...(row.conciliacion?.necesidades || []).map(item => ({ SKU: row.sku, Fecha: item.fecha, Tipo: 'Necesidad prevista', Pares: item.pares, 'Reserva recuperable': item.reservaRecuperable })),
    ])), 'Movimientos previstos')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((forecastData.auditoria || []).flatMap(row => row.meses.map((mes, i) => ({
      Referencia: row.referencia, Canal: row.canal, Mes: mes, Fuente: row.fuentes[i],
      'Mes completo previsto': row.proyeccionCompleta?.[i] ?? row.demanda[i],
      'Ventas ya realizadas': i === 0 ? row.vendidoMes || 0 : 0, 'Demanda pendiente': row.demanda[i],
    })))), 'Cálculo de demanda')
    if (forecastData.crecimientoObservado) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(forecastData.crecimientoObservado.map(row => ({
      'Canal / tienda': row.canal, 'Meses actuales': row.mesesActuales.join(', '), 'Meses comparables': row.mesesComparables.join(', '),
      'Pares actuales': row.recent, 'Pares comparables': row.previous, 'Factor aplicado': row.factor,
      'Variación (%)': row.observed ? Number(((row.factor - 1) * 100).toFixed(2)) : 'No calculable: sin ajuste',
    }))), 'Crecimiento observado')
    if (forecastData.validacion?.revisionReferencias) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      forecastData.validacion.revisionReferencias.map(row => ({
        'Referencia': row.referencia, 'Producción estimada': row.produccion,
        'Error regla anterior (%)': row.errorAnterior == null ? 'Sin evidencia' : Number((row.errorAnterior * 100).toFixed(1)),
        'Error modelo (%)': row.error == null ? 'Sin evidencia' : Number((row.error * 100).toFixed(1)),
        'Error promedio 3 meses (%)': row.errorBase == null ? 'Sin evidencia' : Number((row.errorBase * 100).toFixed(1)),
        'Canales evaluados': row.canalesEvaluados, 'Canales sin evaluar': row.canalesSinEvaluar,
        'Alcance': 'Demanda mensual; no certifica producción ni ventas futuras',
      }))), 'Validación por referencia')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(parametros), 'Parámetros')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(forecastData.forecast.filter(v => (v.faltanteAntesLlegada || 0) > 0).map(v => ({ Referencia: v.producto, Talla: v.size, SKU: v.sku, Faltante: v.faltanteAntesLlegada, Desde: v.primeraFechaFaltante, 'Llegada producción nueva': forecastData.cobertura?.fechaLlegadaProduccion }))), 'Faltantes antes de llegada')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(envios), 'Enviar a tiendas')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((forecastData.auditoria || []).map(row => ({ Referencia: row.referencia, Canal: row.canal, Método: row.modelo, 'Meses de historial': row.mesesHistoria, Evidencia: row.evidencia, Reserva: row.reserva, ...Object.fromEntries(row.meses.map((month, i) => [month, row.demanda[i]])) }))), 'Demanda mensual')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((forecastData.auditoria || []).flatMap(row => row.historial.map(month => ({ Referencia: row.referencia, Canal: row.canal, Mes: month.mes, Pares: month.pares })))), 'Historial mensual')

    const today = new Date()
    const stamp = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
    XLSX.writeFile(wb, `forecast-produccion-${stamp}.xlsx`)
  }

  useEffect(() => {
    if (activeTab === 'forecast' && !forecastData) {
      fetchForecast()
    }
  }, [activeTab])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFFFFF] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#1A2238]" />
        <span className="ml-2 text-[#545454]">Cargando inventario...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#FFFFFF] flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <Link href="/api/auth/shopify">
            <Button className="bg-[#1DA9EF] hover:bg-[#1DA9EF]/90 text-[#1A2238]">
              Reconectar Shopify
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  const referencias = inventarioData?.referencias || []
  const tiendas = inventarioData?.tiendas || []
  const totales = inventarioData?.totales || { referencias: 0, skus: 0, bodega: 0, consignado: 0, total: 0 }

  // Filter at the variant level, keep parent ref if any variant matches
  const searchLower = searchTerm.toLowerCase()
  const passesFilter = (v: VariantItem) => {
    if (filter === 'low' && !(v.total > 0 && v.total <= 5)) return false
    if (filter === 'out' && v.total !== 0) return false
    if (!searchLower) return true
    return (
      v.sku.toLowerCase().includes(searchLower) ||
      v.description.toLowerCase().includes(searchLower) ||
      (v.size || '').toLowerCase().includes(searchLower)
    )
  }
  const filteredRefs: ReferenceItem[] = referencias
    .map(r => {
      // Refine: if search matches reference name, keep ALL variants of that ref (respecting filter)
      const refMatchesSearch = !searchLower || r.reference.toLowerCase().includes(searchLower)
      const variants = r.variants.filter(v => refMatchesSearch ? (filter === 'all' ? true : (filter === 'low' ? (v.total > 0 && v.total <= 5) : v.total === 0)) : passesFilter(v))
      if (variants.length === 0) return null
      const bodega = variants.reduce((s, v) => s + v.bodega, 0)
      const bodegaCalera = variants.reduce((s, v) => s + v.bodegaCalera, 0)
      const bodegaEkho = variants.reduce((s, v) => s + v.bodegaEkho, 0)
      const totalConsignado = variants.reduce((s, v) => s + v.totalConsignado, 0)
      const tiendasAgg: { [k: string]: number } = {}
      for (const v of variants) {
        for (const tid in v.tiendas) tiendasAgg[tid] = (tiendasAgg[tid] || 0) + v.tiendas[tid]
      }
      return {
        ...r,
        variants,
        variantCount: variants.length,
        bodega,
        bodegaCalera,
        bodegaEkho,
        tiendas: tiendasAgg,
        totalConsignado,
        total: bodega + totalConsignado,
      }
    })
    .filter((r): r is ReferenceItem => r !== null)

  const filteredTotales = {
    bodega: filteredRefs.reduce((s, r) => s + r.bodega, 0),
    consignado: filteredRefs.reduce((s, r) => s + r.totalConsignado, 0),
    total: filteredRefs.reduce((s, r) => s + r.total, 0),
  }

  const allVariants = referencias.flatMap(r => r.variants)
  const lowStockCount = allVariants.filter(v => v.total > 0 && v.total <= 5).length
  const outOfStockCount = allVariants.filter(v => v.total === 0).length

  // Filter forecast
  let filteredForecast = forecastData?.forecast || []
  if (forecastSearchTerm) {
    const searchLower = forecastSearchTerm.toLowerCase()
    filteredForecast = filteredForecast.filter(item =>
      item.producto.toLowerCase().includes(searchLower) ||
      item.sku.toLowerCase().includes(searchLower) ||
      item.variante.toLowerCase().includes(searchLower)
    )
  }
  if (forecastFilter !== 'all') {
    filteredForecast = filteredForecast.filter(item => item.prioridad === forecastFilter)
  }

  return (
    <div className="min-h-screen bg-[#FFFFFF]">
      {/* Header */}
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
              <LogOut className="h-4 w-4 mr-2" />
              Cerrar sesión
            </Button>
          </Link>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="bg-white border-b">
        <div className="container mx-auto px-4">
          <nav className="flex gap-4">
            <Link href="/dashboard">
              <Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4">
                <BarChart3 className="h-4 w-4 mr-2" />
                Ventas
              </Button>
            </Link>
            <Link href="/dashboard/shopify">
              <Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4">
                <ShoppingCart className="h-4 w-4 mr-2" />
                Shopify
              </Button>
            </Link>
            <Link href="/dashboard/whatsapp">
              <Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4">
                <MessageCircle className="h-4 w-4 mr-2" />
                WhatsApp
              </Button>
            </Link>
            <Link href="/dashboard/tiendas">
              <Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4">
                <Store className="h-4 w-4 mr-2" />
                Tiendas
              </Button>
            </Link>
            <Link href="/dashboard/ferias">
              <Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4">
                <Tent className="h-4 w-4 mr-2" />
                Ferias
              </Button>
            </Link>
            <Link href="/dashboard/ppismercadeo">
              <Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4">
                <Megaphone className="h-4 w-4 mr-2" />
                Marketing
              </Button>
            </Link>
            <Link href="/dashboard/conciliacion">
              <Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4">
                <FileText className="h-4 w-4 mr-2" />
                Conciliación
              </Button>
            </Link>
            <Link href="/dashboard/analitica">
              <Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4">
                <TrendingUp className="h-4 w-4 mr-2" />
                Analítica
              </Button>
            </Link>
            <Link href="/dashboard/productos">
              <Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4">
                <Package className="h-4 w-4 mr-2" />
                Productos
              </Button>
            </Link>
            <Button variant="ghost" className="rounded-none border-b-2 border-[#1DA9EF] text-[#1A2238] py-4">
              <Boxes className="h-4 w-4 mr-2" />
              Inventario
            </Button>
            <Link href="/dashboard/configuracion">
              <Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4">
                <Settings className="h-4 w-4 mr-2" />
                Configuración
              </Button>
            </Link>
          </nav>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-[#1A2238]">Inventario y Forecast</h1>
              <div className="flex items-center gap-2 mt-1 text-xs text-[#545454]">
                {syncingStock ? (
                  <span className="inline-flex items-center gap-1 text-[#1DA9EF]">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Sincronizando stock desde Siigo…
                  </span>
                ) : (
                  <>
                    <span>
                      Stock Siigo: {lastStockSync
                        ? `actualizado ${new Date(lastStockSync).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                        : 'sin sincronizar'}
                    </span>
                    <button
                      type="button"
                      onClick={syncStockFromSiigo}
                      className="inline-flex items-center gap-1 text-[#1DA9EF] hover:underline"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Actualizar ahora
                    </button>
                  </>
                )}
              </div>
            </div>
            <TabsList>
              <TabsTrigger value="inventario" className="flex items-center gap-2">
                <Boxes className="h-4 w-4" />
                Inventario
              </TabsTrigger>
              <TabsTrigger value="forecast" className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Forecast Produccion
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Inventario Tab */}
          <TabsContent value="inventario">
            {/* KPIs */}
            <div className="grid gap-4 md:grid-cols-4 mb-8">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-[#545454]">Total Empresa</CardTitle>
                  <Boxes className="h-4 w-4 text-[#1A2238]" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-[#1A2238]">{totales.total.toLocaleString()}</div>
                  <p className="text-xs text-[#545454]">unidades totales</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-[#545454]">En Bodega</CardTitle>
                  <Warehouse className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-[#1A2238]">{totales.bodega.toLocaleString()}</div>
                  <p className="text-xs text-[#545454]">{totales.total > 0 ? ((totales.bodega / totales.total) * 100).toFixed(0) : 0}% del total</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-[#545454]">Consignado</CardTitle>
                  <Store className="h-4 w-4 text-purple-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-[#1A2238]">{totales.consignado.toLocaleString()}</div>
                  <p className="text-xs text-[#545454]">en {tiendas.length} tiendas</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-[#545454]">Alertas</CardTitle>
                  <Package className="h-4 w-4 text-yellow-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-[#1A2238]">{lowStockCount + outOfStockCount}</div>
                  <p className="text-xs text-[#545454]">{outOfStockCount} agotados, {lowStockCount} stock bajo</p>
                </CardContent>
              </Card>
            </div>

            {/* Filters and Search */}
            <Card className="mb-6">
              <CardContent className="pt-6">
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[#545454]" />
                    <Input
                      placeholder="Buscar por producto, SKU o variante..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant={filter === 'all' ? 'default' : 'outline'}
                      onClick={() => setFilter('all')}
                      className={filter === 'all' ? 'bg-[#1DA9EF] hover:bg-[#1DA9EF]/90 text-[#1A2238]' : ''}
                    >
                      Todos ({allVariants.length})
                    </Button>
                    <Button
                      variant={filter === 'low' ? 'default' : 'outline'}
                      onClick={() => setFilter('low')}
                      className={filter === 'low' ? 'bg-yellow-500 hover:bg-yellow-500/90 text-white' : ''}
                    >
                      Stock Bajo ({lowStockCount})
                    </Button>
                    <Button
                      variant={filter === 'out' ? 'default' : 'outline'}
                      onClick={() => setFilter('out')}
                      className={filter === 'out' ? 'bg-red-500 hover:bg-red-500/90 text-white' : ''}
                    >
                      Agotados ({outOfStockCount})
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Inventory Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  Detalle por Producto
                  {searchTerm && (
                    <span className="ml-2 text-sm font-normal text-[#545454]">
                      ({filteredRefs.length} referencias)
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8"></TableHead>
                        <TableHead className="min-w-[200px]">Referencia / SKU</TableHead>
                        <TableHead className="text-center bg-blue-50">Bodega Calera</TableHead>
                        <TableHead className="text-center bg-cyan-50">Bodega Ekho</TableHead>
                        {tiendasExpanded ? (
                          <>
                            {tiendas.map(tienda => (
                              <TableHead key={tienda.id} className="text-center bg-purple-50 min-w-[80px]">
                                {tienda.nombre.length > 12 ? tienda.nombre.substring(0, 12) + '…' : tienda.nombre}
                              </TableHead>
                            ))}
                            <TableHead className="text-center bg-purple-50 w-8">
                              <button
                                type="button"
                                onClick={() => setTiendasExpanded(false)}
                                title="Colapsar tiendas"
                                className="text-purple-600 hover:text-purple-800"
                              >
                                <ChevronLeft className="h-4 w-4" />
                              </button>
                            </TableHead>
                          </>
                        ) : (
                          <TableHead className="text-center bg-purple-50">
                            <div className="inline-flex items-center gap-1">
                              <span>Tiendas ({tiendas.length})</span>
                              <button
                                type="button"
                                onClick={() => setTiendasExpanded(true)}
                                title="Expandir tiendas"
                                className="text-purple-600 hover:text-purple-800"
                              >
                                <ChevronRight className="h-4 w-4" />
                              </button>
                            </div>
                          </TableHead>
                        )}
                        <TableHead className="text-center bg-green-50">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRefs.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={tiendasExpanded ? 6 + tiendas.length : 6} className="text-center py-8 text-[#545454]">
                            {searchTerm ? 'No se encontraron productos' : 'No hay productos en inventario'}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredRefs.map((r) => {
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
                                <TableCell className="text-center bg-blue-50/50">
                                  {getInventoryBadge(r.bodegaCalera)}
                                </TableCell>
                                <TableCell className="text-center bg-cyan-50/50">
                                  {getInventoryBadge(r.bodegaEkho)}
                                </TableCell>
                                {tiendasExpanded ? (
                                  <>
                                    {tiendas.map(tienda => (
                                      <TableCell key={tienda.id} className="text-center bg-purple-50/50">
                                        {r.tiendas[tienda.id] > 0 ? (
                                          <Badge variant="secondary">{r.tiendas[tienda.id]}</Badge>
                                        ) : (
                                          <span className="text-[#D1D5DB]">—</span>
                                        )}
                                      </TableCell>
                                    ))}
                                    <TableCell></TableCell>
                                  </>
                                ) : (
                                  <TableCell className="text-center bg-purple-50/50">
                                    {r.totalConsignado > 0 ? (
                                      <Badge variant="secondary">{r.totalConsignado}</Badge>
                                    ) : (
                                      <span className="text-[#D1D5DB]">—</span>
                                    )}
                                  </TableCell>
                                )}
                                <TableCell className="text-center bg-green-50/50">
                                  {getInventoryBadge(r.total)}
                                </TableCell>
                              </TableRow>

                              {isExpanded && r.variants.map(v => {
                                const variantOpen = expandedVariantSkus.has(v.sku)
                                const tiendasConStock = tiendas
                                  .map(t => ({ nombre: t.nombre, qty: v.tiendas[t.id] || 0 }))
                                  .filter(t => t.qty > 0)
                                  .sort((a, b) => b.qty - a.qty)
                                return (
                                <Fragment key={`${r.reference}-${v.sku}`}>
                                <TableRow className="bg-gray-50/40">
                                  <TableCell></TableCell>
                                  <TableCell className="pl-8">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs bg-white border rounded px-1.5 py-0.5 font-mono text-[#545454]">{v.sku}</span>
                                      <span className="text-sm text-[#1A2238]">
                                        {v.size ? `Talla ${v.size}` : v.description}
                                      </span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-center bg-blue-50/30">
                                    {getInventoryBadge(v.bodegaCalera)}
                                  </TableCell>
                                  <TableCell className="text-center bg-cyan-50/30">
                                    {getInventoryBadge(v.bodegaEkho)}
                                  </TableCell>
                                  {tiendasExpanded ? (
                                    <>
                                      {tiendas.map(tienda => (
                                        <TableCell key={tienda.id} className="text-center bg-purple-50/30">
                                          {v.tiendas[tienda.id] > 0 ? (
                                            <Badge variant="secondary" className="text-xs">{v.tiendas[tienda.id]}</Badge>
                                          ) : (
                                            <span className="text-[#D1D5DB]">—</span>
                                          )}
                                        </TableCell>
                                      ))}
                                      <TableCell></TableCell>
                                    </>
                                  ) : (
                                    <TableCell className="text-center bg-purple-50/30">
                                      {v.totalConsignado > 0 ? (
                                        <button
                                          type="button"
                                          onClick={() => toggleVariantSku(v.sku)}
                                          className="inline-flex items-center gap-1 hover:opacity-80"
                                          title="Ver en qué tiendas está"
                                        >
                                          <Badge variant="secondary" className="text-xs cursor-pointer">{v.totalConsignado}</Badge>
                                          {variantOpen
                                            ? <ChevronDown className="h-3 w-3 text-purple-500" />
                                            : <ChevronRight className="h-3 w-3 text-purple-400" />}
                                        </button>
                                      ) : (
                                        <span className="text-[#D1D5DB]">—</span>
                                      )}
                                    </TableCell>
                                  )}
                                  <TableCell className="text-center bg-green-50/30">
                                    {getInventoryBadge(v.total)}
                                  </TableCell>
                                </TableRow>
                                {!tiendasExpanded && variantOpen && (
                                  <TableRow className="bg-purple-50/20">
                                    <TableCell></TableCell>
                                    <TableCell colSpan={5} className="py-2 pl-12">
                                      {tiendasConStock.length > 0 ? (
                                        <div className="flex flex-wrap gap-1.5">
                                          <span className="text-xs text-[#545454] mr-1">
                                            {v.size ? `Talla ${v.size}` : ''} está en:
                                          </span>
                                          {tiendasConStock.map((t, i) => (
                                            <span key={i} className="inline-flex items-center gap-1 bg-white border border-purple-200 rounded-full px-2.5 py-0.5 text-xs">
                                              <span className="text-[#1A2238]">{t.nombre}</span>
                                              <span className="font-bold text-purple-700">{t.qty}</span>
                                            </span>
                                          ))}
                                        </div>
                                      ) : (
                                        <span className="text-xs text-[#9CA3AF]">Sin stock en tiendas</span>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                )}
                                </Fragment>
                                )
                              })}
                            </Fragment>
                          )
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>

                {filteredRefs.length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <div className="flex justify-end gap-8 text-sm">
                      <div>
                        <span className="text-[#545454]">Bodega: </span>
                        <span className="font-bold text-blue-600">{filteredTotales.bodega.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-[#545454]">Consignado: </span>
                        <span className="font-bold text-purple-600">{filteredTotales.consignado.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-[#545454]">Total: </span>
                        <span className="font-bold text-green-600">{filteredTotales.total.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Forecast Tab */}
          <TabsContent value="forecast">
            {storeSelectionError && <p role="alert" className="mb-4 text-red-700">{storeSelectionError}</p>}
            {forecastLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-[#1A2238]" />
                <span className="ml-2 text-[#545454]">Calculando forecast...</span>
              </div>
            ) : forecastData ? (
              <>
                <Card className="mb-6">
                  <CardHeader><CardTitle>Tiendas incluidas en el forecast</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-sm text-[#545454] mb-3">Marca las tiendas que quieres incluir en el forecast de producción. La selección se guarda en este navegador. El inventario físico seguirá visible.</p>
                    <div className="flex gap-2 mb-3">
                      <Button variant="outline" onClick={() => setExcludedStoreIds([])}>Seleccionar todas</Button>
                      <Button variant="outline" onClick={() => setExcludedStoreIds((forecastData.tiendasForecast || []).map(store => store.id))}>Desmarcar todas</Button>
                    </div>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {(forecastData.tiendasForecast || []).map(store => (
                        <label key={store.id} className="flex items-start gap-2 p-3 rounded border cursor-pointer">
                          <input type="checkbox" className="mt-1" checked={!excludedStoreIds.includes(store.id)} onChange={event => setExcludedStoreIds(previous => event.target.checked ? previous.filter(id => id !== store.id) : [...previous, store.id])} />
                          <span>{store.nombre}{!store.tieneBodega && <span className="block text-xs text-amber-700">Pendiente de vincular bodega: no se calcula su reposición.</span>}</span>
                        </label>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-4">
                      <Button onClick={applyStoreSelection}>Guardar selección y recalcular</Button>
                      <span className="text-sm text-[#545454]">Resultado actual: {(forecastData.tiendasForecast || []).filter(store => store.incluida && store.tieneBodega).length} tiendas con bodega incluidas.</span>
                      {(forecastData.tiendasForecast || []).some(store => store.incluida === excludedStoreIds.includes(store.id)) && <span className="text-sm text-amber-700">Cambios pendientes de aplicar</span>}
                    </div>
                  </CardContent>
                </Card>

                <Card className="mb-6"><CardHeader><CardTitle>Asistencia a Feria EVA</CardTitle></CardHeader><CardContent className="space-y-2">
                  <label className="flex items-center gap-3"><input type="checkbox" checked={forecastData.feriaEva?.incluida === true} disabled={forecastLoading} onChange={event => changeEvaAttendance(event.target.checked)} />Sí asistiremos a EVA: incluir sus ventas previstas</label>
                  <p className="text-sm font-medium">{forecastData.feriaEva?.incluida ? `EVA incluida: ${forecastData.feriaEva.demandaIncluida} pares de demanda adicional antes de descontar inventario y pedidos.` : 'No asistiremos a EVA: sus ventas no se incluyen en la demanda prevista.'}</p>
                  <p className="text-xs text-[#545454]">La selección se guarda para este año en este navegador. Otras ferias siguen excluidas. {forecastData.feriaEva?.supuesto}</p>
                  {forecastData.feriaEva?.incluida && forecastData.feriaEva.demandaHistoricaComparable === 0 && <p className="text-sm text-amber-700">No hay ventas EVA identificadas para comparar dentro del período. No se inventa demanda para la feria.</p>}
                </CardContent></Card>

                {forecastData.validacion && <Card className="mb-6">
                  <CardHeader><CardTitle>Comprobación del forecast</CardTitle></CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <p>Base de demanda: ventas de cada referencia del mismo mes del año pasado × crecimiento observado. Shopify, WhatsApp y cada tienda se calculan por separado. Black Friday y Navidad ya están incluidos en el histórico: no se añade otro aumento.</p>
                    <p>Crecimiento observado = pares vendidos en los últimos tres meses completos ÷ pares de esos mismos meses del año anterior − 1. Una caída también se aplica. Sin base comparable se usa 0 % de ajuste, identificado como no calculable; si falta el mes histórico de la referencia, se usa su promedio reciente sin multiplicarlo otra vez.</p>
                    <p>{forecastData.validacion.errorModelo == null ? 'No hay suficiente historia para medir el error.' : `Error histórico de demanda a cuatro meses: ${(forecastData.validacion.errorModelo * 100).toFixed(1)} %. Promedio de tres meses como comparación: ${((forecastData.validacion.errorBase || 0) * 100).toFixed(1)} %.`}</p>
                    {forecastData.validacion.errorAnterior != null && <p>Comparación sin crecimiento, repetir la referencia del año pasado, en los mismos cortes: {(forecastData.validacion.errorAnterior * 100).toFixed(1)} %. La comparación es retrospectiva y no una garantía de ventas.</p>}
                    {forecastData.validacion.porCanal?.map(row => <p key={row.canal}>{row.canal === 'directo' ? 'Online + WhatsApp' : 'Tiendas'}: {row.error == null ? 'sin evidencia suficiente' : `${(row.error * 100).toFixed(1)} % de error histórico`} ({row.series} series evaluadas).</p>)}
                    <p className="rounded border border-amber-300 bg-amber-50 p-3 font-medium">Estimación con incertidumbre: compara el error del modelo con el promedio sencillo. Una mejora retrospectiva pequeña no garantiza precisión futura. La cantidad calculada no debe tomarse como una orden de fabricación confirmada.</p>
                    <details open><summary className="cursor-pointer font-medium">Crecimiento observado aplicado</summary>
                      <p className="my-2 text-xs">Meses actuales: {forecastData.crecimientoObservado?.[0]?.mesesActuales.join(', ')}. Comparación: {forecastData.crecimientoObservado?.[0]?.mesesComparables.join(', ') || 'sin período completo'}.</p>
                      <table className="w-full text-left text-xs"><thead><tr><th className="p-2">Canal / tienda</th><th className="p-2">Pares actuales</th><th className="p-2">Pares año pasado</th><th className="p-2">Variación aplicada</th></tr></thead><tbody>{forecastData.crecimientoObservado?.map(row => <tr key={row.canal} className="border-t"><td className="p-2">{row.canal}</td><td className="p-2">{row.recent}</td><td className="p-2">{row.previous}</td><td className="p-2">{row.observed ? `${((row.factor - 1) * 100).toFixed(1)} %` : 'No calculable: sin ajuste'}</td></tr>)}</tbody></table>
                    </details>
                    <p>{forecastData.validacion.seriesEvaluadas} combinaciones de referencia y canal evaluadas; {forecastData.validacion.seriesSinEvaluar} sin validación individual suficiente.</p>
                    <p>Reserva limitada a {forecastData.parametros.stockSeguridad} días de demanda media prevista por referencia y canal, redondeada hacia abajo a pares completos. El error histórico no puede aumentar ese límite.</p>
                    {forecastData.resumen.totalProduccionSinReserva != null && <p className="rounded bg-amber-50 p-3 font-medium">Desglose de producción: {forecastData.resumen.totalProduccionSinReserva} pares para cubrir la demanda sin reserva + {forecastData.resumen.totalProduccionPorReserva} pares adicionales por reserva de seguridad = {forecastData.resumen.totalProducirSugerido} pares. Ambos cálculos descuentan stock y pedidos según talla y fecha de llegada.</p>}
                    <p className="text-[#545454]">{forecastData.validacion.alcance} Las facturas de Siigo son ventas reales de las tiendas. Las ventas del mes en curso se descuentan de la demanda pendiente, sin volver a descontarlas del stock. La sugerencia es una estimación, no una garantía de ventas.</p>
                    {seasonalReview.length > 0 && <div className="rounded border border-amber-300 p-3">
                      <p className="font-medium">Cambios frente a la misma referencia el año pasado</p>
                      <p className="mb-2">Estas referencias tuvieron ventas directas mayores el mismo mes del año pasado. Ahora se aplica la variación observada del canal o de la tienda. Son ventas mensuales, antes de descontar inventario.</p>
                      <table className="w-full text-left text-xs"><thead><tr><th className="p-1">Referencia</th><th className="p-1">Mes</th><th className="p-1">Año pasado</th><th className="p-1">Proyección actual</th></tr></thead>
                      <tbody>{seasonalReview.slice(0, 8).map(row => <tr key={`${row.referencia}-${row.canal}-${row.mes}`}><td className="p-1">{row.referencia} · {row.canal}</td><td className="p-1">{row.mes}</td><td className="p-1">{row.anterior}</td><td className="p-1">{row.proyeccion}</td></tr>)}</tbody></table>
                      <p className="mt-2 text-xs">La descarga incluye el historial completo y la demanda mensual de todas las referencias.</p>
                    </div>}
                    <details open>
                      <summary className="cursor-pointer font-medium">Revisión por referencia: estimaciones, no órdenes confirmadas</summary>
                      <p className="my-2 text-xs">Comparación sobre los mismos meses históricos. Un error menor que el promedio no garantiza ventas futuras. Los canales sin evidencia suficiente quedan identificados.</p>
                      <div className="overflow-x-auto"><table className="w-full text-left text-xs">
                        <thead><tr><th className="p-2">Referencia</th><th className="p-2">Producción estimada</th><th className="p-2">Error anterior</th><th className="p-2">Error modelo</th><th className="p-2">Error promedio 3 meses</th><th className="p-2">Canales evaluados / sin evaluar</th></tr></thead>
                        <tbody>{forecastData.validacion.revisionReferencias?.filter(row => row.produccion > 0).map(row => <tr className="border-t" key={row.referencia}><td className="p-2">{row.referencia}</td><td className="p-2">{row.produccion}</td><td className="p-2">{row.errorAnterior == null ? 'Sin evidencia' : `${(row.errorAnterior * 100).toFixed(1)} %`}</td><td className="p-2">{row.error == null ? 'Sin evidencia' : `${(row.error * 100).toFixed(1)} %`}</td><td className="p-2">{row.errorBase == null ? 'Sin evidencia' : `${(row.errorBase * 100).toFixed(1)} %`}</td><td className="p-2">{row.canalesEvaluados} / {row.canalesSinEvaluar}</td></tr>)}</tbody>
                      </table></div>
                    </details>
                    <details>
                      <summary className="cursor-pointer font-medium">Ver demanda mensual y reserva por referencia y canal</summary>
                      <div className="overflow-x-auto mt-3"><table className="w-full text-left text-xs">
                        <thead><tr><th className="p-2">Referencia / canal</th><th className="p-2">Historial cerrado</th><th className="p-2">Demanda pendiente por mes</th><th className="p-2">Reserva</th></tr></thead>
                        <tbody>{forecastData.auditoria?.map((row, i) => <tr key={i} className="border-t"><td className="p-2">{row.referencia} · {row.canal}<span className="block text-[#545454]">{row.evidencia}</span></td><td className="p-2">{row.mesesHistoria} meses</td><td className="p-2">{row.meses.map((month, index) => `${month}: ${row.demanda[index]} (${row.fuentes?.[index] || row.modelo})`).join(' · ')}</td><td className="p-2">{row.reserva}</td></tr>)}</tbody>
                      </table></div>
                    </details>
                  </CardContent>
                </Card>}

                {forecastData.cobertura && <Card className="mb-6 border-amber-300 bg-amber-50"><CardContent className="pt-6">
                  <p className="font-semibold">Faltantes antes de llegada: {forecastData.cobertura.faltanteAntesLlegada} pares</p>
                  <p className="text-sm mt-1">Producción nueva: llegada estimada {forecastData.cobertura.fechaLlegadaProduccion}. Los faltantes anteriores requieren adelantar entregas o conseguir inventario; no están sumados a “Producir”. La reserva de seguridad puede requerir reposición adicional.</p>
                  <p className="text-xs mt-2">Supuesto de fechas: {forecastData.cobertura.distribucion} Los picos dentro del mes pueden cambiar la cobertura.</p>
                </CardContent></Card>}
                {/* Forecast KPIs */}
                <div className="grid gap-4 md:grid-cols-5 mb-8">
                  <Card className="border-red-200 bg-red-50">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-red-700">Urgentes</CardTitle>
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-red-700">{forecastKpis.criticos}</div>
                      <p className="text-xs text-red-600">se agotan en 7 dias</p>
                    </CardContent>
                  </Card>
                  <Card className="border-orange-200 bg-orange-50">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-orange-700">Alta Prioridad</CardTitle>
                      <Clock className="h-4 w-4 text-orange-600" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-orange-700">{forecastKpis.altos}</div>
                      <p className="text-xs text-orange-600">se agotan en 14 dias</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-[#545454]">Media Prioridad</CardTitle>
                      <TrendingUp className="h-4 w-4 text-yellow-500" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-[#1A2238]">{forecastKpis.medios}</div>
                      <p className="text-xs text-[#545454]">se agotan en 30 dias</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-[#545454]">Estimación de producción</CardTitle>
                      <Factory className="h-4 w-4 text-[#1A2238]" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-[#1A2238]">{totalProducirToggle.toLocaleString()}</div>
                      <p className="text-xs text-[#545454]">estimación para Online, WhatsApp y Tiendas</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-[#545454]">Ventas ({diasAnalisis}d)</CardTitle>
                      <ShoppingCart className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-[#1A2238]">{forecastData.resumen.totalVentasPeriodo.toLocaleString()}</div>
                      <p className="text-xs text-[#545454]">
                        Online {forecastData.resumen.totalVentasOnline.toLocaleString()} · WhatsApp {forecastData.resumen.totalVentasWhatsApp.toLocaleString()} · Tiendas {forecastData.resumen.totalVentasTiendas.toLocaleString()}
                      </p>
                      <p className="mt-1 text-xs font-medium text-purple-700">
                        {forecastData.resumen.skusConAjusteEstacional} productos/tallas ajustados por estacionalidad
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Warehouse classification diagnostic */}
                {forecastData.bodegas && forecastData.bodegas.length > 0 && (
                  <Card className="mb-6">
                    <CardContent className="pt-6">
                      <p className="text-sm text-[#1A2238] mb-2 font-medium">Clasificación de bodegas Siigo</p>
                      <div className="flex flex-wrap gap-2">
                        {forecastData.bodegas.map(w => (
                          <span
                            key={w.id}
                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs border ${
                              w.bucket === 'bodega'
                                ? 'bg-blue-50 border-blue-200 text-blue-800'
                                : 'bg-purple-50 border-purple-200 text-purple-800'
                            }`}
                          >
                            <span className={`inline-block w-2 h-2 rounded-full ${w.bucket === 'bodega' ? 'bg-blue-500' : 'bg-purple-500'}`} />
                            {w.name} · {w.bucket === 'bodega' ? 'Bodega propia' : 'Consignado'} · {w.units.toLocaleString()} uds
                          </span>
                        ))}
                      </div>
                      <p className="text-xs text-[#545454] mt-2">
                        Las <b>Bodega propia</b> (principal + Ekho) suman al stock disponible; las <b>Consignado</b> están en tiendas.
                        Si alguna bodega tuya quedó como &quot;Consignado&quot;, avisame y la agrego.
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* En camino diagnostic */}
                {forecastData.enCamino && forecastData.enCamino.totalUnidades > 0 && (
                  <Card className="mb-6 border-l-4 border-l-[#F59E0B]">
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-3">
                        <Truck className="h-5 w-5 text-[#F59E0B] mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm text-[#1A2238]">
                            <b>{forecastData.enCamino.matchUnidades}</b> de <b>{forecastData.enCamino.totalUnidades}</b> pares
                            en camino reducen la producción sugerida hoy.
                          </p>
                          {forecastData.enCamino.sinMatch.length > 0 ? (
                            <div className="mt-2 bg-[#FEF3C7] border border-[#F59E0B]/30 rounded-md p-3">
                              <p className="text-sm text-[#92400E] mb-1">
                                ⚠ {forecastData.enCamino.sinMatch.reduce((s, x) => s + x.unidades, 0)} pares NO machearon
                                (el diseño/talla no coincide con ningún producto en Siigo, no se descuentan):
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {forecastData.enCamino.sinMatch.map((x, i) => (
                                  <span key={i} className="inline-flex items-center gap-1 bg-white border border-amber-200 rounded px-2 py-0.5 text-xs">
                                    {x.label} · <b>{x.unidades}</b>
                                  </span>
                                ))}
                              </div>
                              <p className="text-xs text-[#92400E] mt-2">
                                Revisá los modelos en <Link href="/dashboard/inventario/ordenes" className="underline font-medium">Órdenes en camino</Link> para
                                que coincida con cómo Siigo nombra el producto, o revisá la talla.
                              </p>
                            </div>
                          ) : (
                            <p className="text-xs text-green-700 mt-1">✓ Todos los pares en camino machearon con productos del forecast.</p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Forecast Parameters */}
                <Card className="mb-6">
                  <CardContent className="pt-6">
                    <div className="flex flex-col md:flex-row gap-4 items-end">
                      <div className="flex-1">
                        <Label htmlFor="dias">Periodo de analisis</Label>
                        <Select value={diasAnalisis} onValueChange={setDiasAnalisis}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="7">Ultimos 7 dias</SelectItem>
                            <SelectItem value="14">Ultimos 14 dias</SelectItem>
                            <SelectItem value="30">Ultimos 30 dias</SelectItem>
                            <SelectItem value="60">Ultimos 60 dias</SelectItem>
                            <SelectItem value="90">Ultimos 90 dias</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex-1">
                        <Label htmlFor="leadtime">Lead time producción (días hábiles)</Label>
                        <Input
                          id="leadtime"
                          type="number"
                          min="1"
                          value={leadTime}
                          onChange={(e) => setLeadTime(e.target.value)}
                          placeholder="52"
                        />
                        <p className="mt-1 text-xs text-[#545454]">Excluye fines de semana y festivos nacionales de Colombia.</p>
                      </div>
                      <div className="flex-1">
                        <Label htmlFor="seguridad">Límite de seguridad (días)</Label>
                        <Input
                          id="seguridad"
                          type="number"
                          min="0"
                          value={stockSeguridad}
                          onChange={(e) => setStockSeguridad(e.target.value)}
                          placeholder="7"
                        />
                      </div>
                      <Button onClick={fetchForecast} className="bg-[#1DA9EF] hover:bg-[#1DA9EF]/90 text-[#1A2238]">
                        Recalcular
                      </Button>
                      <Button
                        onClick={downloadForecastExcel}
                        variant="outline"
                        disabled={!forecastData}
                        className="border-[#1A2238] text-[#1A2238] hover:bg-[#1A2238]/5"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Bajar Excel
                      </Button>
                      <Link href="/dashboard/inventario/ordenes">
                        <Button variant="outline" className="border-[#F59E0B] text-[#D97706] hover:bg-[#F59E0B]/10">
                          <Truck className="h-4 w-4 mr-2" />
                          Órdenes en camino
                        </Button>
                      </Link>
                    </div>
                    <div className="mt-4 pt-4 border-t">
                      <p className="text-sm font-medium text-[#1A2238]">
                        Cálculo automático: cubre ventas Online + WhatsApp y la reposición necesaria de cada tienda.
                      </p>
                      <p className="mt-1 text-xs text-[#545454]">
                        Mes en curso: se estima el mes completo con el historial de meses cerrados y se descuentan las ventas ya registradas. El stock de Siigo ya refleja esas ventas.
                      </p>
                      <p className="mt-1 text-xs text-[#545454]">
                        El inventario de cada tienda cubre únicamente esa tienda. También se descuentan la bodega propia y las órdenes en camino aplicables.
                      </p>
                      {!!forecastData.reposicionTiendas?.tiendasSinBodega && (
                        <p className="mt-1 text-xs text-amber-700">{forecastData.reposicionTiendas.tiendasSinBodega} tiendas sin bodega vinculada no se incluyen en la sugerencia.</p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Filters */}
                <Card className="mb-6">
                  <CardContent className="pt-6">
                    <div className="flex flex-col md:flex-row gap-4">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[#545454]" />
                        <Input
                          placeholder="Buscar por producto, SKU o variante..."
                          value={forecastSearchTerm}
                          onChange={(e) => setForecastSearchTerm(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant={forecastFilter === 'all' ? 'default' : 'outline'}
                          onClick={() => setForecastFilter('all')}
                          className={forecastFilter === 'all' ? 'bg-[#1DA9EF] hover:bg-[#1DA9EF]/90 text-[#1A2238]' : ''}
                        >
                          Todos
                        </Button>
                        <Button
                          variant={forecastFilter === 'critica' ? 'default' : 'outline'}
                          onClick={() => setForecastFilter('critica')}
                          className={forecastFilter === 'critica' ? 'bg-red-500 hover:bg-red-500/90 text-white' : ''}
                        >
                          Urgentes ({forecastKpis.criticos})
                        </Button>
                        <Button
                          variant={forecastFilter === 'alta' ? 'default' : 'outline'}
                          onClick={() => setForecastFilter('alta')}
                          className={forecastFilter === 'alta' ? 'bg-orange-500 hover:bg-orange-500/90 text-white' : ''}
                        >
                          Alta ({forecastKpis.altos})
                        </Button>
                        <Button
                          variant={forecastFilter === 'media' ? 'default' : 'outline'}
                          onClick={() => setForecastFilter('media')}
                          className={forecastFilter === 'media' ? 'bg-yellow-500 hover:bg-yellow-500/90 text-white' : ''}
                        >
                          Media ({forecastKpis.medios})
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Forecast Table grouped by reference */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Forecast de Produccion</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(() => {
                      const allRefs = forecastData.referencias || []
                      const searchLowerF = forecastSearchTerm.toLowerCase()
                      const recalcVariant = (v: ForecastItem): ForecastItem => v

                      const filteredRefs: ForecastReference[] = allRefs
                        .map(r => {
                          const refMatches = !searchLowerF || r.reference.toLowerCase().includes(searchLowerF)
                          const variants = r.variants
                            .map(recalcVariant)
                            .filter(v => {
                              if (forecastFilter !== 'all' && v.prioridad !== forecastFilter) return false
                              if (refMatches) return true
                              return (
                                v.sku.toLowerCase().includes(searchLowerF) ||
                                v.description.toLowerCase().includes(searchLowerF) ||
                                (v.size || '').toLowerCase().includes(searchLowerF)
                              )
                            })
                          if (variants.length === 0) return null
                          // Worst priority across variants
                          const order = { critica: 0, alta: 1, media: 2, baja: 3 } as const
                          let worst: ForecastItem['prioridad'] = 'baja'
                          for (const v of variants) {
                            if (order[v.prioridad] < order[worst]) worst = v.prioridad
                          }
                          const aggregated: ForecastReference = {
                            reference: r.reference,
                            variantCount: variants.length,
                            stockBodega: variants.reduce((s, v) => s + v.stockBodega, 0),
                            stockConsignado: variants.reduce((s, v) => s + v.stockConsignado, 0),
                            stockTotal: variants.reduce((s, v) => s + v.stockTotal, 0),
                            enCamino: variants.reduce((s, v) => s + (v.enCamino || 0), 0),
                            ventasTotal: variants.reduce((s, v) => s + v.ventasTotal, 0),
                            ventasTiendas: variants.reduce((s, v) => s + v.ventasTiendas, 0),
                            ventasPeriodoEstacional: variants.reduce((s, v) => s + v.ventasPeriodoEstacional, 0),
                            velocidadDiaria: Math.round(variants.reduce((s, v) => s + v.velocidadDiaria, 0) * 100) / 100,
                            enviarTiendas: variants.reduce((s, v) => s + (v.enviarTiendas || 0), 0),
                            faltanteAntesLlegada: variants.reduce((s, v) => s + (v.faltanteAntesLlegada || 0), 0),
                            sugerenciaProduccion: variants.reduce((s, v) => s + v.sugerenciaProduccion, 0),
                            prioridad: worst,
                            variants,
                          }
                          return aggregated
                        })
                        .filter((r): r is ForecastReference => r !== null)

                      return (
                        <>
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-8"></TableHead>
                                  <TableHead className="min-w-[200px]">Referencia / Talla</TableHead>
                                  <TableHead className="text-center">Bodega</TableHead>
                                  <TableHead className="text-center">Consignado</TableHead>
                                  <TableHead className="text-center">Total Stock</TableHead>
                                  <TableHead className="text-center bg-amber-50">En camino</TableHead>
                                  <TableHead className="text-center">Ventas ({diasAnalisis}d)</TableHead>
                                  <TableHead className="text-center">Vel. Semanal</TableHead>
                                  <TableHead className="text-center">Días Restantes</TableHead>
                                  <TableHead className="text-center">Prioridad</TableHead>
                                  <TableHead className="text-center bg-amber-50">Falta antes de llegada</TableHead>
                                  <TableHead className="text-center bg-green-50">Producir</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {filteredRefs.length === 0 ? (
                                  <TableRow>
                                    <TableCell colSpan={12} className="text-center py-8 text-[#545454]">
                                      No hay productos que mostrar
                                    </TableCell>
                                  </TableRow>
                                ) : (
                                  filteredRefs.map(r => {
                                    const isExpanded = expandedForecastRefs.has(r.reference)
                                    const rowBg = r.prioridad === 'critica' ? 'bg-red-50' : r.prioridad === 'alta' ? 'bg-orange-50' : ''
                                    const variantDays = r.variants
                                      .map(v => v.diasHastaAgotamiento)
                                      .filter((days): days is number => days !== null)
                                    // Reference priority inherits the most urgent
                                    // size, so its displayed coverage must do the
                                    // same instead of hiding a missing size behind
                                    // excess stock in other sizes.
                                    const diasParent = variantDays.length ? Math.min(...variantDays) : null
                                    return (
                                      <Fragment key={r.reference}>
                                        <TableRow
                                          className={`cursor-pointer hover:bg-gray-50 ${rowBg}`}
                                          onClick={() => toggleForecastRef(r.reference)}
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
                                          <TableCell className="text-center">{getInventoryBadge(r.stockBodega)}</TableCell>
                                          <TableCell className="text-center">
                                            {r.stockConsignado > 0 ? (
                                              <Badge variant="secondary">{r.stockConsignado}</Badge>
                                            ) : (
                                              <span className="text-[#D1D5DB]">—</span>
                                            )}
                                          </TableCell>
                                          <TableCell className="text-center font-medium">{r.stockTotal}</TableCell>
                                          <TableCell className="text-center bg-amber-50/40">
                                            {r.enCamino > 0 ? (
                                              <Badge className="bg-amber-100 text-amber-700">{r.enCamino}</Badge>
                                            ) : (
                                              <span className="text-[#D1D5DB]">—</span>
                                            )}
                                          </TableCell>
                                          <TableCell className="text-center font-medium">
                                            <div>{r.ventasTotal}</div>
                                            {r.ventasTiendas > 0 && (
                                              <div className="text-xs font-normal text-purple-700">
                                                Tiendas: {r.ventasTiendas} ({(r.ventasTiendas * 30 / (parseInt(diasAnalisis) || 1)).toFixed(1)}/mes)
                                              </div>
                                            )}
                                          </TableCell>
                                          <TableCell className="text-center">
                                            <span className="font-medium">{(r.velocidadDiaria * 7).toFixed(1)}</span>
                                            <span className="text-xs text-[#545454]"> uds/sem</span>
                                          </TableCell>
                                          <TableCell className="text-center">
                                            {diasParent !== null ? (
                                              <span className={`font-bold ${diasParent <= 7 ? 'text-red-600' : diasParent <= 14 ? 'text-orange-600' : 'text-[#1A2238]'}`}>
                                                {diasParent} días
                                              </span>
                                            ) : (
                                              <span className="text-[#545454]">—</span>
                                            )}
                                          </TableCell>
                                          <TableCell className="text-center">
                                            {getPriorityBadge(r.prioridad)}
                                          </TableCell>
                                          <TableCell className="text-center text-amber-800 font-semibold">{r.faltanteAntesLlegada || 0}</TableCell>
                                          <TableCell className="text-center bg-green-50/50">
                                            {r.sugerenciaProduccion > 0 ? (
                                              <span className="font-bold text-green-700">{r.sugerenciaProduccion}</span>
                                            ) : (
                                              <span className="text-[#545454]">—</span>
                                            )}
                                          </TableCell>
                                        </TableRow>

                                        {isExpanded && r.variants.map(v => {
                                          const varBg = v.prioridad === 'critica' ? 'bg-red-50/50' : v.prioridad === 'alta' ? 'bg-orange-50/40' : 'bg-gray-50/40'
                                          return (
                                            <TableRow key={`${r.reference}-${v.sku}`} className={varBg}>
                                              <TableCell></TableCell>
                                              <TableCell className="pl-8">
                                                <div className="flex items-center gap-2">
                                                  <span className="text-xs bg-white border rounded px-1.5 py-0.5 font-mono text-[#545454]">{v.sku}</span>
                                                  <span className="text-sm text-[#1A2238]">
                                                    {v.size ? `Talla ${v.size}` : v.description}
                                                  </span>
                                                </div>
                                              </TableCell>
                                              <TableCell className="text-center">{getInventoryBadge(v.stockBodega)}</TableCell>
                                              <TableCell className="text-center">
                                                {v.stockConsignado > 0 ? (
                                                  <Badge variant="secondary" className="text-xs">{v.stockConsignado}</Badge>
                                                ) : (
                                                  <span className="text-[#D1D5DB]">—</span>
                                                )}
                                              </TableCell>
                                              <TableCell className="text-center text-sm">{v.stockTotal}</TableCell>
                                              <TableCell className="text-center bg-amber-50/30">
                                                {v.enCamino > 0 ? (
                                                  <Badge className="bg-amber-100 text-amber-700 text-xs">{v.enCamino}</Badge>
                                                ) : (
                                                  <span className="text-[#D1D5DB]">—</span>
                                                )}
                                              </TableCell>
                                              <TableCell className="text-center">
                                                <div className="text-sm">
                                                  <span className="font-medium">{v.ventasTotal}</span>
                                                  {v.ventasTotal > 0 && (
                                                    <div className="text-xs text-[#545454]">
                                                      Online:{v.ventasShopify} · WhatsApp:{v.ventasWhatsApp} · Tiendas:{v.ventasTiendas}
                                                      {v.ventasTiendas > 0 && ` · Tiendas ${(v.ventasTiendas * 30 / (parseInt(diasAnalisis) || 1)).toFixed(1)}/mes`}
                                                    </div>
                                                  )}
                                                  {v.demandaFuente === 'estacional' && (
                                                    <div className="text-xs font-medium text-purple-700">
                                                      Estacionalidad: {v.ventasPeriodoEstacional} uds. año anterior
                                                    </div>
                                                  )}
                                                </div>
                                              </TableCell>
                                              <TableCell className="text-center text-sm">
                                                <span className="font-medium">{v.velocidadSemanal.toFixed(1)}</span>
                                              </TableCell>
                                              <TableCell className="text-center">
                                                {v.diasHastaAgotamiento !== null ? (
                                                  <span className={`font-bold text-sm ${v.diasHastaAgotamiento <= 7 ? 'text-red-600' : v.diasHastaAgotamiento <= 14 ? 'text-orange-600' : 'text-[#1A2238]'}`}>
                                                    {v.diasHastaAgotamiento} d
                                                  </span>
                                                ) : (
                                                  <span className="text-[#545454]">—</span>
                                                )}
                                              </TableCell>
                                              <TableCell className="text-center">
                                                {getPriorityBadge(v.prioridad)}
                                              </TableCell>
                                              <TableCell className="text-center text-amber-800"><b>{v.faltanteAntesLlegada || 0}</b>{v.primeraFechaFaltante && <div className="text-xs">Desde {v.primeraFechaFaltante}</div>}</TableCell>
                                              <TableCell className="text-center bg-green-50/30">
                                                {v.sugerenciaProduccion > 0 ? (
                                                  <span className="font-bold text-green-700 text-sm">{v.sugerenciaProduccion}</span>
                                                ) : (
                                                  <span className="text-[#545454]">—</span>
                                                )}
                                              </TableCell>
                                            </TableRow>
                                          )
                                        })}
                                      </Fragment>
                                    )
                                  })
                                )}
                              </TableBody>
                            </Table>
                          </div>

                          {filteredRefs.length > 0 && (
                            <div className="mt-4 pt-4 border-t">
                              <div className="flex justify-between items-center text-sm">
                                <div className="text-[#545454]">
                                  Estimación hasta enero: demanda mensual prevista + seguridad − bodega − órdenes en camino
                                </div>
                                <div>
                                  <span className="text-[#545454]">Total a producir: </span>
                                  <span className="font-bold text-green-600">
                                    {filteredRefs.reduce((sum, r) => sum + r.sugerenciaProduccion, 0).toLocaleString()} uds
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                        </>
                      )
                    })()}
                  </CardContent>
                </Card>
              </>
            ) : null}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
