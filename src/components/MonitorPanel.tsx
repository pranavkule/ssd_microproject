import { useCallback, useState } from 'react'
import { useApp } from '../state/store'
import { useShallow } from 'zustand/react/shallow'
import { labelsFor } from '../sim/experiments'
import { Button, cx, inputCls, StatCard, EmptyState } from './ui'
import { EventLog } from './EventLog'
import { ExperimentPanel } from './ExperimentPanel'
import {
  GatewayDistributionChart,
  ServiceDistributionChart,
  StatusCodeChart,
  TimeSeriesChart,
  UtilizationChart,
} from './charts'
import { ChevronDown, ChevronUp, Download, Send, Table2, GripHorizontal } from 'lucide-react'

type Tab = 'overview' | 'charts' | 'events' | 'requests' | 'experiments'

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'charts', label: 'Charts' },
  { id: 'events', label: 'Event log' },
  { id: 'requests', label: 'Requests' },
  { id: 'experiments', label: 'Experiments' },
]

const MIN_HEIGHT = 168
const COLLAPSED_HEIGHT = 200

/**
 * Results panel pinned to the bottom of the simulator. Collapsed by default at
 * ~200px showing a single compact metric row; expandable (drag handle or
 * chevron) up to 50% of the viewport, scrolling internally. The last height is
 * remembered in localStorage.
 */
