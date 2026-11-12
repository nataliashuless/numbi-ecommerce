import type { MonthlyCosts } from './contribution'
import siigoExpenses from '@/data/marketing-shopify-siigo-expenses.json'
import contentExpenses from '@/data/marketing-content-siigo-expenses.json'

/** Reviewed supplier documents replace their accounting cash entry, never add to it.
 * HostGator 6685364: paid COP 305,400 on 2026-08-04; annual service through 2027-08-03.
 * Shopify COP evidence: Davivienda statement 08/Sep–08/Oct, p2, merchant + bill ID.
 * Generic international debits in accountant emails are not verified Shopify charges.
 */
export function reviewedBillingCosts(input: MonthlyCosts): MonthlyCosts {
  const costs = structuredClone(input)
  const service = { start: '2026-08-04', end: '2027-08-03', amount: 305400 }
  for (let index = 0; index < 13; index++) {
    const date = new Date(Date.UTC(2026, 7 + index, 1))
    const month = date.toISOString().slice(0, 7)
    const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
    const first = month === '2026-08' ? service.start : `${month}-01`
    const last = month === '2027-08' ? service.end : end
    const days = (Date.parse(last) - Date.parse(first)) / 86400000 + 1
    costs[month] = { ...costs[month], servers: service.amount * days / 365, hostingService: service }
  }
  const months = {
    '2026-09': [
      { date: '2026-09-01', invoice: '582502042', usd: 231.37, cop: null },
      { date: '2026-09-02', invoice: '582670032', usd: 33.32, cop: null },
      { date: '2026-09-20', invoice: '592414575', usd: 46.50, cop: 151439 },
    ],
    '2026-10': [
      { date: '2026-10-01', invoice: '598034407', usd: 216.47, cop: null },
      { date: '2026-10-02', invoice: '598203492', usd: 31.53, cop: null },
      { date: '2026-10-31', invoice: '614615004', usd: 224.64, cop: null },
    ],
    '2026-11': [{ date: '2026-11-01', invoice: '614780490', usd: 26.16, cop: null }],
  }
  for (const [month, charges] of Object.entries(months)) {
    costs[month] = { ...costs[month], platformReview: {
      confirmedCop: charges.reduce((sum, charge) => sum + (charge.cop ?? 0), 0), charges,
      note: 'Revisión al 12/11/2026. Falta conciliar el total del mes con los movimientos bancarios. No se convierten USD con una TRM estimada ni se confirman débitos sin referencia Shopify.',
    } }
    delete costs[month].platformFee
  }
  for (const month of ['2026-09', '2026-10']) {
    const documents = siigoExpenses.documents.filter(document => document.date.startsWith(month))
    costs[month].platformAccounting = { through: siigoExpenses.through, account: siigoExpenses.account, documents }
    costs[month].platformFee = Math.round(documents.reduce((sum, document) => sum + document.amount, 0) * 100) / 100
    delete costs[month].platformReview
  }
  for (const month of ['2026-09', '2026-10', '2026-11']) {
    const documents = contentExpenses.documents.filter(document => document.date.startsWith(month))
    costs[month] = { ...costs[month], contentFee: Math.round(documents.reduce((sum, document) => sum + document.amount, 0) * 100) / 100,
      contentAccounting: { through: contentExpenses.through, account: contentExpenses.account, documents } }
    for (const field of ['agencyFee', 'agencyVariable', 'natiFee'] as const) delete costs[month][field]
  }
  return costs
}
