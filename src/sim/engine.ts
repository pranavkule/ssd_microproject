import type {
  Architecture,
  ComponentNode,
  ComponentRuntimeView,
  FlowFrame,
  GatewayConfig,
  HttpMethod,
  LoadBalancingAlgorithm,
  RateLimiterConfig,
  RouteRule,
  SecretManagerConfig,
  SimEvent,
  SimRequestRecord,
  Severity,
} from '../domain/types'
import { matchRoute } from '../domain/routing'
import { selectTarget, type LbTarget } from '../domain/loadbalancing'
import { checkRateLimit, createRateLimitState, type RateLimitState } from '../domain/ratelimit'
import { createRng } from '../domain/rng'
import { successors } from '../domain/topology'
import { MetricsCollector } from './metrics'

type Stage = 'queued' | 'in-service' | 'done'

interface InternalRequest {
  id: string
  method: HttpMethod
  path: string
  clientNodeId: string
  clientId: string
  arrivalTime: number
  stage: Stage
  componentId: string | null
  readyAt: number
  retries: number
  gatewayId: string | null
  serviceId: string | null
  routeId: string | null
  leftGatewayAt: number
  statusCode: number | null
  failureReason: string | null
  completionTime: number | null
  lastEdgeId: string | null
  done: boolean
}

interface NodeRuntimeState {
  queue: InternalRequest[]
  inService: InternalRequest[]
  processed: number
  rejected: number
  queueDepthPeak: number
}

interface GwRuntime {
  activeVersion: number | null
  rules: RouteRule[]
  pending: { version: number; dueAt: number } | null
  warning: string | null
  /** JWT/TLS secrets fetched from the Secret Manager, tracked for display. */
  secretsVersion: number
  secretsFetched: number
  secretsRefreshed: number
  publishedSeen: number | null
}

interface SecretManagerRuntime {
  nextRotationAt: number
  rotations: number
}

interface LbRuntime {
  rrIndex: number
  wrrCurrent: Record<string, number>
  health: Record<string, { healthy: boolean; lastCheckMs: number }>
}

export type ScheduledAction =
  | { atMs: number; kind: 'publish-rules'; rules: RouteRule[]; note: string }
  | { atMs: number; kind: 'fail-node'; nodeId: string }
  | { atMs: number; kind: 'restore-node'; nodeId: string }

export interface EngineOptions {
  scheduledActions?: ScheduledAction[]
}

export class SimulationEngine {
  private arch: Architecture
  private now = 0
  private readonly rng: () => number
  private readonly tickMs: number
  private readonly sampleIntervalMs: number
  private readonly maxSimMs: number

  private nodes = new Map<string, ComponentNode>()
  private nodeState = new Map<string, NodeRuntimeState>()
  private failed = new Set<string>()
  private rateLimit = new Map<string, RateLimitState>()
  private lbRuntime = new Map<string, LbRuntime>()
  private gwRuntime = new Map<string, GwRuntime>()
  private secretRuntime = new Map<string, SecretManagerRuntime>()
  private edgeActivity = new Map<string, { t: number; ok: boolean }>()
  private edgeCounts = new Map<string, number>()
  private clientAccum = new Map<string, number>()
  private requestCounter = 0
  private eventCounter = 0

  private inflight = new Map<string, InternalRequest>()
  private recentRequests: SimRequestRecord[] = []
  private events: SimEvent[] = []
  private pendingEvents: SimEvent[] = []
  private metrics = new MetricsCollector()
  private scheduled: ScheduledAction[] = []
  private lastFrameEventId = 0
  private routingVersionHistory: { version: number; rules: RouteRule[] }[] = []

  constructor(arch: Architecture, options: EngineOptions = {}) {
    this.arch = structuredClone(arch)
    this.rng = createRng(arch.settings.seed)
    this.tickMs = arch.settings.tickMs
    this.sampleIntervalMs = arch.settings.sampleIntervalMs
    this.maxSimMs = arch.settings.maxSimSeconds * 1000
    this.rebuildGraph()
    this.scheduled = [...(options.scheduledActions ?? [])].sort((a, b) => a.atMs - b.atMs)
    this.initializeRouting()
  }

  // ---------------------------------------------------------------- lifecycle

