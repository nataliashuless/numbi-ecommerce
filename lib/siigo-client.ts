/**
 * Siigo API Client
 *
 * Handles authentication and API calls to Siigo for electronic invoicing.
 * Uses token caching to minimize authentication calls.
 */

import { getUserSiigoCredentials, getAdminClient } from './auth-helpers'

const AUTH_URL = 'https://services.siigo.com/alliances/api/siigoapi-users/v1/sign-in'
const API_BASE = 'https://api.siigo.com/v1'

// Token cache with 23-hour TTL (tokens last 24h)
const tokenCache: Map<string, { token: string; expires: number }> = new Map()
const TOKEN_TTL_MS = 23 * 60 * 60 * 1000 // 23 hours

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
    price: number // Price WITH IVA included (as shown to customer)
    taxId?: number
  }>
  paymentTypeId: number
  observations?: string
  documentId?: number
  shippingCost?: number // Shipping cost (with IVA included)
}

export interface SiigoConfig {
  costCenterId: number
  sellerId: number
  ivaTaxId: number
  defaultDocumentId?: number
}

/**
 * Get Siigo access token (with caching)
 */
export async function getSiigoToken(userId: string): Promise<string> {
  // Check cache first
  const cached = tokenCache.get(userId)
  if (cached && Date.now() < cached.expires) {
    return cached.token
  }

  // Get credentials from database
  const credentials = await getUserSiigoCredentials(userId)
  if (!credentials?.siigo_username || !credentials?.siigo_access_key) {
    throw new Error('Siigo no configurado. Configure sus credenciales en Configuración.')
  }

  // Request new token
  const response = await fetch(AUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username: credentials.siigo_username,
      access_key: credentials.siigo_access_key,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('Siigo auth error status:', response.status)
    console.error('Siigo auth error response:', errorText)

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

  if (!token) {
    throw new Error('No se recibió token de Siigo')
  }

  // Cache the token
  tokenCache.set(userId, {
    token,
    expires: Date.now() + TOKEN_TTL_MS,
  })

  return token
}

/**
 * Clear cached token for a user (useful when credentials change)
 */
export function clearSiigoTokenCache(userId: string): void {
  tokenCache.delete(userId)
}

/**
 * Make authenticated request to Siigo API
 */
async function siigoFetch(
  userId: string,
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getSiigoToken(userId)

  return fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Partner-Id': 'numbi',
      ...options.headers,
    },
  })
}

/**
 * Get user's Siigo configuration from database (legacy - use getSiigoConfigForSource instead)
 */
export async function getUserSiigoConfig(userId: string): Promise<SiigoConfig> {
  const supabase = getAdminClient()
  const { data } = await supabase
    .from('user_integrations')
    .select('siigo_cost_center_id, siigo_seller_id, siigo_iva_tax_id, siigo_default_document_id')
    .eq('user_id', userId)
    .single()

  return {
    costCenterId: data?.siigo_cost_center_id || 481,  // fallback to default
    sellerId: data?.siigo_seller_id || 171,  // fallback to default
    ivaTaxId: data?.siigo_iva_tax_id || 3559,  // fallback to IVA 19%
    defaultDocumentId: data?.siigo_default_document_id,
  }
}

/**
 * Get Siigo configuration for a specific source (WhatsApp or Tienda)
 */
export async function getSiigoConfigForSource(
  userId: string,
  sourceType: 'whatsapp' | 'tienda',
  tiendaId?: string
): Promise<SiigoConfig> {
  const supabase = getAdminClient()

  if (sourceType === 'whatsapp') {
    const { data } = await supabase
      .from('user_integrations')
      .select('siigo_whatsapp_cost_center_id, siigo_whatsapp_seller_id, siigo_whatsapp_iva_tax_id, siigo_whatsapp_default_document_id')
      .eq('user_id', userId)
      .single()

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
      .eq('user_id', userId)
      .single()

    return {
      costCenterId: data?.siigo_cost_center_id || 481,
      sellerId: data?.siigo_seller_id || 171,
      ivaTaxId: data?.siigo_iva_tax_id || 3559,
      defaultDocumentId: data?.siigo_default_document_id,
    }
  }

  // Fallback to defaults
  return {
    costCenterId: 481,
    sellerId: 171,
    ivaTaxId: 3559,
    defaultDocumentId: undefined,
  }
}

