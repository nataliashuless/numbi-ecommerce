import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

type Status = 'good' | 'warning' | 'bad' | 'neutral' | 'insufficient'

function statusFor(
  value: number | null,
  target: number | undefined,
  direction: 'higher' | 'lower',
  tolerancePct: number | undefined,
  sufficient: boolean,
): Status {
  if (!sufficient) return 'insufficient'
  if (value === null || target === undefined) return 'neutral'
  const meets = direction === 'higher' ? value >= target : value <= target
  if (meets) return 'good'
  if (tolerancePct === undefined) return 'bad'
  const tolerance = Math.abs(target) * tolerancePct
  const close = direction === 'higher' ? value >= target - tolerance : value <= target + tolerance
  return close ? 'warning' : 'bad'
}

const statusStyles: Record<Status, string> = {
  good: 'border-emerald-200 bg-emerald-50/70',
  warning: 'border-amber-200 bg-amber-50/70',
  bad: 'border-rose-200 bg-rose-50/70',
  neutral: 'border-slate-200 bg-white',
  insufficient: 'border-slate-200 bg-slate-50',
}

const statusLabels: Record<Status, string> = {
  good: 'En objetivo',
  warning: 'Vigilar',
  bad: 'Fuera de objetivo',
  neutral: 'Sin objetivo',
  insufficient: 'Datos insuficientes',
}

export function KpiCard({
  label,
  source,
  value,
  previous,
  change,
  target,
  direction = 'higher',
  tolerancePct,
  sufficient = true,
  format,
}: {
  label: string
  source: string
  value: number | null
  previous: number | null
  change: number | null
  target?: number
  direction?: 'higher' | 'lower'
  tolerancePct?: number
  sufficient?: boolean
  format: (value: number) => string
}) {
  const status = statusFor(value, target, direction, tolerancePct, sufficient)
  const changeColor = change === null ? 'text-slate-400' : change > 0 ? 'text-emerald-700' : change < 0 ? 'text-rose-700' : 'text-slate-500'
  return (
    <Card className={`${statusStyles[status]} min-h-44 shadow-sm`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
            <p className="mt-1 text-[11px] text-slate-400">Fuente: {source}</p>
          </div>
          <span className="rounded-full border border-current/10 bg-white/70 px-2 py-1 text-[10px] font-semibold text-slate-600">
            {statusLabels[status]}
          </span>
        </div>
        <div className="mt-5 text-2xl font-bold tracking-tight text-[#18233b]">
          {value === null ? 'Dato no disponible' : format(value)}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 text-xs">
          <span className="text-slate-500">Anterior: {previous === null ? 'N/D' : format(previous)}</span>
          <span className={`flex items-center gap-1 font-semibold ${changeColor}`}>
            {change === null ? <Minus className="h-3.5 w-3.5" /> : change > 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : change < 0 ? <ArrowDownRight className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
            {change === null ? 'Sin comparación' : `${(change * 100).toFixed(1)}%`}
          </span>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">Objetivo: {target === undefined ? 'No configurado' : format(target)}</p>
      </CardContent>
    </Card>
  )
}
