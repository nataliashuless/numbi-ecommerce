'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { format, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { DateRange } from 'react-day-picker'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DollarSign,
  ShoppingCart,
  Package,
  TrendingUp,
  Loader2,
  Plus,
  Trash2,
  MessageCircle,
  BarChart3,
  Store,
  Boxes,
  FileText,
  ChevronDown,
  ChevronRight,
  Truck,
  Clock,
  MapPin,
  ExternalLink,
  Receipt,
  CheckCircle,
  Settings,
  LogOut,
  Sparkles,
  AlertTriangle,
  Check,
} from 'lucide-react'
// ShoppingCart already imported
import { DateRangePicker } from '@/components/ui/date-range-picker'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface VentaWA {
  id: string
  fecha: string
  cliente_nombre: string | null
  cliente_telefono: string | null
  cliente_cedula: string | null
  cliente_email: string | null
  cliente_direccion: string | null
  cliente_ciudad: string | null
  producto_nombre: string
  producto_variante: string | null
  producto_sku: string | null
  cantidad: number
  precio_unitario: number
  total: number
  notas: string | null
  enviado: boolean
  envio_carrier: string | null
  envio_tracking: string | null
  envio_guia_url: string | null
  envio_costo: number | null
  envio_estado: string | null
  siigo_invoice_id: string | null
  siigo_invoice_number: string | null
}

interface QuoteOption {
  carrier: string
  carrierLogo: string
  serviceId: string
  serviceName: string
  deliveryDays: number
  price: number
  currency: string
  idCarrier: number
  idProduct: number
}

interface Stats {
  totalVentas: number
  totalUnidades: number
  numVentas: number
  promedioVenta: number
}

interface ChartDataPoint {
  date: string
  sales: number
  orders: number
  units: number
}

interface ProductVariant {
  id: number
  title: string
  price: number
  sku: string
  inventory: number
}

interface Product {
  id: number
  title: string
  variants: ProductVariant[]
  minPrice: number
  maxPrice: number
}

interface SiigoCity {
  name: string
  stateCode: string
  cityCode: string
}

interface PaymentType {
  id: number
  name: string
  type: string
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value)
}

