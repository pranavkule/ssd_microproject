import type { Architecture, ComponentNode, ComponentType, DatabaseConfig, MetricsSnapshot, RouteRule, ServiceConfig } from '../domain/types'
import type { ScheduledAction } from './engine'

export interface ExperimentParamSpec {
  key: string
  label: string
  unit?: string
  min: number
  max: number
  step: number
  default: number
}

export interface ExperimentDef {
  id: string
  name: string
  description: string
  params: ExperimentParamSpec[]
  /** Returns a modified architecture (or the same one) plus scheduled mid-run actions. */
  apply: (arch: Architecture, params: Record<string, number>) => { arch: Architecture; scheduled: ScheduledAction[] }
  /** Build a results summary from the actual simulation metrics. */
  summarize: (metrics: MetricsSnapshot, labels: Record<string, string>) => string
}

function firstOf(arch: Architecture, type: ComponentType): ComponentNode | undefined {
  return arch.nodes.find((n) => n.data.type === type)
}

function allOf(arch: Architecture, type: ComponentType): ComponentNode[] {
  return arch.nodes.filter((n) => n.data.type === type)
}

function clone(arch: Architecture): Architecture {
  return structuredClone(arch)
}

function labelMap(arch: Architecture): Record<string, string> {
  return Object.fromEntries(arch.nodes.map((n) => [n.id, n.data.label]))
}

function gatewaySplitSummary(metrics: MetricsSnapshot, labels: Record<string, string>): string {
  const entries = Object.entries(metrics.perGateway)
  if (entries.length === 0) return 'No gateway traffic recorded.'
  return entries
    .map(([id, count]) => `${labels[id] ?? id}: ${count} requests (${metrics.completed > 0 ? ((count / metrics.completed) * 100).toFixed(1) : '0'}%)`)
    .join(' · ')
}

