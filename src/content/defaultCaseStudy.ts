import type { CaseStudy, CaseStudyManifestEntry } from './caseStudy'

/** Id of the case study the lab opens with by default. */
export const DEFAULT_CASE_STUDY_ID = 'cs-16'

/**
 * Bundled fallback used to build the initial architecture synchronously (before
 * the async case-study JSON has loaded) and when content cannot be fetched
 * (e.g. offline). Kept intentionally small: only the starter diagram is needed
 * to seed the canvas; the full document is fetched at runtime.
 */
export const FALLBACK_CASE_STUDY: CaseStudy = {
  id: DEFAULT_CASE_STUDY_ID,
  number: 16,
  title: 'Dynamic L7 API Gateway & Reverse Proxy',
  infrastructure: 'Cloud compute (2 gateway VMs) · Managed Redis Config Store · Managed Secret Manager · 3 application services · 3 databases',
  description:
    'Design a high-performance L7 API gateway and reverse proxy. A Rate Limiter drops excess traffic, a Load Balancer spreads requests across gateway VMs, and each gateway verifies the client JWT using keys from a Secret Manager before routing to the User, Product or Order service. Routing rules live in a shared Config Store watched live by the gateways.',
  tasks: [],
  quiz: [],
  essentialComponents: ['client', 'rateLimiter', 'loadBalancer', 'gateway', 'service', 'database', 'configStore', 'secretManager'],
  starterDiagram: {
    nodes: [
      { id: 'client-1', type: 'client', label: 'Web Client', x: 60, y: 300 },
      { id: 'rl-1', type: 'rateLimiter', label: 'Rate Limiter', x: 300, y: 300 },
      { id: 'gw-1', type: 'gateway', label: 'L7 API Gateway', x: 560, y: 300 },
      { id: 'svc-users', type: 'service', label: 'User Service', x: 860, y: 100 },
      { id: 'svc-products', type: 'service', label: 'Product Service', x: 860, y: 300 },
      { id: 'svc-orders', type: 'service', label: 'Order Service', x: 860, y: 500 },
      { id: 'db-users', type: 'database', label: 'User DB', x: 1140, y: 100 },
      { id: 'db-products', type: 'database', label: 'Product DB', x: 1140, y: 300 },
      { id: 'db-orders', type: 'database', label: 'Order DB', x: 1140, y: 500 },
    ],
    edges: [
      { id: 'e-client-rl', source: 'client-1', target: 'rl-1' },
      { id: 'e-rl-gw1', source: 'rl-1', target: 'gw-1' },
      { id: 'e-gw1-users', source: 'gw-1', target: 'svc-users' },
      { id: 'e-gw1-products', source: 'gw-1', target: 'svc-products' },
      { id: 'e-gw1-orders', source: 'gw-1', target: 'svc-orders' },
      { id: 'e-users-db', source: 'svc-users', target: 'db-users' },
      { id: 'e-products-db', source: 'svc-products', target: 'db-products' },
      { id: 'e-orders-db', source: 'svc-orders', target: 'db-orders' },
    ],
  },
  referenceDiagram: { nodes: [], edges: [] },
}

export type { CaseStudyManifestEntry }