export function MonitorPanel() {
  const tab = useApp((s) => s.monitorTab)
  const setTab = useApp((s) => s.setMonitorTab)
  const expanded = useApp((s) => s.monitorExpanded)
  const setExpanded = useApp((s) => s.setMonitorExpanded)
  const height = useApp((s) => s.resultsHeight)
  const setHeight = useApp((s) => s.setResultsHeight)
  const metrics = useApp((s) => s.metrics)
  const simTime = useApp((s) => s.simTime)
  const status = useApp((s) => s.status)
  const engineIssue = useApp((s) => s.engineIssue)

  const startDrag = useCallback(
    (startY: number) => {
      const startHeight = height
      const maxHeight = () => Math.round(window.innerHeight * 0.5)
      const onMove = (e: MouseEvent): void => {
        const next = Math.min(maxHeight(), Math.max(MIN_HEIGHT, startHeight + (startY - e.clientY)))
        setHeight(next)
      }
      const onUp = (): void => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [height, setHeight],
  )

  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800
  const maxExpanded = Math.round(viewportH * 0.5)
  const panelHeight = expanded ? Math.min(maxExpanded, Math.max(height, Math.round(viewportH * 0.4))) : COLLAPSED_HEIGHT

  return (
    <section
      style={{ height: panelHeight, maxHeight: '50dvh', minHeight: 140 }}
      className="relative flex shrink flex-col overflow-hidden border-t border-app-200 bg-white dark:border-app-700 dark:bg-app-900"
    >
      {/* Drag handle: only meaningful when expanded. */}
      <div
        role="separator"
        aria-label="Resize results panel"
        onMouseDown={(e) => {
          if (!expanded) setExpanded(true)
          startDrag(e.clientY)
        }}
        className="group flex h-2.5 shrink-0 cursor-row-resize items-center justify-center hover:bg-app-100 dark:hover:bg-app-800"
      >
        <GripHorizontal size={14} className="text-app-300 group-hover:text-app-500 dark:text-app-600" />
      </div>

      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-app-100 px-2 dark:border-app-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => (tab === t.id && expanded ? setExpanded(false) : setTab(t.id))}
            className={cx(
              'rounded px-2 py-1 text-[11px] font-semibold transition-colors',
              tab === t.id && expanded
                ? 'bg-accent-50 text-accent-700 dark:bg-app-700 dark:text-accent-200'
                : 'text-app-500 hover:bg-app-100 dark:text-app-400 dark:hover:bg-app-800',
            )}
          >
            {t.label}
            {t.id === 'events' && metrics.failed > 0 && <span className="ml-1 rounded-full bg-red-500 px-1 text-[9px] text-white">{metrics.failed}</span>}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-3 pr-1 font-mono text-[10px] text-app-500 dark:text-app-400">
          <span>t = {(simTime / 1000).toFixed(1)}s</span>
          <span className="hidden md:inline">gen {metrics.generated}</span>
          <span className="hidden md:inline">done {metrics.completed}</span>
          <span className={status === 'running' ? 'text-emerald-600' : 'text-app-400'}>{status}</span>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="rounded p-1 hover:bg-app-100 dark:hover:bg-app-800"
            title={expanded ? 'Collapse panel' : 'Expand panel'}
            aria-expanded={expanded}
          >
            {expanded ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          </button>
        </div>
      </div>

      {engineIssue && (
        <div className="border-b border-red-200 bg-red-50 px-3 py-1 text-[11px] text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
          {engineIssue}
        </div>
      )}

      {/* Collapsed: one compact row of the key metrics. */}
      {!expanded && <CompactMetrics />}

      {expanded && (
        <div className="min-h-0 flex-1">
          {tab === 'overview' && <Overview />}
          {tab === 'charts' && <ChartsTab />}
          {tab === 'events' && <EventLog />}
          {tab === 'requests' && <RequestsTab />}
          {tab === 'experiments' && <ExperimentPanel />}
        </div>
      )}
    </section>
  )
}

/** Single compact metric strip shown while the results panel is collapsed. */
function CompactMetrics() {
  const m = useApp((s) => s.metrics)
  const cells: { label: string; value: string | number; tone?: 'ok' | 'warn' | 'bad' }[] = [
    { label: 'Generated', value: m.generated },
    { label: 'Succeeded', value: m.succeeded, tone: 'ok' },
    { label: 'Failed', value: m.failed, tone: m.failed > 0 ? 'bad' : undefined },
    { label: 'Rate limited', value: m.rateLimited, tone: m.rateLimited > 0 ? 'warn' : undefined },
    { label: 'Latency p99', value: `${m.latencyP99}ms` },
    { label: 'Throughput', value: `${m.throughputRps}/s` },
  ]
  const toneCls = {
    ok: 'text-emerald-600 dark:text-emerald-400',
    warn: 'text-amber-600 dark:text-amber-400',
    bad: 'text-red-600 dark:text-red-400',
  }
  return (
    <div className="thin-scroll grid h-11 shrink-0 grid-cols-3 items-center gap-2 overflow-x-auto px-3 text-xs sm:grid-cols-6">
      {cells.map((c) => (
        <div key={c.label} className="flex min-w-0 flex-col">
          <span className="text-[9px] font-semibold uppercase tracking-wide text-app-400">{c.label}</span>
          <span className={cx('truncate font-mono text-sm font-semibold leading-tight', c.tone ? toneCls[c.tone] : 'text-app-900 dark:text-app-50')}>
            {c.value}
          </span>
        </div>
      ))}
    </div>
  )
}

function Overview() {
  const m = useApp((s) => s.metrics)
  const runtimes = useApp((s) => s.runtimes)
  const dark = useApp((s) => s.theme === 'dark')
  const labels = useApp(useShallow((s) => labelsFor(s.architecture)))
  const routing = useApp((s) => s.architecture.routing)
  const setMonitorTab = useApp((s) => s.setMonitorTab)
  const exportCsv = useApp((s) => s.exportCsv)
  const exportRequestsCsv = useApp((s) => s.exportRequestsCsv)

  return (
    <div className="thin-scroll h-full overflow-y-auto p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <StatCard label="Generated" value={m.generated} sub="requests created" />
        <StatCard label="Completed" value={m.completed} sub={`${m.accepted} accepted`} />
        <StatCard label="Succeeded" value={m.succeeded} tone="ok" sub={`err ${(m.errorRate * 100).toFixed(1)}%`} />
        <StatCard label="Failed" value={m.failed} tone={m.failed > 0 ? 'bad' : 'neutral'} sub={`${m.serviceUnavailable}× 503`} />
        <StatCard label="Rate limited" value={m.rateLimited} tone={m.rateLimited > 0 ? 'warn' : 'neutral'} sub="HTTP 429" />
        <StatCard label="Latency avg" value={`${m.latencyAvg}ms`} sub={`p95 ${m.latencyP95} · p99 ${m.latencyP99}`} />
        <StatCard label="Throughput" value={`${m.throughputRps}/s`} sub={`p50 ${m.latencyP50} · max ${m.latencyMax}ms`} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <StatCard label="Timeouts" value={m.timeouts} tone={m.timeouts > 0 ? 'bad' : 'neutral'} sub="504 responses" />
        <StatCard label="Auth failures" value={m.authFailed} tone={m.authFailed > 0 ? 'warn' : 'neutral'} sub="401 responses" />
        <StatCard label="Not found" value={m.notFound} tone={m.notFound > 0 ? 'warn' : 'neutral'} sub="404 responses" />
        <StatCard label="Retries" value={m.retries} sub="gateway retries" />
        <StatCard label="Cache" value={`${m.cacheHits}/${m.cacheHits + m.cacheMisses}`} sub={`${m.cacheHits + m.cacheMisses > 0 ? ((m.cacheHits / (m.cacheHits + m.cacheMisses)) * 100).toFixed(0) : 0}% hit ratio`} />
        <StatCard label="Queue depth" value={Object.values(runtimes).reduce((s, r) => s + r.queued, 0)} sub="across components" />
        <StatCard label="Config version" value={`v${routing.publishedVersion}`} sub={`delay ${routing.propagationDelayMs}ms`} />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-app-200 p-2.5 dark:border-app-700">
          <GatewayDistributionChart metrics={m} labels={labels} dark={dark} />
        </div>
        <div className="rounded-lg border border-app-200 p-2.5 dark:border-app-700">
          <ServiceDistributionChart metrics={m} labels={labels} dark={dark} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setMonitorTab('charts')}>
          Open all charts
        </Button>
        <Button size="sm" onClick={exportCsv}>
          <Download size={12} /> Metrics CSV
        </Button>
        <Button size="sm" onClick={exportRequestsCsv}>
          <Download size={12} /> Requests CSV
        </Button>
      </div>
    </div>
  )
}