  private rebuildGraph(): void {
    this.nodes = new Map(this.arch.nodes.map((n) => [n.id, n]))
    for (const n of this.arch.nodes) {
      if (!this.nodeState.has(n.id)) {
        this.nodeState.set(n.id, { queue: [], inService: [], processed: 0, rejected: 0, queueDepthPeak: 0 })
      }
      if (n.data.type === 'rateLimiter' && !this.rateLimit.has(n.id)) {
        this.rateLimit.set(n.id, createRateLimitState(n.data.config as RateLimiterConfig, 0))
      }
      if (n.data.type === 'loadBalancer' && !this.lbRuntime.has(n.id)) {
        this.lbRuntime.set(n.id, { rrIndex: 0, wrrCurrent: {}, health: {} })
      }
      if (n.data.type === 'gateway' && !this.gwRuntime.has(n.id)) {
        this.gwRuntime.set(n.id, { activeVersion: null, rules: [], pending: null, warning: null, secretsVersion: 1, secretsFetched: 0, secretsRefreshed: 0, publishedSeen: null })
      }
      if (n.data.type === 'secretManager' && !this.secretRuntime.has(n.id)) {
        const cfg = n.data.config as SecretManagerConfig
        this.secretRuntime.set(n.id, { nextRotationAt: cfg.keyRotationIntervalMs, rotations: 0 })
      }
    }
    // drop state for deleted nodes
    for (const id of [...this.nodeState.keys()]) if (!this.nodes.has(id)) this.nodeState.delete(id)
    for (const id of [...this.secretRuntime.keys()]) if (!this.nodes.has(id)) this.secretRuntime.delete(id)

    // initialize any newly added gateways from the published configuration
    const published = this.arch.routing.publishedVersion
    const snap = this.arch.routing.versions.find((v) => v.version === published)
    for (const n of this.arch.nodes) {
      if (n.data.type !== 'gateway') continue
      const rt = this.gwRuntime.get(n.id)!
      if (rt.activeVersion === null) {
        rt.activeVersion = published
        rt.rules = structuredClone(snap?.rules ?? this.arch.routing.draftRules)
      }
    }
  }

  private initializeRouting(): void {
    const version = this.arch.routing.publishedVersion
    const snap = this.arch.routing.versions.find((v) => v.version === version)
    this.routingVersionHistory = this.arch.routing.versions.map((v) => ({ version: v.version, rules: structuredClone(v.rules) }))
    const rules = structuredClone(snap?.rules ?? this.arch.routing.draftRules)
    for (const n of this.arch.nodes) {
      if (n.data.type === 'gateway') {
        const rt = this.gwRuntime.get(n.id)!
        rt.activeVersion = version
        rt.rules = structuredClone(rules)
        rt.pending = null
        rt.warning = null
      }
    }
    this.initializeSecrets()
    this.initializeConfigWatch(version)
  }

  /** Gateways load their initial routing table from the shared Config Store at startup. */
  private initializeConfigWatch(version: number): void {
    const configStores = this.arch.nodes.filter((n) => n.data.type === 'configStore')
    for (const n of this.arch.nodes) {
      if (n.data.type !== 'gateway') continue
      const rt = this.gwRuntime.get(n.id)!
      if (rt.publishedSeen !== null) continue
      rt.publishedSeen = version
      const storeNode = configStores.find((cs) => successors(this.arch.edges, n.id).includes(cs.id))
      if (!storeNode) continue
      this.nodeState.get(storeNode.id)!.processed += 1
      this.log('config.watch', 'info', `${n.data.label} loaded routing configuration v${version} from ${storeNode.data.label} at startup (watch enabled)`, n.id)
    }
  }

  /** Gateways fetch JWT signing/public keys and TLS certificates from the Secret Manager at startup. */
  private initializeSecrets(): void {
    for (const n of this.arch.nodes) {
      if (n.data.type !== 'gateway') continue
      const rt = this.gwRuntime.get(n.id)!
      if (rt.secretsFetched > 0) continue
      const store = this.secretStoreFor(n.id)
      if (!store) {
        rt.warning = 'No Secret Manager connected; JWT keys unavailable'
        continue
      }
      const readLatency = (store.data.config as SecretManagerConfig).readLatencyMs
      rt.secretsVersion = 1
      rt.secretsFetched++
      const certs = (store.data.config as SecretManagerConfig).storesTlsCertificates ? ' + TLS certificates' : ''
      this.log('secret.fetched', 'success', `${n.data.label} fetched JWT keys${certs} from ${store.data.label} at startup (read ${readLatency}ms)`, n.id)
    }
  }

  private secretStoreFor(gwId: string): ComponentNode | null {
    const storeId = successors(this.arch.edges, gwId).find((t) => this.nodes.get(t)?.data.type === 'secretManager')
    return storeId ? this.nodes.get(storeId) ?? null : null
  }

  /** Periodic JWT key rotation: gateways re-fetch keys from the Secret Manager. */
  private runSecretRotation(): void {
    for (const [smId, srt] of this.secretRuntime) {
      const sm = this.nodes.get(smId)
      if (!sm || this.failed.has(smId)) continue
      const cfg = sm.data.config as SecretManagerConfig
      if (cfg.keyRotationIntervalMs <= 0) continue
      if (this.now < srt.nextRotationAt) continue
      srt.nextRotationAt = this.now + cfg.keyRotationIntervalMs
      srt.rotations++
      this.nodeState.get(smId)!.processed += 1
      for (const n of this.arch.nodes) {
        if (n.data.type !== 'gateway') continue
        if (this.secretStoreFor(n.id)?.id !== smId) continue
        const rt = this.gwRuntime.get(n.id)!
        rt.secretsVersion++
        rt.secretsRefreshed++
      }
      this.log('secret.rotated', 'info', `${sm.data.label} rotated JWT keys (rotation #${srt.rotations}); gateways re-fetched signing/public keys + TLS certificates`, smId)
    }
  }

  /** Sync configuration/structure changes while preserving runtime state. */
  updateArchitecture(arch: Architecture): void {
    const prevPublished = this.arch.routing.publishedVersion
    this.arch = structuredClone(arch)
    this.rebuildGraph()
    if (arch.routing.publishedVersion !== prevPublished) {
      this.applyPublishedVersion(arch.routing.publishedVersion)
    }
    // health check targets refresh config-driven weights lazily via getConfig
  }

