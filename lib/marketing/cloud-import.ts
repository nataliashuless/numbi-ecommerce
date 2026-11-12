import * as XLSX from 'xlsx'
import type { MonthlyCosts } from './contribution'
import type { DesignCostSource } from './design-costs'

const number = (sheet: XLSX.WorkSheet, address: string) => {
  const value = sheet[address]?.v
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}
const closedMonth = (now: Date) => {
  const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit' }).formatToParts(now)
  const year = Number(month.find(p => p.type === 'year')!.value)
  const m = Number(month.find(p => p.type === 'month')!.value)
  return new Date(Date.UTC(year, m - 2, 1)).toISOString().slice(0, 7)
}
export function importMonthlyWorkbook(workbook: XLSX.WorkBook, now = new Date()): MonthlyCosts {
  const sheet = workbook.Sheets.Monthly
  if (!sheet || !String(sheet.B4?.v).toLowerCase().includes('usuario') || !String(sheet.B14?.v).toLowerCase().includes('agencia')) throw new Error('Cambió la estructura de Monthly; se conserva el último dato válido')
  const costs: MonthlyCosts = {}
  const end = Math.min(XLSX.utils.decode_range(sheet['!ref'] || 'A1').e.c, 200)
  for (let index = 2; index <= end; index++) {
    const c = XLSX.utils.encode_col(index), year = number(sheet, `${c}2`), m = number(sheet, `${c}3`)
    if (!year || year < 2024 || year > 2100 || !m || m < 1 || m > 12 || !Number.isInteger(m)) continue
    const month = `${year}-${String(m).padStart(2, '0')}`
    if (month > closedMonth(now)) continue
    const values: MonthlyCosts[string] = {}
    for (const [field, row] of [['agencyFee',14],['agencyVariable',15],['natiFee',16],['servers',20],['unitCost',35]] as const) {
      const value = number(sheet, `${c}${row}`)
      // A blank is unavailable, never inferred as zero.
      if (value !== undefined) values[field] = value
    }
    if (Object.keys(values).length) costs[month] = values
  }
  if (!Object.keys(costs).length) throw new Error('Monthly no contiene costos históricos válidos')
  return costs
}
export function importAccountingWorkbook(workbook: XLSX.WorkBook, now = new Date()): MonthlyCosts {
  const costs: MonthlyCosts = {}
  for (const name of workbook.SheetNames.filter(name => /^ER 20\d{2}$/.test(name))) {
    const sheet = workbook.Sheets[name], year = Number(name.slice(3))
    if (year < 2025) continue
    const rows: Record<string, number> = {}
    for (let r = 1; r <= 150; r++) {
      const label = String(sheet[`B${r}`]?.v || '').toLowerCase()
      if (label.includes('contenido digital')) rows.contentFee = r
      if (label.trim() === 'shopify') rows.platformFee = r
      if (label.trim() === 'hostgator') rows.servers = r
    }
    for (let m = 1; m <= 12; m++) {
      const c = XLSX.utils.encode_col(m + 1), month = `${year}-${String(m).padStart(2, '0')}`
      if (month > closedMonth(now)) continue
      const header = sheet[`${c}4`]?.v
      const date = typeof header === 'number' ? XLSX.SSF.parse_date_code(header) : null
      if (!date || date.y !== year || date.m !== m) continue
      for (const [field, row] of Object.entries(rows)) {
        const raw = sheet[`${c}${row}`]?.v
        if (typeof raw === 'number' && Number.isFinite(raw) && raw <= 0) costs[month] = { ...costs[month], [field]: Math.abs(raw) }
      }
    }
  }
  if (!Object.keys(costs).length) throw new Error('No se encontraron gastos contables históricos válidos')
  // Unit COGS in Modelo depend on total invoiced units, including budgeted quantities.
  // Preserve the reviewed historical unit costs; future estimates come from OC32 by design.
  return costs
}
export function importDesignWorkbook(workbook: XLSX.WorkBook, source: DesignCostSource): DesignCostSource {
  const sheet = workbook.Sheets['Costos por Diseño']
  if (!sheet) throw new Error('No se encontró la hoja Costos por Diseño')
  const entries: DesignCostSource['entries'] = []
  let category = ''
  for (let row = 1; row <= 150; row++) {
    const label = String(sheet[`K${row}`]?.v || '')
    if (/EXPLORADORES/i.test(label)) category = 'Infantil / Exploradores'
    if (/PEQUEÑOS CAMINANTES/i.test(label)) category = 'Bebé / Pequeños Caminantes'
    if (category && typeof sheet[`J${row}`]?.v === 'number' && label) {
      const value = number(sheet, `L${row}`)
      entries.push({ design: label.trim(), category, unitCost: value && value > 0 ? value : null })
    }
  }
  let title = ''
  for (let row = 1; row <= Math.min(XLSX.utils.decode_range(sheet['!ref'] || 'A1').e.r + 1, 2000); row++) {
    const label = String(sheet[`A${row}`]?.v || '')
    if (/^Sandalia/i.test(label) && !sheet[`B${row}`]?.v) title = label
    if (label === 'COSTO TOTAL UNIDAD' && title) {
      const value = number(sheet, `F${row}`)
      entries.push({ design: title.trim(), category: 'Bebé / Pequeños Caminantes', unitCost: value && value > 0 ? value : null }); title = ''
    }
  }
  const unique = new Map<string, DesignCostSource['entries'][number]>()
  for (const row of entries) {
    const id = `${row.category}:${row.design.toLowerCase()}`
    const previous = unique.get(id)
    if (previous && previous.unitCost !== row.unitCost) throw new Error('Hay costos distintos para el mismo diseño; se conserva el último dato válido')
    unique.set(id, row)
  }
  // Layout loss must not erase a reviewed design or silently lower coverage.
  if (!entries.length || source.entries.some(old => !entries.some(row => row.design.trim().toLowerCase() === old.design.trim().toLowerCase() && row.category === old.category))) throw new Error('Cambió la estructura de costos por diseño; se conserva el último dato válido')
  return { effectiveFrom: source.effectiveFrom, sourceUrl: source.sourceUrl, entries: Array.from(unique.values()) }
}
