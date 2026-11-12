import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { listExpenseDocuments, listAccountingJournals } from '@/lib/siigo-client'

export const maxDuration = 300

/** No writes to Siigo. Only Shopify expense lines leave the server. Payment
 * vouchers are excluded: paying a recognized expense is not a second expense. */
export async function GET() {
  const { error } = await requireAuth()
  if (error) return error
  const reads = await Promise.allSettled([
    listExpenseDocuments('purchases', '2026-09-01', '2026-11-12'),
    listExpenseDocuments('purchase-support-documents', '2026-09-01', '2026-11-12'),
    listAccountingJournals('2026-09-01', '2026-11-12'),
  ])
  const kinds = ['purchases', 'purchase-support-documents', 'journals']
  const documents = reads.flatMap((result, index) => {
    if (result.status !== 'fulfilled') return []
    return result.value.flatMap(document => {
      const data = document as unknown as Record<string, unknown>
      const items = (data.items || []) as Array<Record<string, unknown>>
      const lines = items.filter(item => {
        const account = item.account as { code?: string } | undefined
        return String(account?.code || item.code) === '52356005' || /shopify/i.test(String(item.description || ''))
      })
      if (!lines.length && !/shopify/i.test(String(data.observations || ''))) return []
      return [{ kind: kinds[index], id: document.id, name: data.name, date: document.date,
        total: data.total, currency: data.currency, annulled: data.annulled, stamp: data.stamp,
        items: lines.map(item => ({ account: item.account, code: item.code, type: item.type, quantity: item.quantity, price: item.price, total: item.total, value: item.value, taxes: item.taxes, description: item.description })),
        references: String(data.observations || '').match(/(?:shopify\s*\*?\s*|factura\s*)(\d{6,})/gi) || [],
      }]
    })
  })
  return NextResponse.json({ through: '2026-11-12', complete: reads.every(result => result.status === 'fulfilled'), sources: reads.map((result, index) => ({ kind: kinds[index], count: result.status === 'fulfilled' ? result.value.length : null, error: result.status === 'rejected' ? String(result.reason instanceof Error ? result.reason.message : 'Lectura incompleta') : null })), documents }, { headers: { 'Cache-Control': 'no-store' } })
}
