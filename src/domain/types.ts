import type { Edge, Node } from '@xyflow/react'

export type ComponentType =
  | 'client'
  | 'rateLimiter'
  | 'loadBalancer'
  | 'gateway'
  | 'service'
  | 'database'
  | 'cache'
  | 'queue'
  | 'sidecar'
  | 'configStore'
  | 'secretManager'

export const COMPONENT_TYPES: ComponentType[] = [
  'client',
  'rateLimiter',
  'loadBalancer',
  'gateway',
  'service',
  'database',
  'cache',
  'queue',
  'sidecar',
  'configStore',
  'secretManager',
]

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'ANY'

export const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'ANY']

export interface RequestMixEntry {
  path: string
  method: HttpMethod
  weight: number
}

export interface ClientConfig {
  requestRate: number
  requestMix: RequestMixEntry[]
  timeoutMs: number
  burst: number
}

export type RateLimitStrategy = 'token-bucket' | 'fixed-window'
export type RateLimitScope = 'global' | 'per-route' | 'per-client'

export interface PerRouteLimit {
  path: string
  requestsPerSecond: number
}

export interface RateLimiterConfig {
  requestsPerSecond: number
  burstCapacity: number
  strategy: RateLimitStrategy
  scope: RateLimitScope
  perRouteLimits: PerRouteLimit[]
}

export type LoadBalancingAlgorithm = 'round-robin' | 'least-connections' | 'weighted-round-robin'

export interface LoadBalancerConfig {
  algorithm: LoadBalancingAlgorithm
  weights: Record<string, number>
  healthCheckIntervalMs: number
  capacity: number
  serviceTimeMs: number
  queueLimit: number
}

export type MatchType = 'exact' | 'prefix'

export interface RouteRule {
  id: string
  path: string
  matchType: MatchType
  methods: HttpMethod[]
  destinationId: string
  priority: number
  enabled: boolean
}

export interface GatewayConfig {
  instanceName: string
  capacity: number
  serviceTimeMs: number
  queueLimit: number
  authEnabled: boolean
  authFailureRate: number
  timeoutMs: number
  maxRetries: number
}

export interface ServiceConfig {
  serviceName: string
  endpoints: string[]
  capacity: number
  serviceTimeMs: number
  queueLimit: number
  errorRate: number
  timeoutMs: number
  useCache: boolean
}

export interface DatabaseConfig {
  databaseName: string
  capacity: number
  queryLatencyMs: number
  queueLimit: number
  errorRate: number
  connectionPoolSize: number
  lockContention: number
}

export interface CacheConfig {
  readLatencyMs: number
  writeLatencyMs: number
  hitRatio: number
}

export interface QueueConfig {
  maxThroughput: number
  enqueueLatencyMs: number
  maxDepth: number
}

export interface SidecarConfig {
  latencyMs: number
  maxRetries: number
  timeoutMs: number
  collectMetrics: boolean
}

export interface ConfigStoreConfig {
  readLatencyMs: number
  writeLatencyMs: number
  cacheHitRatio: number
}

export interface SecretManagerConfig {
  readLatencyMs: number
  keyRotationIntervalMs: number
  storesTlsCertificates: boolean
}

export interface ComponentConfigMap {
  client: ClientConfig
  rateLimiter: RateLimiterConfig
  loadBalancer: LoadBalancerConfig
  gateway: GatewayConfig
  service: ServiceConfig
  database: DatabaseConfig
  cache: CacheConfig
  queue: QueueConfig
  sidecar: SidecarConfig
  configStore: ConfigStoreConfig
  secretManager: SecretManagerConfig
}

export interface ComponentNodeData extends Record<string, unknown> {
  label: string
  type: ComponentType
  config: ComponentConfigMap[ComponentType]
  description: string
}

export type ComponentNode = Node<ComponentNodeData>
export type ArchitectureEdge = Edge

export interface RoutingVersion {
  version: number
  rules: RouteRule[]
  publishedAtSimMs: number
  note: string
}

export interface RoutingState {
  draftRules: RouteRule[]
  versions: RoutingVersion[]
  publishedVersion: number
  propagationDelayMs: number
  fallbackRouteId: string | null
}

export interface SimSettings {
  seed: number
  tickMs: number
  maxSimSeconds: number
  sampleIntervalMs: number
}

export interface CanvasAnnotation {
  id: string
  type: 'note' | 'section'
  position: { x: number; y: number }
  width: number
  height: number
  text: string
}

export interface Architecture {
  id: string
  name: string
  description: string
  nodes: ComponentNode[]
  edges: ArchitectureEdge[]
  annotations: CanvasAnnotation[]
  routing: RoutingState
  settings: SimSettings
}

export type RequestStatus =
  | 'rate-limited'
  | 'completed'
  | 'timeout'
  | 'in-flight'

export interface SimRequestRecord {
  id: string
  method: HttpMethod
  path: string
  clientId: string
  clientNodeId: string
  arrivalTime: number
  completionTime: number | null
  statusCode: number | null
  gatewayId: string | null
  serviceId: string | null
  routeId: string | null
  retries: number
  failureReason: string | null
  status: RequestStatus
}

export type Severity = 'info' | 'success' | 'warning' | 'error'

export interface SimEvent {
  id: number
  time: number
  type: string
  severity: Severity
  componentId: string | null
  requestId: string | null
  message: string
}

export interface TickSample {
  time: number
  rps: number
  succeeded: number
  failed: number
  avgLatency: number
  p95Latency: number
  totalQueued: number
  avgUtilization: number
}

export interface MetricsSnapshot {
  generated: number
  accepted: number
  completed: number
  succeeded: number
  failed: number
  rateLimited: number
  authFailed: number
  timeouts: number
  retries: number
  notFound: number
  serviceUnavailable: number
  cacheHits: number
  cacheMisses: number
  statusCodes: Record<string, number>
  perGateway: Record<string, number>
  perService: Record<string, number>
  perRoute: Record<string, number>
  latencyAvg: number
  latencyP50: number
  latencyP95: number
  latencyP99: number
  latencyMax: number
  currentRps: number
  throughputRps: number
  errorRate: number
  samples: TickSample[]
}

export type ComponentHealth = 'up' | 'down' | 'overloaded' | 'warning'

export interface ComponentRuntimeView {
  health: ComponentHealth
  inService: number
  queued: number
  capacity: number
  queueLimit: number
  utilization: number
  activeConfigVersion: number | null
  pendingConfigVersion: number | null
  pendingDueAt: number | null
  configWarning: string | null
  totalProcessed: number
  totalRejected: number
  statusText: string
}

export interface FlowFrame {
  simTime: number
  metrics: MetricsSnapshot
  runtimes: Record<string, ComponentRuntimeView>
  events: SimEvent[]
  activeEdges: Record<string, 'ok' | 'fail'>
  edgeCounts: Record<string, number>
  recentRequests: SimRequestRecord[]
}

export interface ExperimentParamSpec {
  key: string
  label: string
  unit?: string
  min: number
  max: number
  step: number
  default: number
}

export type ExperimentSetup =
  | { kind: 'modify-architecture' }
  | { kind: 'schedule'; atSimMs: number; action: 'publish-route' | 'restore-all' | 'fail-node'; nodeId?: string; rule?: Partial<RouteRule> }
