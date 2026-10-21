import type {
  Architecture,
  CacheConfig,
  ClientConfig,
  ComponentConfigMap,
  ComponentNode,
  ComponentType,
  ConfigStoreConfig,
  DatabaseConfig,
  GatewayConfig,
  LoadBalancerConfig,
  QueueConfig,
  RateLimiterConfig,
  RouteRule,
  SecretManagerConfig,
  ServiceConfig,
  SidecarConfig,
} from './types'

export const DEFAULT_CLIENT_CONFIG: ClientConfig = {
  requestRate: 50,
  requestMix: [
    { path: '/users/profile', method: 'GET', weight: 30 },
    { path: '/products/list', method: 'GET', weight: 40 },
    { path: '/orders', method: 'POST', weight: 20 },
    { path: '/orders/1001', method: 'GET', weight: 10 },
  ],
  timeoutMs: 4000,
  burst: 0,
}

export const DEFAULT_RATE_LIMITER_CONFIG: RateLimiterConfig = {
  requestsPerSecond: 60,
  burstCapacity: 30,
  strategy: 'token-bucket',
  scope: 'global',
  perRouteLimits: [],
}

export const DEFAULT_LOAD_BALANCER_CONFIG: LoadBalancerConfig = {
  algorithm: 'round-robin',
  weights: {},
  healthCheckIntervalMs: 1000,
  capacity: 200,
  serviceTimeMs: 1,
  queueLimit: 1000,
}

export const DEFAULT_GATEWAY_CONFIG: GatewayConfig = {
  instanceName: 'gateway',
  capacity: 60,
  serviceTimeMs: 6,
  queueLimit: 200,
  authEnabled: false,
  authFailureRate: 0,
  timeoutMs: 2000,
  maxRetries: 1,
}

export const DEFAULT_SERVICE_CONFIG: ServiceConfig = {
  serviceName: 'service',
  endpoints: ['/'],
  capacity: 40,
  serviceTimeMs: 12,
  queueLimit: 150,
  errorRate: 0,
  timeoutMs: 2000,
  useCache: false,
}

export const DEFAULT_DATABASE_CONFIG: DatabaseConfig = {
  databaseName: 'database',
  capacity: 30,
  queryLatencyMs: 18,
  queueLimit: 120,
  errorRate: 0,
  connectionPoolSize: 20,
  lockContention: 0,
}

export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  readLatencyMs: 1.5,
  writeLatencyMs: 2.5,
  hitRatio: 0.8,
}

export const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  maxThroughput: 500,
  enqueueLatencyMs: 2,
  maxDepth: 5000,
}

export const DEFAULT_SIDECAR_CONFIG: SidecarConfig = {
  latencyMs: 1,
  maxRetries: 1,
  timeoutMs: 2000,
  collectMetrics: true,
}

export const DEFAULT_CONFIG_STORE_CONFIG: ConfigStoreConfig = {
  readLatencyMs: 2,
  writeLatencyMs: 4,
  cacheHitRatio: 0.9,
}

export const DEFAULT_SECRET_MANAGER_CONFIG: SecretManagerConfig = {
  readLatencyMs: 2,
  keyRotationIntervalMs: 30000,
  storesTlsCertificates: true,
}

export function defaultConfigFor(type: ComponentType): ComponentConfigMap[ComponentType] {
  switch (type) {
    case 'client':
      return structuredClone(DEFAULT_CLIENT_CONFIG)
    case 'rateLimiter':
      return structuredClone(DEFAULT_RATE_LIMITER_CONFIG)
    case 'loadBalancer':
      return structuredClone(DEFAULT_LOAD_BALANCER_CONFIG)
    case 'gateway':
      return structuredClone(DEFAULT_GATEWAY_CONFIG)
    case 'service':
      return structuredClone(DEFAULT_SERVICE_CONFIG)
    case 'database':
      return structuredClone(DEFAULT_DATABASE_CONFIG)
    case 'cache':
      return structuredClone(DEFAULT_CACHE_CONFIG)
    case 'queue':
      return structuredClone(DEFAULT_QUEUE_CONFIG)
    case 'sidecar':
      return structuredClone(DEFAULT_SIDECAR_CONFIG)
    case 'configStore':
      return structuredClone(DEFAULT_CONFIG_STORE_CONFIG)
    case 'secretManager':
      return structuredClone(DEFAULT_SECRET_MANAGER_CONFIG)
  }
}