  setFailures(nodeIds: string[]): void {
    this.failed = new Set(nodeIds)
  }

  schedule(action: ScheduledAction): void {
    this.scheduled.push(action)
    this.scheduled.sort((a, b) => a.atMs - b.atMs)
  }

  getSimTime(): number {
    return this.now
  }

  isFinished(): boolean {
    return this.now >= this.maxSimMs
  }

  // ---------------------------------------------------------------- events

  private log(type: string, severity: Severity, message: string, componentId: string | null = null, requestId: string | null = null): void {
    const ev: SimEvent = {
      id: ++this.eventCounter,
      time: this.now,
      type,
      severity,
      componentId,
      requestId,
      message,
    }
    this.events.push(ev)
    this.pendingEvents.push(ev)
    if (this.events.length > 4000) this.events.splice(0, this.events.length - 4000)
  }

  // ---------------------------------------------------------------- main tick

  tick(): FlowFrame {
    const targetTime = Math.min(this.now + this.tickMs, this.maxSimMs)
    if (targetTime === this.now) this.advanceStep(0)
    while (this.now < targetTime) {
      this.advanceStep(Math.min(10, targetTime - this.now))
    }
    return this.buildFrame()
  }

  private advanceStep(dtMs: number): void {
    this.now += dtMs
    this.runScheduledActions()
    this.runConfigPropagation()
    this.runSecretRotation()
    this.runHealthChecks()
    this.generateTraffic(dtMs)
    this.processQueues()
    this.processQueues()
    this.sweepTimeouts()

    this.metrics.maybeSample(this.now, this.sampleIntervalMs, this.totalQueued(), this.avgUtilization())
  }

  private runScheduledActions(): void {
    while (this.scheduled.length > 0 && this.scheduled[0].atMs <= this.now) {
      const action = this.scheduled.shift()!
      if (action.kind === 'publish-rules') {
        this.publishRules(action.rules, action.note)
      } else if (action.kind === 'fail-node') {
        this.failed.add(action.nodeId)
        this.log('failure.injected', 'error', `${this.nodeName(action.nodeId)} marked DOWN by failure injection`, action.nodeId)
      } else if (action.kind === 'restore-node') {
        this.failed.delete(action.nodeId)
        this.log('failure.restored', 'success', `${this.nodeName(action.nodeId)} restored and healthy again`, action.nodeId)
        // reset queue state so recovered node can serve again
        const st = this.nodeState.get(action.nodeId)
        if (st) {
          for (const req of st.queue) this.finish(req, 503, 'Component was down when request was queued')
          st.queue = []
        }
      }
    }
  }

  private nodeName(id: string): string {
    return this.nodes.get(id)?.data.label ?? id
  }

  // ---------------------------------------------------------------- config store

  publishRules(rules: RouteRule[], note: string): void {
    const versions = this.arch.routing.versions
    const nextVersion = versions.length > 0 ? Math.max(...versions.map((v) => v.version)) + 1 : 1
    const snapshot = structuredClone(rules)
    versions.push({ version: nextVersion, rules: structuredClone(snapshot), publishedAtSimMs: this.now, note })
    this.arch.routing.publishedVersion = nextVersion
    this.arch.routing.draftRules = structuredClone(snapshot)
    this.routingVersionHistory.push({ version: nextVersion, rules: structuredClone(snapshot) })
    this.log('config.published', 'info', `Routing configuration v${nextVersion} published (${note})`, null)

    const configStores = this.arch.nodes.filter((n) => n.data.type === 'configStore')
    const delay = this.arch.routing.propagationDelayMs
    for (const n of this.arch.nodes) {
      if (n.data.type !== 'gateway') continue
      const rt = this.gwRuntime.get(n.id)!
      if (configStores.length === 0) {
        // architecture has no config store at all: apply locally, but warn
        rt.activeVersion = nextVersion
        rt.rules = structuredClone(snapshot)
        rt.pending = null
        rt.warning = 'No Config Store in architecture; applied configuration locally'
        this.log('config.activated', 'warning', `${n.data.label} activated routing configuration v${nextVersion} locally (no Config Store in architecture)`, n.id)
        continue
      }
      // fetch happens during propagation; if the store is down or the gateway
      // is not connected, runConfigPropagation retains the last valid table and warns
      rt.pending = { version: nextVersion, dueAt: this.now + delay }
      this.log('config.propagating', 'info', `${n.data.label} is fetching routing configuration v${nextVersion} (ETA ${(delay / 1000).toFixed(1)}s)`, n.id)
    }
  }

  private applyPublishedVersion(version: number): void {
    const snap = this.arch.routing.versions.find((v) => v.version === version)
    if (!snap) return
    for (const n of this.arch.nodes) {
      if (n.data.type !== 'gateway') continue
      const rt = this.gwRuntime.get(n.id)!
      rt.activeVersion = version
      rt.rules = structuredClone(snap.rules)
      rt.pending = null
    }
  }

