export const FIRM_STORE_NIT = '830145876'
// The owner confirmed that production orders identified as Travesuras are
// committed to that outright-sale customer, not replenishment for our channels.
export function isFirmSaleProductionOrder(order: { numero: string | null }) {
  return /\btravesuras\b/i.test((order.numero || '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
}
export const DEFAULT_EXCLUDED_STORES = [
  'f6b22b8b-cbcc-4dfe-b13f-31f551e79cce', '7e317f42-035b-4786-a3ed-199e002a0761',
  'e7b2e7f8-b269-4f7e-9453-52fa31b58614', 'bb7ec817-5e7e-4e42-9d0d-a75bbc4f3975',
  'c7bc6d02-045b-4595-a4bf-c10135802196', '079bfe7e-81ab-4ae6-80bb-35796aadb66f',
]
export function forecastPolicy(value: unknown) {
  const v = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return { version: 1, leadTime: 52, reserveDays: 14, review: 'monthly',
    excludedStores: Array.isArray(v.excludedStores) ? [...new Set([...v.excludedStores.filter((x): x is string => typeof x === 'string'), DEFAULT_EXCLUDED_STORES[0]])] : DEFAULT_EXCLUDED_STORES,
    evaYear: typeof v.evaYear === 'string' ? v.evaYear : '', includeEva: v.includeEva === true,
  }
}
