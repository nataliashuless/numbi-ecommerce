import { getSiigoCredentials, getAdminClient } from './auth-helpers'

const AUTH_URL = 'https://services.siigo.com/alliances/api/siigoapi-users/v1/sign-in'
const API_BASE = 'https://api.siigo.com/v1'

let cachedToken: { token: string; expires: number } | null = null
const TOKEN_TTL_MS = 23 * 60 * 60 * 1000

export interface SiigoCustomer {
  id: string
  identification: string
  check_digit: string
  name: string[]
  commercial_name: string
  branch_office: number
  active: boolean
  person_type: string
  address: {
    address: string
    city: {
      country_code: string
      state_code: string
      city_code: string
    }
  }
  phones: Array<{ number: string }>
  contacts: Array<{ first_name: string; last_name: string; email: string }>
}

export interface SiigoInvoice {
  id: string
  number: string
  name: string
  date: string
  total: number
}

export interface SiigoInvoiceListItem {
  id: string
  number: number
  name: string
  prefix: string
  date: string
  total: number
  balance: number
  customer: { id: string; identification: string; branch_office: number }
  observations: string
  items: Array<{
    code: string
    description: string
    quantity: number
    price: number
    total: number
  }>
}

export interface CreateCustomerData {
  nit: string
  checkDigit: string
  name: string
  address: string
  cityCode: string
  stateCode: string
  phone: string
  email: string
  contactName?: string
}

export interface CreateInvoiceData {
  customerIdentification: string
  date: string
  items: Array<{
    code: string
    description: string
    quantity: number
    price: number
    taxId?: number
  }>
  paymentTypeId: number
  observations?: string
  documentId?: number
  shippingCost?: number
}

export interface SiigoConfig {
  costCenterId: number
  sellerId: number
  ivaTaxId: number
  defaultDocumentId?: number
}

export async function getSiigoToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expires) {
    return cachedToken.token
  }

  const credentials = await getSiigoCredentials()
  if (!credentials?.siigo_username || !credentials?.siigo_access_key) {
    throw new Error('Siigo no configurado. Configure sus credenciales en Configuración.')
  }

  const response = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: credentials.siigo_username,
      access_key: credentials.siigo_access_key,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    let errorMessage = 'Error de autenticación con Siigo'
    try {
      const errorData = JSON.parse(errorText)
      errorMessage = errorData.Message || errorData.message || errorData.error || errorData.Error || JSON.stringify(errorData)
    } catch {
      errorMessage = errorText || `Error HTTP ${response.status}`
    }
    throw new Error(errorMessage)
  }

  const data = await response.json()
  const token = data.access_token
  if (!token) throw new Error('No se recibió token de Siigo')

  cachedToken = { token, expires: Date.now() + TOKEN_TTL_MS }
  return token
}

export function clearSiigoTokenCache(): void {
  cachedToken = null
}

async function siigoFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const token = await getSiigoToken()
  return fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Partner-Id': 'shuless',
      ...options.headers,
    },
  })
}

export async function getUserSiigoConfig(): Promise<SiigoConfig> {
  const supabase = getAdminClient()
  const { data } = await supabase
    .from('user_integrations')
    .select('siigo_cost_center_id, siigo_seller_id, siigo_iva_tax_id, siigo_default_document_id')
    .limit(1)
    .maybeSingle()

  return {
    costCenterId: data?.siigo_cost_center_id || 481,
    sellerId: data?.siigo_seller_id || 171,
    ivaTaxId: data?.siigo_iva_tax_id || 3559,
    defaultDocumentId: data?.siigo_default_document_id,
  }
}

export async function getSiigoConfigForSource(
  sourceType: 'whatsapp' | 'tienda',
  tiendaId?: string
): Promise<SiigoConfig> {
  const supabase = getAdminClient()

  if (sourceType === 'whatsapp') {
    const { data } = await supabase
      .from('user_integrations')
      .select('siigo_whatsapp_cost_center_id, siigo_whatsapp_seller_id, siigo_whatsapp_iva_tax_id, siigo_whatsapp_default_document_id')
      .limit(1)
      .maybeSingle()

    return {
      costCenterId: data?.siigo_whatsapp_cost_center_id || 481,
      sellerId: data?.siigo_whatsapp_seller_id || 171,
      ivaTaxId: data?.siigo_whatsapp_iva_tax_id || 3559,
      defaultDocumentId: data?.siigo_whatsapp_default_document_id,
    }
  } else if (sourceType === 'tienda' && tiendaId) {
    const { data } = await supabase
      .from('tiendas_terceros')
      .select('siigo_cost_center_id, siigo_seller_id, siigo_iva_tax_id, siigo_default_document_id')
      .eq('id', tiendaId)
      .single()

    return {
      costCenterId: data?.siigo_cost_center_id || 481,
      sellerId: data?.siigo_seller_id || 171,
      ivaTaxId: data?.siigo_iva_tax_id || 3559,
      defaultDocumentId: data?.siigo_default_document_id,
    }
  }

  return { costCenterId: 481, sellerId: 171, ivaTaxId: 3559, defaultDocumentId: undefined }
}

