import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'

interface SaleData {
  cliente_nombre: string
  cliente_cedula: string
  cliente_telefono: string
  cliente_email: string
  cliente_direccion: string
  cliente_ciudad: string
}

interface ValidationResult {
  isValid: boolean
  suggestions: Array<{
    field: string
    fieldLabel: string
    currentValue: string
    suggestedValue: string
    reason: string
  }>
  warnings: string[]
}

export async function POST(request: Request) {
  const { user, error } = await requireAuth()
  if (error) return error

  try {
    const saleData: SaleData = await request.json()

    // Get OpenAI API key from environment variable (system-wide)
    const openaiApiKey = process.env.OPENAI_API_KEY

    if (!openaiApiKey) {
      return NextResponse.json({
        error: 'OpenAI API key no configurada en el sistema.'
      }, { status: 500 })
    }

    // Build the prompt for GPT
    const prompt = `Eres un asistente de validación de datos para ventas de e-commerce en Colombia. Analiza los siguientes datos de un cliente y detecta errores o inconsistencias.

DATOS DEL CLIENTE:
- Nombre: "${saleData.cliente_nombre || ''}"
- Cédula/NIT: "${saleData.cliente_cedula || ''}"
- Teléfono: "${saleData.cliente_telefono || ''}"
- Email: "${saleData.cliente_email || ''}"
- Dirección: "${saleData.cliente_direccion || ''}"
- Ciudad: "${saleData.cliente_ciudad || ''}"

VALIDACIONES REQUERIDAS:
1. Detectar campos intercambiados (ej: dirección en campo de cédula, nombre en email)
2. Validar formatos:
   - Teléfono: debe tener 10 dígitos, empezar con 3
   - Email: formato válido con @
   - Cédula: solo números (6-10 dígitos para persona natural, 9 dígitos para NIT)
3. Si la dirección contiene barrio, ciudad o datos adicionales, sugerir separarlos
4. Detectar datos que parecen estar en el campo equivocado

IMPORTANTE:
- Si un campo está vacío, no lo marques como error a menos que sea crítico
- La ciudad puede estar vacía si está incluida en la dirección
- Sé específico en las sugerencias

Responde SOLO con un JSON válido con esta estructura:
{
  "isValid": boolean,
  "suggestions": [
    {
      "field": "nombre_campo_tecnico",
      "fieldLabel": "Nombre visible del campo",
      "currentValue": "valor actual",
      "suggestedValue": "valor sugerido corregido",
      "reason": "explicación breve"
    }
  ],
  "warnings": ["advertencias generales si las hay"]
}

Si todo está correcto, devuelve isValid: true con suggestions vacío.`

    // Call OpenAI API
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
            content: 'Eres un validador de datos preciso. Siempre respondes con JSON válido sin texto adicional.'
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
    let validationResult: ValidationResult
    try {
      // Clean the response (remove markdown code blocks if present)
      const cleanedContent = content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim()
      validationResult = JSON.parse(cleanedContent)
    } catch (parseError) {
      console.error('Error parsing OpenAI response:', content)
      return NextResponse.json({
        error: 'Error al procesar la respuesta de validación'
      }, { status: 500 })
    }

    return NextResponse.json(validationResult)

  } catch (err) {
    console.error('Validation error:', err)
    const message = err instanceof Error ? err.message : 'Error en validación'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