export const EXPERIMENTS: ExperimentDef[] = [
  {
    id: 'normal',
    name: 'Normal operation',
    description: 'Baseline run. Both gateways and all services are healthy; traffic flows through the rate limiter, load balancer and gateways.',
    params: [],
    apply: (arch) => ({ arch: clone(arch), scheduled: [] }),
    summarize: (m, labels) =>
      `Generated ${m.generated}, completed ${m.completed}, succeeded ${m.succeeded}, failed ${m.failed} (${(m.errorRate * 100).toFixed(1)}% errors). ` +
      `Latency avg ${m.latencyAvg}ms · p95 ${m.latencyP95}ms · p99 ${m.latencyP99}ms. Distribution: ${gatewaySplitSummary(m, labels)}`,
  },
  {
    id: 'gateway-failure',
    name: 'Gateway failure',
    description: 'Fails API Gateway 1 while the simulation runs. All traffic should shift to Gateway 2 after the load balancer health check notices.',
    params: [
      { key: 'failAtSec', label: 'Fail Gateway 1 at', unit: 's', min: 1, max: 60, step: 1, default: 3 },
      { key: 'durationSec', label: 'Run length', unit: 's', min: 10, max: 120, step: 5, default: 30 },
    ],
    apply: (arch, p) => {
      const a = clone(arch)
      const gw1 = allOf(a, 'gateway')[0]
      const scheduled: ScheduledAction[] = gw1 ? [{ atMs: p.failAtSec * 1000, kind: 'fail-node', nodeId: gw1.id }] : []
      return { arch: a, scheduled }
    },
    summarize: (m, labels) => {
      const gwEntries = Object.entries(m.perGateway)
      const failedGw = gwEntries.find(([, c]) => c === 0)
      const survivor = gwEntries.filter(([, c]) => c > 0)
      return (
        `After the failure, ${failedGw ? labels[failedGw[0]] ?? failedGw[0] : 'the failed gateway'} received 0 new requests. ` +
        `${survivor.map(([id, c]) => `${labels[id] ?? id} handled ${c}`).join('; ')}. ` +
        `Success rate ${m.completed > 0 ? (((m.succeeded / m.completed) * 100).toFixed(1)) : '0'}%, ` +
        `503s: ${m.serviceUnavailable}, retries: ${m.retries}.`
      )
    },
  },
  {
    id: 'load-balancing',
    name: 'Load balancing comparison',
    description: 'Runs the default traffic against both gateways with the selected algorithm. Switch between Round Robin and Least Connections and compare the traffic split.',
    params: [
      { key: 'algorithm', label: 'Algorithm (0=RR, 1=Least Conn, 2=Weighted RR)', min: 0, max: 2, step: 1, default: 0 },
      { key: 'weightGw2', label: 'Weight for Gateway 2 (Weighted RR)', min: 0, max: 10, step: 1, default: 3 },
    ],
    apply: (arch, p) => {
      const a = clone(arch)
      const lb = firstOf(a, 'loadBalancer')
      const gws = allOf(a, 'gateway')
      if (lb && gws.length >= 2) {
        const algos = ['round-robin', 'least-connections', 'weighted-round-robin'] as const
        lb.data.config = {
          ...lb.data.config,
          algorithm: algos[Math.round(p.algorithm)] ?? 'round-robin',
          weights: { [gws[0].id]: 1, [gws[1].id]: p.weightGw2 },
        } as typeof lb.data.config
      }
      return { arch: a, scheduled: [] }
    },
    summarize: (m, labels) => {
      const [a, b] = Object.entries(m.perGateway)
      const split =
        a && b && a[1] + b[1] > 0 ? Math.abs(a[1] - b[1]) / (a[1] + b[1]) : 0
      return `Traffic split: ${gatewaySplitSummary(m, labels)}. Split imbalance: ${(split * 100).toFixed(1)}% (0% = perfectly even).`
    },
  },
  {
    id: 'rate-limit-overload',
    name: 'Rate-limit overload',
    description: 'Pushes the client far beyond the rate limiter capacity. Excess requests must be rejected with HTTP 429.',
    params: [
      { key: 'requestRate', label: 'Client request rate', unit: 'RPS', min: 10, max: 2000, step: 10, default: 200 },
      { key: 'limitRps', label: 'Rate limiter limit', unit: 'RPS', min: 1, max: 500, step: 1, default: 60 },
    ],
    apply: (arch, p) => {
      const a = clone(arch)
      const client = firstOf(a, 'client')
      const rl = firstOf(a, 'rateLimiter')
      if (client) client.data.config = { ...client.data.config, requestRate: p.requestRate } as typeof client.data.config
      if (rl) {
        rl.data.config = {
          ...rl.data.config,
          requestsPerSecond: p.limitRps,
          burstCapacity: Math.round(p.limitRps / 2),
        } as typeof rl.data.config
      }
      return { arch: a, scheduled: [] }
    },
    summarize: (m) =>
      `Generated ${m.generated} requests; ${m.rateLimited} rejected with 429; ${m.completed - m.rateLimited} admitted. ` +
      `Throughput ${m.throughputRps} RPS completed. Avg latency ${m.latencyAvg}ms on admitted traffic.`,
  },
  {
    id: 'slow-backend',
    name: 'Slow backend',
    description: 'Increases User Service processing latency dramatically. Watch queues build at the gateways and latency percentiles climb.',
    params: [
      { key: 'serviceTimeMs', label: 'User Service latency', unit: 'ms', min: 20, max: 2000, step: 10, default: 250 },
      { key: 'durationSec', label: 'Run length', unit: 's', min: 10, max: 120, step: 5, default: 30 },
    ],
    apply: (arch, p) => {
      const a = clone(arch)
      const svc = allOf(a, 'service').find((n) => (n.data.config as ServiceConfig).endpoints.some((e) => e.startsWith('/users')))
      if (svc) svc.data.config = { ...svc.data.config, serviceTimeMs: p.serviceTimeMs } as typeof svc.data.config
      return { arch: a, scheduled: [] }
    },
    summarize: (m) =>
      `Avg latency ${m.latencyAvg}ms, p95 ${m.latencyP95}ms, p99 ${m.latencyP99}ms. ` +
      `Timeouts: ${m.timeouts}, 503s: ${m.serviceUnavailable}, success ${m.succeeded}/${m.completed}.`,
  },
  {
    id: 'db-bottleneck',
    name: 'Database bottleneck',
    description: 'Shrinks the Order Database connection capacity and raises query latency, turning it into a bottleneck under load.',
    params: [
      { key: 'dbCapacity', label: 'DB capacity', unit: 'concurrent', min: 1, max: 30, step: 1, default: 2 },
      { key: 'queryLatencyMs', label: 'Query latency', unit: 'ms', min: 5, max: 1000, step: 5, default: 150 },
    ],
    apply: (arch, p) => {
      const a = clone(arch)
      const db = allOf(a, 'database').find((n) => (n.data.config as DatabaseConfig).databaseName.includes('order'))
      if (db) {
        db.data.config = {
          ...db.data.config,
          capacity: p.dbCapacity,
          queryLatencyMs: p.queryLatencyMs,
        } as typeof db.data.config
      }
      return { arch: a, scheduled: [] }
    },
    summarize: (m) =>
      `Order-path requests queue at the database. Timeouts ${m.timeouts}, 503s ${m.serviceUnavailable}, retries ${m.retries}. ` +
      `Avg latency ${m.latencyAvg}ms (p95 ${m.latencyP95}ms). Success ${m.succeeded}/${m.completed}.`,
  },
  {
    id: 'config-store-outage',
    name: 'Config Store outage',
    description: 'Fails the Config Store (Redis), then publishes a new routing configuration. Gateways must keep their last valid routing table.',
    params: [
      { key: 'failAtSec', label: 'Fail Config Store at', unit: 's', min: 1, max: 60, step: 1, default: 3 },
      { key: 'publishAtSec', label: 'Publish new config at', unit: 's', min: 2, max: 90, step: 1, default: 8 },
      { key: 'durationSec', label: 'Run length', unit: 's', min: 15, max: 120, step: 5, default: 30 },
    ],
    apply: (arch, p) => {
      const a = clone(arch)
      const store = firstOf(a, 'configStore')
      const ordersRule = a.routing.draftRules.find((r) => r.path.startsWith('/orders'))
      const rules: RouteRule[] = structuredClone(a.routing.draftRules).map((r) =>
        r.id === ordersRule?.id ? { ...r, destinationId: destinationOf(a) ?? r.destinationId } : r,
      )
      const scheduled: ScheduledAction[] = []
      if (store) scheduled.push({ atMs: p.failAtSec * 1000, kind: 'fail-node', nodeId: store.id })
      scheduled.push({ atMs: p.publishAtSec * 1000, kind: 'publish-rules', rules, note: 'Canary: /orders/* → User Service' })
      return { arch: a, scheduled }
    },
    summarize: (m, labels) =>
      `The canary configuration was published while the Config Store was down, so gateways retained their last valid table. ` +
      `Errors ${m.failed}/${m.completed} (503s: ${m.serviceUnavailable}). Traffic: ${gatewaySplitSummary(m, labels)}. ` +
      `Check the event log for "could not fetch configuration" warnings.`,
  },
  {
    id: 'dynamic-route-update',
    name: 'Dynamic route update',
    description: 'Publishes a canary routing change mid-run: /orders/* is moved from Order Service to User Service. Watch both gateways activate the new version after the propagation delay.',
    params: [
      { key: 'publishAtSec', label: 'Publish at', unit: 's', min: 1, max: 60, step: 1, default: 5 },
      { key: 'propagationMs', label: 'Propagation delay', unit: 'ms', min: 0, max: 15000, step: 500, default: 2000 },
    ],
    apply: (arch, p) => {
      const a = clone(arch)
      a.routing.propagationDelayMs = p.propagationMs
      const users = allOf(a, 'service').find((n) => (n.data.config as ServiceConfig).endpoints.some((e) => e.startsWith('/users')))
      const rules = structuredClone(a.routing.draftRules).map((r) =>
        r.path.startsWith('/orders') && users ? { ...r, destinationId: users.id } : r,
      )
      const scheduled: ScheduledAction[] = [
        { atMs: p.publishAtSec * 1000, kind: 'publish-rules', rules, note: 'Canary: /orders/* → User Service' },
      ]
      return { arch: a, scheduled }
    },
    summarize: (m, labels) => {
      const perService = Object.entries(m.perService)
      const orderSvc = perService.find(([id]) => (labels[id] ?? '').toLowerCase().includes('order'))
      const userSvc = perService.find(([id]) => (labels[id] ?? '').toLowerCase().includes('user'))
      return (
        `After propagation, /orders/* requests were served by ${userSvc ? labels[userSvc[0]] : 'User Service'} instead of ` +
        `${orderSvc ? labels[orderSvc[0]] : 'Order Service'}. ` +
        `Service distribution: ${perService.map(([id, c]) => `${labels[id] ?? id}: ${c}`).join(', ')}. ` +
        `Inspect the event log for "activated routing configuration" entries on both gateways.`
      )
    },
  },
  {
    id: 'unknown-route',
    name: 'Unknown route',
    description: 'Adds client traffic for a path with no matching route rule. The gateways must answer 404 Not Found.',
    params: [
      { key: 'unknownWeight', label: 'Unknown-path traffic weight', min: 0, max: 100, step: 5, default: 30 },
    ],
    apply: (arch, p) => {
      const a = clone(arch)
      const client = firstOf(a, 'client')
      if (client) {
        const cfg = client.data.config as { requestMix: { path: string; method: 'GET'; weight: number }[] }
        cfg.requestMix = [...cfg.requestMix, { path: '/search/unknown', method: 'GET', weight: p.unknownWeight }]
      }
      return { arch: a, scheduled: [] }
    },
    summarize: (m) =>
      `404 responses: ${m.notFound} of ${m.completed} completed requests (${m.completed > 0 ? ((m.notFound / m.completed) * 100).toFixed(1) : 0}%). ` +
      `Successful responses: ${m.succeeded}.`,
  },
  {
    id: 'auth-failure',
    name: 'Gateway authentication failure',
    description: 'Enables authentication on both gateways with a configurable failure rate. Rejected requests return 401.',
    params: [
      { key: 'failurePercent', label: 'Auth failure rate', unit: '%', min: 1, max: 100, step: 1, default: 25 },
    ],
    apply: (arch, p) => {
      const a = clone(arch)
      for (const gw of allOf(a, 'gateway')) {
        gw.data.config = {
          ...gw.data.config,
          authEnabled: true,
          authFailureRate: p.failurePercent,
        } as typeof gw.data.config
      }
      return { arch: a, scheduled: [] }
    },
    summarize: (m) =>
      `401 rejections: ${m.authFailed} of ${m.generated} generated (${m.generated > 0 ? ((m.authFailed / m.generated) * 100).toFixed(1) : 0}%). ` +
      `Successful completions: ${m.succeeded}. Requests still reached gateways; only authentication was rejected.`,
  },
  {
    id: 'recovery',
    name: 'Recovery',
    description: 'Fails Gateway 1, lets traffic concentrate on Gateway 2, then restores Gateway 1 and observes traffic returning after health checks pass.',
    params: [
      { key: 'failAtSec', label: 'Fail Gateway 1 at', unit: 's', min: 1, max: 30, step: 1, default: 3 },
      { key: 'restoreAtSec', label: 'Restore Gateway 1 at', unit: 's', min: 4, max: 90, step: 1, default: 12 },
    ],
    apply: (arch, p) => {
      const a = clone(arch)
      const gw1 = allOf(a, 'gateway')[0]
      const scheduled: ScheduledAction[] = []
      if (gw1) {
        scheduled.push({ atMs: p.failAtSec * 1000, kind: 'fail-node', nodeId: gw1.id })
        scheduled.push({ atMs: p.restoreAtSec * 1000, kind: 'restore-node', nodeId: gw1.id })
      }
      return { arch: a, scheduled }
    },
    summarize: (m, labels) =>
      `Recovery complete. ${gatewaySplitSummary(m, labels)}. Errors ${m.failed} (503s ${m.serviceUnavailable}), retries ${m.retries}. ` +
      `Both gateways serve traffic again once health checks pass.`,
  },
]

function destinationOf(arch: Architecture): string | undefined {
  return allOf(arch, 'service').find((n) => (n.data.config as ServiceConfig).endpoints.some((e) => e.startsWith('/users')))?.id
}

export function experimentById(id: string): ExperimentDef | undefined {
  return EXPERIMENTS.find((e) => e.id === id)
}

export function defaultParams(exp: ExperimentDef): Record<string, number> {
  return Object.fromEntries(exp.params.map((p) => [p.key, p.default]))
}

export function labelsFor(arch: Architecture): Record<string, string> {
  return labelMap(arch)
}