  private runConfigPropagation(): void {
    const configStores = this.arch.nodes.filter((n) => n.data.type === 'configStore')
    for (const n of this.arch.nodes) {
      if (n.data.type !== 'gateway') continue
      const rt = this.gwRuntime.get(n.id)!
      const storeNode = configStores.find((cs) => successors(this.arch.edges, n.id).includes(cs.id))

      if (!rt.pending) {
        // Live-reload: gateways watch the shared store and pick up newly published
        // versions without a restart, tracked as served/watched store requests.
        if (rt.publishedSeen === null) rt.publishedSeen = rt.activeVersion
        if (storeNode && !this.failed.has(storeNode.id) && this.arch.routing.publishedVersion !== rt.publishedSeen) {
          rt.publishedSeen = this.arch.routing.publishedVersion
          this.nodeState.get(storeNode.id)!.processed += 1
          this.log('config.watch', 'info', `${n.data.label} live-reloaded routing config from ${storeNode.data.label} (watch request, no restart)`, n.id)
        }
        continue
      }
      if (this.now < rt.pending.dueAt) continue

      const storeUp = storeNode && !this.failed.has(storeNode.id)
      if (!storeUp) {
        rt.warning = `Failed to fetch routing configuration v${rt.pending.version}; retaining last valid table v${rt.activeVersion ?? 'none'}`
        rt.pending.dueAt = this.now + this.arch.routing.propagationDelayMs
        this.log('config.fetch-failed', 'warning', `${n.data.label} could not fetch configuration v${rt.pending.version} (Config Store unavailable) — keeping v${rt.activeVersion ?? 'none'}`, n.id)
        continue
      }

      const version = rt.pending.version
      const snap = this.arch.routing.versions.find((v) => v.version === version)
      const readLatency = (storeNode.data.config as { readLatencyMs: number }).readLatencyMs
      const hit = this.rng() < ((storeNode.data.config as { cacheHitRatio: number }).cacheHitRatio / 100)
      rt.activeVersion = version
      rt.rules = structuredClone(snap?.rules ?? this.arch.routing.draftRules)
      rt.pending = null
      rt.warning = null
      rt.publishedSeen = version
      this.nodeState.get(storeNode.id)!.processed += 1
      this.log(
        'config.activated',
        'success',
        `${n.data.label} activated routing configuration v${version} (store read ${readLatency}ms${hit ? ', cache hit' : ''})`,
        n.id,
      )
    }
  }

  // ---------------------------------------------------------------- health checks

  private runHealthChecks(): void {
    for (const [lbId, rt] of this.lbRuntime) {
      const lbNode = this.nodes.get(lbId)
      if (!lbNode) continue
      const cfg = lbNode.data.config as { healthCheckIntervalMs: number }
      const interval = cfg.healthCheckIntervalMs
      const targets = successors(this.arch.edges, lbId)
      for (const t of targets) {
        const entry = rt.health[t] ?? { healthy: false, lastCheckMs: -Infinity }
        const due = interval === 0 || this.now - entry.lastCheckMs >= interval
        if (due) {
          const wasHealthy = entry.healthy
          const healthy = !this.failed.has(t)
          rt.health[t] = { healthy, lastCheckMs: this.now }
          if (wasHealthy !== healthy) {
            this.log(
              'health.change',
              healthy ? 'success' : 'error',
              `Health check: ${this.nodeName(t)} is now ${healthy ? 'HEALTHY' : 'DOWN'}`,
              lbId,
            )
          }
        } else {
          rt.health[t] = entry
        }
      }
    }
  }

  // ---------------------------------------------------------------- traffic

  private generateTraffic(dtMs: number): void {
    for (const n of this.arch.nodes) {
      if (n.data.type !== 'client') continue
      if (this.failed.has(n.id)) continue
      const cfg = n.data.config as { requestRate: number; requestMix: { path: string; method: HttpMethod; weight: number }[]; burst: number }
      const mix = cfg.requestMix.filter((m) => m.weight > 0)
      if (mix.length === 0) continue
      const totalWeight = mix.reduce((s, m) => s + m.weight, 0)

      const accum = (this.clientAccum.get(n.id) ?? 0) + (cfg.requestRate * dtMs) / 1000
      let toEmit = Math.floor(accum)
      this.clientAccum.set(n.id, accum - toEmit)
      if (this.now === this.tickMs && cfg.burst > 0) toEmit += cfg.burst

      for (let i = 0; i < toEmit; i++) {
        let roll = this.rng() * totalWeight
        let entry = mix[0]
        for (const m of mix) {
          roll -= m.weight
          if (roll <= 0) {
            entry = m
            break
          }
        }
        this.emitRequest(n.id, 'client-traffic', entry.path, entry.method)
      }
    }
  }

  /** Programmatic request emission (used by tests and traffic controls). */
  emitRequest(clientNodeId: string, clientId: string, path: string, method: HttpMethod): InternalRequest | null {
    const clientNode = this.nodes.get(clientNodeId)
    if (!clientNode) return null
    const id = `req-${++this.requestCounter}`
    const req: InternalRequest = {
      id,
      method,
      path,
      clientNodeId,
      clientId,
      arrivalTime: this.now,
      stage: 'queued',
      componentId: null,
      readyAt: this.now,
      retries: 0,
      gatewayId: null,
      serviceId: null,
      routeId: null,
      leftGatewayAt: -1,
      statusCode: null,
      failureReason: null,
      completionTime: null,
      lastEdgeId: null,
      done: false,
    }
    this.inflight.set(id, req)
    this.metrics.recordGenerated()
    this.log('request.generated', 'info', `${method} ${path} generated by ${clientNode.data.label}`, clientNodeId, id)

    const hops = successors(this.arch.edges, clientNodeId)
    if (hops.length === 0) {
      this.finish(req, 500, 'Client has no downstream connection')
      return req
    }
    this.enterComponent(req, hops[0], null)
    return req
  }