function ChartsTab() {
  const m = useApp((s) => s.metrics)
  const runtimes = useApp((s) => s.runtimes)
  const dark = useApp((s) => s.theme === 'dark')
  const labels = useApp(useShallow((s) => labelsFor(s.architecture)))

  if (m.samples.length === 0) {
    return (
      <EmptyState
        title="No samples yet"
        hint="Charts are drawn from real simulation samples every 500ms of simulated time. Press Run to start."
      />
    )
  }

  return (
    <div className="thin-scroll h-full space-y-3 overflow-y-auto p-3">
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-lg border border-app-200 p-2.5 dark:border-app-700">
          <TimeSeriesChart
            samples={m.samples}
            dark={dark}
            title="Requests per second (completed)"
            unit="/s"
            series={[
              { key: 'rps', color: '#3b82f6', name: 'RPS' },
              { key: 'succeeded', color: '#10b981', name: 'success/s' },
              { key: 'failed', color: '#ef4444', name: 'failed/s' },
            ]}
          />
        </div>
        <div className="rounded-lg border border-app-200 p-2.5 dark:border-app-700">
          <TimeSeriesChart
            samples={m.samples}
            dark={dark}
            title="Latency (ms)"
            unit="ms"
            series={[
              { key: 'avgLatency', color: '#8b5cf6', name: 'avg' },
              { key: 'p95Latency', color: '#f59e0b', name: 'p95' },
            ]}
          />
        </div>
        <div className="rounded-lg border border-app-200 p-2.5 dark:border-app-700">
          <TimeSeriesChart
            samples={m.samples}
            dark={dark}
            title="Queues & utilization"
            unit=""
            series={[
              { key: 'totalQueued', color: '#06b6d4', name: 'queued' },
              { key: 'avgUtilization', color: '#ec4899', name: 'util x100' },
            ]}
          />
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-lg border border-app-200 p-2.5 dark:border-app-700">
          <GatewayDistributionChart metrics={m} labels={labels} dark={dark} />
        </div>
        <div className="rounded-lg border border-app-200 p-2.5 dark:border-app-700">
          <ServiceDistributionChart metrics={m} labels={labels} dark={dark} />
        </div>
        <div className="rounded-lg border border-app-200 p-2.5 dark:border-app-700">
          <StatusCodeChart metrics={m} dark={dark} />
        </div>
      </div>
      <div className="rounded-lg border border-app-200 p-2.5 dark:border-app-700">
        <UtilizationChart runtimes={runtimes} dark={dark} />
      </div>
    </div>
  )
}