export const COMPONENT_LABELS: Record<ComponentType, string> = {
  client: 'Client',
  rateLimiter: 'Rate Limiter',
  loadBalancer: 'Load Balancer',
  gateway: 'L7 API Gateway (JWT Verify)',
  service: 'Application Service',
  database: 'Database',
  cache: 'Cache / Redis',
  queue: 'Message Queue',
  sidecar: 'Sidecar Proxy',
  configStore: 'Config Store (Redis)',
  secretManager: 'Secret Manager',
}

export const COMPONENT_DESCRIPTIONS: Record<ComponentType, string> = {
  client: 'Generates synthetic HTTP requests according to the configured rate and request mix. Enforces its own request timeout.',
  rateLimiter: 'Admission control. Applies a token bucket or fixed window policy and rejects excess traffic with HTTP 429.',
  loadBalancer: 'Selects a healthy gateway VM using Round Robin, Least Connections or Weighted Round Robin and forwards the request.',
  gateway: 'Layer-7 gateway VM. Verifies the client JWT with keys from the Secret Manager, matches the request path against the active routing table and forwards to a backend service.',
  service: 'Application microservice. Processes matched endpoints, may consult the cache and its database.',
  database: 'Persistent storage with finite connection capacity, query latency and error rate.',
  cache: 'In-memory cache consulted by services. A hit avoids the database round trip.',
  queue: 'Asynchronous buffer with finite depth and throughput.',
  sidecar: 'Optional proxy hop adding latency, retries and metrics between services.',
  configStore: 'Shared versioned routing configuration store. Gateways watch it and reload routing table versions live without restarting.',
  secretManager: 'Central secret store for JWT signing/public keys and TLS certificates. Gateways fetch secrets at startup and on key rotation.',
}

export function defaultRouteRules(): RouteRule[] {
  return [
    {
      id: 'rule-users',
      path: '/users/*',
      matchType: 'prefix',
      methods: ['ANY'],
      destinationId: 'svc-users',
      priority: 10,
      enabled: true,
    },
    {
      id: 'rule-products',
      path: '/products/*',
      matchType: 'prefix',
      methods: ['ANY'],
      destinationId: 'svc-products',
      priority: 10,
      enabled: true,
    },
    {
      id: 'rule-orders',
      path: '/orders/*',
      matchType: 'prefix',
      methods: ['ANY'],
      destinationId: 'svc-orders',
      priority: 10,
      enabled: true,
    },
  ]
}

function node(id: string, type: ComponentType, label: string, x: number, y: number, config?: ComponentConfigMap[ComponentType]): ComponentNode {
  return {
    id,
    type: 'component',
    position: { x, y },
    data: {
      label,
      type,
      config: config ?? defaultConfigFor(type),
      description: COMPONENT_DESCRIPTIONS[type],
    },
  }
}