  // ---------------------------------------------------------------- request routing

  private edgeIdBetween(source: string, target: string): string | null {
    const e = this.arch.edges.find((x) => x.source === source && x.target === target)
    return e?.id ?? null
  }

  private markEdge(req: InternalRequest, source: string, target: string, ok: boolean): void {
    const id = this.edgeIdBetween(source, target)
    if (id) {
      this.edgeActivity.set(id, { t: this.now, ok })
      this.edgeCounts.set(id, (this.edgeCounts.get(id) ?? 0) + 1)
      req.lastEdgeId = id
    }
  }

  private enterComponent(req: InternalRequest, compId: string, fromId: string | null): void {
    if (req.done) return
    if (fromId) this.markEdge(req, fromId, compId, true)

    const node = this.nodes.get(compId)
    if (!node) {
      this.finish(req, 500, 'Destination component no longer exists')
      return
    }
    if (this.failed.has(compId)) {
      this.handleDownstreamFailure(req, compId, 503, `${node.data.label} is unavailable`)
      return
    }

    const st = this.nodeState.get(compId)!

    if (node.data.type === 'rateLimiter') {
      const cfg = node.data.config as RateLimiterConfig
      const rlState = this.rateLimit.get(compId) ?? createRateLimitState(cfg, this.now)
      const result = checkRateLimit(cfg, rlState, this.now, req.path, req.clientId)
      this.rateLimit.set(compId, result.state)
      if (!result.allowed) {
        st.rejected++
        this.log('request.rate-limited', 'warning', `${node.data.label} rejected ${req.method} ${req.path} with 429`, compId, req.id)
        this.finish(req, 429, 'Rate limit exceeded')
        return
      }
      this.log('request.rate-limit-pass', 'info', `${node.data.label} admitted ${req.method} ${req.path}`, compId, req.id)
      const hops = successors(this.arch.edges, compId)
      if (hops.length === 0) {
        this.finish(req, 500, 'Rate Limiter has no downstream connection')
        return
      }
      this.enterComponent(req, hops[0], compId)
      return
    }

    if (node.data.type === 'configStore') {
      // Gateways query the store internally; a stray request path hop just passes through.
      const cfg = node.data.config as { readLatencyMs: number }
      this.enqueue(req, compId, cfg.readLatencyMs)
      return
    }

    if (node.data.type === 'secretManager') {
      const cfg = node.data.config as SecretManagerConfig
      this.enqueue(req, compId, cfg.readLatencyMs)
      return
    }

    const cfg = node.data.config as unknown as Record<string, unknown>
    let serviceTime = 0
    if (node.data.type === 'loadBalancer') serviceTime = Number(cfg.serviceTimeMs ?? 0)
    else if (node.data.type === 'gateway') serviceTime = Number(cfg.serviceTimeMs ?? 5)
    else if (node.data.type === 'service') serviceTime = Number(cfg.serviceTimeMs ?? 10)
    else if (node.data.type === 'database') serviceTime = Number(cfg.queryLatencyMs ?? 10)
    else if (node.data.type === 'cache') serviceTime = Number(cfg.readLatencyMs ?? 1)
    else if (node.data.type === 'queue') serviceTime = Number(cfg.enqueueLatencyMs ?? 1)
    else if (node.data.type === 'sidecar') serviceTime = Number(cfg.latencyMs ?? 1)

    this.enqueue(req, compId, serviceTime)
  }

  private enqueue(req: InternalRequest, compId: string, serviceTimeMs: number): void {
    const node = this.nodes.get(compId)!
    const st = this.nodeState.get(compId)!
    const cfg = node.data.config as unknown as Record<string, unknown>
    const queueLimit = Number(cfg.queueLimit ?? cfg.maxDepth ?? 1000)

    if (st.queue.length >= queueLimit) {
      st.rejected++
      this.log('queue.rejected', 'warning', `${node.data.label} queue is full (${queueLimit}) — rejecting ${req.method} ${req.path}`, compId, req.id)
      this.handleDownstreamFailure(req, compId, 503, `${node.data.label} queue full`)
      return
    }

    req.stage = 'queued'
    req.componentId = compId
    req.readyAt = this.now + serviceTimeMs
    st.queue.push(req)
    if (st.queue.length > st.queueDepthPeak) st.queueDepthPeak = st.queue.length
  }

  private processQueues(): void {
    for (const [compId, st] of this.nodeState) {
      const node = this.nodes.get(compId)
      if (!node) continue
      if (this.failed.has(compId)) continue

      // complete in-service requests
      for (let i = st.inService.length - 1; i >= 0; i--) {
        const req = st.inService[i]
        if (req.readyAt <= this.now) {
          st.inService.splice(i, 1)
          st.processed++
          this.onServiceComplete(compId, req)
        }
      }

      // start queued requests
      const capacity = this.capacityOf(node)
      while (st.inService.length < capacity && st.queue.length > 0) {
        const req = st.queue.shift()!
        if (req.done) continue
        req.stage = 'in-service'
        req.componentId = compId
        const extra = this.extraLatency(compId)
        req.readyAt = Math.max(req.readyAt, this.now) + extra
        st.inService.push(req)
      }
    }
  }

