import type { ComponentConfigMap, ComponentType } from './types'
import { COMPONENT_TYPES } from './types'
import { validateRuleSyntax } from './routing'

export type FieldType = 'number' | 'text' | 'select' | 'boolean' | 'routeRules' | 'requestMix' | 'perRouteLimits' | 'endpointList' | 'weights' | 'jsonRoutes'

export interface FieldSpec {
  key: string
  label: string
  type: FieldType
  unit?: string
  min?: number
  max?: number
  step?: number
  options?: { value: string; label: string }[]
  help?: string
  dynamicOptions?: 'gatewayTargets' | 'serviceTargets'
}

export interface ComponentSchema {
  fields: FieldSpec[]
}

export const COMPONENT_SCHEMAS: Record<ComponentType, ComponentSchema> = {
  client: {
    fields: [
      { key: 'requestRate', label: 'Request rate', type: 'number', unit: 'RPS', min: 0, max: 5000, step: 1, help: 'Requests generated per second.' },
      { key: 'timeoutMs', label: 'Request timeout', type: 'number', unit: 'ms', min: 100, max: 60000, step: 100 },
      { key: 'burst', label: 'Burst allowance', type: 'number', unit: 'extra req', min: 0, max: 1000, step: 1, help: 'Extra requests that may be emitted instantly when traffic starts.' },
      { key: 'requestMix', label: 'Request mix by endpoint', type: 'requestMix' },
    ],
  },
  rateLimiter: {
    fields: [
      { key: 'requestsPerSecond', label: 'Requests allowed', type: 'number', unit: 'RPS', min: 1, max: 10000, step: 1 },
      { key: 'burstCapacity', label: 'Burst capacity', type: 'number', unit: 'requests', min: 0, max: 5000, step: 1 },
      {
        key: 'strategy',
        label: 'Strategy',
        type: 'select',
        options: [
          { value: 'token-bucket', label: 'Token bucket' },
          { value: 'fixed-window', label: 'Fixed window' },
        ],
      },
      {
        key: 'scope',
        label: 'Scope',
        type: 'select',
        options: [
          { value: 'global', label: 'Global' },
          { value: 'per-route', label: 'Per route' },
          { value: 'per-client', label: 'Per client' },
        ],
        help: 'Per-route applies the limits below in addition to the global limit.',
      },
      { key: 'perRouteLimits', label: 'Per-route limits', type: 'perRouteLimits' },
    ],
  },
  loadBalancer: {
    fields: [
      {
        key: 'algorithm',
        label: 'Routing algorithm',
        type: 'select',
        options: [
          { value: 'round-robin', label: 'Round Robin' },
          { value: 'least-connections', label: 'Least Connections' },
          { value: 'weighted-round-robin', label: 'Weighted Round Robin' },
        ],
      },
      { key: 'weights', label: 'Target weights', type: 'weights', dynamicOptions: 'gatewayTargets', help: 'Used by Weighted Round Robin.' },
      { key: 'healthCheckIntervalMs', label: 'Health check interval', type: 'number', unit: 'ms', min: 0, max: 60000, step: 100, help: '0 disables active checks (instant detection).' },
      { key: 'capacity', label: 'Capacity', type: 'number', unit: 'concurrent', min: 1, max: 5000, step: 1 },
      { key: 'serviceTimeMs', label: 'Service time', type: 'number', unit: 'ms', min: 0, max: 1000, step: 0.5 },
      { key: 'queueLimit', label: 'Queue limit', type: 'number', unit: 'requests', min: 0, max: 20000, step: 10 },
    ],
  },
  gateway: {
    fields: [
      { key: 'instanceName', label: 'Instance name', type: 'text' },
      { key: 'capacity', label: 'Processing capacity', type: 'number', unit: 'concurrent', min: 1, max: 5000, step: 1 },
      { key: 'serviceTimeMs', label: 'Service time', type: 'number', unit: 'ms', min: 0.5, max: 5000, step: 0.5 },
      { key: 'queueLimit', label: 'Queue limit', type: 'number', unit: 'requests', min: 0, max: 50000, step: 10 },
      { key: 'authEnabled', label: 'Authentication', type: 'boolean', help: 'Rejects a configurable fraction of unauthenticated-style requests.' },
      { key: 'authFailureRate', label: 'Auth failure rate', type: 'number', unit: '%', min: 0, max: 100, step: 1, help: 'Share of requests rejected with 401 when authentication is enabled.' },
      { key: 'timeoutMs', label: 'Downstream timeout', type: 'number', unit: 'ms', min: 100, max: 60000, step: 100 },
      { key: 'maxRetries', label: 'Max retries', type: 'number', unit: 'attempts', min: 0, max: 5, step: 1, help: 'Retries after a downstream 5xx or timeout.' },
    ],
  },
  service: {
    fields: [
      { key: 'serviceName', label: 'Service name', type: 'text' },
      { key: 'endpoints', label: 'Supported endpoints', type: 'endpointList', help: 'Informational; unmatched endpoints are still routed but reported as 404 when no route matches.' },
      { key: 'capacity', label: 'Processing capacity', type: 'number', unit: 'concurrent', min: 1, max: 5000, step: 1 },
      { key: 'serviceTimeMs', label: 'Service time', type: 'number', unit: 'ms', min: 0.5, max: 60000, step: 0.5 },
      { key: 'queueLimit', label: 'Queue limit', type: 'number', unit: 'requests', min: 0, max: 50000, step: 10 },
      { key: 'errorRate', label: 'Error rate', type: 'number', unit: '%', min: 0, max: 100, step: 1 },
      { key: 'timeoutMs', label: 'Timeout', type: 'number', unit: 'ms', min: 100, max: 60000, step: 100 },
      { key: 'useCache', label: 'Use cache', type: 'boolean', help: 'Consult a connected Cache node before hitting the database.' },
    ],
  },
  database: {
    fields: [
      { key: 'databaseName', label: 'Database name', type: 'text' },
      { key: 'capacity', label: 'Capacity', type: 'number', unit: 'concurrent queries', min: 1, max: 5000, step: 1 },
      { key: 'queryLatencyMs', label: 'Query latency', type: 'number', unit: 'ms', min: 0.5, max: 60000, step: 0.5 },
      { key: 'queueLimit', label: 'Queue limit', type: 'number', unit: 'queries', min: 0, max: 50000, step: 10 },
      { key: 'errorRate', label: 'Error rate', type: 'number', unit: '%', min: 0, max: 100, step: 1 },
      { key: 'connectionPoolSize', label: 'Connection pool', type: 'number', unit: 'connections', min: 1, max: 1000, step: 1 },
      { key: 'lockContention', label: 'Lock contention', type: 'number', unit: '%', min: 0, max: 100, step: 1, help: 'Adds up to 100% extra latency at full contention.' },
    ],
  },
  cache: {
    fields: [
      { key: 'readLatencyMs', label: 'Read latency', type: 'number', unit: 'ms', min: 0.1, max: 1000, step: 0.1 },
      { key: 'writeLatencyMs', label: 'Write latency', type: 'number', unit: 'ms', min: 0.1, max: 1000, step: 0.1 },
      { key: 'hitRatio', label: 'Cache hit ratio', type: 'number', unit: '%', min: 0, max: 100, step: 1 },
    ],
  },
  queue: {
    fields: [
      { key: 'maxThroughput', label: 'Max throughput', type: 'number', unit: 'msg/s', min: 1, max: 100000, step: 10 },
      { key: 'enqueueLatencyMs', label: 'Enqueue latency', type: 'number', unit: 'ms', min: 0, max: 10000, step: 0.5 },
      { key: 'maxDepth', label: 'Max depth', type: 'number', unit: 'messages', min: 1, max: 1000000, step: 100 },
    ],
  },
  sidecar: {
    fields: [
      { key: 'latencyMs', label: 'Processing latency', type: 'number', unit: 'ms', min: 0, max: 10000, step: 0.5 },
      { key: 'maxRetries', label: 'Max retries', type: 'number', unit: 'attempts', min: 0, max: 5, step: 1 },
      { key: 'timeoutMs', label: 'Timeout', type: 'number', unit: 'ms', min: 100, max: 60000, step: 100 },
      { key: 'collectMetrics', label: 'Collect metrics', type: 'boolean' },
    ],
  },
  configStore: {
    fields: [
      { key: 'readLatencyMs', label: 'Read latency', type: 'number', unit: 'ms', min: 0.1, max: 10000, step: 0.5 },
      { key: 'writeLatencyMs', label: 'Write latency', type: 'number', unit: 'ms', min: 0.1, max: 10000, step: 0.5 },
      { key: 'cacheHitRatio', label: 'Config cache hit ratio', type: 'number', unit: '%', min: 0, max: 100, step: 1 },
    ],
  },
  secretManager: {
    fields: [
      { key: 'readLatencyMs', label: 'Secret read latency', type: 'number', unit: 'ms', min: 0.1, max: 10000, step: 0.5 },
      { key: 'keyRotationIntervalMs', label: 'Key rotation interval', type: 'number', unit: 'ms', min: 0, max: 600000, step: 1000, help: 'Gateways re-fetch JWT keys on each rotation. 0 disables rotation.' },
      { key: 'storesTlsCertificates', label: 'Stores TLS certificates', type: 'boolean', help: 'Serve TLS certificates to gateways alongside JWT keys.' },
    ],
  },
}

