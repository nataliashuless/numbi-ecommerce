import { NextResponse } from 'next/server'
import { requireAuth, getUserShopifyCredentials } from '@/lib/auth-helpers'

interface ParsedData {
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

interface ParseResult {
  data: ParsedData
  missing: string[]
  warnings: string[]
  confidence: 'high' | 'medium' | 'low'
}

interface ShopifyProduct {
  id: number
  title: string
  variants: Array<{
    id: number
    title: string
    price: string
    sku: string
  }>
}

// Fetch products from Shopify for RAG context
async function fetchProductCatalog(userId: string): Promise<string[]> {
  try {
    const credentials = await getUserShopifyCredentials(userId)
    if (!credentials?.shopify_shop || !credentials?.shopify_access_token) {
      return []
    }

    const response = await fetch(
      `https://${credentials.shopify_shop}/admin/api/2024-10/products.json?limit=250&fields=id,title,variants`,
      {
        headers: {
          'X-Shopify-Access-Token': credentials.shopify_access_token,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.ok) {
      console.error('Failed to fetch products for RAG')
      return []
    }

    const data = await response.json()
    const products: ShopifyProduct[] = data.products || []

    // Extract product names (titles)
    return products.map(p => p.title)
  } catch (error) {
    console.error('Error fetching products for RAG:', error)
    return []
  }
}

export async function POST(request: Request) {
  const { user, error } = await requireAuth()
  if (error) return error

  try {
    const { text } = await request.json()

    if (!text || text.trim().length === 0) {
      return NextResponse.json({
        error: 'Texto vacío'
      }, { status: 400 })
    }

    const openaiApiKey = process.env.OPENAI_API_KEY

    if (!openaiApiKey) {
      return NextResponse.json({
        error: 'OpenAI API key no configurada en el sistema.'
      }, { status: 500 })
    }

    // Fetch product catalog for RAG
    const productNames = await fetchProductCatalog(user!.id)
    const productCatalogContext = productNames.length > 0
      ? `\nCATÁLOGO DE PRODUCTOS DE LA TIENDA (usa estos nombres para identificar productos):\n${productNames.map(p => `- ${p}`).join('\n')}\n`
      : ''

    const prompt = `Eres un asistente que extrae datos de clientes de mensajes de WhatsApp para una tienda de zapatos/calzado en Colombia.
${productCatalogContext}
TEXTO DEL MENSAJE:
"""
${text}
"""

Extrae la siguiente información del texto. Si un campo no está presente, devuelve null.

CAMPOS A EXTRAER:
- cliente_nombre: Nombre completo del cliente (nombre de persona, no confundir con productos)
- cliente_cedula: Número de cédula o documento (solo números, 6-10 dígitos, sin puntos)
- cliente_telefono: Número de teléfono/celular (solo números, 10 dígitos, empieza con 3)
- cliente_email: Correo electrónico
- cliente_direccion: SOLO la dirección oficial (calle/carrera + número). Máximo 50 caracteres. Ejemplo: "Calle 152 # 12c-12 apto 916"
- cliente_barrio: Nombre del barrio o localidad. Ejemplo: "Cedritos", "Chapinero"
- cliente_ciudad: Ciudad de envío. Ejemplo: "Bogotá", "Medellín"
- cliente_indicaciones: Indicaciones adicionales de entrega (nombre del edificio, conjunto, referencias). Ejemplo: "Edificio Entrecedros, portería principal"
- producto: Nombre del producto/diseño (DEBE coincidir con uno del catálogo si está disponible)
- talla: Talla del zapato (número entre 18 y 45, típicamente 20-40 para adultos, 18-26 para niños)
- cantidad: Cantidad de productos (si no se menciona, asumir 1)

REGLAS IMPORTANTES:
1. Las TALLAS de zapatos son números entre 18-45. Si ves un número de 2 dígitos cerca de un producto, probablemente es la talla
2. La CÉDULA colombiana tiene 6-10 dígitos. Un número de 2 dígitos NO es cédula
3. El TELÉFONO tiene 10 dígitos y empieza con 3
4. Busca coincidencias con el catálogo de productos. Nombres cortos como "ama", "silver", "luna" pueden ser productos
5. Si el texto tiene formato "nombre_producto + número", el número probablemente es la talla
6. IMPORTANTE para la dirección:
   - cliente_direccion: SOLO calle/carrera con números y apartamento (máx 50 chars). Ej: "Cra 13A #91-53 apto 704"
   - cliente_barrio: El barrio por separado. Ej: "Chico"
   - cliente_indicaciones: Edificio, conjunto, referencias. Ej: "Torre Alameda, cerca al parque"
   - cliente_ciudad: Ciudad aparte. Ej: "Bogotá"

Responde SOLO con un JSON válido con esta estructura exacta:
{
  "data": {
    "cliente_nombre": "string o null",
    "cliente_cedula": "string o null",
    "cliente_telefono": "string o null",
    "cliente_email": "string o null",
    "cliente_direccion": "string o null (máx 50 chars, solo dirección oficial)",
    "cliente_barrio": "string o null",
    "cliente_ciudad": "string o null",
    "cliente_indicaciones": "string o null",
    "producto": "string o null",
    "talla": "string o null",
    "cantidad": number o null
  },
  "missing": ["lista de campos importantes que faltan"],
  "warnings": ["advertencias sobre datos que podrían estar mal"],
  "confidence": "high" | "medium" | "low"
}

Los campos importantes que deben estar para envío son: nombre, teléfono, dirección, ciudad.
Los campos importantes para facturación son: nombre, cédula, email.`

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Eres un parser de datos preciso. Siempre respondes con JSON válido sin texto adicional ni markdown.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 1000,
      }),
    })

    if (!openaiResponse.ok) {
      const errorData = await openaiResponse.json().catch(() => ({}))
      console.error('OpenAI API error:', errorData)
      return NextResponse.json({
        error: errorData.error?.message || 'Error al conectar con OpenAI'
      }, { status: 500 })
    }

    const openaiData = await openaiResponse.json()
    const content = openaiData.choices?.[0]?.message?.content

    if (!content) {
      return NextResponse.json({
        error: 'No se recibió respuesta de OpenAI'
      }, { status: 500 })
    }

    // Parse the JSON response
    let parseResult: ParseResult
    try {
      const cleanedContent = content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim()
      parseResult = JSON.parse(cleanedContent)
    } catch (parseError) {
      console.error('Error parsing OpenAI response:', content)
      return NextResponse.json({
        error: 'Error al procesar la respuesta del AI'
      }, { status: 500 })
    }

    return NextResponse.json(parseResult)

  } catch (err) {
    console.error('Parse error:', err)
    const message = err instanceof Error ? err.message : 'Error al parsear'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
