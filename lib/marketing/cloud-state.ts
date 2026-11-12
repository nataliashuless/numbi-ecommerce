import { getAdminClient } from '@/lib/auth-helpers'
import importedCosts from '@/data/marketing-monthly-costs.json'
import importedDesigns from '@/data/marketing-design-costs-oc32.json'
import { COST_FIELDS, type MonthlyCosts } from './contribution'
import type { DesignCostSource } from './design-costs'

export type CloudSyncStatus = { lastAttempt?: string; lastSuccess?: string; state?: 'running' | 'success' | 'error'; sources?: Record<string, string> }
export async function readCloudValues(): Promise<Record<string, unknown>> {
  const { data, error } = await getAdminClient().from('marketing_settings').select('objectives').eq('id', 1).maybeSingle()
  if (error) throw new Error('No se pudo leer la configuración de Mercadeo')
  return data?.objectives || {}
}
/** CAS keeps cloud updates from overwriting concurrent manual costs and objectives. */
export async function changeCloudValues(change: (values: Record<string, unknown>) => Record<string, unknown>) {
  const db = getAdminClient()
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await db.from('marketing_settings').select('objectives, updated_at').eq('id', 1).maybeSingle()
    if (error) throw new Error('No se pudo leer la configuración de Mercadeo')
    const objectives = change(data?.objectives || {})
    const row = { id: 1, objectives, updated_at: new Date(Math.max(Date.now(), (Date.parse(data?.updated_at || '') || 0) + 1)).toISOString() }
    const result = data
      ? await db.from('marketing_settings').update(row).eq('id', 1).eq('updated_at', data.updated_at).select('id').maybeSingle()
      : await db.from('marketing_settings').insert(row).select('id').single()
    if (result.error?.code === '23505') continue
    if (result.error) throw new Error('No se pudo guardar la actualización de Mercadeo')
    if (result.data) return
  }
  throw new Error('La configuración cambió mientras se actualizaba; vuelve a intentar')
}
export function cloudMonthlyCosts(values: Record<string, unknown>): MonthlyCosts {
  const result: MonthlyCosts = structuredClone(importedCosts.costs)
  const snapshot = values._cloudMonthlyCosts
  if (snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)) {
    for (const [month, fields] of Object.entries(snapshot)) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !fields || typeof fields !== 'object') continue
      for (const field of COST_FIELDS) {
        const value = (fields as Record<string, unknown>)[field]
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0) result[month] = { ...result[month], [field]: value }
      }
    }
  }
  return result
}
export function cloudDesignSource(values: Record<string, unknown>): DesignCostSource {
  const snapshot = values._cloudDesignCosts as DesignCostSource | undefined
  if (!snapshot || snapshot.effectiveFrom !== importedDesigns.effectiveFrom || !Array.isArray(snapshot.entries) || snapshot.entries.length > 500) return importedDesigns
  if (snapshot.entries.some(row => typeof row.design !== 'string' || typeof row.category !== 'string' || row.unitCost !== null && (typeof row.unitCost !== 'number' || !Number.isFinite(row.unitCost) || row.unitCost <= 0))) return importedDesigns
  return { ...snapshot, sourceUrl: importedDesigns.sourceUrl }
}
