import { NextResponse } from 'next/server'
import { requireAuth, getAdminClient } from '@/lib/auth-helpers'
import {
  findCustomerByIdentification,
  createCustomer,
  createInvoice,
  getDocumentTypes,
  getPaymentTypes,
  getTaxes,
  getCostCenters,
  getSellers,
  getSiigoConfigForSource,
  testConnection,
  clearSiigoTokenCache,
  COLOMBIAN_CITIES,
  type CreateCustomerData,
  type CreateInvoiceData,
} from '@/lib/siigo-client'

// POST /api/siigo - Various Siigo operations
export async function POST(request: Request) {
  const { user, error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')

  try {
    const body = await request.json().catch(() => ({}))

    switch (action) {
      case 'test-connection': {
        const result = await testConnection(user!.id)
        return NextResponse.json({ connected: result.success, error: result.error })
      }

      case 'find-customer': {
        const identification = body.identification
        if (!identification) {
          return NextResponse.json({ error: 'Identificación requerida' }, { status: 400 })
        }
        const customer = await findCustomerByIdentification(user!.id, identification)
        return NextResponse.json({ customer })
      }

      case 'create-customer': {
        const customerData: CreateCustomerData = {
          nit: body.nit,
          checkDigit: body.checkDigit,
          name: body.name,
          address: body.address,
          cityCode: body.cityCode,
          stateCode: body.stateCode,
          phone: body.phone,
          email: body.email,
          contactName: body.contactName,
        }

        if (!customerData.nit || !customerData.name || !customerData.email) {
          return NextResponse.json({ error: 'NIT, nombre y email son requeridos' }, { status: 400 })
        }

        const customer = await createCustomer(user!.id, customerData)
        return NextResponse.json({ customer })
      }

      case 'create-invoice': {
        const invoiceData: CreateInvoiceData = {
          customerIdentification: body.customerIdentification,
          date: body.date || new Date().toISOString().split('T')[0],
          items: body.items,
          paymentTypeId: body.paymentTypeId,
          observations: body.observations,
          documentId: body.documentId,
          shippingCost: body.shippingCost || 0,
        }

        if (!invoiceData.customerIdentification || !invoiceData.items?.length || !invoiceData.paymentTypeId) {
          return NextResponse.json({
            error: 'Cliente, items y forma de pago son requeridos'
          }, { status: 400 })
        }

        // Load Siigo configuration based on source type (whatsapp or tienda)
        const sourceType = body.sourceType || 'whatsapp'
        const tiendaId = body.tiendaId
        const siigoConfig = await getSiigoConfigForSource(user!.id, sourceType, tiendaId)
        console.log('Creating invoice with config for', sourceType, ':', siigoConfig)

        const invoice = await createInvoice(user!.id, invoiceData, siigoConfig)

        // If ventaId provided, update the venta_whatsapp record
        if (body.ventaId) {
          const supabase = getAdminClient()
          await supabase
            .from('ventas_whatsapp')
            .update({
              siigo_invoice_id: invoice.id,
              siigo_invoice_number: invoice.number,
            })
            .eq('id', body.ventaId)
            .eq('user_id', user!.id)
        }

        return NextResponse.json({ invoice })
      }

      case 'clear-cache': {
        clearSiigoTokenCache(user!.id)
        return NextResponse.json({ success: true })
      }

      default:
        return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
    }
  } catch (err) {
    console.error('Siigo API error:', err)
    const message = err instanceof Error ? err.message : 'Error en Siigo API'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// GET /api/siigo - Get Siigo configuration data
export async function GET(request: Request) {
  const { user, error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')

  try {
    switch (action) {
      case 'document-types': {
        const types = await getDocumentTypes(user!.id)
        return NextResponse.json({ documentTypes: types })
      }

      case 'payment-types': {
        const types = await getPaymentTypes(user!.id)
        return NextResponse.json({ paymentTypes: types })
      }

      case 'cost-centers': {
        const centers = await getCostCenters(user!.id)
        return NextResponse.json({ costCenters: centers })
      }

      case 'sellers': {
        const sellers = await getSellers(user!.id)
        return NextResponse.json({ sellers })
      }

      case 'debug-payment-types': {
        // Debug: return raw payment types from Siigo without filtering
        const { getSiigoToken } = await import('@/lib/siigo-client')
        const token = await getSiigoToken(user!.id)
        const response = await fetch('https://api.siigo.com/v1/payment-types?document_type=FV', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Partner-Id': 'numbi',
          },
        })
        const rawData = await response.json()
        return NextResponse.json({
          status: response.status,
          raw: rawData,
          count: Array.isArray(rawData) ? rawData.length : 'not array'
        })
      }

      case 'debug-cost-centers': {
        // Debug: get cost centers and sellers from Siigo
        const { getSiigoToken } = await import('@/lib/siigo-client')
        const token = await getSiigoToken(user!.id)

        const [costCentersRes, usersRes] = await Promise.all([
          fetch('https://api.siigo.com/v1/cost-centers', {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
              'Partner-Id': 'numbi',
            },
          }),
          fetch('https://api.siigo.com/v1/users', {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
              'Partner-Id': 'numbi',
            },
          })
        ])

        const costCenters = await costCentersRes.json()
        const users = await usersRes.json()

        return NextResponse.json({
          costCenters,
          users,
        })
      }

      case 'debug-ventas': {
        // Debug: check all ventas for this user
        const supabase = getAdminClient()
        const { data: ventas, error: ventasError } = await supabase
          .from('ventas_whatsapp')
          .select('id, fecha, cliente_nombre, producto_nombre, total, created_at')
          .eq('user_id', user!.id)
          .order('created_at', { ascending: false })
          .limit(20)

        // Also check stored payment methods
        const { data: integration } = await supabase
          .from('user_integrations')
          .select('siigo_payment_methods')
          .eq('user_id', user!.id)
          .single()

        return NextResponse.json({
          userId: user!.id,
          userEmail: user!.email,
          ventasCount: ventas?.length || 0,
          ventas: ventas || [],
          storedPaymentMethods: integration?.siigo_payment_methods || [],
          error: ventasError?.message
        })
      }

      case 'taxes': {
        const taxes = await getTaxes(user!.id)
        return NextResponse.json({ taxes })
      }

      case 'cities': {
        return NextResponse.json({ cities: COLOMBIAN_CITIES })
      }

      default:
        // Return all config
        const [documentTypes, paymentTypes, taxes] = await Promise.all([
          getDocumentTypes(user!.id).catch((e) => {
            console.error('Error fetching document types:', e)
            return []
          }),
          getPaymentTypes(user!.id).catch((e) => {
            console.error('Error fetching payment types:', e)
            return []
          }),
          getTaxes(user!.id).catch((e) => {
            console.error('Error fetching taxes:', e)
            return []
          }),
        ])

        console.log('Siigo config fetched:', {
          documentTypes: documentTypes?.length || 0,
          paymentTypes: paymentTypes?.length || 0,
          paymentTypesIds: paymentTypes?.map((p: { id: number }) => p.id),
          taxes: taxes?.length || 0,
        })

        // Return with no-cache headers to prevent stale data
        return NextResponse.json({
          documentTypes,
          paymentTypes,
          taxes,
          cities: COLOMBIAN_CITIES,
        }, {
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'Pragma': 'no-cache',
          }
        })
    }
  } catch (err) {
    console.error('Siigo API error:', err)
    const message = err instanceof Error ? err.message : 'Error en Siigo API'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
