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

// Pass the date-only value returned by businessDateBogota, not a UTC instant.
export function buildSchoolSeasonPeriods(today: Date): { periods: PlanningPeriod[]; planningEnd: Date } {
  let planningEnd = new Date(today.getFullYear(), 0, 31, 12)
  if (civilDateKey(today) > civilDateKey(planningEnd)) {
    planningEnd = new Date(today.getFullYear() + 1, 0, 31, 12)
  }

  const currentMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 12)
  const daysInCurrentMonth = currentMonthEnd.getDate()
  const remainingDays = Math.max(0, daysInCurrentMonth - today.getDate() + 1)
  const periods: PlanningPeriod[] = [{
    month: civilDateKey(today).slice(0, 7),
    demandDate: currentMonthEnd,
    fraction: remainingDays / daysInCurrentMonth,
    futureIndex: null,
  }]

  const cursor = new Date(today.getFullYear(), today.getMonth() + 1, 1, 12)
  let futureIndex = 0
  while (civilDateKey(cursor) <= civilDateKey(planningEnd)) {
    periods.push({
      month: civilDateKey(cursor).slice(0, 7),
      demandDate: new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 12),
      fraction: 1,
      futureIndex,
    })
    cursor.setMonth(cursor.getMonth() + 1)
    futureIndex += 1
  }
  return { periods, planningEnd }
}
