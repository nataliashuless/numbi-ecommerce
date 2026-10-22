export function normalizeMarketingCity(city: string | null | undefined): string {
  const key = (city || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!key) return 'Sin ciudad registrada'
  if (/^(?:santa fe de |santafe de )?bogota(?: d c| dc| distrito capital)?$/.test(key)) return 'Bogotá'
  const names: Record<string, string> = { medellin: 'Medellín', ibague: 'Ibagué', monteria: 'Montería', chia: 'Chía', zipaquira: 'Zipaquirá', popayan: 'Popayán', quibdo: 'Quibdó', soacha: 'Soacha' }
  return names[key] || key.replace(/\b\w/g, letter => letter.toUpperCase())
}

export const MARKETING_WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

export function marketingWeekday(date: string): string {
  // The input is already a Colombian calendar date, so no second timezone shift is needed.
  return MARKETING_WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()]
}
