import { GET as readMeta } from '@/app/api/meta/insights/route'
import { GET as readTraffic } from '@/app/api/shopify/analytics-ql/route'
import { randomUUID } from 'node:crypto'
import { POST as syncShopify } from '@/app/api/shopify/sync-orders/route'
import { POST as syncSiigo } from '@/app/api/siigo/sync-invoices/route'
import { changeCloudValues, cloudDesignSource, cloudMonthlyCosts, readCloudValues, type CloudSyncStatus } from './cloud-state'
import { downloadMarketingWorkbooks } from './cloud-drive'
import { importAccountingWorkbook, importDesignWorkbook, importMonthlyWorkbook } from './cloud-import'

export async function runMarketingCloudSync(request: Request) {
  const id = randomUUID(), started = new Date().toISOString()
  let acquired = false
  await changeCloudValues(values => {
    acquired = false
    const lease = values._cloudLease as { until?: number } | undefined
    if (lease?.until && lease.until > Date.now()) return values
    acquired = true
    return { ...values, _cloudLease: { id, until: Date.now() + 330000 }, _cloudSync: { ...(values._cloudSync as CloudSyncStatus || {}), state: 'running', lastAttempt: started } }
  })
  if (!acquired) return { ok: false, skipped: true, reason: 'Ya hay una actualización en curso' }
  try {
    const makeRequest = () => new Request('https://shuless.vercel.app/api/internal-sync', { method: 'POST', headers: { 'Content-Type': 'application/json', authorization: request.headers.get('authorization') || '' }, body: JSON.stringify({ auto: true }) })
    const local = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit' }).formatToParts(new Date())
    const year = Number(local.find(p => p.type === 'year')!.value), month = Number(local.find(p => p.type === 'month')!.value)
    const end = new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10)
    const start = `${end.slice(0, 7)}-01`
    const insightRequest = () => new Request(`https://shuless.vercel.app/api/internal-insights?start_date=${start}&end_date=${end}&level=account`, { headers: { authorization: request.headers.get('authorization') || '' } })
    const results = await Promise.allSettled([
      syncShopify(makeRequest()).then(response => ({ ok: response.ok })),
      syncSiigo(makeRequest()).then(response => ({ ok: response.ok })),
      (async () => {
        const workbooks = await downloadMarketingWorkbooks()
        const values = await readCloudValues()
        const monthly = importMonthlyWorkbook(workbooks.monthly.workbook)
        const accounting = importAccountingWorkbook(workbooks.accounting.workbook)
        const costs = { ...monthly }
        for (const [month, fields] of Object.entries(accounting)) costs[month] = { ...costs[month], ...fields }
        const designs = importDesignWorkbook(workbooks.designs.workbook, cloudDesignSource(values))
        // Commit the three sources together only after every download/validation passed.
        await changeCloudValues(current => {
          if ((current._cloudLease as { id?: string })?.id !== id) throw new Error('La actualización perdió su reserva de ejecución')
          const mergedCosts = cloudMonthlyCosts(current)
          for (const [month, fields] of Object.entries(costs)) mergedCosts[month] = { ...mergedCosts[month], ...fields }
          return { ...current, _cloudMonthlyCosts: mergedCosts, _cloudDesignCosts: designs, _cloudSourceDates: Object.fromEntries(Object.entries(workbooks).map(([name, file]) => [name, file.modifiedTime])) }
        })
        return { ok: true }
      })(),
      readMeta(insightRequest()).then(async response => { const data = await response.json(); return { ok: response.ok && data.connected === true && !data.error } }),
      readTraffic(insightRequest()).then(async response => { const data = await response.json(); return { ok: response.ok && data.available === true } }),
    ])
    const sources = Object.fromEntries(results.map((result, index) => {
      const name = ['shopify', 'siigo', 'drive', 'meta', 'traficoShopify'][index]
      if (result.status === 'fulfilled' && result.value.ok) return [name, 'Actualizado']
      return [name, name === 'drive' && result.status === 'rejected' && result.reason instanceof Error ? result.reason.message : 'No se pudo actualizar; se conserva el dato anterior']
    }))
    const ok = results.every(result => result.status === 'fulfilled' && result.value.ok)
    await changeCloudValues(values => {
      if ((values._cloudLease as { id?: string })?.id !== id) throw new Error('La actualización perdió su reserva de ejecución')
      const previous = values._cloudSync as CloudSyncStatus || {}
      return { ...values, _cloudLease: null, _cloudSync: { ...previous, state: ok ? 'success' : 'error', sources, ...(ok ? { lastSuccess: new Date().toISOString() } : {}) } }
    })
    return { ok, sources }
  } catch {
    await changeCloudValues(values => (values._cloudLease as { id?: string })?.id === id ? { ...values, _cloudLease: null, _cloudSync: { ...(values._cloudSync as CloudSyncStatus || {}), state: 'error', sources: { sync: 'No se pudo completar la actualización; se conserva el dato anterior' } } } : values)
    return { ok: false }
  }
}