export function createDefaultArchitecture(): Architecture {
  const rules = defaultRouteRules()

  const nodes: ComponentNode[] = [
    node('client-1', 'client', 'Web Client', 40, 300, {
      ...structuredClone(DEFAULT_CLIENT_CONFIG),
    }),
    node('rl-1', 'rateLimiter', 'Rate Limiter', 230, 300),
    node('lb-1', 'loadBalancer', 'Load Balancer', 430, 300),
    node(
      'gw-1',
      'gateway',
      'Gateway VM 1',
      640,
      150,
      {
        ...structuredClone(DEFAULT_GATEWAY_CONFIG),
        instanceName: 'gateway-vm-1 (JWT Verify)',
        authEnabled: true,
        authFailureRate: 0,
      },
    ),
    node(
      'gw-2',
      'gateway',
      'Gateway VM 2',
      640,
      450,
      {
        ...structuredClone(DEFAULT_GATEWAY_CONFIG),
        instanceName: 'gateway-vm-2 (JWT Verify)',
        authEnabled: true,
        authFailureRate: 0,
      },
    ),
    node(
      'svc-users',
      'service',
      'User Service',
      900,
      60,
      {
        ...structuredClone(DEFAULT_SERVICE_CONFIG),
        serviceName: 'user-service',
        endpoints: ['/users/*'],
        serviceTimeMs: 10,
        capacity: 40,
      },
    ),
    node(
      'svc-products',
      'service',
      'Product Service',
      900,
      300,
      {
        ...structuredClone(DEFAULT_SERVICE_CONFIG),
        serviceName: 'product-service',
        endpoints: ['/products/*'],
        serviceTimeMs: 14,
        capacity: 40,
      },
    ),
    node(
      'svc-orders',
      'service',
      'Order Service',
      900,
      540,
      {
        ...structuredClone(DEFAULT_SERVICE_CONFIG),
        serviceName: 'order-service',
        endpoints: ['/orders/*'],
        serviceTimeMs: 16,
        capacity: 30,
      },
    ),
    node(
      'db-users',
      'database',
      'User DB',
      1160,
      60,
      { ...structuredClone(DEFAULT_DATABASE_CONFIG), databaseName: 'users-db' },
    ),
    node(
      'db-products',
      'database',
      'Product DB',
      1160,
      300,
      { ...structuredClone(DEFAULT_DATABASE_CONFIG), databaseName: 'products-db' },
    ),
    node(
      'db-orders',
      'database',
      'Order DB',
      1160,
      540,
      { ...structuredClone(DEFAULT_DATABASE_CONFIG), databaseName: 'orders-db', queryLatencyMs: 22 },
    ),
    node('redis-1', 'configStore', 'Config Store', 640, 680),
    node('sm-1', 'secretManager', 'Secret Manager', 380, 680),
  ]

  const edges = [
    { id: 'e-client-rl', source: 'client-1', target: 'rl-1' },
    { id: 'e-rl-lb', source: 'rl-1', target: 'lb-1' },
    { id: 'e-lb-gw1', source: 'lb-1', target: 'gw-1' },
    { id: 'e-lb-gw2', source: 'lb-1', target: 'gw-2' },
    { id: 'e-gw1-users', source: 'gw-1', target: 'svc-users' },
    { id: 'e-gw1-products', source: 'gw-1', target: 'svc-products' },
    { id: 'e-gw1-orders', source: 'gw-1', target: 'svc-orders' },
    { id: 'e-gw2-users', source: 'gw-2', target: 'svc-users' },
    { id: 'e-gw2-products', source: 'gw-2', target: 'svc-products' },
    { id: 'e-gw2-orders', source: 'gw-2', target: 'svc-orders' },
    { id: 'e-users-db', source: 'svc-users', target: 'db-users' },
    { id: 'e-products-db', source: 'svc-products', target: 'db-products' },
    { id: 'e-orders-db', source: 'svc-orders', target: 'db-orders' },
    { id: 'e-gw1-redis', source: 'gw-1', target: 'redis-1' },
    { id: 'e-gw2-redis', source: 'gw-2', target: 'redis-1' },
    { id: 'e-gw1-sm', source: 'gw-1', target: 'sm-1' },
    { id: 'e-gw2-sm', source: 'gw-2', target: 'sm-1' },
  ]

  return {
    id: 'default-case-study',
    name: 'Dynamic L7 API Gateway & Reverse Proxy',
    description:
      'This system is a high-performance L7 API gateway and reverse proxy. A Rate Limiter drops excess traffic, and a Load Balancer spreads requests across ' +
      'multiple gateway instances running on cloud compute. Each gateway verifies the client\'s JWT using keys fetched from a Secret Manager, then routes the ' +
      'request to the User, Product, or Order service by URL path. Routing rules live in a shared Config Store that the gateways watch, so rules reload live ' +
      'without restarting. Each service has its own database.',
    nodes,
    edges,
    annotations: [],
    routing: {
      draftRules: structuredClone(rules),
      versions: [{ version: 1, rules: structuredClone(rules), publishedAtSimMs: 0, note: 'Initial routing configuration' }],
      publishedVersion: 1,
      propagationDelayMs: 2000,
      fallbackRouteId: null,
    },
    settings: {
      seed: 42,
      tickMs: 100,
      maxSimSeconds: 600,
      sampleIntervalMs: 500,
    },
  }
}