function RequestsTab() {
  const recent = useApp((s) => s.recentRequests)
  const labels = useApp(useShallow((s) => labelsFor(s.architecture)))
  const sendTestRequest = useApp((s) => s.sendTestRequest)
  const status = useApp((s) => s.status)
  const [path, setPath] = useState('/users/profile')
  const [method, setMethod] = useState('GET')
  const [filter, setFilter] = useState<'all' | 'failed' | 'ok'>('all')

  const rows = recent.filter((r) => (filter === 'all' ? true : filter === 'ok' ? (r.statusCode ?? 0) < 400 : (r.statusCode ?? 0) >= 400))

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-app-200 px-3 py-2 dark:border-app-700">
        <span className="text-[11px] font-semibold text-app-600 dark:text-app-300">Send a test request:</span>
        <select value={method} onChange={(e) => setMethod(e.target.value)} className={cx(inputCls, 'w-20')}>
          {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((mm) => (
            <option key={mm}>{mm}</option>
          ))}
        </select>
        <input value={path} onChange={(e) => setPath(e.target.value)} className={cx(inputCls, 'w-56 font-mono')} placeholder="/users/42" />
        <Button size="sm" variant="primary" onClick={() => sendTestRequest(path, method)} disabled={status === 'idle'}>
          <Send size={11} /> Send
        </Button>
        <div className="ml-auto flex items-center gap-1">
          {(['all', 'ok', 'failed'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cx('rounded px-2 py-0.5 text-[10px] font-semibold uppercase', filter === f ? 'bg-accent-600 text-white' : 'text-app-500 hover:bg-app-100 dark:hover:bg-app-800')}
            >
              {f}
            </button>
          ))}
          <span className="ml-1 text-[10px] text-app-400">last {rows.length} shown</span>
        </div>
      </div>

      <div className="thin-scroll flex-1 overflow-auto">
        {rows.length === 0 ? (
          <EmptyState icon={<Table2 size={30} />} title="No requests recorded" hint="Run the simulation or send a manual test request." />
        ) : (
          <table className="w-full text-left font-mono text-[11px]">
            <thead className="sticky top-0 bg-app-50 text-app-500 dark:bg-app-800">
              <tr>
                <th className="px-3 py-1.5 font-semibold">id</th>
                <th className="px-2 py-1.5 font-semibold">req</th>
                <th className="px-2 py-1.5 font-semibold">status</th>
                <th className="px-2 py-1.5 font-semibold">latency</th>
                <th className="px-2 py-1.5 font-semibold">gateway</th>
                <th className="px-2 py-1.5 font-semibold">service</th>
                <th className="px-2 py-1.5 font-semibold">route</th>
                <th className="px-2 py-1.5 font-semibold">retries</th>
                <th className="px-2 py-1.5 font-semibold">failure reason</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const code = r.statusCode ?? 0
                const tone = code < 400 ? 'text-emerald-600 dark:text-emerald-400' : code < 500 ? 'text-amber-600' : 'text-red-600'
                return (
                  <tr key={r.id} className="border-t border-app-100 hover:bg-app-50 dark:border-app-800 dark:hover:bg-app-800/60">
                    <td className="px-3 py-1 text-app-400">{r.id.replace('req-', '#')}</td>
                    <td className="px-2 py-1 text-app-700 dark:text-app-200">
                      <span className="mr-1 text-app-400">{r.method}</span>
                      {r.path}
                    </td>
                    <td className={cx('px-2 py-1 font-bold', tone)}>{code}</td>
                    <td className="px-2 py-1 text-app-600 dark:text-app-300">{r.completionTime != null ? `${(r.completionTime - r.arrivalTime).toFixed(1)}ms` : '—'}</td>
                    <td className="px-2 py-1 text-app-600 dark:text-app-300">{r.gatewayId ? labels[r.gatewayId] ?? r.gatewayId : '—'}</td>
                    <td className="px-2 py-1 text-app-600 dark:text-app-300">{r.serviceId ? labels[r.serviceId] ?? r.serviceId : '—'}</td>
                    <td className="px-2 py-1 text-app-500">{r.routeId ?? '—'}</td>
                    <td className="px-2 py-1 text-app-500">{r.retries}</td>
                    <td className="px-2 py-1 text-red-500">{r.failureReason ?? ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
