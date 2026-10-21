import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { ComponentNode, HttpMethod, RouteRule } from '../domain/types'
import { HTTP_METHODS } from '../domain/types'
import { COMPONENT_SCHEMAS, type FieldSpec } from '../domain/validation'
import { COMPONENT_LABELS, COMPONENT_DESCRIPTIONS } from '../domain/defaults'
import { validateRuleSyntax } from '../domain/routing'
import { useApp } from '../state/store'
import { Button, cx, FieldRow, inputCls, EmptyState } from './ui'
import { COMPONENT_ICONS } from './icons'
import { TaskPanel } from '../labs/TaskPanel'
import { Trash2, Plus, Rocket, RotateCcw, ServerCrash, MousePointerClick } from 'lucide-react'

type Draft = Record<string, unknown>

function buildDraft(node: ComponentNode): Draft {
  return structuredClone(node.data.config) as unknown as Draft
}

type PanelTab = 'node' | 'routing' | 'tasks'

export function ConfigPanel({ sheet = false }: { sheet?: boolean }) {
  const [tab, setTab] = useState<PanelTab>('node')
  const selectedNodeId = useApp((s) => s.selectedNodeId)
  const selectedEdgeId = useApp((s) => s.selectedEdgeId)
  const node = useApp((s) => s.architecture.nodes.find((n) => n.id === s.selectedNodeId))

  useEffect(() => {
    setTab((prev) => (selectedNodeId ? 'node' : prev === 'tasks' ? 'tasks' : prev))
  }, [selectedNodeId])

  return (
    <aside
      className={cx(
        'flex shrink-0 flex-col border-l border-app-200 bg-white dark:border-app-700 dark:bg-app-900',
        sheet ? 'h-full w-full border-l-0' : 'w-[320px]',
      )}
    >
      <div className="flex border-b border-app-200 dark:border-app-700">
        {(
          [
            { id: 'node', label: 'Component' },
            { id: 'routing', label: 'L7 Routing' },
            { id: 'tasks', label: 'Tasks' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cx(
              'flex-1 px-2 py-2 text-xs font-semibold',
              tab === t.id
                ? 'border-b-2 border-accent-600 text-accent-700 dark:text-accent-300'
                : 'text-app-500 hover:text-app-700 dark:hover:text-app-300',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="thin-scroll flex-1 overflow-y-auto">
        {tab === 'node' ? (node ? <NodeEditor key={node.id} node={node} /> : selectedEdgeId ? <EdgeInfo /> : <PanelHint />) : null}
        {tab === 'routing' ? <RoutingEditor /> : null}
        {tab === 'tasks' ? <TaskPanel embedded /> : null}
      </div>
    </aside>
  )
}

function PanelHint() {
  return (
    <div className="p-3">
      <EmptyState
        icon={<MousePointerClick size={34} />}
        title="Select a node on the canvas to edit its settings."
        hint="Pick a component on the canvas, or open the L7 Routing tab to manage gateway routing rules and the Tasks tab to check your design."
      />
      <div className="mt-4 rounded-lg border border-app-200 p-3 text-xs dark:border-app-700">
        <h4 className="font-semibold text-app-900 dark:text-app-50">Architecture</h4>
        <p className="mt-2 leading-relaxed text-app-500 dark:text-app-400">
          Requests flow <span className="text-app-700 dark:text-app-200">Client → Rate Limiter → Load Balancer → Gateway VMs → Services → Databases</span>.
          Each gateway VM verifies the client JWT with keys fetched from the Secret Manager, enforces L7 routing rules and retries, and watches the shared
          Config Store (Redis) so routing tables reload live without a restart.
        </p>
      </div>
    </div>
  )
}

function EdgeInfo() {
  const edgeId = useApp((s) => s.selectedEdgeId)
  const edge = useApp((s) => s.architecture.edges.find((e) => e.id === s.selectedEdgeId))
  const source = useApp((s) => s.architecture.nodes.find((n) => n.id === edge?.source))
  const target = useApp((s) => s.architecture.nodes.find((n) => n.id === edge?.target))
  const removeEdge = useApp((s) => s.removeEdge)
  const count = useApp((s) => s.edgeCounts[edgeId ?? ''])
  if (!edge) return <PanelHint />
  return (
    <div className="p-3">
      <h3 className="text-sm font-semibold text-app-900 dark:text-app-50">Connection</h3>
      <div className="mt-3 space-y-2 rounded-lg border border-app-200 p-3 text-xs dark:border-app-700">
        <Row label="Source" value={source?.data.label ?? edge.source} />
        <Row label="Target" value={target?.data.label ?? edge.target} />
        <Row label="Traffic (requests)" value={String(count ?? 0)} />
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-app-400">
        Directed edge. Requests leave the source component and enter the target component when the simulation forwards them.
      </p>
      <div className="mt-3">
        <Button variant="danger" size="sm" onClick={() => removeEdge(edge.id)}>
          <Trash2 size={12} /> Delete connection
        </Button>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-app-500">{label}</span>
      <span className="font-medium text-app-800 dark:text-app-100">{value}</span>
    </div>
  )
}

function NodeEditor({ node }: { node: ComponentNode }) {
  const updateNodeConfig = useApp((s) => s.updateNodeConfig)
  const updateLabel = useApp((s) => s.updateLabel)
  const removeNode = useApp((s) => s.removeNode)
  const toggleFailure = useApp((s) => s.toggleFailure)
  const isFailed = useApp((s) => s.failedNodeIds.includes(node.id))
  const runtime = useApp((s) => s.runtimes[node.id])
  const services = useApp(useShallow((s) => s.architecture.nodes.filter((n) => n.data.type === 'service')))
  const lbTargets = useApp(
    useShallow((s) =>
      s.architecture.edges
        .filter((e) => e.source === node.id)
        .map((e) => s.architecture.nodes.find((n) => n.id === e.target))
        .filter(Boolean),
    ),
  )

  const [draft, setDraft] = useState<Draft>(() => buildDraft(node))
  const [issues, setIssues] = useState<{ field: string; message: string }[]>([])
  const [labelDraft, setLabelDraft] = useState(node.data.label)

  useEffect(() => {
    setDraft(buildDraft(node))
    setIssues([])
    setLabelDraft(node.data.label)
  }, [node])

  const schema = COMPONENT_SCHEMAS[node.data.type]
  const Icon = COMPONENT_ICONS[node.data.type]

  const set = (key: string, value: unknown): void => setDraft((d) => ({ ...d, [key]: value }))

  const apply = (): void => {
    const result = updateNodeConfig(node.id, draft)
    if (!result.ok) {
      setIssues(result.issues)
      return
    }
    setIssues([])
    if (labelDraft.trim() !== '' && labelDraft !== node.data.label) updateLabel(node.id, labelDraft.trim())
  }

  const reset = (): void => {
    setDraft(buildDraft(node))
    setIssues([])
    setLabelDraft(node.data.label)
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(node.data.config) || labelDraft !== node.data.label

  return (
    <div className="p-3">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded bg-app-100 text-app-600 dark:bg-app-700 dark:text-app-300">
          <Icon size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <input value={labelDraft} onChange={(e) => setLabelDraft(e.target.value)} className={cx(inputCls, 'font-semibold')} />
          <div className="mt-1 text-[10px] uppercase tracking-wide text-app-400">
            {COMPONENT_LABELS[node.data.type]} · id {node.id}
          </div>
        </div>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-app-500 dark:text-app-400">{COMPONENT_DESCRIPTIONS[node.data.type]}</p>

      {runtime && (
        <div className="mt-3 grid grid-cols-3 gap-1.5 rounded-lg border border-app-200 p-2 dark:border-app-700">
          <MiniStat label="Active" value={runtime.inService} />
          <MiniStat label="Queued" value={runtime.queued} />
          <MiniStat label="Done" value={runtime.totalProcessed} />
          <MiniStat label="Rejected" value={runtime.totalRejected} />
          <MiniStat label="Util" value={`${Math.round(runtime.utilization * 100)}%`} />
          <MiniStat label="State" value={runtime.health} />
        </div>
      )}

      <div className="mt-3 space-y-3">
        {schema.fields.map((field) => (
          <FieldRenderer
            key={field.key}
            field={field}
            value={draft[field.key]}
            onChange={(v) => set(field.key, v)}
            issue={issues.find((i) => i.field === field.key)?.message}
            targets={(lbTargets ?? []).filter(Boolean).map((n) => ({ id: n!.id, label: n!.data.label }))}
            services={services.map((s) => ({ id: s.id, label: s.data.label }))}
          />
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="primary" size="sm" onClick={apply} disabled={!dirty}>
          Apply
        </Button>
        <Button variant="secondary" size="sm" onClick={reset} disabled={!dirty}>
          <RotateCcw size={12} /> Revert
        </Button>
        <Button variant={isFailed ? 'primary' : 'danger'} size="sm" onClick={() => toggleFailure(node.id)} title="Failure injection: take this component down or restore it">
          {isFailed ? <ServerCrash size={12} /> : <ServerCrash size={12} />} {isFailed ? 'Restore' : 'Fail'}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => removeNode(node.id)}>
          <Trash2 size={12} /> Delete
        </Button>
      </div>

      {issues.length > 0 && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-[11px] text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
          {issues.map((i, idx) => (
            <p key={idx}>• {i.message}</p>
          ))}
        </div>
      )}
      {dirty && issues.length === 0 && <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">Unapplied changes — press Apply to save.</p>}
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <div className="font-mono text-xs font-semibold text-app-800 dark:text-app-100">{value}</div>
      <div className="text-[9px] uppercase text-app-400">{label}</div>
    </div>
  )
}

function FieldRenderer({
  field,
  value,
  onChange,
  issue,
  targets,
  services,
}: {
  field: FieldSpec
  value: unknown
  onChange: (v: unknown) => void
  issue?: string
  targets: { id: string; label: string }[]
  services: { id: string; label: string }[]
}) {
  if (field.type === 'number') {
    return (
      <FieldRow label={field.label} unit={field.unit} help={field.help} error={issue}>
        <input
          type="number"
          value={typeof value === 'number' ? value : 0}
          min={field.min}
          max={field.max}
          step={field.step}
          onChange={(e) => onChange(Number(e.target.value))}
          className={inputCls}
        />
      </FieldRow>
    )
  }
  if (field.type === 'text') {
    return (
      <FieldRow label={field.label} help={field.help} error={issue}>
        <input type="text" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} className={inputCls} />
      </FieldRow>
    )
  }
  if (field.type === 'boolean') {
    return (
      <label className="flex items-center justify-between gap-2 rounded-md border border-app-200 px-2 py-1.5 dark:border-app-700">
        <span className="text-xs font-medium text-app-700 dark:text-app-300">{field.label}</span>
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-accent-600" />
        {field.help && <span className="sr-only">{field.help}</span>}
      </label>
    )
  }
  if (field.type === 'select') {
    return (
      <FieldRow label={field.label} help={field.help} error={issue}>
        <select value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} className={inputCls}>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </FieldRow>
    )
  }
  if (field.type === 'requestMix') {
    const rows = (value as { path: string; method: HttpMethod; weight: number }[]) ?? []
    return (
      <div>
        <div className="mb-1 text-xs font-medium text-app-700 dark:text-app-300">{field.label}</div>
        <div className="space-y-1">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-1">
              <input
                value={row.path}
                onChange={(e) => onChange(rows.map((r, j) => (j === i ? { ...r, path: e.target.value } : r)))}
                className={cx(inputCls, 'flex-1')}
                placeholder="/path"
              />
              <select
                value={row.method}
                onChange={(e) => onChange(rows.map((r, j) => (j === i ? { ...r, method: e.target.value } : r)))}
                className={cx(inputCls, 'w-16 px-1')}
              >
                {HTTP_METHODS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
              <input
                type="number"
                value={row.weight}
                min={0}
                onChange={(e) => onChange(rows.map((r, j) => (j === i ? { ...r, weight: Number(e.target.value) } : r)))}
                className={cx(inputCls, 'w-14 px-1')}
                title="Weight in the request mix"
              />
              <button
                type="button"
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
                className="text-app-400 hover:text-red-600"
                title="Remove entry"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-1 flex items-center justify-between">
          <button
            type="button"
            onClick={() => onChange([...rows, { path: '/users/new', method: 'GET', weight: 10 }])}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-accent-600 hover:underline"
          >
            <Plus size={11} /> Add endpoint
          </button>
          <span className="text-[10px] text-app-400">total weight {rows.reduce((s, r) => s + (r.weight || 0), 0)}</span>
        </div>
        {issue && <p className="mt-1 text-[11px] text-red-600">{issue}</p>}
      </div>
    )
  }
  if (field.type === 'perRouteLimits') {
    const rows = (value as { path: string; requestsPerSecond: number }[]) ?? []
    return (
      <div>
        <div className="mb-1 text-xs font-medium text-app-700 dark:text-app-300">{field.label}</div>
        <div className="space-y-1">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-1">
              <input
                value={row.path}
                onChange={(e) => onChange(rows.map((r, j) => (j === i ? { ...r, path: e.target.value } : r)))}
                className={cx(inputCls, 'flex-1')}
                placeholder="/path/*"
              />
              <input
                type="number"
                value={row.requestsPerSecond}
                min={1}
                onChange={(e) => onChange(rows.map((r, j) => (j === i ? { ...r, requestsPerSecond: Number(e.target.value) } : r)))}
                className={cx(inputCls, 'w-16 px-1')}
                title="Requests per second"
              />
              <span className="text-[10px] text-app-400">RPS</span>
              <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="text-app-400 hover:text-red-600">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onChange([...rows, { path: '/orders/*', requestsPerSecond: 10 }])}
          className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-accent-600 hover:underline"
        >
          <Plus size={11} /> Add per-route limit
        </button>
        {issue && <p className="mt-1 text-[11px] text-red-600">{issue}</p>}
      </div>
    )
  }
  if (field.type === 'endpointList') {
    const rows = (value as string[]) ?? []
    return (
      <div>
        <div className="mb-1 text-xs font-medium text-app-700 dark:text-app-300">{field.label}</div>
        <div className="flex flex-wrap gap-1">
          {rows.map((ep, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded bg-app-100 px-1.5 py-0.5 font-mono text-[10px] text-app-700 dark:bg-app-700 dark:text-app-200">
              {ep}
              <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="text-app-400 hover:text-red-600">
                ✕
              </button>
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onChange([...rows, '/*'])}
          className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-accent-600 hover:underline"
        >
          <Plus size={11} /> Add endpoint
        </button>
        {issue && <p className="mt-1 text-[11px] text-red-600">{issue}</p>}
      </div>
    )
  }
  if (field.type === 'weights') {
    const weights = (value as Record<string, number>) ?? {}
    return (
      <div>
        <div className="mb-1 text-xs font-medium text-app-700 dark:text-app-300">{field.label}</div>
        <div className="space-y-1">
          {targets.map((t) => (
            <div key={t.id} className="flex items-center gap-2">
              <span className="flex-1 truncate text-[11px] text-app-600 dark:text-app-300">{t.label}</span>
              <input
                type="number"
                min={0}
                max={10}
                value={weights[t.id] ?? 1}
                onChange={(e) => onChange({ ...weights, [t.id]: Number(e.target.value) })}
                className={cx(inputCls, 'w-16 px-1')}
              />
            </div>
          ))}
          {targets.length === 0 && <p className="text-[11px] text-app-400">Connect downstream gateways to assign weights.</p>}
        </div>
        {issue && <p className="mt-1 text-[11px] text-red-600">{issue}</p>}
      </div>
    )
  }
  if (field.type === 'jsonRoutes') return null
  void services
  return null
}

// ------------------------------------------------------------------ routing

function RoutingEditor() {
  const routing = useApp((s) => s.architecture.routing)
  const services = useApp(useShallow((s) => s.architecture.nodes.filter((n) => n.data.type === 'service')))
  const gateways = useApp(useShallow((s) => s.architecture.nodes.filter((n) => n.data.type === 'gateway')))
  const runtimes = useApp((s) => s.runtimes)
  const setDraftRules = useApp((s) => s.setDraftRules)
  const setPropagationDelay = useApp((s) => s.setPropagationDelay)
  const setFallbackRoute = useApp((s) => s.setFallbackRoute)
  const publishConfig = useApp((s) => s.publishConfig)
  const status = useApp((s) => s.status)
  const configStore = useApp((s) => s.architecture.nodes.find((n) => n.data.type === 'configStore'))
  const configStoreDown = useApp((s) => (configStore ? s.failedNodeIds.includes(configStore.id) : false))
  const configStoreServed = useApp((s) => (configStore ? s.runtimes[configStore.id]?.totalProcessed ?? 0 : 0))

  const rules = routing.draftRules
  const dirty = useMemo(() => JSON.stringify(rules) !== JSON.stringify(routing.versions.at(-1)?.rules ?? []), [rules, routing.versions])

  const updateRule = (id: string, patch: Partial<RouteRule>): void => {
    setDraftRules(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  const addRule = (): void => {
    const newRule: RouteRule = {
      id: `rule-${Math.random().toString(36).slice(2, 7)}`,
      path: '/new/*',
      matchType: 'prefix',
      methods: ['GET'],
      destinationId: services[0]?.id ?? '',
      priority: 10,
      enabled: true,
    }
    setDraftRules([...rules, newRule])
  }

  return (
    <div className="p-3">
      <h3 className="text-sm font-semibold text-app-900 dark:text-app-50">Dynamic L7 routing (Config Store)</h3>
      <p className="mt-1 text-[11px] leading-relaxed text-app-500 dark:text-app-400">
        This routing table is attached to the shared Config Store. Gateways watch the store and reload rules live without a restart. Publish the draft rules
        to roll a new configuration version out to every gateway after the propagation delay.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-md border border-app-200 p-2 dark:border-app-700">
          <div className="text-app-400">Published version</div>
          <div className="font-mono text-sm font-semibold text-app-800 dark:text-app-100">v{routing.publishedVersion}</div>
        </div>
        <div className="rounded-md border border-app-200 p-2 dark:border-app-700">
          <div className="text-app-400">Config Store</div>
          <div className={cx('font-mono text-sm font-semibold', configStoreDown ? 'text-red-600' : configStore ? 'text-emerald-600' : 'text-app-400')}>
            {configStore ? (configStoreDown ? 'OUTAGE' : `${configStoreServed} served`) : 'not linked'}
          </div>
        </div>
      </div>

      <div className="mt-2 space-y-1">
        {gateways.map((gw) => {
          const rt = runtimes[gw.id]
          return (
            <div key={gw.id} className="flex items-center justify-between rounded-md bg-app-50 px-2 py-1.5 text-[11px] dark:bg-app-800">
              <span className="font-medium text-app-700 dark:text-app-200">{gw.data.label}</span>
              <span className="flex items-center gap-1.5">
                {rt?.pendingConfigVersion != null ? (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-amber-700 dark:bg-amber-900/70 dark:text-amber-300">
                    fetching v{rt.pendingConfigVersion}…
                  </span>
                ) : (
                  <span className="rounded bg-accent-50 px-1.5 py-0.5 font-mono text-accent-700 dark:bg-app-700 dark:text-accent-300">
                    active v{rt?.activeConfigVersion ?? '-'}
                  </span>
                )}
                {rt?.configWarning && <span title={rt.configWarning} className="text-amber-500">⚠</span>}
              </span>
            </div>
          )
        })}
      </div>

      <div className="mt-3 space-y-2">
        <FieldRow label="Config propagation delay" unit="ms" help="Delay before each gateway activates a newly published version.">
          <input
            type="number"
            min={0}
            max={60000}
            step={250}
            value={routing.propagationDelayMs}
            onChange={(e) => setPropagationDelay(Number(e.target.value))}
            className={inputCls}
          />
        </FieldRow>
        <FieldRow label="Fallback route (when nothing matches)" help="Requests fall back to this rule; with no fallback they return 404.">
          <select value={routing.fallbackRouteId ?? ''} onChange={(e) => setFallbackRoute(e.target.value || null)} className={inputCls}>
            <option value="">None — return 404 Not Found</option>
            {rules.map((r) => (
              <option key={r.id} value={r.id}>
                {r.path} → {services.find((s) => s.id === r.destinationId)?.data.label ?? r.destinationId}
              </option>
            ))}
          </select>
        </FieldRow>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-app-500 dark:text-app-400">Routing rules ({rules.length})</h4>
        <button type="button" onClick={addRule} className="inline-flex items-center gap-1 text-[11px] font-medium text-accent-600 hover:underline">
          <Plus size={11} /> Add rule
        </button>
      </div>

      <div className="mt-2 space-y-2">
        {rules.map((rule) => {
          const err = validateRuleSyntax(rule)
          const destMissing = !services.some((s) => s.id === rule.destinationId)
          return (
            <div key={rule.id} className={cx('rounded-lg border p-2', err || destMissing ? 'border-red-300 bg-red-50/50 dark:border-red-900 dark:bg-red-950/30' : 'border-app-200 dark:border-app-700')}>
              <div className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={(e) => updateRule(rule.id, { enabled: e.target.checked })}
                  className="h-3.5 w-3.5 accent-accent-600"
                  title="Enable / disable this rule"
                />
                <input value={rule.path} onChange={(e) => updateRule(rule.id, { path: e.target.value })} className={cx(inputCls, 'flex-1 font-mono')} />
                <button
                  type="button"
                  onClick={() => setDraftRules(rules.filter((r) => r.id !== rule.id))}
                  className="text-app-400 hover:text-red-600"
                  title="Delete rule"
                >
                  <Trash2 size={12} />
                </button>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <select value={rule.matchType} onChange={(e) => updateRule(rule.id, { matchType: e.target.value as RouteRule['matchType'] })} className={cx(inputCls, 'w-16 px-1')}>
                  <option value="prefix">prefix</option>
                  <option value="exact">exact</option>
                </select>
                <select
                  value={rule.methods.includes('ANY') ? 'ANY' : rule.methods[0] ?? 'GET'}
                  onChange={(e) => updateRule(rule.id, { methods: [e.target.value as HttpMethod] })}
                  className={cx(inputCls, 'w-16 px-1')}
                >
                  {HTTP_METHODS.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
                <select value={rule.destinationId} onChange={(e) => updateRule(rule.id, { destinationId: e.target.value })} className={cx(inputCls, 'flex-1 px-1')}>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.data.label}
                    </option>
                  ))}
                  {!services.some((s) => s.id === rule.destinationId) && <option value={rule.destinationId}>{rule.destinationId} (missing)</option>}
                </select>
                <label className="flex items-center gap-1 text-[10px] text-app-500">
                  prio
                  <input
                    type="number"
                    value={rule.priority}
                    onChange={(e) => updateRule(rule.id, { priority: Number(e.target.value) })}
                    className={cx(inputCls, 'w-12 px-1')}
                  />
                </label>
              </div>
              {(err || destMissing) && <p className="mt-1 text-[10px] text-red-600">{err ?? 'Destination service is not in the architecture'}</p>}
            </div>
          )
        })}
        {rules.length === 0 && <p className="rounded-md border border-dashed border-app-300 p-3 text-center text-[11px] text-app-400">No rules — every request returns 404.</p>}
      </div>

      <div className="mt-4 rounded-lg border border-app-200 bg-app-50 p-2 dark:border-app-700 dark:bg-app-800">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-medium text-app-600 dark:text-app-300">Draft vs published</span>
          <span className={cx('font-mono', dirty ? 'text-amber-600' : 'text-emerald-600')}>{dirty ? 'unpublished changes' : 'in sync'}</span>
        </div>
        <div className="mt-2 flex gap-2">
          <Button variant="primary" size="sm" onClick={() => publishConfig('Draft update')} disabled={status === 'idle'} title={status === 'idle' ? 'Start the simulation first' : 'Publish draft rules'}>
            <Rocket size={12} /> Publish config
          </Button>
          <span className="self-center text-[10px] text-app-400">{status === 'idle' ? 'Start the sim to publish' : `v${routing.publishedVersion} → pending`}</span>
        </div>
      </div>

      <div className="mt-3 text-[10px] leading-relaxed text-app-400">
        Rule evaluation order: enabled first, then method match, then priority (higher wins), then longest/most specific path, exact before prefix.
      </div>
    </div>
  )
}