export default function WhatsAppPage() {
  const [ventas, setVentas] = useState<VentaWA[]>([])
  const [stats, setStats] = useState<Stats>({ totalVentas: 0, totalUnidades: 0, numVentas: 0, promedioVenta: 0 })
  const [chartData, setChartData] = useState<ChartDataPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importStep, setImportStep] = useState<'input' | 'results'>('input')
  const [importLoading, setImportLoading] = useState(false)
  const [importResults, setImportResults] = useState<{
    data: {
      cliente_nombre: string | null
      cliente_cedula: string | null
      cliente_telefono: string | null
      cliente_email: string | null
      cliente_direccion: string | null
      cliente_barrio: string | null
      cliente_ciudad: string | null
      cliente_indicaciones: string | null
      producto: string | null
      talla: string | null
      cantidad: number | null
    }
    missing: string[]
    warnings: string[]
    confidence: 'high' | 'medium' | 'low'
  } | null>(null)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [shippingDialogOpen, setShippingDialogOpen] = useState(false)
  const [selectedVentaForShipping, setSelectedVentaForShipping] = useState<VentaWA | null>(null)
  const [quoteOptions, setQuoteOptions] = useState<QuoteOption[]>([])
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [shipmentLoading, setShipmentLoading] = useState(false)
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)

  useEffect(() => {
    setDateRange({ from: subDays(new Date(), 30), to: new Date() })
  }, [])
  const [products, setProducts] = useState<Product[]>([])
  const [selectedProduct, setSelectedProduct] = useState<string>('')
  const [selectedVariant, setSelectedVariant] = useState<string>('')

  // Invoice (Siigo) state
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false)
  const [selectedVentaForInvoice, setSelectedVentaForInvoice] = useState<VentaWA | null>(null)
  const [invoiceLoading, setInvoiceLoading] = useState(false)
  const [siigoPaymentTypes, setSiigoPaymentTypes] = useState<PaymentType[]>([])
  const [siigoDocumentTypes, setSiigoDocumentTypes] = useState<Array<{ id: number; name: string }>>([])
  const [siigoCities, setSiigoCities] = useState<SiigoCity[]>([])
  const [siigoConfigError, setSiigoConfigError] = useState<string | null>(null)
  const [siigoConfigLoading, setSiigoConfigLoading] = useState(false)
  const [invoiceFormData, setInvoiceFormData] = useState({
    nit: '',
    checkDigit: '',
    name: '',
    address: '',
    cityCode: '',
    stateCode: '',
    phone: '',
    email: '',
    paymentTypeId: '',
    documentId: '',
  })

  // Form state
  const [formData, setFormData] = useState({
    fecha: format(new Date(), 'yyyy-MM-dd'),
    cliente_nombre: '',
    cliente_telefono: '',
    cliente_cedula: '',
    cliente_email: '',
    cliente_direccion: '',
    cliente_ciudad: '',
    producto_nombre: '',
    producto_variante: '',
    producto_sku: '',
    cantidad: 1,
    precio_unitario: 0,
    notas: '',
  })

  // Parse WhatsApp text block
  function parseWhatsAppText(text: string) {
    const lines = text.split('\n')
    const data: Record<string, string> = {}

    for (const line of lines) {
      // Try to find a separator (colon or space for specific fields)
      let key = ''
      let value = ''

      const colonIndex = line.indexOf(':')
      if (colonIndex > 0) {
        key = line.substring(0, colonIndex).trim().toLowerCase()
        value = line.substring(colonIndex + 1).trim()
      } else {
        // Handle lines without colon (e.g., "Celular 3175134486")
        const lineLower = line.toLowerCase().trim()
        if (lineLower.startsWith('celular ') || lineLower.startsWith('cel ') || lineLower.startsWith('telefono ') || lineLower.startsWith('teléfono ')) {
          const parts = line.trim().split(/\s+/)
          key = parts[0].toLowerCase()
          value = parts.slice(1).join(' ')
        }
      }

      if (!key) continue

      // Map common field names
      if (key.includes('nombre') && !key.includes('edificio') && !key.includes('conjunto')) {
        data.nombre = value
      } else if (key.includes('cédula') || key.includes('cedula') || key.includes('cc')) {
        data.cedula = value
      } else if (key.includes('dirección') || key.includes('direccion')) {
        data.direccion = value
      } else if (key.includes('barrio')) {
        data.barrio = value
      } else if (key.includes('edificio') || key.includes('conjunto')) {
        data.edificio = value
      } else if (key.includes('ciudad')) {
        data.ciudad = value
      } else if (key.includes('celular') || key.includes('teléfono') || key.includes('telefono') || key.includes('tel') || key.includes('cel')) {
        data.telefono = value.replace(/\D/g, '') // Remove non-digits
      } else if (key.includes('correo') || key.includes('email') || key.includes('mail')) {
        data.email = value
      } else if (key.includes('talla') || key.includes('size')) {
        data.talla = value
      } else if (key.includes('diseño') || key.includes('diseno') || key.includes('producto') || key.includes('referencia')) {
        data.diseno = value
      } else if (key.includes('color')) {
        data.color = value
      } else if (key.includes('cantidad')) {
        data.cantidad = value
      }
    }

    return data
  }

  async function handleImportWithAI() {
    setImportLoading(true)
    try {
      const res = await fetch('/api/ai/parse-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: importText }),
      })

      const data = await res.json()

      if (data.error) {
        alert(data.error)
        return
      }

      setImportResults(data)
      setImportStep('results')
    } catch (error) {
      console.error('Error parsing with AI:', error)
      alert('Error al procesar con AI')
    } finally {
      setImportLoading(false)
    }
  }

  function handleAcceptImportResults() {
    if (!importResults) return

    const data = importResults.data

    // Try to match product based on producto field
    let matchedProduct: Product | null = null
    let matchedVariant: ProductVariant | null = null
    const searchTerm = (data.producto || '').toLowerCase()

    if (searchTerm && products.length > 0) {
      for (const product of products) {
        if (product.title.toLowerCase().includes(searchTerm)) {
          matchedProduct = product
          if (data.talla) {
            const variant = product.variants.find(v =>
              v.title.toLowerCase().includes(data.talla!.toLowerCase())
            )
            if (variant) {
              matchedVariant = variant
            }
          }
          if (!matchedVariant && product.variants.length === 1) {
            matchedVariant = product.variants[0]
          }
          break
        }
      }
    }

    // Build notes with extra info
    const notasParts: string[] = []
    if (data.producto && !matchedProduct) {
      notasParts.push(`Producto: ${data.producto}${data.talla ? `, Talla: ${data.talla}` : ''}`)
    }
    if (data.cliente_barrio) {
      notasParts.push(`Barrio: ${data.cliente_barrio}`)
    }
    if (data.cliente_indicaciones) {
      notasParts.push(`Indicaciones: ${data.cliente_indicaciones}`)
    }

    // Set form data
    setFormData(prev => ({
      ...prev,
      cliente_nombre: data.cliente_nombre || prev.cliente_nombre,
      cliente_cedula: data.cliente_cedula || prev.cliente_cedula,
      cliente_telefono: data.cliente_telefono || prev.cliente_telefono,
      cliente_email: data.cliente_email || prev.cliente_email,
      cliente_direccion: data.cliente_direccion || prev.cliente_direccion,
      cliente_ciudad: data.cliente_ciudad || prev.cliente_ciudad,
      cantidad: data.cantidad || prev.cantidad,
      notas: notasParts.length > 0 ? notasParts.join(' | ') : prev.notas,
      producto_nombre: matchedProduct?.title || prev.producto_nombre,
      producto_variante: matchedVariant && matchedVariant.title !== 'Default Title' ? matchedVariant.title : prev.producto_variante,
      producto_sku: matchedVariant?.sku || prev.producto_sku,
      precio_unitario: matchedVariant?.price || prev.precio_unitario,
    }))

    if (matchedProduct) {
      setSelectedProduct(matchedProduct.id.toString())
      if (matchedVariant) {
        setSelectedVariant(matchedVariant.id.toString())
      }
    }

    // Reset and close import dialog, open form dialog
    setImportDialogOpen(false)
    setImportStep('input')
    setImportText('')
    setImportResults(null)
    setDialogOpen(true)
  }

  function handleCancelImport() {
    setImportStep('input')
    setImportResults(null)
  }

  async function fetchData() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (dateRange?.from && dateRange?.to) {
        params.set('start_date', format(dateRange.from, 'yyyy-MM-dd'))
        params.set('end_date', format(dateRange.to, 'yyyy-MM-dd'))
      }
      const res = await fetch(`/api/whatsapp?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setVentas(data.ventas)
        setStats(data.stats)
        setChartData(data.chartData)
      }
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (dateRange?.from && dateRange?.to) {
      fetchData()
    }
  }, [dateRange])

  async function fetchProducts() {
    try {
      const res = await fetch('/api/shopify/products')
      if (res.ok) {
        const data = await res.json()
        setProducts(data.products || [])
      }
    } catch (error) {
      console.error('Error fetching products:', error)
    }
  }

  useEffect(() => {
    fetchProducts()
  }, [])

  // Get current product and its variants
  const currentProduct = products.find(p => p.id.toString() === selectedProduct)
  const currentVariant = currentProduct?.variants.find(v => v.id.toString() === selectedVariant)

  function handleProductChange(productId: string) {
    setSelectedProduct(productId)
    setSelectedVariant('')
    const product = products.find(p => p.id.toString() === productId)
    if (product) {
      setFormData(prev => ({
        ...prev,
        producto_nombre: product.title,
        producto_variante: '',
        producto_sku: '',
        precio_unitario: product.variants.length === 1 ? product.variants[0].price : 0,
      }))
      // Auto-select variant if only one
      if (product.variants.length === 1) {
        const variant = product.variants[0]
        setSelectedVariant(variant.id.toString())
        setFormData(prev => ({
          ...prev,
          producto_variante: variant.title !== 'Default Title' ? variant.title : '',
          producto_sku: variant.sku || '',
          precio_unitario: variant.price,
        }))
      }
    }
  }

  function handleVariantChange(variantId: string) {
    setSelectedVariant(variantId)
    const variant = currentProduct?.variants.find(v => v.id.toString() === variantId)
    if (variant) {
      setFormData(prev => ({
        ...prev,
        producto_nombre: currentProduct!.title,
        producto_variante: variant.title !== 'Default Title' ? variant.title : '',
        producto_sku: variant.sku || '',
        precio_unitario: variant.price,
      }))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      const res = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          total: formData.cantidad * formData.precio_unitario,
        }),
      })
      if (res.ok) {
        setDialogOpen(false)
        setSelectedProduct('')
        setSelectedVariant('')
        setFormData({
          fecha: format(new Date(), 'yyyy-MM-dd'),
          cliente_nombre: '',
          cliente_telefono: '',
          cliente_cedula: '',
          cliente_email: '',
          cliente_direccion: '',
          cliente_ciudad: '',
          producto_nombre: '',
          producto_variante: '',
          producto_sku: '',
          cantidad: 1,
          precio_unitario: 0,
          notas: '',
        })
        fetchData()
      }
    } catch (error) {
      console.error('Error creating sale:', error)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta venta?')) return
    try {
      const res = await fetch(`/api/whatsapp?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        fetchData()
      }
    } catch (error) {
      console.error('Error deleting sale:', error)
    }
  }

  async function handleToggleEnviado(id: string, currentValue: boolean) {
    try {
      const res = await fetch(`/api/whatsapp?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enviado: !currentValue }),
      })
      if (res.ok) {
        setVentas(prev => prev.map(v =>
          v.id === id ? { ...v, enviado: !currentValue } : v
        ))
      }
    } catch (error) {
      console.error('Error updating enviado:', error)
    }
  }

  function toggleRowExpanded(id: string) {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  async function handleOpenShippingDialog(venta: VentaWA) {
    setSelectedVentaForShipping(venta)
    setQuoteOptions([])
    setShippingDialogOpen(true)

    // Auto-fetch quote
    await handleGetQuote(venta)
  }

  async function handleGetQuote(venta: VentaWA) {
    if (!venta.cliente_ciudad || !venta.cliente_direccion) {
      alert('El pedido necesita ciudad y dirección para cotizar')
      return
    }

    setQuoteLoading(true)
    try {
      // Get DANE code for city
      const daneRes = await fetch(`/api/envioclick?city=${encodeURIComponent(venta.cliente_ciudad.toLowerCase())}`)
      const daneData = await daneRes.json()

      if (!daneData.daneCode) {
        alert(`No se encontró código DANE para ${venta.cliente_ciudad}. Contacta soporte.`)
        setQuoteLoading(false)
        return
      }

      // Get quote
      const quoteRes = await fetch('/api/envioclick?action=quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          daneCode: daneData.daneCode,
          address: venta.cliente_direccion,
          contentValue: venta.total,
          description: `${venta.producto_nombre} ${venta.producto_variante || ''}`.trim(),
        }),
      })

      const quoteData = await quoteRes.json()
      console.log('EnvioClick Quote Full Response:', JSON.stringify(quoteData, null, 2))

      // Handle various API response structures
      if (quoteData.error) {
        alert('Error al cotizar: ' + quoteData.error)
        setQuoteLoading(false)
        return
      }

      // Try to extract quotes array from different possible structures
      let quotesArray: unknown[] = []

      if (Array.isArray(quoteData)) {
        // Response is directly an array
        quotesArray = quoteData
      } else if (Array.isArray(quoteData.data)) {
        // Response has data as array
        quotesArray = quoteData.data
      } else if (quoteData.data && typeof quoteData.data === 'object') {
        // Response has data as object - try to find array inside
        const dataObj = quoteData.data as Record<string, unknown>
        if (Array.isArray(dataObj.quotes)) {
          quotesArray = dataObj.quotes
        } else if (Array.isArray(dataObj.services)) {
          quotesArray = dataObj.services
        } else if (Array.isArray(dataObj.carriers)) {
          quotesArray = dataObj.carriers
        } else if (Array.isArray(dataObj.rates)) {
          quotesArray = dataObj.rates
        } else if (Array.isArray(dataObj.options)) {
          quotesArray = dataObj.options
        } else {
          // Try to get values if they look like quote objects
          const values = Object.values(dataObj)
          if (values.length > 0 && typeof values[0] === 'object' && values[0] !== null) {
            quotesArray = values
          }
        }
      } else if (quoteData.quotes && Array.isArray(quoteData.quotes)) {
        quotesArray = quoteData.quotes
      } else if (quoteData.services && Array.isArray(quoteData.services)) {
        quotesArray = quoteData.services
      } else if (quoteData.rates && Array.isArray(quoteData.rates)) {
        quotesArray = quoteData.rates
      }

      console.log('Parsed quotes array:', quotesArray)

      if (quotesArray.length > 0) {
        const options: QuoteOption[] = quotesArray.map((q: unknown) => {
          const quote = q as Record<string, unknown>
          // Calculate total price: flete + minimumInsurance (EnvioClick structure)
          const flete = Number(quote.flete || 0)
          const insurance = Number(quote.minimumInsurance || quote.insurance || 0)
          const totalPrice = flete + insurance || Number(quote.price || quote.total || quote.amount || quote.cost || quote.rate || 0)

          return {
            carrier: String(quote.carrier || quote.carrierName || quote.carrier_name || quote.name || 'Transportadora'),
            carrierLogo: String(quote.carrierLogo || quote.carrier_logo || quote.logo || ''),
            serviceId: String(quote.idRate || quote.serviceId || quote.service_id || quote.id || ''),
            serviceName: String(quote.product || quote.serviceName || quote.service_name || quote.service || quote.type || 'Servicio estándar'),
            deliveryDays: Number(quote.deliveryDays || quote.delivery_days || quote.days || quote.estimatedDays || quote.estimated_days || 3),
            price: totalPrice,
            currency: String(quote.currency || 'COP'),
            // Additional fields that might be needed for shipment
            idCarrier: Number(quote.idCarrier || quote.id_carrier || 0),
            idProduct: Number(quote.idProduct || quote.id_product || 0),
          }
        })
        setQuoteOptions(options)
      } else {
        console.error('Could not parse quotes from response:', quoteData)
        const statusMsg = quoteData.status_messages ? JSON.stringify(quoteData.status_messages) : ''
        alert('No hay cotizaciones disponibles para este destino. ' + statusMsg)
      }
    } catch (error) {
      console.error('Error getting quote:', error)
      alert('Error al conectar con EnvioClick')
    } finally {
      setQuoteLoading(false)
    }
  }

  async function handleCreateShipment(option: QuoteOption) {
    if (!selectedVentaForShipping) return

    const venta = selectedVentaForShipping

    if (!confirm(`¿Generar guía con ${option.carrier} por ${formatCurrency(option.price)}?`)) {
      return
    }

    setShipmentLoading(true)
    try {
      // Get DANE code
      const daneRes = await fetch(`/api/envioclick?city=${encodeURIComponent(venta.cliente_ciudad!.toLowerCase())}`)
      const daneData = await daneRes.json()

      // Create shipment
      const shipmentRes = await fetch('/api/envioclick?action=shipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idRate: option.serviceId, // serviceId contains the idRate from quote
          idCarrier: option.idCarrier,
          idProduct: option.idProduct,
          daneCode: daneData.daneCode,
          address: venta.cliente_direccion,
          firstName: venta.cliente_nombre?.split(' ')[0] || 'Cliente',
          lastName: venta.cliente_nombre?.split(' ').slice(1).join(' ') || '',
          phone: venta.cliente_telefono || '',
          email: venta.cliente_email || '',
          contentValue: venta.total,
          description: `${venta.producto_nombre} ${venta.producto_variante || ''}`.trim(),
        }),
      })

      const shipmentData = await shipmentRes.json()

      if (shipmentData.status === 'OK' && shipmentData.data) {
        // Update order with shipping info
        const updateRes = await fetch(`/api/whatsapp?id=${venta.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            envio_carrier: option.carrier,
            envio_tracking: shipmentData.data.tracker,
            envio_guia_url: shipmentData.data.url,
            envio_costo: option.price,
            envio_estado: 'Pendiente de Recolección',
            enviado: false,
          }),
        })

        if (updateRes.ok) {
          // Update local state
          setVentas(prev => prev.map(v =>
            v.id === venta.id ? {
              ...v,
              envio_carrier: option.carrier,
              envio_tracking: shipmentData.data.tracker,
              envio_guia_url: shipmentData.data.url,
              envio_costo: option.price,
              envio_estado: 'Pendiente de Recolección',
            } : v
          ))

          alert(`Guía generada exitosamente!\nTracking: ${shipmentData.data.tracker}`)
          setShippingDialogOpen(false)

          // Open PDF in new tab
          if (shipmentData.data.url) {
            window.open(shipmentData.data.url, '_blank')
          }
        }
      } else {
        console.error('Shipment error:', shipmentData)
        console.error('Full shipment error details:', JSON.stringify(shipmentData, null, 2))
        // Extract error messages from nested structure
        let errorMsg = 'Error desconocido'
        if (shipmentData.status_messages && Array.isArray(shipmentData.status_messages)) {
          const errors = shipmentData.status_messages
            .map((msg: { error?: string[] | string }) => {
              if (msg.error) {
                return Array.isArray(msg.error) ? msg.error.join(', ') : msg.error
              }
              return JSON.stringify(msg)
            })
            .join(' | ')
          errorMsg = errors
        }
        alert('Error al generar guía: ' + errorMsg)
      }
    } catch (error) {
      console.error('Error creating shipment:', error)
      alert('Error al conectar con EnvioClick')
    } finally {
      setShipmentLoading(false)
    }
  }

  // Fetch Siigo config (payment types, document types, and cities)
  async function fetchSiigoConfig() {
    setSiigoConfigLoading(true)
    setSiigoConfigError(null)

    try {
      const res = await fetch('/api/siigo')
      const data = await res.json()
      console.log('Siigo config response:', data)

      if (data.error) {
        console.error('Siigo config error:', data.error)
        setSiigoConfigError(data.error)
        return
      }

      // Payment types from Siigo API can be array or have results property
      const paymentTypes = Array.isArray(data.paymentTypes)
        ? data.paymentTypes
        : data.paymentTypes?.results || []

      // Document types (invoice types)
      const documentTypes = Array.isArray(data.documentTypes)
        ? data.documentTypes
        : data.documentTypes?.results || []

      console.log('Payment types loaded:', paymentTypes.length)
      console.log('Document types loaded:', documentTypes.length)

      if (paymentTypes.length === 0) {
        setSiigoConfigError('No se encontraron formas de pago. Verifica las credenciales de Siigo.')
      }

      setSiigoPaymentTypes(paymentTypes)
      setSiigoDocumentTypes(documentTypes)
      setSiigoCities(data.cities || [])

      // Auto-select first document type if only one available
      if (documentTypes.length === 1) {
        setInvoiceFormData(prev => ({ ...prev, documentId: documentTypes[0].id.toString() }))
      }
    } catch (error) {
      console.error('Error fetching Siigo config:', error)
      setSiigoConfigError(error instanceof Error ? error.message : 'Error conectando con Siigo')
    } finally {
      setSiigoConfigLoading(false)
    }
  }

  async function handleOpenInvoiceDialog(venta: VentaWA) {
    setSelectedVentaForInvoice(venta)

    // Always fetch fresh Siigo config to avoid stale payment type IDs
    await fetchSiigoConfig()

    // Pre-fill form with client data after config is loaded
    // (siigoDocumentTypes will be updated by fetchSiigoConfig)
    setInvoiceFormData({
      nit: venta.cliente_cedula || '',
      checkDigit: '',
      name: venta.cliente_nombre || '',
      address: venta.cliente_direccion || '',
      cityCode: '',
      stateCode: '',
      phone: venta.cliente_telefono || '',
      email: venta.cliente_email || '',
      paymentTypeId: '',
      documentId: '',
    })

    // Find matching city
    if (venta.cliente_ciudad && siigoCities.length > 0) {
      const cityLower = venta.cliente_ciudad.toLowerCase()
      const matchedCity = siigoCities.find(c => c.name.toLowerCase() === cityLower)
      if (matchedCity) {
        setInvoiceFormData(prev => ({
          ...prev,
          cityCode: matchedCity.cityCode,
          stateCode: matchedCity.stateCode,
        }))
      }
    }

    setInvoiceDialogOpen(true)
  }

  async function handleCreateInvoice() {
    if (!selectedVentaForInvoice) return

    // Validate required fields
    if (!invoiceFormData.nit || !invoiceFormData.name || !invoiceFormData.email || !invoiceFormData.paymentTypeId || !invoiceFormData.documentId) {
      alert('NIT, Nombre, Email, Tipo de documento y Forma de pago son requeridos')
      return
    }

    // Validate that selected payment type exists in current list
    const selectedPaymentType = siigoPaymentTypes.find(pt => pt.id.toString() === invoiceFormData.paymentTypeId)
    if (!selectedPaymentType) {
      console.error('Invalid payment type ID:', invoiceFormData.paymentTypeId)
      console.error('Available payment types:', siigoPaymentTypes.map(pt => ({ id: pt.id, name: pt.name })))
      alert('La forma de pago seleccionada no es válida. Por favor cierra el diálogo y vuelve a intentar.')
      return
    }

    // Debug logging
    console.log('Creating invoice with:', {
      paymentTypeId: invoiceFormData.paymentTypeId,
      paymentTypeName: selectedPaymentType.name,
      documentId: invoiceFormData.documentId,
      customerNit: invoiceFormData.nit,
    })

    setInvoiceLoading(true)
    try {
      // First, check if customer exists or create one
      const findRes = await fetch('/api/siigo?action=find-customer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identification: invoiceFormData.nit }),
      })

      const findData = await findRes.json()

      // If customer doesn't exist, create one
      if (!findData.customer) {
        const createCustomerRes = await fetch('/api/siigo?action=create-customer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nit: invoiceFormData.nit,
            checkDigit: invoiceFormData.checkDigit || '0',
            name: invoiceFormData.name,
            address: invoiceFormData.address || 'Sin dirección',
            cityCode: invoiceFormData.cityCode || '11001',
            stateCode: invoiceFormData.stateCode || '11',
            phone: invoiceFormData.phone || '3000000000',
            email: invoiceFormData.email,
          }),
        })

        const createCustomerData = await createCustomerRes.json()
        if (createCustomerData.error) {
          alert('Error creando cliente: ' + createCustomerData.error)
          setInvoiceLoading(false)
          return
        }
      }

      // Create invoice with shipping if available
      const invoiceRes = await fetch('/api/siigo?action=create-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceType: 'whatsapp',  // Use WhatsApp-specific Siigo config
          ventaId: selectedVentaForInvoice.id,
          customerIdentification: invoiceFormData.nit,
          date: format(new Date(), 'yyyy-MM-dd'),
          documentId: parseInt(invoiceFormData.documentId),
          items: [{
            code: selectedVentaForInvoice.producto_sku || 'PROD',
            description: `${selectedVentaForInvoice.producto_nombre} ${selectedVentaForInvoice.producto_variante || ''}`.trim(),
            quantity: selectedVentaForInvoice.cantidad,
            price: selectedVentaForInvoice.precio_unitario,
          }],
          paymentTypeId: parseInt(invoiceFormData.paymentTypeId),
          shippingCost: selectedVentaForInvoice.envio_costo || 0, // Include shipping cost if available
          observations: `Venta WhatsApp - ${selectedVentaForInvoice.cliente_nombre || 'Cliente'}`,
        }),
      })

      const invoiceData = await invoiceRes.json()

      if (invoiceData.error) {
        alert('Error creando factura: ' + invoiceData.error)
        setInvoiceLoading(false)
        return
      }

      // Update local state
      setVentas(prev => prev.map(v =>
        v.id === selectedVentaForInvoice.id ? {
          ...v,
          siigo_invoice_id: invoiceData.invoice.id,
          siigo_invoice_number: invoiceData.invoice.number,
        } : v
      ))

      alert(`Factura creada exitosamente!\nNúmero: ${invoiceData.invoice.number}`)
      setInvoiceDialogOpen(false)
    } catch (error) {
      console.error('Error creating invoice:', error)
      alert('Error al conectar con Siigo')
    } finally {
      setInvoiceLoading(false)
    }
  }

  useEffect(() => {
    fetchSiigoConfig()
  }, [])

  const formattedChartData = chartData.map(d => ({
    ...d,
    displayDate: format(new Date(d.date), 'dd MMM', { locale: es })
  }))

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
            <Button variant="ghost" className="rounded-none border-b-2 border-[#1DA9EF] text-[#1A2238] py-4">
              <MessageCircle className="h-4 w-4 mr-2" />
              WhatsApp
            </Button>
            <Link href="/dashboard/tiendas">
              <Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4">
                <Store className="h-4 w-4 mr-2" />
                Tiendas
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
            <Link href="/dashboard/inventario">
              <Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4">
                <Boxes className="h-4 w-4 mr-2" />
                Inventario
              </Button>
            </Link>
            <Link href="/dashboard/configuracion">
              <Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4">
                <Settings className="h-4 w-4 mr-2" />
                Configuración
              </Button>
            </Link>
          </nav>
        </div>
      </div>

      {/* Main */}
      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-[#1A2238] mb-2">Ventas WhatsApp</h1>
            <p className="text-[#545454]">Registro manual de ventas por WhatsApp</p>
          </div>
          <div className="flex items-center gap-2 mt-4 md:mt-0">
            <DateRangePicker date={dateRange} onDateChange={setDateRange} />

            {/* Import from text dialog */}
            <Dialog open={importDialogOpen} onOpenChange={(open) => {
              setImportDialogOpen(open)
              if (!open) {
                setImportStep('input')
                setImportResults(null)
              }
            }}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <FileText className="h-4 w-4 mr-2" />
                  Importar Texto
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-xl">
                <DialogHeader>
                  <DialogTitle>
                    {importStep === 'input' ? 'Importar desde WhatsApp' : 'Datos Encontrados'}
                  </DialogTitle>
                </DialogHeader>

                {importStep === 'input' ? (
                  <div className="space-y-4">
                    <p className="text-sm text-[#545454]">
                      Pega el bloque de texto del cliente. El AI analizará y extraerá los datos automáticamente.
                    </p>
                    <Textarea
                      value={importText}
                      onChange={e => setImportText(e.target.value)}
                      placeholder={`Ejemplo:
Nombre: Maria Moreno
Cédula: 22587285
Dirección: Cra 5 # 87-19
Barrio: Refugio
Ciudad: Bogota
Celular: 3175134486
Correo: cliente@email.com
Talla: 21
Diseño: chocolate`}
                      className="min-h-[200px] font-mono text-sm"
                    />
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
                        Cancelar
                      </Button>
                      <Button
                        onClick={handleImportWithAI}
                        disabled={!importText.trim() || importLoading}
                        className="bg-purple-600 hover:bg-purple-700 text-white"
                      >
                        {importLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Sparkles className="h-4 w-4 mr-2" />
                        )}
                        Analizar con AI
                      </Button>
                    </div>
                  </div>
                ) : importResults && (
                  <div className="space-y-4">
                    {/* Confidence indicator */}
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
                      importResults.confidence === 'high' ? 'bg-green-50 text-green-700' :
                      importResults.confidence === 'medium' ? 'bg-yellow-50 text-yellow-700' :
                      'bg-red-50 text-red-700'
                    }`}>
                      {importResults.confidence === 'high' ? <CheckCircle className="h-4 w-4" /> :
                       importResults.confidence === 'medium' ? <AlertTriangle className="h-4 w-4" /> :
                       <AlertTriangle className="h-4 w-4" />}
                      <span className="text-sm font-medium">
                        Confianza {importResults.confidence === 'high' ? 'alta' :
                                   importResults.confidence === 'medium' ? 'media' : 'baja'}
                      </span>
                    </div>

                    {/* Editable data fields */}
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { key: 'cliente_nombre', label: 'Nombre' },
                        { key: 'cliente_cedula', label: 'Cédula' },
                        { key: 'cliente_telefono', label: 'Teléfono' },
                        { key: 'cliente_email', label: 'Email' },
                        { key: 'cliente_direccion', label: 'Dirección (máx 50)' },
                        { key: 'cliente_barrio', label: 'Barrio' },
                        { key: 'cliente_ciudad', label: 'Ciudad' },
                        { key: 'cliente_indicaciones', label: 'Indicaciones' },
                        { key: 'producto', label: 'Producto' },
                        { key: 'talla', label: 'Talla' },
                      ].map(({ key, label }) => {
                        const value = importResults.data[key as keyof typeof importResults.data]
                        const isMissing = !value
                        return (
                          <div key={key}>
                            <Label className={`text-xs ${isMissing ? 'text-amber-600 font-medium' : 'text-gray-500'}`}>
                              {label} {isMissing && '*'}
                            </Label>
                            <Input
                              value={value?.toString() || ''}
                              onChange={(e) => {
                                setImportResults(prev => prev ? {
                                  ...prev,
                                  data: {
                                    ...prev.data,
                                    [key]: e.target.value || null
                                  },
                                  missing: prev.missing.filter(m => {
                                    const fieldMap: Record<string, string> = {
                                      'nombre': 'cliente_nombre',
                                      'teléfono': 'cliente_telefono',
                                      'telefono': 'cliente_telefono',
                                      'dirección': 'cliente_direccion',
                                      'direccion': 'cliente_direccion',
                                      'barrio': 'cliente_barrio',
                                      'ciudad': 'cliente_ciudad',
                                      'indicaciones': 'cliente_indicaciones',
                                      'cédula': 'cliente_cedula',
                                      'cedula': 'cliente_cedula',
                                      'email': 'cliente_email',
                                      'producto': 'producto',
                                      'talla': 'talla',
                                    }
                                    return fieldMap[m.toLowerCase()] !== key || !e.target.value
                                  })
                                } : null)
                              }}
                              placeholder={isMissing ? 'Completar...' : ''}
                              className={isMissing
                                ? 'border-amber-400 bg-amber-50 focus:border-amber-500 focus:ring-amber-500'
                                : 'border-green-200 bg-green-50'
                              }
                            />
                          </div>
                        )
                      })}
                    </div>

                    {/* Warnings */}
                    {importResults.warnings.length > 0 && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <p className="text-sm text-blue-700">
                          {importResults.warnings.join('. ')}
                        </p>
                      </div>
                    )}

                    <div className="flex justify-end gap-2 pt-2 border-t">
                      <Button variant="outline" onClick={handleCancelImport}>
                        Volver
                      </Button>
                      <Button
                        onClick={handleAcceptImportResults}
                        className="bg-[#1DA9EF] hover:bg-[#1DA9EF]/90 text-[#1A2238]"
                      >
                        <Check className="h-4 w-4 mr-2" />
                        Aceptar y Continuar
                      </Button>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-[#1DA9EF] hover:bg-[#1DA9EF]/90 text-[#1A2238]">
                  <Plus className="h-4 w-4 mr-2" />
                  Nueva Venta
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Registrar Venta WhatsApp</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="fecha">Fecha</Label>
                      <Input
                        id="fecha"
                        type="date"
                        value={formData.fecha}
                        onChange={e => setFormData({ ...formData, fecha: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="cantidad">Cantidad</Label>
                      <Input
                        id="cantidad"
                        type="number"
                        min="1"
                        value={formData.cantidad}
                        onChange={e => setFormData({ ...formData, cantidad: parseInt(e.target.value) || 1 })}
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Producto *</Label>
                    <Select value={selectedProduct} onValueChange={handleProductChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar producto" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map(product => (
                          <SelectItem key={product.id} value={product.id.toString()}>
                            {product.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {currentProduct && currentProduct.variants.length > 1 && (
                    <div>
                      <Label>Variante *</Label>
                      <Select value={selectedVariant} onValueChange={handleVariantChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar variante" />
                        </SelectTrigger>
                        <SelectContent>
                          {currentProduct.variants.map(variant => (
                            <SelectItem key={variant.id} value={variant.id.toString()}>
                              {variant.title} - {formatCurrency(variant.price)} {variant.sku && `(${variant.sku})`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>SKU</Label>
                      <Input
                        value={formData.producto_sku}
                        disabled
                        className="bg-gray-50"
                      />
                    </div>
                    <div>
                      <Label>Precio Unitario *</Label>
                      <Input
                        type="number"
                        min="0"
                        value={formData.precio_unitario}
                        onChange={e => setFormData({ ...formData, precio_unitario: parseFloat(e.target.value) || 0 })}
                        required
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="cliente_nombre">Cliente</Label>
                      <Input
                        id="cliente_nombre"
                        value={formData.cliente_nombre}
                        onChange={e => setFormData({ ...formData, cliente_nombre: e.target.value })}
                        placeholder="Nombre"
                      />
                    </div>
                    <div>
                      <Label htmlFor="cliente_telefono">Teléfono</Label>
                      <Input
                        id="cliente_telefono"
                        value={formData.cliente_telefono}
                        onChange={e => setFormData({ ...formData, cliente_telefono: e.target.value })}
                        placeholder="+57..."
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="cliente_cedula">Cédula</Label>
                      <Input
                        id="cliente_cedula"
                        value={formData.cliente_cedula}
                        onChange={e => setFormData({ ...formData, cliente_cedula: e.target.value })}
                        placeholder="123456789"
                      />
                    </div>
                    <div>
                      <Label htmlFor="cliente_email">Email</Label>
                      <Input
                        id="cliente_email"
                        type="email"
                        value={formData.cliente_email}
                        onChange={e => setFormData({ ...formData, cliente_email: e.target.value })}
                        placeholder="cliente@email.com"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="cliente_ciudad">Ciudad</Label>
                      <Input
                        id="cliente_ciudad"
                        value={formData.cliente_ciudad}
                        onChange={e => setFormData({ ...formData, cliente_ciudad: e.target.value })}
                        placeholder="Bogotá"
                      />
                    </div>
                    <div>
                      <Label htmlFor="cliente_direccion">Dirección</Label>
                      <Input
                        id="cliente_direccion"
                        value={formData.cliente_direccion}
                        onChange={e => setFormData({ ...formData, cliente_direccion: e.target.value })}
                        placeholder="Calle 123 #45-67"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="notas">Notas</Label>
                    <Textarea
                      id="notas"
                      value={formData.notas}
                      onChange={e => setFormData({ ...formData, notas: e.target.value })}
                      placeholder="Observaciones..."
                    />
                  </div>

                  <div className="flex justify-between items-center pt-4 border-t">
                    <div className="text-lg font-semibold">
                      Total: {formatCurrency(formData.cantidad * formData.precio_unitario)}
                    </div>
                    <Button type="submit" className="bg-[#1DA9EF] hover:bg-[#1DA9EF]/90 text-[#1A2238]">
                      Guardar
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-[#1A2238]" />
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-[#545454]">Ventas Totales</CardTitle>
                  <DollarSign className="h-4 w-4 text-[#545454]" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-[#1A2238]">{formatCurrency(stats.totalVentas)}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-[#545454]"># Ventas</CardTitle>
                  <ShoppingCart className="h-4 w-4 text-[#545454]" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-[#1A2238]">{stats.numVentas}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-[#545454]">Unidades</CardTitle>
                  <Package className="h-4 w-4 text-[#545454]" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-[#1A2238]">{stats.totalUnidades}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-[#545454]">Promedio/Venta</CardTitle>
                  <TrendingUp className="h-4 w-4 text-[#545454]" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-[#1A2238]">{formatCurrency(stats.promedioVenta)}</div>
                </CardContent>
              </Card>
            </div>

            {/* Chart */}
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="text-lg">Ventas por Día</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[250px]">
                  {formattedChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={formattedChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="displayDate" tick={{ fontSize: 12 }} stroke="#545454" />
                        <YAxis tick={{ fontSize: 12 }} stroke="#545454" tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                        <Tooltip
                          formatter={(value) => [formatCurrency(Number(value)), 'Ventas']}
                          contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
                        />
                        <Bar dataKey="sales" fill="#FFD93D" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-[#545454]">
                      No hay datos para mostrar
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Table */}
            <Card>
              <CardHeader>
                <CardTitle>Historial de Ventas</CardTitle>
              </CardHeader>
              <CardContent>
                {ventas.length === 0 ? (
                  <p className="text-[#545454] text-center py-8">No hay ventas registradas</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8"></TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Producto</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead className="text-center">Cant.</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-center">Envío</TableHead>
                        <TableHead className="text-center">Factura</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ventas.map((venta) => (
                        <>
                          <TableRow key={venta.id} className="cursor-pointer hover:bg-gray-50">
                            <TableCell onClick={() => toggleRowExpanded(venta.id)}>
                              {expandedRows.has(venta.id) ? (
                                <ChevronDown className="h-4 w-4 text-[#545454]" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-[#545454]" />
                              )}
                            </TableCell>
                            <TableCell className="text-[#545454]" onClick={() => toggleRowExpanded(venta.id)}>
                              {format(new Date(venta.fecha), 'dd MMM yyyy', { locale: es })}
                            </TableCell>
                            <TableCell onClick={() => toggleRowExpanded(venta.id)}>
                              <div className="font-medium">{venta.producto_nombre}</div>
                              {venta.producto_variante && (
                                <div className="text-xs text-[#545454]">{venta.producto_variante}</div>
                              )}
                            </TableCell>
                            <TableCell onClick={() => toggleRowExpanded(venta.id)}>
                              {venta.cliente_nombre || '-'}
                            </TableCell>
                            <TableCell className="text-center" onClick={() => toggleRowExpanded(venta.id)}>
                              {venta.cantidad}
                            </TableCell>
                            <TableCell className="text-right font-medium" onClick={() => toggleRowExpanded(venta.id)}>
                              {formatCurrency(venta.total)}
                            </TableCell>
                            <TableCell className="text-center">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleToggleEnviado(venta.id, venta.enviado)}
                                className={venta.enviado ? 'text-green-600 hover:text-green-700' : 'text-orange-500 hover:text-orange-600'}
                              >
                                {venta.enviado ? (
                                  <Truck className="h-4 w-4" />
                                ) : (
                                  <Clock className="h-4 w-4" />
                                )}
                              </Button>
                            </TableCell>
                            <TableCell className="text-center">
                              {venta.siigo_invoice_number ? (
                                <span className="inline-flex items-center gap-1 text-green-600 text-sm font-medium">
                                  <CheckCircle className="h-3 w-3" />
                                  {venta.siigo_invoice_number}
                                </span>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleOpenInvoiceDialog(venta)}
                                  className="text-blue-600 hover:text-blue-700"
                                  title="Facturar en Siigo"
                                >
                                  <Receipt className="h-4 w-4" />
                                </Button>
                              )}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDelete(venta.id)}
                                className="text-red-500 hover:text-red-700"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                          {expandedRows.has(venta.id) && (
                            <TableRow key={`${venta.id}-detail`} className="bg-gray-50">
                              <TableCell colSpan={9} className="py-4">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                  <div>
                                    <span className="text-[#545454]">Teléfono:</span>
                                    <p className="font-medium">{venta.cliente_telefono || '-'}</p>
                                  </div>
                                  <div>
                                    <span className="text-[#545454]">Cédula:</span>
                                    <p className="font-medium">{venta.cliente_cedula || '-'}</p>
                                  </div>
                                  <div>
                                    <span className="text-[#545454]">Email:</span>
                                    <p className="font-medium">{venta.cliente_email || '-'}</p>
                                  </div>
                                  <div>
                                    <span className="text-[#545454]">Ciudad:</span>
                                    <p className="font-medium">{venta.cliente_ciudad || '-'}</p>
                                  </div>
                                  <div className="md:col-span-2">
                                    <span className="text-[#545454]">Dirección:</span>
                                    <p className="font-medium">{venta.cliente_direccion || '-'}</p>
                                  </div>
                                  <div>
                                    <span className="text-[#545454]">SKU:</span>
                                    <p className="font-medium">{venta.producto_sku || '-'}</p>
                                  </div>
                                  <div>
                                    <span className="text-[#545454]">Precio Unitario:</span>
                                    <p className="font-medium">{formatCurrency(venta.precio_unitario)}</p>
                                  </div>
                                  {venta.notas && (
                                    <div className="md:col-span-4">
                                      <span className="text-[#545454]">Notas:</span>
                                      <p className="font-medium">{venta.notas}</p>
                                    </div>
                                  )}
                                </div>

                                {/* Shipping section */}
                                <div className="mt-4 pt-4 border-t">
                                  {venta.envio_tracking ? (
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-4">
                                        <div>
                                          <span className="text-[#545454] text-sm">Transportadora:</span>
                                          <p className="font-medium">{venta.envio_carrier}</p>
                                        </div>
                                        <div>
                                          <span className="text-[#545454] text-sm">Tracking:</span>
                                          <p className="font-medium">{venta.envio_tracking}</p>
                                        </div>
                                        <div>
                                          <span className="text-[#545454] text-sm">Costo envío:</span>
                                          <p className="font-medium">{formatCurrency(venta.envio_costo || 0)}</p>
                                        </div>
                                        <div>
                                          <span className="text-[#545454] text-sm">Estado:</span>
                                          <p className="font-medium">{venta.envio_estado}</p>
                                        </div>
                                      </div>
                                      {venta.envio_guia_url && (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => window.open(venta.envio_guia_url!, '_blank')}
                                        >
                                          <ExternalLink className="h-4 w-4 mr-2" />
                                          Ver Guía
                                        </Button>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="flex items-center justify-between">
                                      <span className="text-[#545454] text-sm">Sin guía de envío generada</span>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleOpenShippingDialog(venta)}
                                        disabled={!venta.cliente_ciudad || !venta.cliente_direccion}
                                      >
                                        <MapPin className="h-4 w-4 mr-2" />
                                        Cotizar Envío
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* Shipping Quote Dialog */}
        <Dialog open={shippingDialogOpen} onOpenChange={setShippingDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Cotizar Envío - EnvioClick</DialogTitle>
            </DialogHeader>
            {selectedVentaForShipping && (
              <div className="space-y-4">
                <div className="bg-gray-50 p-3 rounded-lg text-sm">
                  <p><strong>Destino:</strong> {selectedVentaForShipping.cliente_ciudad}</p>
                  <p><strong>Dirección:</strong> {selectedVentaForShipping.cliente_direccion}</p>
                  <p><strong>Cliente:</strong> {selectedVentaForShipping.cliente_nombre}</p>
                  <p><strong>Valor declarado:</strong> {formatCurrency(selectedVentaForShipping.total)}</p>
                </div>

                {quoteLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-[#1A2238] mr-2" />
                    <span className="text-[#545454]">Cotizando...</span>
                  </div>
                ) : quoteOptions.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm text-[#545454]">Selecciona una opción:</p>
                    {quoteOptions.map((option, index) => (
                      <div
                        key={index}
                        className="border rounded-lg p-3 hover:border-[#1DA9EF] cursor-pointer transition-colors"
                        onClick={() => !shipmentLoading && handleCreateShipment(option)}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{option.carrier}</p>
                            <p className="text-sm text-[#545454]">{option.serviceName}</p>
                            <p className="text-xs text-[#545454]">{option.deliveryDays} días hábiles</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-lg text-[#1A2238]">
                              {formatCurrency(option.price)}
                            </p>
                            {shipmentLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <p className="text-xs text-[#545454]">Click para generar</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-[#545454]">
                    <p>No hay cotizaciones disponibles.</p>
                    <p className="text-sm">Verifica la ciudad y dirección.</p>
                  </div>
                )}

                <div className="flex justify-end">
                  <Button variant="outline" onClick={() => setShippingDialogOpen(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Invoice Dialog (Siigo) */}
        <Dialog open={invoiceDialogOpen} onOpenChange={setInvoiceDialogOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Crear Factura - Siigo</DialogTitle>
            </DialogHeader>
            {selectedVentaForInvoice && (
              <div className="space-y-4">
                {/* Product info */}
                <div className="bg-gray-50 p-3 rounded-lg text-sm">
                  <p><strong>Producto:</strong> {selectedVentaForInvoice.producto_nombre} {selectedVentaForInvoice.producto_variante || ''}</p>
                  <p><strong>SKU:</strong> {selectedVentaForInvoice.producto_sku || 'N/A'}</p>
                  <p><strong>Cantidad:</strong> {selectedVentaForInvoice.cantidad}</p>
                  <p><strong>Precio Unitario:</strong> {formatCurrency(selectedVentaForInvoice.precio_unitario)}</p>
                  <p className="text-lg font-bold mt-2"><strong>Total:</strong> {formatCurrency(selectedVentaForInvoice.total)}</p>
                </div>

                {/* Customer data form */}
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <Label htmlFor="inv-nit">NIT / Cédula *</Label>
                      <Input
                        id="inv-nit"
                        value={invoiceFormData.nit}
                        onChange={e => setInvoiceFormData(prev => ({ ...prev, nit: e.target.value }))}
                        placeholder="900123456"
                      />
                    </div>
                    <div>
                      <Label htmlFor="inv-check">DV</Label>
                      <Input
                        id="inv-check"
                        value={invoiceFormData.checkDigit}
                        onChange={e => setInvoiceFormData(prev => ({ ...prev, checkDigit: e.target.value }))}
                        placeholder="0"
                        maxLength={1}
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="inv-name">Razón Social / Nombre *</Label>
                    <Input
                      id="inv-name"
                      value={invoiceFormData.name}
                      onChange={e => setInvoiceFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Empresa SAS"
                    />
                  </div>

                  <div>
                    <Label htmlFor="inv-email">Email *</Label>
                    <Input
                      id="inv-email"
                      type="email"
                      value={invoiceFormData.email}
                      onChange={e => setInvoiceFormData(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="contacto@empresa.com"
                    />
                  </div>

                  <div>
                    <Label htmlFor="inv-phone">Teléfono</Label>
                    <Input
                      id="inv-phone"
                      value={invoiceFormData.phone}
                      onChange={e => setInvoiceFormData(prev => ({ ...prev, phone: e.target.value }))}
                      placeholder="3001234567"
                    />
                  </div>

                  <div>
                    <Label htmlFor="inv-address">Dirección</Label>
                    <Input
                      id="inv-address"
                      value={invoiceFormData.address}
                      onChange={e => setInvoiceFormData(prev => ({ ...prev, address: e.target.value }))}
                      placeholder="Calle 123 #45-67"
                    />
                  </div>

                  <div>
                    <Label>Ciudad</Label>
                    <Select
                      value={invoiceFormData.cityCode}
                      onValueChange={val => {
                        const city = siigoCities.find(c => c.cityCode === val)
                        if (city) {
                          setInvoiceFormData(prev => ({
                            ...prev,
                            cityCode: city.cityCode,
                            stateCode: city.stateCode,
                          }))
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar ciudad" />
                      </SelectTrigger>
                      <SelectContent>
                        {siigoCities.map(city => (
                          <SelectItem key={city.cityCode} value={city.cityCode}>
                            {city.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Tipo de Documento *</Label>
                    {siigoConfigLoading ? (
                      <div className="flex items-center gap-2 text-gray-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Cargando...</span>
                      </div>
                    ) : siigoDocumentTypes.length > 0 ? (
                      <Select
                        value={invoiceFormData.documentId}
                        onValueChange={val => setInvoiceFormData(prev => ({ ...prev, documentId: val }))}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecciona tipo de documento..." />
                        </SelectTrigger>
                        <SelectContent>
                          {siigoDocumentTypes.map(dt => (
                            <SelectItem key={dt.id} value={dt.id.toString()}>
                              {dt.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="text-sm text-amber-600 bg-amber-50 p-2 rounded">
                        No se encontraron tipos de documento.
                      </div>
                    )}
                  </div>

                  <div>
                    <Label>Forma de Pago *</Label>
                    {siigoConfigLoading ? (
                      <div className="flex items-center gap-2 text-gray-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Cargando formas de pago...</span>
                      </div>
                    ) : siigoPaymentTypes.length > 0 ? (
                      <Select
                        value={invoiceFormData.paymentTypeId}
                        onValueChange={val => setInvoiceFormData(prev => ({ ...prev, paymentTypeId: val }))}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecciona forma de pago..." />
                        </SelectTrigger>
                        <SelectContent>
                          {siigoPaymentTypes.map(pt => (
                            <SelectItem key={pt.id} value={pt.id.toString()}>
                              {pt.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="text-sm text-amber-600 bg-amber-50 p-2 rounded">
                        No se encontraron formas de pago. Verifica tus credenciales de Siigo en Configuración.
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button variant="outline" onClick={() => setInvoiceDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleCreateInvoice}
                    disabled={invoiceLoading}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {invoiceLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creando...
                      </>
                    ) : (
                      <>
                        <Receipt className="h-4 w-4 mr-2" />
                        Crear Factura
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}