/**
 * Find customer by identification (NIT/Cédula)
 */
export async function findCustomerByIdentification(
  userId: string,
  identification: string
): Promise<SiigoCustomer | null> {
  const response = await siigoFetch(
    userId,
    `/customers?identification=${encodeURIComponent(identification)}`
  )

  if (!response.ok) {
    if (response.status === 404) return null
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.Message || `Error buscando cliente: ${response.status}`)
  }

  const data = await response.json()
  const customers = data.results || []

  return customers.length > 0 ? customers[0] : null
}

/**
 * Create customer in Siigo (handles both persons and companies)
 */
export async function createCustomer(
  userId: string,
  data: CreateCustomerData
): Promise<SiigoCustomer> {
  // Determine if it's a person (cédula) or company (NIT)
  // Colombian cédulas: 6-10 digits, NITs: 9 digits with check digit
  const identification = data.nit.replace(/\D/g, '') // Remove non-digits
  const isPersonaNatural = identification.length <= 10 && !data.checkDigit

  // Split name for persona natural
  const nameParts = data.name.trim().split(' ')
  const firstName = nameParts[0] || data.name
  const lastName = nameParts.slice(1).join(' ') || ''

  const customerData: Record<string, unknown> = {
    type: 'Customer',
    person_type: isPersonaNatural ? 'Person' : 'Company',
    id_type: isPersonaNatural ? '13' : '31', // 13=Cédula, 31=NIT
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
    fiscal_responsibilities: [{ code: 'R-99-PN' }], // No responsable
  }

  // Only add check_digit for companies (NIT)
  if (!isPersonaNatural && data.checkDigit) {
    customerData.check_digit = data.checkDigit
  }

  console.log('Creating Siigo customer:', JSON.stringify(customerData, null, 2))

  const response = await siigoFetch(userId, '/customers', {
    method: 'POST',
    body: JSON.stringify(customerData),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    console.error('Siigo create customer error:', errorData)
    const errorMsg = errorData.Message ||
                     errorData.Errors?.[0]?.Message ||
                     errorData.errors?.[0]?.message ||
                     JSON.stringify(errorData)
    throw new Error(errorMsg)
  }

  return response.json()
}

/**
 * Create invoice in Siigo
 */
export async function createInvoice(
  userId: string,
  data: CreateInvoiceData,
  config: SiigoConfig
): Promise<SiigoInvoice> {
  const IVA_TAX_ID = config.ivaTaxId  // Use configured IVA tax ID
  const IVA_RATE = 1.19  // Fixed rate for Colombia

  // Build items with IVA - prices come WITH IVA, we need to calculate base price
  const items = data.items.map(item => {
    // Calculate base price (without IVA) - round to avoid decimals
    const priceWithIva = item.price
    const basePrice = Math.round(priceWithIva / IVA_RATE)

    return {
      code: item.code || 'PROD',
      description: item.description.substring(0, 100), // Max 100 chars
      quantity: item.quantity,
      price: basePrice, // Base price without IVA
      taxes: [{ id: IVA_TAX_ID }], // Always add IVA 19%
    }
  })

  // Add shipping as a separate line item if provided
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

  // Calculate total (base prices * quantity, IVA will be added by Siigo)
  const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.price), 0)
  // Total with IVA for payment
  const totalWithIva = Math.round(subtotal * IVA_RATE)

  const invoiceData: Record<string, unknown> = {
    document: data.documentId ? { id: data.documentId } : undefined,
    date: data.date,
    customer: {
      identification: data.customerIdentification,
      branch_office: 0,
    },
    cost_center: config.costCenterId,  // Use configured cost center
    seller: config.sellerId,  // Use configured seller
    items,
    payments: [{
      id: data.paymentTypeId,
      value: totalWithIva,
      due_date: data.date,
    }],
    observations: data.observations || 'Venta WhatsApp - Numbi',
  }

  // Remove undefined values
  if (!invoiceData.document) delete invoiceData.document

  console.log('Creating Siigo invoice with data:', JSON.stringify(invoiceData, null, 2))

  const response = await siigoFetch(userId, '/invoices', {
    method: 'POST',
    body: JSON.stringify(invoiceData),
  })

  console.log('Siigo invoice response status:', response.status)

  if (!response.ok) {
    const errorText = await response.text()
    console.error('Siigo create invoice error raw:', errorText)

    let errorMessage = 'Error creando factura en Siigo'
    try {
      const errorData = JSON.parse(errorText)
      console.error('Siigo create invoice error parsed:', JSON.stringify(errorData, null, 2))
      errorMessage = errorData.Message || errorData.Errors?.[0]?.Message || errorData.error || JSON.stringify(errorData)
    } catch {
      errorMessage = errorText || `Error HTTP ${response.status}`
    }
    throw new Error(errorMessage)
  }

  return response.json()
}

