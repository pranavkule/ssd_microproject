import { useMemo, useState } from 'react'
import type { Severity } from '../domain/types'
import { useApp } from '../state/store'
import { cx, inputCls, Button, EmptyState } from './ui'
import { ScrollText, Search } from 'lucide-react'

const SEVERITY_STYLES: Record<Severity, string> = {
  info: 'bg-app-100 text-app-600 dark:bg-app-700 dark:text-app-300',
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300',
  error: 'bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300',
}

export function EventLog() {
  const events = useApp((s) => s.events)
  const nodes = useApp((s) => s.architecture.nodes)
  const [query, setQuery] = useState('')
  const [severity, setSeverity] = useState<'all' | Severity>('all')
  const [componentId, setComponentId] = useState('all')
  const [requestQuery, setRequestQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')

  const types = useMemo(() => [...new Set(events.map((e) => e.type))].sort(), [events])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rq = requestQuery.trim().toLowerCase()
    return events
      .filter((e) => {
        if (severity !== 'all' && e.severity !== severity) return false
        if (componentId !== 'all' && e.componentId !== componentId) return false
        if (typeFilter !== 'all' && e.type !== typeFilter) return false
        if (rq && !(e.requestId ?? '').toLowerCase().includes(rq)) return false
        if (q && !e.message.toLowerCase().includes(q)) return false
        return true
      })
      .slice(-400)
      .reverse()
  }, [events, query, severity, componentId, requestQuery, typeFilter])

  const labelOf = (id: string | null): string => (id ? (nodes.find((n) => n.id === id)?.data.label ?? id) : '—')

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-app-200 px-3 py-2 dark:border-app-700">
        <div className="relative min-w-40 flex-1">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-app-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search messages…" className={cx(inputCls, 'pl-6')} />
        </div>
        <input
          value={requestQuery}
          onChange={(e) => setRequestQuery(e.target.value)}
          placeholder="Request ID…"
          className={cx(inputCls, 'w-28')}
        />
        <select value={severity} onChange={(e) => setSeverity(e.target.value as 'all' | Severity)} className={cx(inputCls, 'w-28')}>
          <option value="all">All severities</option>
          <option value="info">Info</option>
          <option value="success">Success</option>
          <option value="warning">Warning</option>
          <option value="error">Error</option>
        </select>
        <select value={componentId} onChange={(e) => setComponentId(e.target.value)} className={cx(inputCls, 'w-36')}>
          <option value="all">All components</option>
          {nodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.data.label}
            </option>
          ))}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={cx(inputCls, 'w-40')}>
          <option value="all">All event types</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        {(query || severity !== 'all' || componentId !== 'all' || requestQuery || typeFilter !== 'all') && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setQuery('')
              setSeverity('all')
              setComponentId('all')
              setRequestQuery('')
              setTypeFilter('all')
            }}
          >
            Clear
          </Button>
        )}
        <span className="font-mono text-[10px] text-app-400">{filtered.length}/{events.length}</span>
      </div>

      <div className="thin-scroll flex-1 overflow-y-auto font-mono text-[11px]">
        {filtered.length === 0 ? (
          <EmptyState icon={<ScrollText size={30} />} title={events.length === 0 ? 'No events yet' : 'No events match the filters'} hint="Start the simulation to generate request, routing and configuration events." />
        ) : (
          filtered.map((e) => (
            <div key={e.id} className="flex items-start gap-2 border-b border-app-100 px-3 py-1 hover:bg-app-50 dark:border-app-800 dark:hover:bg-app-800/60">
              <span className="w-14 shrink-0 text-right text-app-400">{(e.time / 1000).toFixed(2)}s</span>
              <span className={cx('w-16 shrink-0 rounded px-1 text-center text-[9px] font-bold uppercase', SEVERITY_STYLES[e.severity])}>{e.severity}</span>
              <span className="w-36 shrink-0 truncate text-app-500 dark:text-app-400" title={labelOf(e.componentId)}>
                {labelOf(e.componentId)}
              </span>
              <span className="min-w-0 flex-1 break-words text-app-700 dark:text-app-200">{e.message}</span>
              {e.requestId && <span className="shrink-0 text-app-400" title={e.requestId}>#{e.requestId.replace('req-', '')}</span>}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
