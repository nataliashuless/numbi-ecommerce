import { NextResponse } from 'next/server'

const API_BASE = 'https://api.envioclickpro.com.co/api/v2'
const API_KEY = process.env.ENVIOCLICKPRO_API_KEY

// Origin address (your warehouse/store)
const ORIGIN = {
  daneCode: '11001000', // Bogotá
  address: 'Calle 124 #19-46',
  company: 'Shuless',
  firstName: 'Carolina',
  lastName: 'Castillo',
  email: 'calzadoshuless@gmail.com',
  phone: '3125317939',
}

// POST /api/envioclick - Quote or create shipment
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') // 'quote' or 'shipment'

  if (!API_KEY) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
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
        description: body.description || 'Producto Shuless',
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
      console.log('Using API Key:', API_KEY ? 'Set' : 'NOT SET')

      const response = await fetch(`${API_BASE}/quotation`, {
        method: 'POST',
        headers: {
          'Authorization': API_KEY!,
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

      // Create shipment/guide
      const shipmentData = {
        idRate: Number(body.idRate), // Rate ID from quote (required)
        requestPickup: false, // No solicitar recolección automática
        packages: [{
          weight: body.weight || 1,
          height: body.height || 10,
          width: body.width || 10,
          length: body.length || 15,
        }],
        description: body.description || 'Producto Shuless',
        contentValue: body.contentValue || 100000,
        origin: {
          daneCode: ORIGIN.daneCode,
          address: ORIGIN.address,
          company: ORIGIN.company,
          firstName: ORIGIN.firstName,
          lastName: ORIGIN.lastName,
          email: ORIGIN.email,
          phone: ORIGIN.phone,
          suburb: 'Santa Barbara',
          crossStreet: 'Calle 124 con Carrera 19',
        },
        destination: {
          daneCode: body.daneCode,
          address: body.address,
          company: body.firstName || 'Cliente', // Use name as company if empty
          firstName: body.firstName || 'Cliente',
          lastName: body.lastName || 'Shuless',
          email: body.email || 'cliente@shuless.co',
          phone: formatPhone(body.phone),
          suburb: body.suburb && body.suburb.length >= 2 ? body.suburb.substring(0, 30) : 'Barrio',
          crossStreet: body.crossStreet || 'Calle principal',
          reference: body.reference || 'N/A',
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
