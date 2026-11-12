export type DesignCostInput = { date: string; design: string; category: string; units: number }
export type DesignCostSource = { effectiveFrom: string; sourceUrl: string; entries: Array<{ design: string; category: string; unitCost: number | null }> }
export type DesignCostEstimate = {
  effectiveFrom: string; sourceUrl: string; units: number; coveredUnits: number; knownCost: number
  months: Array<{ month: string; units: number; coveredUnits: number; knownCost: number }>
  designs: Array<{ design: string; category: string; units: number; unitCost: number | null; cost: number | null }>
}
function key(value: string) {
  const base = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/^eva(?:feli|sebas)\d+-/i, '').replace(/\s*\(proyecto\s+felipe\)/i, '')
    .replace(/\s+felipe$/, '').replace(/\s*[·|].*$/, '').replace(/\s+/g, ' ').trim()
  return ({ 'black colegial oc 25 mayo 2026': 'negro colegial', 'colegial negro': 'negro colegial', 'sandalia alicia cafe': 'alicia cafe' } as Record<string, string>)[base] || base
}
/** Match exact design and size category. Missing/invalid source costs never become zero. */
export function estimateDesignCosts(inputs: DesignCostInput[], period: { start: string; end: string }, source: DesignCostSource): DesignCostEstimate {
  const prices = new Map(source.entries.map(row => [`${row.category}:${key(row.design)}`, row.unitCost]))
  const months = new Map<string, DesignCostEstimate['months'][number]>()
  const designs = new Map<string, DesignCostEstimate['designs'][number]>()
  for (const row of inputs) {
    if (row.date < source.effectiveFrom || row.date < period.start || row.date > period.end || row.units <= 0) continue
    const price = prices.get(`${row.category}:${key(row.design)}`)
    const valid = typeof price === 'number' && Number.isFinite(price) && price > 0
    const month = row.date.slice(0, 7)
    const m = months.get(month) || { month, units: 0, coveredUnits: 0, knownCost: 0 }
    m.units += row.units
    if (valid) { m.coveredUnits += row.units; m.knownCost += row.units * price }
    months.set(month, m)
    const id = `${row.category}:${key(row.design)}`
    const d = designs.get(id) || { design: row.design, category: row.category, units: 0, unitCost: valid ? price : null, cost: valid ? 0 : null }
    d.units += row.units
    if (d.cost !== null && valid) d.cost += row.units * price
    designs.set(id, d)
  }
  const list = Array.from(months.values()).sort((a, b) => a.month.localeCompare(b.month))
  return { effectiveFrom: source.effectiveFrom, sourceUrl: source.sourceUrl, months: list, designs: Array.from(designs.values()).sort((a, b) => b.units - a.units), units: list.reduce((sum, row) => sum + row.units, 0), coveredUnits: list.reduce((sum, row) => sum + row.coveredUnits, 0), knownCost: list.reduce((sum, row) => sum + row.knownCost, 0) }
}
