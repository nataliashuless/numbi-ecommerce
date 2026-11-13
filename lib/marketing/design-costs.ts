export type DesignCostInput = { date: string; design: string; category: string; units: number; sku?: string }
export type DesignCostSource = { effectiveFrom: string; sourceUrl: string; entries: Array<{ design: string; category: string; unitCost: number | null }> }
export type MonthlySkuCostSource = { reviewedAt: string; sourceUrl: string; entries: Array<{ month: string; sku: string; product: string; category: string; unitCost: number; sheet: string; cell: string }> }
export type DesignCostEstimate = {
  effectiveFrom: string; sourceUrl: string; units: number; coveredUnits: number; knownCost: number
  months: Array<{ month: string; units: number; coveredUnits: number; knownCost: number }>
  designs: Array<{ design: string; category: string; units: number; unitCost: number | null; cost: number | null }>
  siigo?: { reviewedAt: string; sourceUrl: string; units: number; cost: number; entries: Array<{ month: string; sku: string; product: string; units: number; unitCost: number; cost: number; sheet: string; cell: string }> }
}
function key(value: string) {
  const base = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/^eva(?:feli|sebas)\d+-/i, '').replace(/\s*\(proyecto\s+felipe\)/i, '')
    .replace(/\s+felipe$/, '').replace(/\s*[·|].*$/, '').replace(/\s+/g, ' ').trim()
  return ({ 'black colegial oc 25 mayo 2026': 'negro colegial', 'colegial negro': 'negro colegial', 'sandalia alicia cafe': 'alicia cafe' } as Record<string, string>)[base] || base
}
// Reviewed against the Siigo product catalog on 2026-11-12. Match only these
// exact SKUs and categories; a generic “Black” title is not enough evidence.
const reviewedSkuDesigns: Record<string, { design: string; category: string }> = {
  'WC-1112': { design: 'Básico Niña', category: 'Bebé / Pequeños Caminantes' },
  '181': { design: 'Negro Colegial', category: 'Infantil / Exploradores' },
  '183': { design: 'Negro Colegial', category: 'Infantil / Exploradores' },
}
/** Match exact design and size category. Missing/invalid source costs never become zero. */
export function estimateDesignCosts(inputs: DesignCostInput[], period: { start: string; end: string }, source: DesignCostSource, monthlySkuCosts?: MonthlySkuCostSource): DesignCostEstimate {
  const prices = new Map(source.entries.map(row => [`${row.category}:${key(row.design)}`, row.unitCost]))
  const months = new Map<string, DesignCostEstimate['months'][number]>()
  const designs = new Map<string, { design: string; category: string; units: number; covered: number; cost: number }>()
  const siigoEntries = new Map<string, NonNullable<DesignCostEstimate['siigo']>['entries'][number]>()
  for (const row of inputs) {
    if (row.date < source.effectiveFrom || row.date < period.start || row.date > period.end || row.units <= 0) continue
    const directPrice = prices.get(`${row.category}:${key(row.design)}`)
    const alias = row.sku ? reviewedSkuDesigns[row.sku] : undefined
    const aliasKey = alias?.category === row.category ? `${row.category}:${key(alias.design)}` : undefined
    const estimatedPrice = directPrice ?? (aliasKey ? prices.get(aliasKey) : undefined)
    const month = row.date.slice(0, 7)
    const verified = monthlySkuCosts?.entries.filter(entry => entry.month === month && entry.sku === row.sku && entry.category === row.category)
    const siigo = verified?.length === 1 && Number.isFinite(verified[0].unitCost) && verified[0].unitCost > 0 ? verified[0] : undefined
    const useSiigo = !(typeof estimatedPrice === 'number' && Number.isFinite(estimatedPrice) && estimatedPrice > 0) && siigo !== undefined
    const price = useSiigo ? siigo.unitCost : estimatedPrice
    const valid = typeof price === 'number' && Number.isFinite(price) && price > 0
    const m = months.get(month) || { month, units: 0, coveredUnits: 0, knownCost: 0 }
    m.units += row.units
    if (valid) { m.coveredUnits += row.units; m.knownCost += row.units * price }
    months.set(month, m)
    const id = `${row.category}:${key(row.design)}`
    const d = designs.get(id) || { design: row.design, category: row.category, units: 0, covered: 0, cost: 0 }
    d.units += row.units
    if (valid) { d.covered += row.units; d.cost += row.units * price }
    designs.set(id, d)
    if (useSiigo) {
      const id = `${month}:${siigo.sku}`
      const entry = siigoEntries.get(id) || { ...siigo, units: 0, cost: 0 }
      entry.units += row.units; entry.cost += row.units * siigo.unitCost
      siigoEntries.set(id, entry)
    }
  }
  const list = Array.from(months.values()).sort((a, b) => a.month.localeCompare(b.month))
  const siigoList = Array.from(siigoEntries.values()).sort((a, b) => a.month.localeCompare(b.month) || a.sku.localeCompare(b.sku))
  return { effectiveFrom: source.effectiveFrom, sourceUrl: source.sourceUrl, months: list, designs: Array.from(designs.values()).map(row => ({ design: row.design, category: row.category, units: row.units, unitCost: row.covered === row.units ? row.cost / row.units : null, cost: row.covered === row.units ? row.cost : null })).sort((a, b) => b.units - a.units), units: list.reduce((sum, row) => sum + row.units, 0), coveredUnits: list.reduce((sum, row) => sum + row.coveredUnits, 0), knownCost: list.reduce((sum, row) => sum + row.knownCost, 0), siigo: monthlySkuCosts ? { reviewedAt: monthlySkuCosts.reviewedAt, sourceUrl: monthlySkuCosts.sourceUrl, units: siigoList.reduce((sum, row) => sum + row.units, 0), cost: siigoList.reduce((sum, row) => sum + row.cost, 0), entries: siigoList } : undefined }
}