  private capacityOf(node: ComponentNode): number {
    const cfg = node.data.config as unknown as Record<string, unknown>
    return Math.max(1, Number(cfg.capacity ?? 100))
  }

  private extraLatency(compId: string): number {
    // lock contention on databases and injected latency can be added here later
    const node = this.nodes.get(compId)
    if (node?.data.type === 'database') {
      const cfg = node.data.config as { lockContention: number }
      return 0 * cfg.lockContention
    }
    return 0
  }

  private onServiceComplete(compId: string, req: InternalRequest): void {
    const node = this.nodes.get(compId)!
    const type = node.data.type
    const cfg = node.data.config as unknown as Record<string, unknown>

    if (req.done) return

    switch (type) {
      case 'loadBalancer': {
        const rt = this.lbRuntime.get(compId)!
        const targets: LbTarget[] = successors(this.arch.edges, compId).map((t) => ({
          id: t,
          healthy: rt.health[t]?.healthy ?? !this.failed.has(t),
          connections: (this.nodeState.get(t)?.inService.length ?? 0) + (this.nodeState.get(t)?.queue.length ?? 0),
          weight: Number((cfg.weights as Record<string, number>)?.[t] ?? 1),
        }))
        const sel = selectTarget(cfg.algorithm as LoadBalancingAlgorithm, targets, rt)
        rt.rrIndex = sel.nextState.rrIndex
        rt.wrrCurrent = sel.nextState.wrrCurrent
        if (!sel.target) {
          this.log('lb.no-target', 'error', `${node.data.label}: no healthy gateway target — 503`, compId, req.id)
          this.finish(req, 503, 'No healthy gateway available')
          return
        }
        this.log(
          'lb.selected',
          'info',
          `${node.data.label} selected ${this.nodeName(sel.target.id)} (${cfg.algorithm})`,
          compId,
          req.id,
        )
        this.enterComponent(req, sel.target.id, compId)
        return
      }

      case 'gateway': {
        this.handleGatewayComplete(compId, req)
        return
      }

      case 'service': {
        const errorRate = Number(cfg.errorRate ?? 0) / 100
        if (this.rng() < errorRate) {
          this.log('service.error', 'error', `${node.data.label} returned 500 for ${req.method} ${req.path}`, compId, req.id)
          this.handleDownstreamFailure(req, compId, 500, 'Service internal error')
          return
        }
        if (cfg.useCache) {
          const cacheId = successors(this.arch.edges, compId).find((t) => this.nodes.get(t)?.data.type === 'cache' && !this.failed.has(t))
          if (cacheId) {
            this.log('service.cache-check', 'info', `${node.data.label} consulting ${this.nodeName(cacheId)}`, compId, req.id)
            this.enterComponent(req, cacheId, compId)
            return
          }
        }
        const dbId = successors(this.arch.edges, compId).find((t) => this.nodes.get(t)?.data.type === 'database')
        if (dbId) {
          this.log('service.db-query', 'info', `${node.data.label} queried ${this.nodeName(dbId)}`, compId, req.id)
          this.enterComponent(req, dbId, compId)
          return
        }
        this.completeSuccessfully(req)
        return
      }

      case 'cache': {
        const hitRatio = Number(cfg.hitRatio ?? 80) / 100
        const hit = this.rng() < hitRatio
        this.metrics.recordCache(hit)
        if (hit) {
          this.log('cache.hit', 'success', `${node.data.label} cache HIT for ${req.path}`, compId, req.id)
          this.completeSuccessfully(req)
          return
        }
        this.log('cache.miss', 'info', `${node.data.label} cache MISS for ${req.path}`, compId, req.id)
        const dbId = successors(this.arch.edges, compId).find((t) => this.nodes.get(t)?.data.type === 'database' && !this.failed.has(t))
        if (dbId) {
          this.enterComponent(req, dbId, compId)
          return
        }
        this.completeSuccessfully(req)
        return
      }

      case 'database': {
        const errorRate = Number(cfg.errorRate ?? 0) / 100
        if (this.rng() < errorRate) {
          this.log('db.error', 'error', `${node.data.label} query failed with 500`, compId, req.id)
          this.handleDownstreamFailure(req, compId, 500, 'Database error')
          return
        }
        this.completeSuccessfully(req)
        return
      }

      case 'queue': {
        const qst = this.nodeState.get(compId)!
        const maxDepth = Number(cfg.maxDepth ?? 1000)
        if (qst.queue.length + qst.inService.length > maxDepth) {
          this.handleDownstreamFailure(req, compId, 503, 'Queue depth exceeded')
          return
        }
        this.completeSuccessfully(req)
        return
      }

      case 'configStore': {
        this.nodeState.get(compId)!.processed += 1
        this.completeSuccessfully(req)
        return
      }

      case 'secretManager': {
        this.nodeState.get(compId)!.processed += 1
        this.completeSuccessfully(req)
        return
      }

      case 'sidecar': {
        const hops = successors(this.arch.edges, compId)
        if (hops.length === 0) {
          this.completeSuccessfully(req)
          return
        }
        this.enterComponent(req, hops[0], compId)
        return
      }

      default: {
        this.completeSuccessfully(req)
        return
      }
    }
  }

