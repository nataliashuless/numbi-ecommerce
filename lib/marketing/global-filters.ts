import { isoDateInTimeZone } from './metrics'

export function presetDates(preset: string, now = new Date()) {
  const today = isoDateInTimeZone(now)
  const shift = (date: string, days: number) => new Date(new Date(`${date}T12:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10)
  const yesterday = shift(today, -1)
  if (preset === 'last_month') {
    const end = shift(`${today.slice(0, 7)}-01`, -1)
    return { start: `${end.slice(0, 7)}-01`, end }
  }
  const start = preset === 'month' ? `${today.slice(0, 7)}-01` : `${today.slice(0, 4)}-01-01`
  return { start, end: yesterday < start ? today : yesterday }
}