export interface FieldIssue {
  field: string
  message: string
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

export function validateConfig(type: ComponentType, config: ComponentConfigMap[ComponentType]): FieldIssue[] {
  const issues: FieldIssue[] = []
  const schema = COMPONENT_SCHEMAS[type]

  for (const field of schema.fields) {
    const value = (config as unknown as Record<string, unknown>)[field.key]
    if (field.type === 'number') {
      if (!isFiniteNumber(value)) {
        issues.push({ field: field.key, message: `${field.label} must be a number` })
        continue
      }
      if (field.min !== undefined && value < field.min) {
        issues.push({ field: field.key, message: `${field.label} must be ≥ ${field.min}${field.unit ? ' ' + field.unit : ''}` })
      }
      if (field.max !== undefined && value > field.max) {
        issues.push({ field: field.key, message: `${field.label} must be ≤ ${field.max}${field.unit ? ' ' + field.unit : ''}` })
      }
    } else if (field.type === 'text') {
      if (typeof value !== 'string' || value.trim() === '') {
        issues.push({ field: field.key, message: `${field.label} is required` })
      }
    } else if (field.type === 'boolean') {
      if (typeof value !== 'boolean') {
        issues.push({ field: field.key, message: `${field.label} must be true or false` })
      }
    } else if (field.type === 'select') {
      const opts = (field.options ?? []).map((o) => o.value)
      if (typeof value !== 'string' || !opts.includes(value)) {
        issues.push({ field: field.key, message: `${field.label} has an invalid value` })
      }
    }
  }

  if (type === 'client') {
    const cfg = config as ComponentConfigMap['client']
    if (!Array.isArray(cfg.requestMix) || cfg.requestMix.length === 0) {
      issues.push({ field: 'requestMix', message: 'At least one request mix entry is required' })
    } else {
      if (cfg.requestMix.some((e) => !e.path || !e.path.startsWith('/'))) {
        issues.push({ field: 'requestMix', message: 'Every request path must start with "/"' })
      }
      const total = cfg.requestMix.reduce((s, e) => s + (isFiniteNumber(e.weight) ? e.weight : 0), 0)
      if (total <= 0) issues.push({ field: 'requestMix', message: 'Total request mix weight must be > 0' })
    }
  }

  if (type === 'rateLimiter') {
    const cfg = config as ComponentConfigMap['rateLimiter']
    if (cfg.scope === 'per-route') {
      if (cfg.perRouteLimits.length === 0) {
        issues.push({ field: 'perRouteLimits', message: 'Add at least one per-route limit or change the scope' })
      } else if (cfg.perRouteLimits.some((l) => !l.path.startsWith('/') || l.requestsPerSecond <= 0)) {
        issues.push({ field: 'perRouteLimits', message: 'Each limit needs a "/path" and a positive RPS value' })
      }
    }
  }

  if (type === 'loadBalancer') {
    const cfg = config as ComponentConfigMap['loadBalancer']
    if (cfg.algorithm === 'weighted-round-robin') {
      const values = Object.values(cfg.weights)
      if (values.length > 0 && values.some((w) => !isFiniteNumber(w) || w < 0)) {
        issues.push({ field: 'weights', message: 'Weights must be numbers ≥ 0' })
      }
    }
  }

  if (type === 'service') {
    const cfg = config as ComponentConfigMap['service']
    if (cfg.endpoints.length === 0) {
      issues.push({ field: 'endpoints', message: 'Declare at least one supported endpoint' })
    } else if (cfg.endpoints.some((e) => !e.startsWith('/'))) {
      issues.push({ field: 'endpoints', message: 'Endpoints must start with "/"' })
    }
  }

  return issues
}

export interface ImportIssue {
  level: 'error' | 'warning'
  message: string
}

export function validateImportedArchitecture(doc: unknown): { ok: boolean; issues: ImportIssue[] } {
  const issues: ImportIssue[] = []
  if (typeof doc !== 'object' || doc === null) {
    return { ok: false, issues: [{ level: 'error', message: 'Document must be a JSON object' }] }
  }
  const d = doc as Record<string, unknown>

  if (!Array.isArray(d.nodes)) issues.push({ level: 'error', message: '"nodes" must be an array' })
  if (!Array.isArray(d.edges)) issues.push({ level: 'error', message: '"edges" must be an array' })
  if (issues.some((i) => i.level === 'error')) return { ok: false, issues }

  const nodes = d.nodes as Record<string, unknown>[]
  const edges = d.edges as Record<string, unknown>[]
  const ids = new Set<string>()

  for (const [i, n] of nodes.entries()) {
    if (typeof n !== 'object' || n === null) {
      issues.push({ level: 'error', message: `Node #${i} is not an object` })
      continue
    }
    if (typeof n.id !== 'string' || n.id === '') {
      issues.push({ level: 'error', message: `Node #${i} has no id` })
      continue
    }
    if (ids.has(n.id)) issues.push({ level: 'error', message: `Duplicate node id "${n.id}"` })
    ids.add(n.id)
    const data = n.data as Record<string, unknown> | undefined
    const componentType = typeof data?.type === 'string' ? data.type : n.type
    if (typeof componentType !== 'string' || !COMPONENT_TYPES.includes(componentType as ComponentType)) {
      issues.push({ level: 'error', message: `Node "${n.id}" has unsupported component type "${String(componentType)}"` })
      continue
    }
    if (!data || typeof data !== 'object' || !data.config) {
      issues.push({ level: 'error', message: `Node "${n.id}" is missing data.config` })
      continue
    }
    const cfgIssues = validateConfig(componentType as ComponentType, data.config as ComponentConfigMap[ComponentType])
    for (const ci of cfgIssues) {
      issues.push({ level: 'warning', message: `Node "${n.id}" config: ${ci.message}` })
    }
    const pos = n.position as Record<string, unknown> | undefined
    if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') {
      issues.push({ level: 'warning', message: `Node "${n.id}" has invalid position; placed at origin` })
    }
  }

