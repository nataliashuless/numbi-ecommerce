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

export async function POST(request: Request) {
  const { error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')

  try {
    const body = await request.json().catch(() => ({}))

    switch (action) {
      case 'test-connection': {
        const result = await testConnection()
        return NextResponse.json({ connected: result.success, error: result.error })
      }

      case 'find-customer': {
        const identification = body.identification
        if (!identification) {
          return NextResponse.json({ error: 'Identificación requerida' }, { status: 400 })
        }
        const customer = await findCustomerByIdentification(identification)
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

        const customer = await createCustomer(customerData)
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

        const sourceType = body.sourceType || 'whatsapp'
        const tiendaId = body.tiendaId
        const siigoConfig = await getSiigoConfigForSource(sourceType, tiendaId)

        const invoice = await createInvoice(invoiceData, siigoConfig)

        if (body.ventaId) {
          const supabase = getAdminClient()
          await supabase
            .from('ventas_whatsapp')
            .update({
              siigo_invoice_id: invoice.id,
              siigo_invoice_number: invoice.number,
            })
            .eq('id', body.ventaId)
        }

        return NextResponse.json({ invoice })
      }

      case 'clear-cache': {
        clearSiigoTokenCache()
        return NextResponse.json({ success: true })
      }

      default:
        return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error en Siigo API'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(request: Request) {
  const { error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')

  try {
    switch (action) {
      case 'document-types': {
        const types = await getDocumentTypes()
        return NextResponse.json({ documentTypes: types })
      }

      case 'payment-types': {
        const types = await getPaymentTypes()
        return NextResponse.json({ paymentTypes: types })
      }

      case 'cost-centers': {
        const centers = await getCostCenters()
        return NextResponse.json({ costCenters: centers })
      }

      case 'sellers': {
        const sellers = await getSellers()
        return NextResponse.json({ sellers })
      }

      case 'taxes': {
        const taxes = await getTaxes()
        return NextResponse.json({ taxes })
      }

      case 'cities': {
        return NextResponse.json({ cities: COLOMBIAN_CITIES })
      }

      default: {
        const [documentTypes, paymentTypes, taxes] = await Promise.all([
          getDocumentTypes().catch(() => []),
          getPaymentTypes().catch(() => []),
          getTaxes().catch(() => []),
        ])

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
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error en Siigo API'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
