type Item = { code?: string | null; quantity?: number | null; price?: number | null; total?: number | null }
type Invoice = { id: string; name?: string; credited_amount: number | null; items?: Item[] }
export type Credit = { id: string; total: number; date: string; annulled?: boolean; invoice?: { id?: string; name?: string }; items?: Item[] }
/** Returns correct the original demand observation, not a fictitious negative future sale. */
export function netCreditInvoices<T extends Invoice>(invoices: T[], credits: Credit[]) {
  const unique = [...new Map(credits.filter(c => !c.annulled).map(c => [c.id, c])).values()]
  return invoices.map(invoice => {
    const notes = unique.filter(c => c.invoice?.id === invoice.id || (!!invoice.name && c.invoice?.name === invoice.name))
    if (!notes.length) {
      if (Number(invoice.credited_amount) > 0 && (invoice as T & { total?: number }).total !== undefined && Number(invoice.credited_amount) < Number((invoice as T & { total?: number }).total))
        throw new Error(`Nota crédito parcial sin detalle por producto: ${invoice.name || invoice.id}`)
      return invoice
    }
    const returned = new Map<string, number>()
    for (const note of notes) for (const item of note.items || []) {
      if (item.code) returned.set(item.code, (returned.get(item.code) || 0) + Math.max(0, Number(item.quantity) || 0))
    }
    const items = (invoice.items || []).map(item => {
      const original = Math.max(0, Number(item.quantity) || 0)
      const removed = Math.min(original, returned.get(item.code || '') || 0)
      returned.set(item.code || '', (returned.get(item.code || '') || 0) - removed)
      const quantity = original - removed
      return { ...item, quantity, total: original > 0 ? Number(item.total || 0) * quantity / original : item.total }
    }).filter(item => Number(item.quantity) > 0)
    return { ...invoice, items, credited_amount: notes.reduce((n, c) => n + Math.max(0, Number(c.total) || 0), 0) }
  })
}