  if (d.annotations !== undefined && !Array.isArray(d.annotations)) {
    issues.push({ level: 'error', message: '"annotations" must be an array' })
  } else if (Array.isArray(d.annotations)) {
    const annotationIds = new Set<string>()
    for (const [i, value] of d.annotations.entries()) {
      if (typeof value !== 'object' || value === null) {
        issues.push({ level: 'error', message: `Annotation #${i} is not an object` })
        continue
      }
      const annotation = value as Record<string, unknown>
      if (typeof annotation.id !== 'string' || annotation.id === '') {
        issues.push({ level: 'error', message: `Annotation #${i} has no id` })
        continue
      }
      if (ids.has(annotation.id) || annotationIds.has(annotation.id)) {
        issues.push({ level: 'error', message: `Duplicate annotation id "${annotation.id}"` })
      }
      annotationIds.add(annotation.id)
      if (annotation.type !== 'note' && annotation.type !== 'section') {
        issues.push({ level: 'error', message: `Annotation "${annotation.id}" has unsupported type` })
      }
      const pos = annotation.position as Record<string, unknown> | undefined
      if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') {
        issues.push({ level: 'warning', message: `Annotation "${annotation.id}" has invalid position; placed at origin` })
      }
      if (typeof annotation.text !== 'string') {
        issues.push({ level: 'warning', message: `Annotation "${annotation.id}" has invalid text; using an empty value` })
      }
      for (const key of ['width', 'height'] as const) {
        if (typeof annotation[key] !== 'number' || !Number.isFinite(annotation[key]) || annotation[key] < 80) {
          issues.push({ level: 'warning', message: `Annotation "${annotation.id}" has invalid ${key}; using its default size` })
        }
      }
    }
  }

  const edgeIds = new Set<string>()
  for (const [i, e] of edges.entries()) {
    if (typeof e !== 'object' || e === null) {
      issues.push({ level: 'error', message: `Edge #${i} is not an object` })
      continue
    }
    const source = e.source as string
    const target = e.target as string
    if (typeof source !== 'string' || typeof target !== 'string') {
      issues.push({ level: 'error', message: `Edge #${i} is missing source or target` })
      continue
    }
    if (!ids.has(source)) issues.push({ level: 'error', message: `Edge "${String(e.id ?? i)}" references unknown source "${source}"` })
    if (!ids.has(target)) issues.push({ level: 'error', message: `Edge "${String(e.id ?? i)}" references unknown target "${target}"` })
    if (typeof e.id === 'string') {
      if (edgeIds.has(e.id)) issues.push({ level: 'error', message: `Duplicate edge id "${e.id}"` })
      edgeIds.add(e.id)
    }
  }

  const routing = d.routing as Record<string, unknown> | undefined
  if (!routing || !Array.isArray(routing.draftRules)) {
    issues.push({ level: 'warning', message: 'No routing table found; default routes will be used' })
  } else {
    for (const r of routing.draftRules as Record<string, unknown>[]) {
      const err = validateRuleSyntax({
        id: String(r.id ?? ''),
        path: String(r.path ?? ''),
        matchType: (r.matchType as 'exact' | 'prefix') ?? 'prefix',
        methods: (r.methods as import('./types').HttpMethod[]) ?? ['ANY'],
        destinationId: String(r.destinationId ?? ''),
        priority: Number(r.priority ?? 0),
        enabled: r.enabled !== false,
      })
      if (err) issues.push({ level: 'warning', message: `Route "${String(r.id)}": ${err}` })
      if (r.destinationId && !ids.has(String(r.destinationId))) {
        issues.push({ level: 'warning', message: `Route "${String(r.id)}" targets unknown node "${String(r.destinationId)}"` })
      }
    }
  }

  return { ok: !issues.some((i) => i.level === 'error'), issues }
}