export async function findCustomerByIdentification(identification: string): Promise<SiigoCustomer | null> {
  const response = await siigoFetch(`/customers?identification=${encodeURIComponent(identification)}`)
  if (!response.ok) {
    if (response.status === 404) return null
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.Message || `Error buscando cliente: ${response.status}`)
  }
  const data = await response.json()
  const customers = data.results || []
  return customers.length > 0 ? customers[0] : null
}

export async function createCustomer(data: CreateCustomerData): Promise<SiigoCustomer> {
  const identification = data.nit.replace(/\D/g, '')
  const isPersonaNatural = identification.length <= 10 && !data.checkDigit
  const nameParts = data.name.trim().split(' ')
  const firstName = nameParts[0] || data.name
  const lastName = nameParts.slice(1).join(' ') || ''

  const customerData: Record<string, unknown> = {
    type: 'Customer',
    person_type: isPersonaNatural ? 'Person' : 'Company',
    id_type: isPersonaNatural ? '13' : '31',
    identification: identification,
    name: isPersonaNatural ? [firstName, lastName] : [data.name],
    address: {
      address: data.address || 'Sin dirección',
      city: {
        country_code: 'Co',
        state_code: data.stateCode || '11',
        city_code: data.cityCode || '11001',
      },
    },
    phones: [{ number: data.phone || '3000000000' }],
    contacts: [{
      first_name: firstName,
      last_name: lastName || firstName,
      email: data.email,
    }],
    fiscal_responsibilities: [{ code: 'R-99-PN' }],
  }

  if (!isPersonaNatural && data.checkDigit) {
    customerData.check_digit = data.checkDigit
  }

  const response = await siigoFetch('/customers', {
    method: 'POST',
    body: JSON.stringify(customerData),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    const errorMsg = errorData.Message ||
                     errorData.Errors?.[0]?.Message ||
                     errorData.errors?.[0]?.message ||
                     JSON.stringify(errorData)
    throw new Error(errorMsg)
  }

  return response.json()
}

export async function createInvoice(
  data: CreateInvoiceData,
  config: SiigoConfig
): Promise<SiigoInvoice> {
  const IVA_TAX_ID = config.ivaTaxId
  const IVA_RATE = 1.19

  const items = data.items.map(item => {
    const priceWithIva = item.price
    const basePrice = Math.round(priceWithIva / IVA_RATE)
    return {
      code: item.code || 'PROD',
      description: item.description.substring(0, 100),
      quantity: item.quantity,
      price: basePrice,
      taxes: [{ id: IVA_TAX_ID }],
    }
  })

  if (data.shippingCost && data.shippingCost > 0) {
    const shippingBasePrice = Math.round(data.shippingCost / IVA_RATE)
    items.push({
      code: 'ENVIO',
      description: 'Costo de envío',
      quantity: 1,
      price: shippingBasePrice,
      taxes: [{ id: IVA_TAX_ID }],
    })
  }

  const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.price), 0)
  const totalWithIva = Math.round(subtotal * IVA_RATE)

  const invoiceData: Record<string, unknown> = {
    document: data.documentId ? { id: data.documentId } : undefined,
    date: data.date,
    customer: {
      identification: data.customerIdentification,
      branch_office: 0,
    },
    cost_center: config.costCenterId,
    seller: config.sellerId,
    items,
    payments: [{
      id: data.paymentTypeId,
      value: totalWithIva,
      due_date: data.date,
    }],
    observations: data.observations || 'Venta WhatsApp - Shuless',
  }

  if (!invoiceData.document) delete invoiceData.document

  const response = await siigoFetch('/invoices', {
    method: 'POST',
    body: JSON.stringify(invoiceData),
  })

  if (!response.ok) {
    const errorText = await response.text()
    let errorMessage = 'Error creando factura en Siigo'
    try {
      const errorData = JSON.parse(errorText)
      errorMessage = errorData.Message || errorData.Errors?.[0]?.Message || errorData.error || JSON.stringify(errorData)
    } catch {
      errorMessage = errorText || `Error HTTP ${response.status}`
    }
    throw new Error(errorMessage)
  }

  return response.json()
}

export async function listInvoices(
  startDate: string,
  endDate: string
): Promise<SiigoInvoiceListItem[]> {
  const all: SiigoInvoiceListItem[] = []
  const pageSize = 100
  let page = 1

  while (true) {
    const url = `/invoices?created_start=${startDate}&created_end=${endDate}&page_size=${pageSize}&page=${page}`
    const response = await siigoFetch(url)
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.Message || `Error listando facturas Siigo: ${response.status}`)
    }
    const data = await response.json()
    const results: SiigoInvoiceListItem[] = data.results || []
    all.push(...results)

    const total = data.pagination?.total_results ?? all.length
    if (all.length >= total || results.length < pageSize) break
    page++
    if (page > 50) break
  }

  return all
}

