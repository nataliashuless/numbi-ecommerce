'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
  Loader2,
  ShoppingCart,
  MessageCircle,
  BarChart3,
  Store,
  Package,
  Boxes,
  Settings,
  CheckCircle,
  XCircle,
  Truck,
  Receipt,
  Facebook,
  LogOut,
  Plus,
  Trash2,
  FileText,
  TrendingUp,
  Tent,
  Megaphone,
} from 'lucide-react'

interface SiigoPaymentMethod {
  id: number
  name: string
}

interface SiigoCostCenter {
  id: number
  name: string
}

interface SiigoSeller {
  id: number
  first_name: string
  last_name: string
  username: string
}

interface SiigoTax {
  id: number
  name: string
  percentage: number
}

interface SiigoDocumentType {
  id: number
  name: string
}

interface Integration {
  shopify_shop: string | null
  shopify_access_token: string | null
  envioclick_api_key: string | null
  envioclick_origin_address: string | null
  siigo_username: string | null
  siigo_access_key: string | null
  siigo_payment_methods: SiigoPaymentMethod[] | null
  // Legacy user-level config (kept for backward compatibility)
  siigo_cost_center_id: number | null
  siigo_cost_center_name: string | null
  siigo_seller_id: number | null
  siigo_seller_name: string | null
  siigo_iva_tax_id: number | null
  siigo_default_document_id: number | null
  siigo_default_document_name: string | null
  // WhatsApp-specific Siigo config
  siigo_whatsapp_cost_center_id: number | null
  siigo_whatsapp_cost_center_name: string | null
  siigo_whatsapp_seller_id: number | null
  siigo_whatsapp_seller_name: string | null
  siigo_whatsapp_iva_tax_id: number | null
  siigo_whatsapp_default_document_id: number | null
  siigo_whatsapp_default_document_name: string | null
  // Meta Marketing API
  meta_access_token: string | null
  meta_ad_account_id: string | null
  meta_token_expires_at: string | null
}

