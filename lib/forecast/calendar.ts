export type PlanningPeriod = {
  month: string
  demandDate: Date
  fraction: number
  futureIndex: number | null
}

// A date-only value, represented at local noon for the existing calendar helpers.
// It represents the Colombian civil date, not the original instant in time.
export function businessDateBogota(now: Date): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const value = (type: string) => Number(parts.find(part => part.type === type)?.value)
  return new Date(value('year'), value('month') - 1, value('day'), 12)
}

function civilDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// Monthly orders use the same civil day, clamped to the next month's last day.
export function nextMonthlyOrder(today: Date): Date {
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 2, 0, 12).getDate()
  return new Date(today.getFullYear(), today.getMonth() + 1, Math.min(today.getDate(), lastDay), 12)
}

// Include inventory depletion before arrival and stop before the next order arrives.
export function buildForecastPeriods(today: Date, planningEnd: Date): { periods: PlanningPeriod[]; planningEnd: Date } {
  const periods: PlanningPeriod[] = []
  const cursor = new Date(today.getFullYear(), today.getMonth(), 1, 12)
  let index = 0
  while (civilDateKey(cursor) <= civilDateKey(planningEnd)) {
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 12)
    const demandDate = civilDateKey(monthEnd) > civilDateKey(planningEnd) ? new Date(planningEnd) : monthEnd
    const startDay = index === 0 ? today.getDate() : 1
    periods.push({
      month: civilDateKey(cursor).slice(0, 7),
      demandDate,
      fraction: (demandDate.getDate() - startDay + 1) / monthEnd.getDate(),
      futureIndex: index === 0 ? null : index - 1,
    })
    cursor.setMonth(cursor.getMonth() + 1)
    index += 1
  }
  return { periods, planningEnd }
}
