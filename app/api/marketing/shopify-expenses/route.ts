import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { listExpenseDocuments, listAccountingJournals } from '@/lib/siigo-client'

export const maxDuration = 300

/** No writes to Siigo. Only the selected marketing expense lines leave the server. Payment
 * vouchers are excluded: paying a recognized expense is not a second expense. */
export async function GET(request?: Request) {
  const { error } = await requireAuth()
  if (error) return error
  const category = request ? new URL(request.url).searchParams.get('category') : null
  if (category && category !== 'content' && category !== 'shoe') return NextResponse.json({ error: 'Categoría inválida' }, { status: 400 })
  const targetAccount = category === 'shoe' ? '6135' : category === 'content' ? '52356004' : '52356005'
  const pattern = category === 'shoe' ? /silver|platead|black|azul.*colegial|b[aá]sico/i : category === 'content' ? /agencia|contenid|community\s*manager|manejo.*redes|nati.*agenc/i : /shopify/i
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
        const code = String(account?.code || item.code || '')
        if (category === 'shoe') return kinds[index] === 'journals' ? code.startsWith(targetAccount) : pattern.test(String(item.description || ''))
        return code === targetAccount || (kinds[index] !== 'journals' || code.startsWith('5')) && pattern.test(String(item.description || ''))
      })
      if (!lines.length && !pattern.test(String(data.observations || ''))) return []
      return [{ kind: kinds[index], id: document.id, name: data.name, date: document.date,
        total: data.total, currency: data.currency, annulled: data.annulled, stamp: { status: (data.stamp as { status?: string } | undefined)?.status },
        items: lines.map(item => ({ account: item.account, product: item.product, code: item.code, type: item.type, quantity: item.quantity, price: item.price, discount: item.discount, total: item.total, value: item.value, taxes: item.taxes, description: item.description })),
        references: String(data.observations || '').match(/(?:shopify\s*\*?\s*|factura\s*)(\d{6,})/gi) || [],
      }]
    })
  })
  return NextResponse.json({ account: targetAccount, through: '2026-11-12', complete: reads.every(result => result.status === 'fulfilled'), sources: reads.map((result, index) => ({ kind: kinds[index], count: result.status === 'fulfilled' ? result.value.length : null, error: result.status === 'rejected' ? String(result.reason instanceof Error ? result.reason.message : 'Lectura incompleta') : null })), documents }, { headers: { 'Cache-Control': 'no-store' } })
}