  private handleGatewayComplete(gwId: string, req: InternalRequest): void {
    const node = this.nodes.get(gwId)!
    const cfg = node.data.config as GatewayConfig
    const rt = this.gwRuntime.get(gwId)!

    if (cfg.authEnabled && this.rng() < cfg.authFailureRate / 100) {
      this.log('gateway.auth-failed', 'warning', `${node.data.label} rejected ${req.method} ${req.path} with 401 (authentication)`, gwId, req.id)
      this.finish(req, 401, 'Authentication failed')
      return
    }

    const match = matchRoute(rt.rules, req.path, req.method, this.arch.routing.fallbackRouteId)
    if (!match) {
      this.log('gateway.no-route', 'warning', `${node.data.label} found no route for ${req.method} ${req.path} — 404`, gwId, req.id)
      this.finish(req, 404, 'No matching route')
      return
    }

    const destId = match.rule.destinationId
    const destNode = this.nodes.get(destId)
    if (!destNode) {
      this.handleDownstreamFailure(req, gwId, 503, `Route destination "${destId}" does not exist`)
      return
    }
    const connected = successors(this.arch.edges, gwId).includes(destId)
    if (!connected) {
      this.log('gateway.route-unreachable', 'error', `${node.data.label} route "${match.rule.path}" → ${destNode.data.label} is not connected — 503`, gwId, req.id)
      this.handleDownstreamFailure(req, gwId, 503, 'Route destination not connected')
      return
    }
    if (this.failed.has(destId)) {
      this.log('gateway.destination-down', 'error', `${node.data.label} route "${match.rule.path}" → ${destNode.data.label} is DOWN`, gwId, req.id)
      this.handleDownstreamFailure(req, gwId, 503, 'Route destination unavailable')
      return
    }

    req.gatewayId = gwId
    req.serviceId = destId
    req.routeId = match.rule.id
    req.leftGatewayAt = this.now
    this.log(
      'gateway.matched',
      'info',
      `${node.data.label} matched "${match.rule.path}" (${match.kind}) → ${destNode.data.label} [config v${rt.activeVersion ?? '-'}]`,
      gwId,
      req.id,
    )
    this.enterComponent(req, destId, gwId)
  }

  /** A downstream hop failed. Retry through the owning gateway if policy allows. */
  private handleDownstreamFailure(req: InternalRequest, failedCompId: string, status: number, reason: string): void {
    const gwId = req.gatewayId
    if (gwId) {
      const gwNode = this.nodes.get(gwId)
      const rt = this.gwRuntime.get(gwId)
      if (gwNode && rt && !this.failed.has(gwId) && req.retries < (gwNode.data.config as GatewayConfig).maxRetries) {
        req.retries++
        this.metrics.recordRetry()
        this.log('request.retry', 'warning', `Retrying ${req.id} via ${gwNode.data.label} (attempt ${req.retries + 1}) after failure at ${this.nodeName(failedCompId)}: ${reason}`, gwId, req.id)
        req.stage = 'queued'
        req.componentId = gwId
        req.readyAt = this.now + 5
        const st = this.nodeState.get(gwId)!
        if (st.queue.length < (gwNode.data.config as GatewayConfig).queueLimit) {
          st.queue.push(req)
          return
        }
      }
    }
    this.finish(req, status, reason)
  }

  private completeSuccessfully(req: InternalRequest): void {
    this.finish(req, 200, null)
  }

  private finish(req: InternalRequest, status: number, reason: string | null): void {
    if (req.done) return
    req.done = true
    req.stage = 'done'
    req.statusCode = status
    req.failureReason = reason
    req.completionTime = this.now
    this.inflight.delete(req.id)
    const record = this.toRecord(req, status, reason)
    this.metrics.recordCompletion(record)
    if (status === 429) this.metrics.recordRateLimited()
    this.recentRequests.unshift(record)
    if (this.recentRequests.length > 80) this.recentRequests.pop()
    if (status >= 200 && status < 400) {
      this.log('request.completed', 'success', `${req.method} ${req.path} completed 200 in ${(req.completionTime! - req.arrivalTime).toFixed(1)}ms`, req.componentId, req.id)
    } else if (status === 404) {
      // already logged
    } else {
      this.log('request.failed', 'error', `${req.method} ${req.path} failed with ${status}${reason ? ` (${reason})` : ''}`, req.componentId, req.id)
    }
  }

  private toRecord(req: InternalRequest, status: number, reason: string | null): SimRequestRecord {
    return {
      id: req.id,
      method: req.method,
      path: req.path,
      clientId: req.clientId,
      clientNodeId: req.clientNodeId,
      arrivalTime: req.arrivalTime,
      completionTime: req.completionTime,
      statusCode: status,
      gatewayId: req.gatewayId,
      serviceId: req.serviceId,
      routeId: req.routeId,
      retries: req.retries,
      failureReason: reason,
      status: status === 429 ? 'rate-limited' : status === 504 ? 'timeout' : 'completed',
    }
  }

