import { NextResponse } from 'next/server'
import { requireAuth, getUserEnvioClickCredentials } from '@/lib/auth-helpers'

const API_BASE = 'https://api.envioclickpro.com.co/api/v2'

// Default origin address - used as fallback if user hasn't configured one
const DEFAULT_ORIGIN = {
  daneCode: '11001000', // Bogotá
  address: 'Direccion no configurada',
  company: 'Empresa',
  firstName: 'Usuario',
  lastName: 'Usuario',
  email: 'usuario@example.com',
  phone: '3000000000',
}

interface OriginAddress {
  daneCode: string
  address: string
  company: string
  firstName: string
  lastName: string
  email: string
  phone: string
  suburb?: string
  crossStreet?: string
  reference?: string
}

// POST /api/envioclick - Quote or create shipment
export async function POST(request: Request) {
  // Require authentication
  const { user, error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') // 'quote' or 'shipment'

  // Get user's EnvioClick credentials from database
  const credentials = await getUserEnvioClickCredentials(user!.id)
  const API_KEY = credentials?.envioclick_api_key

  if (!API_KEY) {
    return NextResponse.json({ error: 'EnvioClick no configurado. Configure su API key en la configuración.' }, { status: 400 })
  }

  // Parse origin address from user's integration settings
  let ORIGIN: OriginAddress = DEFAULT_ORIGIN
  if (credentials?.envioclick_origin_address) {
    try {
      const parsed = typeof credentials.envioclick_origin_address === 'string'
        ? JSON.parse(credentials.envioclick_origin_address)
        : credentials.envioclick_origin_address
      ORIGIN = { ...DEFAULT_ORIGIN, ...parsed }
    } catch (e) {
      console.error('Error parsing origin address:', e)
    }
  }

  const body = await request.json()

  try {
    if (action === 'quote') {
      // Get shipping quote
      const quoteData = {
        packages: [{
          weight: body.weight || 1,
          height: body.height || 10,
          width: body.width || 10,
          length: body.length || 15,
        }],
        description: body.description || 'Producto',
        contentValue: body.contentValue || 100000,
        origin: {
          daneCode: ORIGIN.daneCode,
          address: ORIGIN.address,
        },
        destination: {
          daneCode: body.daneCode || '11001000',
          address: body.address || '',
        },
      }

      console.log('EnvioClick Quote Request:', JSON.stringify(quoteData, null, 2))

      const response = await fetch(`${API_BASE}/quotation`, {
        method: 'POST',
        headers: {
          'Authorization': API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(quoteData),
      })

      const data = await response.json()
      console.log('EnvioClick Quote Response:', JSON.stringify(data, null, 2))
      return NextResponse.json(data)

    } else if (action === 'shipment') {
      // Format phone number (ensure it has country code)
      const formatPhone = (phone: string) => {
        if (!phone) return '3000000000'
        const cleaned = phone.replace(/\D/g, '')
        // If starts with 57, remove it (API might add it)
        if (cleaned.startsWith('57') && cleaned.length > 10) {
          return cleaned.substring(2)
        }
        return cleaned || '3000000000'
      }

      // Helper to truncate strings to max length
      const truncate = (str: string, max: number) => str ? str.substring(0, max) : ''
      const ensureMin = (str: string, min: number, defaultVal: string) =>
        str && str.length >= min ? str : defaultVal

      // Generate pickup date (tomorrow)
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const pickupDate = tomorrow.toISOString().split('T')[0]

      // Create shipment/guide with all required fields per API docs
      const shipmentData: Record<string, unknown> = {
        idRate: Number(body.idRate),
        myShipmentReference: truncate(`ORD-${Date.now()}`, 28), // Required: min 2, max 28
        requestPickup: true, // Solicitar recolección en dirección de origen
        pickupDate: pickupDate, // Required: yyyy-mm-dd (mañana)
        insurance: false, // Required boolean
        packages: [{
          weight: body.weight || 1,
          height: body.height || 10,
          width: body.width || 10,
          length: body.length || 15,
        }],
        description: truncate(body.description || 'Producto', 25), // max 25
        contentValue: body.contentValue || 100000,
        origin: {
          daneCode: ORIGIN.daneCode,
          address: truncate(ORIGIN.address, 50), // min 2, max 50 (but min 8 for destination)
          company: truncate(ORIGIN.company, 28), // min 2, max 28
          firstName: truncate(ORIGIN.firstName, 14), // min 2, max 14
          lastName: truncate(ORIGIN.lastName, 14), // min 2, max 14
          email: ORIGIN.email, // min 8, max 60
          phone: formatPhone(ORIGIN.phone), // exactly 10
          suburb: ORIGIN.suburb || 'Centro', // min 2, max 30
          crossStreet: truncate(ORIGIN.crossStreet || 'Calle principal', 35), // min 2, max 35
          reference: ORIGIN.reference || 'Oficina', // min 2, max 25 - REQUIRED
        },
        destination: {
          daneCode: body.daneCode,
          address: ensureMin(truncate(body.address || '', 50), 8, 'Direccion pendiente'), // min 8, max 50
          company: ensureMin(truncate(body.firstName || 'Cliente', 28), 2, 'Cliente'), // min 2, max 28
          firstName: ensureMin(truncate(body.firstName || 'Cliente', 14), 2, 'Cliente'), // min 2, max 14
          lastName: ensureMin(truncate(body.lastName || 'Cliente', 14), 2, 'Cliente'), // min 2, max 14
          email: body.email || 'cliente@example.com', // min 8, max 60
          phone: formatPhone(body.phone), // exactly 10
          suburb: ensureMin(truncate(body.suburb || 'Barrio', 30), 2, 'Barrio'), // min 2, max 30
          crossStreet: ensureMin(truncate(body.crossStreet || 'Calle principal', 35), 2, 'Calle principal'), // min 2, max 35
          reference: ensureMin(truncate(body.reference || 'Casa', 25), 2, 'Casa'), // min 2, max 25
        },
      }

      console.log('EnvioClick Shipment Request:', JSON.stringify(shipmentData, null, 2))

      const response = await fetch(`${API_BASE}/shipment`, {
        method: 'POST',
        headers: {
          'Authorization': API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(shipmentData),
      })

      const data = await response.json()
      console.log('EnvioClick Shipment Response:', JSON.stringify(data, null, 2))
      return NextResponse.json(data)

    } else if (action === 'track') {
      // Track shipment
      const response = await fetch(`${API_BASE}/track`, {
        method: 'POST',
        headers: {
          'Authorization': API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ trackingCode: body.trackingCode }),
      })

      const data = await response.json()
      return NextResponse.json(data)
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  } catch (error) {
    console.error('EnvioClick API error:', error)
    return NextResponse.json({ error: 'API request failed' }, { status: 500 })
  }
}

// GET /api/envioclick/dane - Get DANE codes (helper)
export async function GET(request: Request) {
  // Require authentication
  const { error } = await requireAuth()
  if (error) return error

  // Common DANE codes for Colombian cities
  const daneCodes: Record<string, string> = {
    'bogota': '11001000',
    'bogotá': '11001000',
    'medellin': '05001000',
    'medellín': '05001000',
    'cali': '76001000',
    'barranquilla': '08001000',
    'cartagena': '13001000',
    'bucaramanga': '68001000',
    'pereira': '66001000',
    'santa marta': '47001000',
    'manizales': '17001000',
    'pasto': '52001000',
    'neiva': '41001000',
    'villavicencio': '50001000',
    'armenia': '63001000',
    'ibague': '73001000',
    'ibagué': '73001000',
    'cucuta': '54001000',
    'cúcuta': '54001000',
    'monteria': '23001000',
    'montería': '23001000',
    'valledupar': '20001000',
    'popayan': '19001000',
    'popayán': '19001000',
    'sincelejo': '70001000',
    'tunja': '15001000',
    'riohacha': '44001000',
    'quibdo': '27001000',
    'quibdó': '27001000',
    'florencia': '18001000',
    'yopal': '85001000',
    'mocoa': '86001000',
    'arauca': '81001000',
    'leticia': '91001000',
    'inirida': '94001000',
    'inírida': '94001000',
    'mitu': '97001000',
    'mitú': '97001000',
    'puerto carreño': '99001000',
    'san jose del guaviare': '95001000',
    'san andrés': '88001000',
    'san andres': '88001000',
  }

  const { searchParams } = new URL(request.url)
  const city = searchParams.get('city')?.toLowerCase()

  if (city) {
    const code = daneCodes[city]
    return NextResponse.json({ city, daneCode: code || null })
  }

  return NextResponse.json({ daneCodes })
}