/**
 * Get document types (invoice types)
 */
export async function getDocumentTypes(userId: string): Promise<Array<{ id: number; name: string }>> {
  const response = await siigoFetch(userId, '/document-types?type=FV')

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.Message || 'Error obteniendo tipos de documento')
  }

  return response.json()
}

/**
 * Common payment types - Users should verify IDs match their Siigo config
 * These IDs are examples and may vary per company
 */
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

/**
 * Get payment types from Siigo
 * Requires document_type parameter (FV = Factura de Venta)
 */
export async function getPaymentTypes(userId: string): Promise<Array<{ id: number; name: string; type: string; active?: boolean }>> {
  try {
    // Siigo API requires document_type parameter
    // FV = Factura de Venta (Sales Invoice)
    const response = await siigoFetch(userId, '/payment-types?document_type=FV')

    console.log('Siigo payment-types response status:', response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Siigo payment-types error:', errorText)

      // Parse error to understand the issue
      try {
        const errorJson = JSON.parse(errorText)
        console.error('Siigo error details:', JSON.stringify(errorJson, null, 2))
      } catch {}

      return DEFAULT_PAYMENT_TYPES
    }

    const data = await response.json()
    // Log full response to see structure including active field
    console.log('Siigo payment-types full response:', JSON.stringify(data).substring(0, 2000))

    // API returns an array directly
    let results: Array<{ id: number; name: string; type: string; active?: boolean }> = []

    if (Array.isArray(data)) {
      results = data
    } else if (data.results && Array.isArray(data.results)) {
      results = data.results
    }

    console.log('Payment types before filter:', results.length)

    // Filter only active payment types (active === true)
    // Also filter by type for sales invoices: type should be for customers (not just suppliers)
    const activeResults = results.filter(pt => pt.active === true)
    console.log('Payment types after active filter:', activeResults.length)
    console.log('Active payment types:', activeResults.map(pt => ({ id: pt.id, name: pt.name, active: pt.active })))

    return activeResults.length > 0 ? activeResults : DEFAULT_PAYMENT_TYPES
  } catch (error) {
    console.error('Error fetching payment types:', error)
    return DEFAULT_PAYMENT_TYPES
  }
}

/**
 * Get taxes
 */
export async function getTaxes(userId: string): Promise<Array<{ id: number; name: string; percentage: number }>> {
  const response = await siigoFetch(userId, '/taxes')

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.Message || 'Error obteniendo impuestos')
  }

  return response.json()
}

/**
 * Get cost centers from Siigo
 */
export async function getCostCenters(userId: string): Promise<Array<{ id: number; name: string }>> {
  const response = await siigoFetch(userId, '/cost-centers')

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.Message || 'Error obteniendo centros de costo')
  }

  return response.json()
}

/**
 * Get sellers (users) from Siigo
 */
export async function getSellers(userId: string): Promise<Array<{ id: number; first_name: string; last_name: string; username: string }>> {
  const response = await siigoFetch(userId, '/users')

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.Message || 'Error obteniendo vendedores')
  }

  const data = await response.json()
  // The API may return results in different formats
  return data.results || data || []
}

/**
 * Test connection with Siigo
 */
export async function testConnection(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await getSiigoToken(userId)
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    console.error('Siigo test connection error:', message)
    return { success: false, error: message }
  }
}

/**
 * Colombian city codes (DANE codes for Siigo)
 */
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