  private sweepTimeouts(): void {
    for (const req of [...this.inflight.values()]) {
      if (req.done) continue
      const clientNode = this.nodes.get(req.clientNodeId)
      const clientTimeout = clientNode ? (clientNode.data.config as { timeoutMs: number }).timeoutMs : 5000
      if (this.now - req.arrivalTime > clientTimeout) {
        this.log('request.timeout', 'error', `${req.method} ${req.path} timed out after ${clientTimeout}ms`, req.componentId, req.id)
        this.finish(req, 504, 'Client timeout')
        continue
      }
      if (req.gatewayId) {
        const gwNode = this.nodes.get(req.gatewayId)
        if (gwNode && req.leftGatewayAt >= 0) {
          const gwTimeout = (gwNode.data.config as GatewayConfig).timeoutMs
          if (this.now - req.leftGatewayAt > gwTimeout) {
            this.log('gateway.timeout', 'warning', `${gwNode.data.label} timed out waiting for downstream (${gwTimeout}ms) for ${req.method} ${req.path}`, req.gatewayId, req.id)
            const st = this.nodeState.get(req.componentId ?? '')
            if (st) {
              const qi = st.queue.indexOf(req)
              if (qi >= 0) st.queue.splice(qi, 1)
              const ii = st.inService.indexOf(req)
              if (ii >= 0) st.inService.splice(ii, 1)
            }
            req.componentId = null
            this.handleDownstreamFailure(req, req.gatewayId, 504, 'Gateway downstream timeout')
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------- frame

  private totalQueued(): number {
    let q = 0
    for (const st of this.nodeState.values()) q += st.queue.length
    return q
  }

  private avgUtilization(): number {
    let sum = 0
    let count = 0
    for (const [id, st] of this.nodeState) {
      const node = this.nodes.get(id)
      if (!node) continue
      sum += st.inService.length / this.capacityOf(node)
      count++
    }
    return count > 0 ? sum / count : 0
  }

  private buildFrame(): FlowFrame {
    const runtimes: Record<string, ComponentRuntimeView> = {}
    for (const [id, st] of this.nodeState) {
      const node = this.nodes.get(id)
      if (!node) continue
      const cfg = node.data.config as unknown as Record<string, unknown>
      const capacity = this.capacityOf(node)
      const utilization = st.inService.length / capacity
      const isDown = this.failed.has(id)
      let health: ComponentRuntimeView['health'] = 'up'
      if (isDown) health = 'down'
      else if (utilization >= 0.9) health = 'overloaded'
      else if (utilization >= 0.7) health = 'warning'

      const gw = this.gwRuntime.get(id)
      let statusText = isDown ? 'DOWN' : health === 'overloaded' ? 'Overloaded' : `${st.inService.length}/${capacity} active`
      if (node.data.type === 'gateway' && gw) {
        statusText = isDown ? 'DOWN' : `v${gw.activeVersion ?? '-'} · keys v${gw.secretsVersion} · ${st.inService.length}/${capacity}`
      }
      if (node.data.type === 'queue') {
        const depth = st.queue.length + st.inService.length
        statusText = isDown ? 'DOWN' : `depth ${depth}/${cfg.maxDepth ?? '-'}`
      }

      runtimes[id] = {
        health,
        inService: st.inService.length,
        queued: st.queue.length,
        capacity,
        queueLimit: Number(cfg.queueLimit ?? cfg.maxDepth ?? 0),
        utilization,
        activeConfigVersion: gw?.activeVersion ?? null,
        pendingConfigVersion: gw?.pending?.version ?? null,
        pendingDueAt: gw?.pending?.dueAt ?? null,
        configWarning: gw?.warning ?? null,
        totalProcessed: st.processed,
        totalRejected: st.rejected,
        statusText,
      }
    }

    const activeEdges: Record<string, 'ok' | 'fail'> = {}
    for (const [edgeId, entry] of this.edgeActivity) {
      if (this.now - entry.t <= 900) activeEdges[edgeId] = entry.ok ? 'ok' : 'fail'
    }

    const edgeCounts: Record<string, number> = {}
    for (const [edgeId, count] of this.edgeCounts) edgeCounts[edgeId] = count

    const newEvents = this.pendingEvents.filter((e) => e.id > this.lastFrameEventId)
    this.pendingEvents = this.pendingEvents.filter((e) => e.id > this.lastFrameEventId)
    if (newEvents.length > 0) this.lastFrameEventId = newEvents[newEvents.length - 1].id

    return {
      simTime: this.now,
      metrics: this.metrics.snapshot(this.now, this.tickMs),
      runtimes,
      events: newEvents,
      activeEdges,
      edgeCounts,
      recentRequests: [...this.recentRequests],
    }
  }

  /** Drain remaining in-flight requests instantly (used when simulation is stopped). */
  drain(maxSteps = 2000): void {
    let steps = 0
    while (this.inflight.size > 0 && steps < maxSteps) {
      let remaining = this.tickMs
      while (remaining > 0 && this.inflight.size > 0) {
        const dtMs = Math.min(10, remaining)
        this.advanceStep(dtMs)
        remaining -= dtMs
      }
      steps++
    }
  }
}
