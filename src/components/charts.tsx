import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Cell,
} from 'recharts'
import type { MetricsSnapshot, TickSample } from '../domain/types'

const PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899']

function chartTheme(dark: boolean) {
  return {
    grid: dark ? '#334155' : '#e2e8f0',
    axis: dark ? '#64748b' : '#94a3b8',
    tooltipBg: dark ? '#0f172a' : '#ffffff',
    tooltipBorder: dark ? '#475569' : '#e2e8f0',
    text: dark ? '#e2e8f0' : '#334155',
  }
}

function ChartTooltip({ active, payload, label, unit }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; unit?: string }) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-md border border-app-200 bg-white px-2.5 py-1.5 text-[11px] shadow-md dark:border-app-600 dark:bg-app-900">
      <div className="mb-1 font-semibold text-app-700 dark:text-app-200">{label}s</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-app-500 dark:text-app-400">{p.name}:</span>
          <span className="font-mono font-semibold text-app-800 dark:text-app-100">
            {p.value}
            {unit ?? ''}
          </span>
        </div>
      ))}
    </div>
  )
}

export function TimeSeriesChart({
  samples,
  dark,
  title,
  series,
  unit,
}: {
  samples: TickSample[]
  dark: boolean
  title: string
  series: { key: keyof TickSample; color: string; name: string }[]
  unit: string
}) {
  const t = chartTheme(dark)
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 text-[11px] font-semibold text-app-600 dark:text-app-300">{title}</div>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={samples} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid stroke={t.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="time" stroke={t.axis} fontSize={9} tickLine={false} />
          <YAxis stroke={t.axis} fontSize={9} tickLine={false} width={44} />
          <Tooltip content={<ChartTooltip unit={unit} />} />
          {series.map((s) => (
            <Line key={String(s.key)} type="monotone" dataKey={String(s.key)} name={s.name} stroke={s.color} strokeWidth={1.8} dot={false} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function GatewayDistributionChart({ metrics, labels, dark }: { metrics: MetricsSnapshot; labels: Record<string, string>; dark: boolean }) {
  const data = Object.entries(metrics.perGateway).map(([id, count]) => ({ name: labels[id] ?? id, value: count }))
  const t = chartTheme(dark)
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 text-[11px] font-semibold text-app-600 dark:text-app-300">Gateway traffic distribution</div>
      {data.length === 0 ? (
        <div className="flex h-[160px] items-center justify-center rounded border border-dashed border-app-300 text-[11px] text-app-400">No gateway traffic yet</div>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid stroke={t.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" stroke={t.axis} fontSize={9} tickLine={false} interval={0} />
            <YAxis stroke={t.axis} fontSize={9} tickLine={false} width={44} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: dark ? '#1e293b' : '#f1f5f9' }} />
            <Bar dataKey="value" name="requests" isAnimationActive={false} radius={[4, 4, 0, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

export function ServiceDistributionChart({ metrics, labels, dark }: { metrics: MetricsSnapshot; labels: Record<string, string>; dark: boolean }) {
  const data = Object.entries(metrics.perService).map(([id, count]) => ({ name: labels[id] ?? id, value: count }))
  const t = chartTheme(dark)
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 text-[11px] font-semibold text-app-600 dark:text-app-300">Per-service request distribution</div>
      {data.length === 0 ? (
        <div className="flex h-[160px] items-center justify-center rounded border border-dashed border-app-300 text-[11px] text-app-400">No service traffic yet</div>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid stroke={t.grid} strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" stroke={t.axis} fontSize={9} tickLine={false} />
            <YAxis type="category" dataKey="name" stroke={t.axis} fontSize={9} tickLine={false} width={96} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: dark ? '#1e293b' : '#f1f5f9' }} />
            <Bar dataKey="value" name="requests" isAnimationActive={false} radius={[0, 4, 4, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={PALETTE[(i + 2) % PALETTE.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

export function UtilizationChart({ runtimes, dark }: { runtimes: Record<string, { utilization: number; health: string }>; dark: boolean }) {
  const data = Object.entries(runtimes)
    .map(([id, r]) => ({ name: id, value: Math.round(r.utilization * 100), health: r.health }))
    .filter((d) => d.value > 0 || d.health === 'down')
    .slice(0, 12)
  const t = chartTheme(dark)
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 text-[11px] font-semibold text-app-600 dark:text-app-300">Component utilization (%)</div>
      {data.length === 0 ? (
        <div className="flex h-[160px] items-center justify-center rounded border border-dashed border-app-300 text-[11px] text-app-400">Idle</div>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid stroke={t.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" stroke={t.axis} fontSize={8} tickLine={false} interval={0} angle={-25} textAnchor="end" height={44} />
            <YAxis stroke={t.axis} fontSize={9} tickLine={false} width={36} domain={[0, 100]} />
            <Tooltip content={<ChartTooltip unit="%" />} cursor={{ fill: dark ? '#1e293b' : '#f1f5f9' }} />
            <Bar dataKey="value" name="utilization" isAnimationActive={false} radius={[3, 3, 0, 0]}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.health === 'down' ? '#ef4444' : d.value >= 90 ? '#f97316' : PALETTE[i % PALETTE.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

export function StatusCodeChart({ metrics, dark }: { metrics: MetricsSnapshot; dark: boolean }) {
  const data = Object.entries(metrics.statusCodes).sort((a, b) => a[0].localeCompare(b[0]))
  const t = chartTheme(dark)
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 text-[11px] font-semibold text-app-600 dark:text-app-300">HTTP status distribution</div>
      {data.length === 0 ? (
        <div className="flex h-[160px] items-center justify-center rounded border border-dashed border-app-300 text-[11px] text-app-400">No completions yet</div>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data.map(([code, count]) => ({ name: code, value: count }))} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid stroke={t.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" stroke={t.axis} fontSize={9} tickLine={false} />
            <YAxis stroke={t.axis} fontSize={9} tickLine={false} width={44} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: dark ? '#1e293b' : '#f1f5f9' }} />
            <Bar dataKey="value" name="responses" isAnimationActive={false} radius={[4, 4, 0, 0]}>
              {data.map(([code], i) => (
                <Cell key={i} fill={code.startsWith('2') ? '#10b981' : code.startsWith('4') ? '#f59e0b' : '#ef4444'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
