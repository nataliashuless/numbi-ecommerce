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
  velocidadDiaria: number
  velocidadSemanal: number
  diasHastaAgotamiento: number | null
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
  velocidadDiaria: number
  sugerenciaProduccion: number
  prioridad: 'critica' | 'alta' | 'media' | 'baja'
  variants: ForecastItem[]
}

interface ForecastData {
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
    totalProducirSugerido: number
    totalVentasPeriodo: number
  }
  parametros: {
    diasAnalisis: number
    leadTimeDias: number
    stockSeguridad: number
    fechaInicio: string
    fechaFin: string
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

  // Forecast parameters
  const [diasAnalisis, setDiasAnalisis] = useState('90')
  const [leadTime, setLeadTime] = useState('52')
  const [stockSeguridad, setStockSeguridad] = useState('7')
  const [incluirConsignado, setIncluirConsignado] = useState(false)

  const [lastStockSync, setLastStockSync] = useState<string | null>(null)
  const [syncingStock, setSyncingStock] = useState(false)

  // KPI values recomputed with the SAME logic the forecast table uses
  // (respects the consignado toggle + units en camino), so the cards always
  // match the table. Covers ALL products (ignores search/filter). Priority is
  // derived from days-of-stock over the chosen stock base — exactly like the
  // per-row recalc — so counts stay consistent with the visible priorities.
  const forecastKpis = useMemo(() => {
    const empty = { totalProducir: 0, criticos: 0, altos: 0, medios: 0 }
    if (!forecastData) return empty
    const leadDays = parseInt(leadTime) || 14
    const safetyDays = parseInt(stockSeguridad) || 7
    const out = { ...empty }
    for (const r of forecastData.referencias) {
      for (const v of r.variants) {
        if (v.velocidadDiaria <= 0) continue
        const stockBase = incluirConsignado ? v.stockBodega + v.stockConsignado : v.stockBodega
        const stockNecesario = Math.ceil(v.velocidadDiaria * (leadDays + safetyDays))
        out.totalProducir += Math.max(0, stockNecesario - stockBase - (v.enCamino || 0))
        // Days of stock → priority (same thresholds as recalcVariant)
        let dias: number | null = null
        if (stockBase > 0) dias = Math.round(stockBase / v.velocidadDiaria)
        else dias = 0
        if (dias <= 7) out.criticos += 1
        else if (dias <= 14) out.altos += 1
        else if (dias <= 30) out.medios += 1
      }
    }
    return out
  }, [forecastData, incluirConsignado, leadTime, stockSeguridad])
  const totalProducirToggle = forecastKpis.totalProducir

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
      const res = await fetch(`/api/forecast?dias=${diasAnalisis}&lead_time=${leadTime}&stock_seguridad=${stockSeguridad}`)
      if (!res.ok) {
        throw new Error('Error al cargar forecast')
      }
      const json = await res.json()
      setForecastData(json)
    } catch (err) {
      console.error('Error fetching forecast:', err)
    } finally {
      setForecastLoading(false)
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
    // Recompute suggestion with the same logic as the on-screen table
    // (respects the consignado toggle + units en camino) so the file matches.
    const leadDays = parseInt(leadTime) || 14
    const safetyDays = parseInt(stockSeguridad) || 7
    const suggestFor = (f: ForecastItem): number => {
      if (f.velocidadDiaria <= 0) return 0
      const stockBase = incluirConsignado ? f.stockBodega + f.stockConsignado : f.stockBodega
      const stockNecesario = Math.ceil(f.velocidadDiaria * (leadDays + safetyDays))
      return Math.max(0, stockNecesario - stockBase - (f.enCamino || 0))
    }

    // Sheet 1: Detalle por variante (SKU)
    const detalle = forecastData.forecast.map(f => ({
      'SKU': f.sku,
      'Producto': f.producto,
      'Variante': f.variante,
      'Talla': f.size || '',
      'Stock bodega': f.stockBodega,
      'Stock consignado': f.stockConsignado,
      'Stock total': f.stockTotal,
      'En camino': f.enCamino,
      'Ventas Shopify': f.ventasShopify,
      'Ventas WhatsApp': f.ventasWhatsApp,
      'Ventas Tiendas': f.ventasTiendas,
      'Ventas totales': f.ventasTotal,
      'Velocidad diaria': Number(f.velocidadDiaria.toFixed(2)),
      'Velocidad semanal': Number(f.velocidadSemanal.toFixed(2)),
      'Días hasta agotamiento': f.diasHastaAgotamiento ?? '∞',
      'Sugerencia producción': suggestFor(f),
      'Prioridad': PRIORIDAD_LABEL[f.prioridad] || f.prioridad,
    }))

    // Sheet 2: Resumen por referencia
    const resumen = (forecastData.referencias || []).map(r => ({
      'Referencia': r.reference,
      'Variantes': r.variantCount,
      'Stock bodega': r.stockBodega,
      'Stock consignado': r.stockConsignado,
      'Stock total': r.stockTotal,
      'En camino': r.enCamino,
      'Ventas totales': r.ventasTotal,
      'Velocidad diaria': Number(r.velocidadDiaria.toFixed(2)),
      'Sugerencia producción': r.variants.reduce((s, v) => s + suggestFor(v), 0),
      'Prioridad': PRIORIDAD_LABEL[r.prioridad] || r.prioridad,
    }))

    // Sheet 3: Parámetros usados
    const parametros = [
      { Parámetro: 'Período de análisis (días)', Valor: diasAnalisis },
      { Parámetro: 'Lead time producción (días)', Valor: leadTime },
      { Parámetro: 'Stock de seguridad (días)', Valor: stockSeguridad },
      { Parámetro: 'Stock a descontar', Valor: incluirConsignado ? 'Bodega + Consignado' : 'Solo bodega' },
      { Parámetro: 'Total a producir sugerido', Valor: detalle.reduce((s, d) => s + (d['Sugerencia producción'] || 0), 0) },
      { Parámetro: 'Ventas en el período', Valor: forecastData.resumen.totalVentasPeriodo },
      { Parámetro: 'Urgentes (≤7 días)', Valor: forecastKpis.criticos },
      { Parámetro: 'Alta prioridad (≤14 días)', Valor: forecastKpis.altos },
      { Parámetro: 'Media prioridad (≤30 días)', Valor: forecastKpis.medios },
      { Parámetro: 'Generado', Valor: new Date().toLocaleString('es-CO') },
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), 'Por referencia')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalle), 'Detalle por SKU')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(parametros), 'Parámetros')

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
            <Link href="/dashboard/marketing">
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
            {forecastLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-[#1A2238]" />
                <span className="ml-2 text-[#545454]">Calculando forecast...</span>
              </div>
            ) : forecastData ? (
              <>
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
                      <CardTitle className="text-sm font-medium text-[#545454]">Producir Sugerido</CardTitle>
                      <Factory className="h-4 w-4 text-[#1A2238]" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-[#1A2238]">{totalProducirToggle.toLocaleString()}</div>
                      <p className="text-xs text-[#545454]">{incluirConsignado ? 'descuenta bodega + consignado' : 'solo bodega'}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-[#545454]">Ventas ({diasAnalisis}d)</CardTitle>
                      <ShoppingCart className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-[#1A2238]">{forecastData.resumen.totalVentasPeriodo.toLocaleString()}</div>
                      <p className="text-xs text-[#545454]">unidades vendidas</p>
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
                            en camino se están descontando del forecast.
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
                                Corregí el nombre del diseño en <Link href="/dashboard/inventario/ordenes" className="underline font-medium">Órdenes en camino</Link> para
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
                        <Label htmlFor="leadtime">Lead time produccion (dias)</Label>
                        <Input
                          id="leadtime"
                          type="number"
                          min="1"
                          value={leadTime}
                          onChange={(e) => setLeadTime(e.target.value)}
                          placeholder="14"
                        />
                      </div>
                      <div className="flex-1">
                        <Label htmlFor="seguridad">Stock de seguridad (dias)</Label>
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
                    <div className="mt-4 pt-4 border-t flex items-center gap-3 flex-wrap">
                      <Label className="text-sm">Stock para descontar:</Label>
                      <div className="flex border rounded-md text-sm overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setIncluirConsignado(true)}
                          className={`px-3 py-1.5 ${incluirConsignado ? 'bg-[#1DA9EF] text-white font-medium' : 'bg-white text-[#545454] hover:bg-gray-50'}`}
                        >
                          Bodega + Consignado en tiendas
                        </button>
                        <button
                          type="button"
                          onClick={() => setIncluirConsignado(false)}
                          className={`px-3 py-1.5 border-l ${!incluirConsignado ? 'bg-[#1DA9EF] text-white font-medium' : 'bg-white text-[#545454] hover:bg-gray-50'}`}
                        >
                          Solo bodega
                        </button>
                      </div>
                      <p className="text-xs text-[#545454]">
                        {incluirConsignado
                          ? 'Asume que el stock consignado se va a vender — no produce de más.'
                          : 'Más conservador — produce para reabastecer bodega ignorando consignado.'}
                      </p>
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
                      const leadDays = parseInt(leadTime) || 14
                      const safetyDays = parseInt(stockSeguridad) || 7

                      // Recalc per variant based on the toggle: stock for production decision.
                      // Also discount units already on order (en camino).
                      const recalcVariant = (v: ForecastItem): ForecastItem => {
                        const stockBase = incluirConsignado
                          ? v.stockBodega + v.stockConsignado
                          : v.stockBodega
                        const stockNecesario = Math.ceil(v.velocidadDiaria * (leadDays + safetyDays))
                        const sugerencia = v.velocidadDiaria > 0
                          ? Math.max(0, stockNecesario - stockBase - (v.enCamino || 0))
                          : 0
                        let dias: number | null = null
                        if (v.velocidadDiaria > 0 && stockBase > 0) {
                          dias = Math.round(stockBase / v.velocidadDiaria)
                        } else if (v.velocidadDiaria > 0 && stockBase === 0) {
                          dias = 0
                        }
                        let prioridad: ForecastItem['prioridad'] = 'baja'
                        if (dias !== null) {
                          if (dias <= 7) prioridad = 'critica'
                          else if (dias <= 14) prioridad = 'alta'
                          else if (dias <= 30) prioridad = 'media'
                        }
                        return {
                          ...v,
                          sugerenciaProduccion: sugerencia,
                          diasHastaAgotamiento: dias,
                          prioridad,
                        }
                      }

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
                            velocidadDiaria: Math.round(variants.reduce((s, v) => s + v.velocidadDiaria, 0) * 100) / 100,
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
                                  <TableHead className="text-center bg-green-50">Producir</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {filteredRefs.length === 0 ? (
                                  <TableRow>
                                    <TableCell colSpan={11} className="text-center py-8 text-[#545454]">
                                      No hay productos que mostrar
                                    </TableCell>
                                  </TableRow>
                                ) : (
                                  filteredRefs.map(r => {
                                    const isExpanded = expandedForecastRefs.has(r.reference)
                                    const rowBg = r.prioridad === 'critica' ? 'bg-red-50' : r.prioridad === 'alta' ? 'bg-orange-50' : ''
                                    const stockBaseParent = incluirConsignado ? r.stockTotal : r.stockBodega
                                    const diasParent = r.velocidadDiaria > 0 ? Math.round(stockBaseParent / r.velocidadDiaria) : null
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
                                          <TableCell className="text-center font-medium">{r.ventasTotal}</TableCell>
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
                                                      S:{v.ventasShopify} W:{v.ventasWhatsApp} T:{v.ventasTiendas}
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
                                  Producir = (Lead Time + Stock Seguridad) × Vel. Diaria − Stock − En camino
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
