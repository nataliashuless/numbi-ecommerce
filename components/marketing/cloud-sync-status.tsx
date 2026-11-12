'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

type State = { cronConfigured: boolean; driveConfigured: boolean; status: { state?: string; lastAttempt?: string; lastSuccess?: string; sources?: Record<string, string> } | null }
export function CloudSyncStatus() {
  const [state, setState] = useState<State | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const load = async () => {
    const response = await fetch('/api/marketing/cloud-sync')
    if (response.ok) setState(await response.json())
  }
  useEffect(() => { void load().catch(() => setMessage('No se pudo consultar la actualización automática')) }, [])
  async function sync() {
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/marketing/cloud-sync', { method: 'POST' })
      setMessage(response.ok ? 'Actualización completada. Pulsa Actualizar para ver los datos nuevos.' : 'Hay fuentes pendientes; se conservan los últimos datos válidos.')
      await load()
    } catch { setMessage('No se pudo completar la actualización; se conservan los últimos datos válidos.') }
    finally { setBusy(false) }
  }
  const ready = state?.cronConfigured && state?.driveConfigured
  return <section aria-label="Actualización automática de Mercadeo" className="rounded-xl border bg-white p-4 text-sm text-slate-600">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold text-slate-900">Actualización mensual en Vercel</p><p>Día 1 de cada mes, 8:00 a. m. de Colombia. Funciona sin computador ni Codex abiertos.</p></div><Button variant="outline" disabled={!ready || busy} onClick={sync}>{busy ? 'Actualizando…' : 'Probar actualización'}</Button></div>
    {state && !ready && <div className="mt-3 rounded-lg bg-amber-50 p-3 text-amber-900"><p className="font-medium">Pendiente de conexión inicial; la actualización automática aún no está activa.</p><p>En las variables de producción de Vercel configura {!state.cronConfigured && <code>CRON_SECRET (clave aleatoria de al menos 16 caracteres)</code>}{!state.cronConfigured && !state.driveConfigured && ' y '}{!state.driveConfigured && <code>MARKETING_GOOGLE_SERVICE_ACCOUNT_JSON</code>}. La cuenta de servicio de Google debe tener acceso de lector únicamente a los tres archivos de costos. Después, vuelve a desplegar y prueba la actualización.</p></div>}
    {state?.status?.lastSuccess && <p className="mt-2">Última actualización completa: {new Date(state.status.lastSuccess).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}.</p>}
    {ready && !state.status?.lastSuccess && <p className="mt-2">Conexiones configuradas; falta verificar la primera ejecución completa.</p>}
    {state?.status?.sources && <ul className="mt-2">{Object.entries(state.status.sources).map(([source, value]) => <li key={source}>{source}: {value}</li>)}</ul>}
    {message && <p className="mt-2" role="status">{message}</p>}
  </section>
}
