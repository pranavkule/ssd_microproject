import type { Architecture, ComponentNode, ComponentType, RouteRule } from '../domain/types'
import { COMPONENT_DESCRIPTIONS, defaultConfigFor } from '../domain/defaults'

/** Shape of a case study document loaded from `public/content/case-studies/*.json`. */
export interface CaseStudyDiagramNode {
  id: string
  type: ComponentType
  label: string
  x: number
  y: number
}

export interface CaseStudyDiagramEdge {
  id: string
  source: string
  target: string
}

export interface CaseStudyDiagram {
  nodes: CaseStudyDiagramNode[]
  edges: CaseStudyDiagramEdge[]
}

export interface CaseStudyTask {
  id: string
  title: string
  detail: string
}

export interface CaseStudyQuizItem {
  q: string
  a: string
}

export interface CaseStudy {
  id: string
  number: number
  title: string
  infrastructure: string
  description: string
  tasks: CaseStudyTask[]
  quiz: CaseStudyQuizItem[]
  /** Component types most relevant to this case study (used to filter the palette). */
  essentialComponents?: ComponentType[]
  starterDiagram: CaseStudyDiagram
  referenceDiagram: CaseStudyDiagram
}

export interface CaseStudyManifestEntry {
  id: string
  number: number
  title: string
  path: string
}

export interface CaseStudyManifest {
  default: string
  caseStudies: CaseStudyManifestEntry[]
}

/** Default route rules matching the case-study service endpoints. */
function caseStudyRouteRules(): RouteRule[] {
  return [
    { id: 'rule-users', path: '/users/*', matchType: 'prefix', methods: ['ANY'], destinationId: 'svc-users', priority: 10, enabled: true },
    { id: 'rule-products', path: '/products/*', matchType: 'prefix', methods: ['ANY'], destinationId: 'svc-products', priority: 10, enabled: true },
    { id: 'rule-orders', path: '/orders/*', matchType: 'prefix', methods: ['ANY'], destinationId: 'svc-orders', priority: 10, enabled: true },
  ]
}

function toComponentNode(n: CaseStudyDiagramNode): ComponentNode {
  const config = defaultConfigFor(n.type)
  if (n.type === 'gateway') {
    Object.assign(config, { instanceName: `${n.label} (JWT Verify)`, authEnabled: true, authFailureRate: 0 })
  }
  if (n.type === 'service') {
    Object.assign(config, { serviceName: n.label.toLowerCase().replace(/\s+/g, '-') })
  }
  return {
    id: n.id,
    type: 'component',
    position: { x: n.x, y: n.y },
    data: {
      label: n.label,
      type: n.type,
      config,
      description: COMPONENT_DESCRIPTIONS[n.type],
    },
  }
}

/** Build a runnable Architecture from a case-study diagram. */
export function diagramToArchitecture(cs: CaseStudy, diagram: CaseStudyDiagram, nameSuffix: string): Architecture {
  const rules = caseStudyRouteRules()
  return {
    id: `${cs.id}-${nameSuffix}`,
    name: cs.title,
    description: cs.description,
    nodes: diagram.nodes.map(toComponentNode),
    edges: diagram.edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
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