export default function ConfiguracionPage() {
  const [loading, setLoading] = useState(true)
  const [savingShopify, setSavingShopify] = useState(false)
  const [savingSiigo, setSavingSiigo] = useState(false)
  const [savingEnvioClick, setSavingEnvioClick] = useState(false)
  const [integration, setIntegration] = useState<Integration>({
    shopify_shop: null,
    shopify_access_token: null,
    envioclick_api_key: null,
    envioclick_origin_address: null,
    siigo_username: null,
    siigo_access_key: null,
    siigo_payment_methods: null,
    siigo_cost_center_id: null,
    siigo_cost_center_name: null,
    siigo_seller_id: null,
    siigo_seller_name: null,
    siigo_iva_tax_id: null,
    siigo_default_document_id: null,
    siigo_default_document_name: null,
    siigo_whatsapp_cost_center_id: null,
    siigo_whatsapp_cost_center_name: null,
    siigo_whatsapp_seller_id: null,
    siigo_whatsapp_seller_name: null,
    siigo_whatsapp_iva_tax_id: null,
    siigo_whatsapp_default_document_id: null,
    siigo_whatsapp_default_document_name: null,
    meta_access_token: null,
    meta_ad_account_id: null,
    meta_token_expires_at: null,
  })

  const [savingMeta, setSavingMeta] = useState(false)
  const [testingMeta, setTestingMeta] = useState(false)
  const [metaConnected, setMetaConnected] = useState<boolean | null>(null)
  const [metaError, setMetaError] = useState<string | null>(null)

  // Siigo payment methods state
  const [siigoPaymentMethods, setSiigoPaymentMethods] = useState<SiigoPaymentMethod[]>([])
  const [newPaymentMethod, setNewPaymentMethod] = useState({ id: '', name: '' })
  const [savingPaymentMethods, setSavingPaymentMethods] = useState(false)

  // Siigo configuration options (fetched from Siigo API)
  const [siigoCostCenters, setSiigoCostCenters] = useState<SiigoCostCenter[]>([])
  const [siigoSellers, setSiigoSellers] = useState<SiigoSeller[]>([])
  const [siigoTaxes, setSiigoTaxes] = useState<SiigoTax[]>([])
  const [siigoDocumentTypes, setSiigoDocumentTypes] = useState<SiigoDocumentType[]>([])
  const [loadingSiigoOptions, setLoadingSiigoOptions] = useState(false)
  const [savingSiigoConfig, setSavingSiigoConfig] = useState(false)

  // Test connection states
  const [testingShopify, setTestingShopify] = useState(false)
  const [shopifyConnected, setShopifyConnected] = useState<boolean | null>(null)
  const [testingEnvioClick, setTestingEnvioClick] = useState(false)
  const [envioClickConnected, setEnvioClickConnected] = useState<boolean | null>(null)
  const [testingSiigo, setTestingSiigo] = useState(false)
  const [siigoConnected, setSiigoConnected] = useState<boolean | null>(null)

  // EnvioClick origin address
  const [originAddress, setOriginAddress] = useState({
    daneCode: '',
    address: '',
    company: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    suburb: '',
    crossStreet: '',
    reference: '',
  })

  async function fetchIntegration() {
    setLoading(true)
    try {
      const res = await fetch('/api/user/integrations')
      console.log('API Response status:', res.status)
      if (res.ok) {
        const data = await res.json()
        console.log('Full API response:', JSON.stringify(data, null, 2))
        console.log('envioclick_origin_address raw:', data.integration?.envioclick_origin_address)
        setIntegration(data.integration)

        // Load Siigo payment methods
        if (data.integration?.siigo_payment_methods) {
          const methods = Array.isArray(data.integration.siigo_payment_methods)
            ? data.integration.siigo_payment_methods
            : []
          setSiigoPaymentMethods(methods)
        }

        // Parse origin address if exists
        if (data.integration.envioclick_origin_address) {
          try {
            const parsed = typeof data.integration.envioclick_origin_address === 'string'
              ? JSON.parse(data.integration.envioclick_origin_address)
              : data.integration.envioclick_origin_address
            console.log('Parsed origin address:', parsed)
            // Map possible different field names
            setOriginAddress({
              daneCode: parsed.daneCode || parsed.dane_code || parsed.daneCodeOrigen || '',
              address: parsed.address || parsed.direccion || '',
              company: parsed.company || parsed.empresa || '',
              firstName: parsed.firstName || parsed.first_name || parsed.nombre || '',
              lastName: parsed.lastName || parsed.last_name || parsed.apellido || '',
              email: parsed.email || parsed.correo || '',
              phone: parsed.phone || parsed.telefono || parsed.celular || '',
              suburb: parsed.suburb || parsed.barrio || '',
              crossStreet: parsed.crossStreet || parsed.cross_street || '',
              reference: parsed.reference || parsed.referencia || '',
            })
          } catch (e) {
            console.error('Error parsing origin address:', e)
          }
        }
      }
    } catch (error) {
      console.error('Error fetching integration:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchIntegration()
  }, [])

  async function handleSave(
    fields: Record<string, unknown>,
    setSaving: (v: boolean) => void
  ) {
    setSaving(true)
    try {
      const res = await fetch('/api/user/integrations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })

      if (res.ok) {
        const data = await res.json()
        setIntegration(data.integration)
        alert('Guardado correctamente')
      } else {
        const errorData = await res.json()
        alert('Error: ' + errorData.error)
      }
    } catch (error) {
      console.error('Error saving:', error)
      alert('Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveOriginAddress() {
    await handleSave(
      { envioclick_origin_address: JSON.stringify(originAddress) },
      setSavingEnvioClick
    )
  }

  async function testShopifyConnection() {
    setTestingShopify(true)
    try {
      const res = await fetch('/api/shopify/products?limit=1')
      setShopifyConnected(res.ok)
    } catch {
      setShopifyConnected(false)
    } finally {
      setTestingShopify(false)
    }
  }

  async function testMetaConnection() {
    setTestingMeta(true)
    setMetaError(null)
    try {
      const res = await fetch('/api/meta/test')
      const data = await res.json()
      if (res.ok && data.ok) {
        setMetaConnected(true)
        if (data.account?.name) {
          setMetaError(`✓ Cuenta: ${data.account.name} · ${data.account.currency || ''} ${data.account.business_name ? `· ${data.account.business_name}` : ''}`)
        }
      } else {
        setMetaConnected(false)
        setMetaError(data.error || 'Error de conexión')
      }
    } catch (e) {
      setMetaConnected(false)
      setMetaError(e instanceof Error ? e.message : 'Error')
    } finally {
      setTestingMeta(false)
    }
  }

  async function testEnvioClickConnection() {
    setTestingEnvioClick(true)
    try {
      const res = await fetch('/api/envioclick')
      setEnvioClickConnected(res.ok)
    } catch {
      setEnvioClickConnected(false)
    } finally {
      setTestingEnvioClick(false)
    }
  }

  async function testSiigoConnection() {
    setTestingSiigo(true)
    try {
      const res = await fetch('/api/siigo?action=test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      setSiigoConnected(data.connected === true)
      if (data.connected === true) {
        // Load Siigo options when connection is successful
        await fetchSiigoOptions()
      } else if (data.error) {
        alert('Error de conexión: ' + data.error)
      }
    } catch (err) {
      setSiigoConnected(false)
      alert('Error al conectar con Siigo')
    } finally {
      setTestingSiigo(false)
    }
  }

  async function fetchSiigoOptions() {
    setLoadingSiigoOptions(true)
    try {
      const [costCentersRes, sellersRes, taxesRes, documentTypesRes] = await Promise.all([
        fetch('/api/siigo?action=cost-centers'),
        fetch('/api/siigo?action=sellers'),
        fetch('/api/siigo?action=taxes'),
        fetch('/api/siigo?action=document-types'),
      ])

      if (costCentersRes.ok) {
        const data = await costCentersRes.json()
        setSiigoCostCenters(data.costCenters || [])
      }
      if (sellersRes.ok) {
        const data = await sellersRes.json()
        setSiigoSellers(data.sellers || [])
      }
      if (taxesRes.ok) {
        const data = await taxesRes.json()
        setSiigoTaxes(data.taxes || [])
      }
      if (documentTypesRes.ok) {
        const data = await documentTypesRes.json()
        setSiigoDocumentTypes(data.documentTypes || [])
      }
    } catch (error) {
      console.error('Error fetching Siigo options:', error)
    } finally {
      setLoadingSiigoOptions(false)
    }
  }

  async function handleSaveSiigoConfig() {
    setSavingSiigoConfig(true)
    try {
      // Find selected names for reference (using WhatsApp-specific fields)
      const selectedCostCenter = siigoCostCenters.find(cc => cc.id === integration.siigo_whatsapp_cost_center_id)
      const selectedSeller = siigoSellers.find(s => s.id === integration.siigo_whatsapp_seller_id)
      const selectedTax = siigoTaxes.find(t => t.id === integration.siigo_whatsapp_iva_tax_id)
      const selectedDocType = siigoDocumentTypes.find(dt => dt.id === integration.siigo_whatsapp_default_document_id)

      // Save to WhatsApp-specific fields
      const updates = {
        siigo_whatsapp_cost_center_id: integration.siigo_whatsapp_cost_center_id,
        siigo_whatsapp_cost_center_name: selectedCostCenter?.name || null,
        siigo_whatsapp_seller_id: integration.siigo_whatsapp_seller_id,
        siigo_whatsapp_seller_name: selectedSeller ? `${selectedSeller.first_name} ${selectedSeller.last_name}` : null,
        siigo_whatsapp_iva_tax_id: integration.siigo_whatsapp_iva_tax_id,
        siigo_whatsapp_default_document_id: integration.siigo_whatsapp_default_document_id,
        siigo_whatsapp_default_document_name: selectedDocType?.name || null,
      }

      const res = await fetch('/api/user/integrations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })

      if (res.ok) {
        const data = await res.json()
        setIntegration(data.integration)
        alert('Configuración Siigo para WhatsApp guardada correctamente')
      } else {
        const errorData = await res.json()
        alert('Error: ' + errorData.error)
      }
    } catch (error) {
      console.error('Error saving Siigo config:', error)
      alert('Error al guardar configuración de Siigo')
    } finally {
      setSavingSiigoConfig(false)
    }
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
            <Link href="/dashboard/inventario">
              <Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4">
                <Boxes className="h-4 w-4 mr-2" />
                Inventario
              </Button>
            </Link>
            <Button variant="ghost" className="rounded-none border-b-2 border-[#1DA9EF] text-[#1A2238] py-4">
              <Settings className="h-4 w-4 mr-2" />
              Configuración
            </Button>
          </nav>
        </div>
      </div>

      {/* Main */}
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#1A2238] mb-2">Configuración</h1>
          <p className="text-[#545454]">Administra tus integraciones y credenciales</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-[#1A2238]" />
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {/* Shopify */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="h-5 w-5 text-[#1A2238]" />
                    <CardTitle>Shopify</CardTitle>
                  </div>
                  {shopifyConnected !== null && (
                    shopifyConnected ? (
                      <span className="flex items-center text-green-600 text-sm">
                        <CheckCircle className="h-4 w-4 mr-1" /> Conectado
                      </span>
                    ) : (
                      <span className="flex items-center text-red-500 text-sm">
                        <XCircle className="h-4 w-4 mr-1" /> Desconectado
                      </span>
                    )
                  )}
                </div>
                <CardDescription>Conexión a tu tienda Shopify</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="shopify-shop">Tienda (ej: mitienda.myshopify.com)</Label>
                  <Input
                    id="shopify-shop"
                    value={integration.shopify_shop || ''}
                    onChange={e => setIntegration(prev => ({ ...prev, shopify_shop: e.target.value }))}
                    placeholder="mitienda.myshopify.com"
                  />
                </div>
                <div>
                  <Label htmlFor="shopify-token">Access Token</Label>
                  <Input
                    id="shopify-token"
                    type="password"
                    value={integration.shopify_access_token || ''}
                    onChange={e => setIntegration(prev => ({ ...prev, shopify_access_token: e.target.value }))}
                    placeholder="shpat_..."
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => handleSave({
                      shopify_shop: integration.shopify_shop,
                      shopify_access_token: integration.shopify_access_token,
                    }, setSavingShopify)}
                    disabled={savingShopify}
                    className="bg-[#1DA9EF] hover:bg-[#1DA9EF]/90 text-[#1A2238]"
                  >
                    {savingShopify ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Guardar
                  </Button>
                  <Button
                    variant="outline"
                    onClick={testShopifyConnection}
                    disabled={testingShopify}
                  >
                    {testingShopify ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Probar Conexión
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Meta Marketing API */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Facebook className="h-5 w-5 text-[#1877F2]" />
                    <CardTitle>Meta Ads</CardTitle>
                  </div>
                  {metaConnected !== null && (
                    metaConnected ? (
                      <span className="flex items-center text-green-600 text-sm">
                        <CheckCircle className="h-4 w-4 mr-1" /> Conectado
                      </span>
                    ) : (
                      <span className="flex items-center text-red-500 text-sm">
                        <XCircle className="h-4 w-4 mr-1" /> Sin conexión
                      </span>
                    )
                  )}
                </div>
                <CardDescription>
                  Marketing API de Meta (Facebook/Instagram Ads). Usado para mostrar spend, impressions, CPA y ROAS en
                  /dashboard/marketing.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="meta_ad_account_id">Ad Account ID</Label>
                  <Input
                    id="meta_ad_account_id"
                    placeholder="act_1234567890"
                    value={integration.meta_ad_account_id || ''}
                    onChange={e => setIntegration(prev => ({ ...prev, meta_ad_account_id: e.target.value }))}
                  />
                  <p className="text-xs text-[#545454] mt-1">
                    En Ads Manager → arriba a la izquierda, formato <code className="bg-gray-100 px-1 rounded">act_NNNNNNNNNN</code>.
                  </p>
                </div>
                <div>
                  <Label htmlFor="meta_access_token">Access Token</Label>
                  <Input
                    id="meta_access_token"
                    type="password"
                    placeholder="EAA..."
                    value={integration.meta_access_token || ''}
                    onChange={e => setIntegration(prev => ({ ...prev, meta_access_token: e.target.value }))}
                  />
                  <p className="text-xs text-[#545454] mt-1">
                    Token long-lived (60 días) o de System User (no expira). Scope necesario: <code className="bg-gray-100 px-1 rounded">ads_read</code>.
                  </p>
                </div>
                <details className="text-xs text-[#545454]">
                  <summary className="cursor-pointer text-[#1A2238] font-medium">Cómo obtener el token (paso a paso)</summary>
                  <ol className="mt-2 space-y-1 list-decimal pl-5">
                    <li>Andate a <a href="https://developers.facebook.com" target="_blank" rel="noreferrer" className="text-[#1DA9EF] underline">developers.facebook.com</a> → Mis Apps → crear app tipo Business.</li>
                    <li>Agregar producto &quot;Marketing API&quot;.</li>
                    <li>Tools → Graph API Explorer → seleccionar app → Generate Access Token con scope <code>ads_read</code>.</li>
                    <li><b>Mejor</b>: en Business Settings → Users → System Users → crear uno, asignarle el ad account, y generar token (no expira).</li>
                    <li>Para Ad Account ID: Ads Manager → arriba izquierda, copiar el ID con prefijo <code>act_</code>.</li>
                  </ol>
                </details>
                {metaError && (
                  <div className={`text-sm p-2 rounded ${metaConnected ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {metaError}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    onClick={async () => {
                      setSavingMeta(true)
                      await handleSave(
                        {
                          meta_access_token: integration.meta_access_token,
                          meta_ad_account_id: integration.meta_ad_account_id,
                        },
                        setSavingMeta
                      )
                    }}
                    disabled={savingMeta}
                    className="bg-[#1877F2] hover:bg-[#0d65d9]"
                  >
                    {savingMeta ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Guardar
                  </Button>
                  <Button
                    variant="outline"
                    onClick={testMetaConnection}
                    disabled={testingMeta}
                  >
                    {testingMeta ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Probar Conexión
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Siigo */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Receipt className="h-5 w-5 text-blue-600" />
                    <CardTitle>Siigo</CardTitle>
                  </div>
                  {siigoConnected !== null && (
                    siigoConnected ? (
                      <span className="flex items-center text-green-600 text-sm">
                        <CheckCircle className="h-4 w-4 mr-1" /> Conectado
                      </span>
                    ) : (
                      <span className="flex items-center text-red-500 text-sm">
                        <XCircle className="h-4 w-4 mr-1" /> Desconectado
                      </span>
                    )
                  )}
                </div>
                <CardDescription>Facturación electrónica con Siigo</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-800">
                  <p className="font-medium mb-1">Cómo obtener credenciales:</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Ingresa a Siigo Nube como administrador</li>
                    <li>Ve a Alianzas e Integraciones → Credenciales</li>
                    <li>Copia el Usuario API y el Access Key</li>
                  </ol>
                </div>
                <div>
                  <Label htmlFor="siigo-username">Usuario API</Label>
                  <Input
                    id="siigo-username"
                    value={integration.siigo_username || ''}
                    onChange={e => setIntegration(prev => ({ ...prev, siigo_username: e.target.value }))}
                    placeholder="usuario@empresa.com"
                  />
                </div>
                <div>
                  <Label htmlFor="siigo-key">Access Key</Label>
                  <Input
                    id="siigo-key"
                    type="password"
                    value={integration.siigo_access_key || ''}
                    onChange={e => setIntegration(prev => ({ ...prev, siigo_access_key: e.target.value }))}
                    placeholder="..."
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => handleSave({
                      siigo_username: integration.siigo_username,
                      siigo_access_key: integration.siigo_access_key,
                    }, setSavingSiigo)}
                    disabled={savingSiigo}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {savingSiigo ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Guardar
                  </Button>
                  <Button
                    variant="outline"
                    onClick={testSiigoConnection}
                    disabled={testingSiigo || !integration.siigo_username || !integration.siigo_access_key}
                  >
                    {testingSiigo ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Probar Conexión
                  </Button>
                </div>

                {/* Siigo Configuration Section for WhatsApp - Shows when connected */}
                {siigoConnected && (
                  <div className="border-t pt-4 mt-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-[#1A2238]">Configuración Siigo - WhatsApp</h4>
                      {loadingSiigoOptions && (
                        <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                      )}
                    </div>
                    <p className="text-sm text-gray-500">
                      Configura los parámetros de Siigo para facturas generadas desde ventas WhatsApp.
                    </p>

                    {/* Centro de Costo */}
                    <div>
                      <Label>Centro de Costo</Label>
                      <Select
                        value={integration.siigo_whatsapp_cost_center_id?.toString() || ''}
                        onValueChange={(value) => setIntegration(prev => ({
                          ...prev,
                          siigo_whatsapp_cost_center_id: parseInt(value)
                        }))}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Seleccionar centro de costo" />
                        </SelectTrigger>
                        <SelectContent>
                          {siigoCostCenters.map((cc) => (
                            <SelectItem key={cc.id} value={cc.id.toString()}>
                              {cc.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {integration.siigo_whatsapp_cost_center_name && (
                        <p className="text-xs text-gray-500 mt-1">
                          Actual: {integration.siigo_whatsapp_cost_center_name}
                        </p>
                      )}
                    </div>

                    {/* Vendedor */}
                    <div>
                      <Label>Vendedor</Label>
                      <Select
                        value={integration.siigo_whatsapp_seller_id?.toString() || ''}
                        onValueChange={(value) => setIntegration(prev => ({
                          ...prev,
                          siigo_whatsapp_seller_id: parseInt(value)
                        }))}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Seleccionar vendedor" />
                        </SelectTrigger>
                        <SelectContent>
                          {siigoSellers.map((seller) => (
                            <SelectItem key={seller.id} value={seller.id.toString()}>
                              {seller.first_name} {seller.last_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {integration.siigo_whatsapp_seller_name && (
                        <p className="text-xs text-gray-500 mt-1">
                          Actual: {integration.siigo_whatsapp_seller_name}
                        </p>
                      )}
                    </div>

                    {/* Impuesto IVA */}
                    <div>
                      <Label>Impuesto IVA</Label>
                      <Select
                        value={integration.siigo_whatsapp_iva_tax_id?.toString() || ''}
                        onValueChange={(value) => setIntegration(prev => ({
                          ...prev,
                          siigo_whatsapp_iva_tax_id: parseInt(value)
                        }))}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Seleccionar impuesto IVA" />
                        </SelectTrigger>
                        <SelectContent>
                          {siigoTaxes.filter(t => t.percentage === 19).map((tax) => (
                            <SelectItem key={tax.id} value={tax.id.toString()}>
                              {tax.name} ({tax.percentage}%)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-500 mt-1">
                        ID actual: {integration.siigo_whatsapp_iva_tax_id || 3559} (default IVA 19%)
                      </p>
                    </div>

                    {/* Tipo de Documento */}
                    <div>
                      <Label>Tipo de Documento (Factura)</Label>
                      <Select
                        value={integration.siigo_whatsapp_default_document_id?.toString() || ''}
                        onValueChange={(value) => setIntegration(prev => ({
                          ...prev,
                          siigo_whatsapp_default_document_id: parseInt(value)
                        }))}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Seleccionar tipo de documento" />
                        </SelectTrigger>
                        <SelectContent>
                          {siigoDocumentTypes.map((docType) => (
                            <SelectItem key={docType.id} value={docType.id.toString()}>
                              {docType.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {integration.siigo_whatsapp_default_document_name && (
                        <p className="text-xs text-gray-500 mt-1">
                          Actual: {integration.siigo_whatsapp_default_document_name}
                        </p>
                      )}
                    </div>

                    {/* Botón Guardar Config */}
                    <Button
                      onClick={handleSaveSiigoConfig}
                      disabled={savingSiigoConfig}
                      className="bg-blue-600 hover:bg-blue-700 text-white w-full"
                    >
                      {savingSiigoConfig ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Guardar Configuración WhatsApp
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* EnvioClick */}
            <Card className="md:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Truck className="h-5 w-5 text-orange-500" />
                    <CardTitle>EnvioClick</CardTitle>
                  </div>
                  {envioClickConnected !== null && (
                    envioClickConnected ? (
                      <span className="flex items-center text-green-600 text-sm">
                        <CheckCircle className="h-4 w-4 mr-1" /> Conectado
                      </span>
                    ) : (
                      <span className="flex items-center text-red-500 text-sm">
                        <XCircle className="h-4 w-4 mr-1" /> Desconectado
                      </span>
                    )
                  )}
                </div>
                <CardDescription>Generación de guías de envío</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">Credenciales API</h4>
                      {integration.envioclick_api_key && (
                        <span className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" /> API Key guardada
                        </span>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="envioclick-key">API Key</Label>
                      <Input
                        id="envioclick-key"
                        type="password"
                        value={integration.envioclick_api_key || ''}
                        onChange={e => setIntegration(prev => ({ ...prev, envioclick_api_key: e.target.value }))}
                        placeholder="Ingresa tu API Key de EnvioClick"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleSave(
                          { envioclick_api_key: integration.envioclick_api_key },
                          setSavingEnvioClick
                        )}
                        disabled={savingEnvioClick}
                        className="bg-orange-500 hover:bg-orange-600 text-white"
                      >
                        {savingEnvioClick ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Guardar API Key
                      </Button>
                      <Button
                        variant="outline"
                        onClick={testEnvioClickConnection}
                        disabled={testingEnvioClick}
                      >
                        {testingEnvioClick ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Probar Conexión
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">Dirección de Origen (para recolección)</h4>
                      {originAddress.daneCode && (
                        <span className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" /> Configurado
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label>Código DANE Ciudad</Label>
                        <Input
                          value={originAddress.daneCode}
                          onChange={e => setOriginAddress(prev => ({ ...prev, daneCode: e.target.value }))}
                          placeholder="Ej: 11001000 (Bogotá)"
                        />
                      </div>
                      <div>
                        <Label>Teléfono</Label>
                        <Input
                          value={originAddress.phone}
                          onChange={e => setOriginAddress(prev => ({ ...prev, phone: e.target.value }))}
                          placeholder="Ej: 3001234567"
                        />
                      </div>
                    </div>
                    <div>
                      <Label>Dirección</Label>
                      <Input
                        value={originAddress.address}
                        onChange={e => setOriginAddress(prev => ({ ...prev, address: e.target.value }))}
                        placeholder="Ej: Calle 123 #45-67"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label>Empresa</Label>
                        <Input
                          value={originAddress.company}
                          onChange={e => setOriginAddress(prev => ({ ...prev, company: e.target.value }))}
                          placeholder="Ej: Mi Empresa SAS"
                        />
                      </div>
                      <div>
                        <Label>Barrio</Label>
                        <Input
                          value={originAddress.suburb}
                          onChange={e => setOriginAddress(prev => ({ ...prev, suburb: e.target.value }))}
                          placeholder="Ej: Centro"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label>Nombre</Label>
                        <Input
                          value={originAddress.firstName}
                          onChange={e => setOriginAddress(prev => ({ ...prev, firstName: e.target.value }))}
                          placeholder="Ej: Juan"
                        />
                      </div>
                      <div>
                        <Label>Apellido</Label>
                        <Input
                          value={originAddress.lastName}
                          onChange={e => setOriginAddress(prev => ({ ...prev, lastName: e.target.value }))}
                          placeholder="Ej: Pérez"
                        />
                      </div>
                    </div>
                    <div>
                      <Label>Email</Label>
                      <Input
                        value={originAddress.email}
                        onChange={e => setOriginAddress(prev => ({ ...prev, email: e.target.value }))}
                        placeholder="Ej: contacto@empresa.com"
                      />
                    </div>
                    <div>
                      <Label>Referencia</Label>
                      <Textarea
                        value={originAddress.reference}
                        onChange={e => setOriginAddress(prev => ({ ...prev, reference: e.target.value }))}
                        placeholder="Ej: Edificio azul, entrada principal"
                        rows={2}
                      />
                    </div>
                    <Button
                      onClick={handleSaveOriginAddress}
                      disabled={savingEnvioClick}
                      className="bg-orange-500 hover:bg-orange-600 text-white"
                    >
                      {savingEnvioClick ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Guardar Dirección de Origen
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  )
}