export async function getCustomersByIds(ids: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids))
  const result = new Map<string, string>()
  const CONCURRENCY = 8

  async function fetchOne(id: string): Promise<void> {
    try {
      const response = await siigoFetch(`/customers/${id}`)
      if (!response.ok) return
      const data = await response.json()
      const name = Array.isArray(data.name)
        ? data.name.filter(Boolean).join(' ').trim()
        : (data.commercial_name || '').trim()
      if (name) result.set(id, name)
    } catch {
      // skip
    }
  }

  for (let i = 0; i < unique.length; i += CONCURRENCY) {
    const batch = unique.slice(i, i + CONCURRENCY)
    await Promise.all(batch.map(fetchOne))
  }

  return result
}

export async function getDocumentTypes(): Promise<Array<{ id: number; name: string }>> {
  const response = await siigoFetch('/document-types?type=FV')
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.Message || 'Error obteniendo tipos de documento')
  }
  return response.json()
}

const DEFAULT_PAYMENT_TYPES = [
  { id: 1, name: 'Efectivo', type: 'Efectivo' },
  { id: 2, name: 'Tarjeta Crédito', type: 'Tarjeta' },
  { id: 3, name: 'Tarjeta Débito', type: 'Tarjeta' },
  { id: 4, name: 'Transferencia Bancaria', type: 'Transferencia' },
  { id: 5, name: 'Nequi', type: 'Transferencia' },
  { id: 6, name: 'Daviplata', type: 'Transferencia' },
  { id: 7, name: 'Consignación', type: 'Consignación' },
  { id: 8, name: 'Crédito', type: 'Crédito' },
]

export async function getPaymentTypes(): Promise<Array<{ id: number; name: string; type: string; active?: boolean }>> {
  try {
    const response = await siigoFetch('/payment-types?document_type=FV')
    if (!response.ok) return DEFAULT_PAYMENT_TYPES

    const data = await response.json()
    let results: Array<{ id: number; name: string; type: string; active?: boolean }> = []
    if (Array.isArray(data)) results = data
    else if (data.results && Array.isArray(data.results)) results = data.results

    const activeResults = results.filter(pt => pt.active === true)
    return activeResults.length > 0 ? activeResults : DEFAULT_PAYMENT_TYPES
  } catch {
    return DEFAULT_PAYMENT_TYPES
  }
}

export async function getTaxes(): Promise<Array<{ id: number; name: string; percentage: number }>> {
  const response = await siigoFetch('/taxes')
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.Message || 'Error obteniendo impuestos')
  }
  return response.json()
}

export async function getCostCenters(): Promise<Array<{ id: number; name: string }>> {
  const response = await siigoFetch('/cost-centers')
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.Message || 'Error obteniendo centros de costo')
  }
  return response.json()
}

export async function getSellers(): Promise<Array<{ id: number; first_name: string; last_name: string; username: string }>> {
  const response = await siigoFetch('/users')
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.Message || 'Error obteniendo vendedores')
  }
  const data = await response.json()
  return data.results || data || []
}

export async function testConnection(): Promise<{ success: boolean; error?: string }> {
  try {
    await getSiigoToken()
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return { success: false, error: message }
  }
}

export const COLOMBIAN_CITIES: Array<{ name: string; stateCode: string; cityCode: string }> = [
  { name: 'Bogotá', stateCode: '11', cityCode: '11001' },
  { name: 'Medellín', stateCode: '05', cityCode: '05001' },
  { name: 'Cali', stateCode: '76', cityCode: '76001' },
  { name: 'Barranquilla', stateCode: '08', cityCode: '08001' },
  { name: 'Cartagena', stateCode: '13', cityCode: '13001' },
  { name: 'Bucaramanga', stateCode: '68', cityCode: '68001' },
  { name: 'Pereira', stateCode: '66', cityCode: '66001' },
  { name: 'Santa Marta', stateCode: '47', cityCode: '47001' },
  { name: 'Manizales', stateCode: '17', cityCode: '17001' },
  { name: 'Pasto', stateCode: '52', cityCode: '52001' },
  { name: 'Neiva', stateCode: '41', cityCode: '41001' },
  { name: 'Villavicencio', stateCode: '50', cityCode: '50001' },
  { name: 'Armenia', stateCode: '63', cityCode: '63001' },
  { name: 'Ibagué', stateCode: '73', cityCode: '73001' },
  { name: 'Cúcuta', stateCode: '54', cityCode: '54001' },
  { name: 'Montería', stateCode: '23', cityCode: '23001' },
  { name: 'Valledupar', stateCode: '20', cityCode: '20001' },
  { name: 'Popayán', stateCode: '19', cityCode: '19001' },
  { name: 'Sincelejo', stateCode: '70', cityCode: '70001' },
  { name: 'Tunja', stateCode: '15', cityCode: '15001' },
]
