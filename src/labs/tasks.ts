import type { Architecture, ComponentNode } from '../domain/types'

export interface TaskCheck {
  id: string
  pass: boolean
  /** Short human-readable evidence for the current diagram state. */
  evidence: string
}

function ofType(arch: Architecture, type: ComponentNode['data']['type']): ComponentNode[] {
  return arch.nodes.filter((n) => n.data.type === type)
}

/** Nodes reachable from `start` following edges forward. */
function reachableFrom(arch: Architecture, start: string): Set<string> {
  const out = new Map<string, string[]>()
  for (const e of arch.edges) {
    if (!out.has(e.source)) out.set(e.source, [])
    out.get(e.source)!.push(e.target)
  }
  const seen = new Set<string>()
  const stack = [start]
  while (stack.length > 0) {
    const cur = stack.pop()!
    for (const next of out.get(cur) ?? []) {
      if (!seen.has(next)) {
        seen.add(next)
        stack.push(next)
      }
    }
  }
  return seen
}

function gatewaysBehindBalance(arch: Architecture): boolean {
  const lbs = ofType(arch, 'loadBalancer')
  if (lbs.length === 0) return false
  const gateways = new Set(ofType(arch, 'gateway').map((g) => g.id))
  return lbs.some((lb) => {
    const reach = reachableFrom(arch, lb.id)
    for (const gw of gateways) if (reach.has(gw)) return true
    return false
  })
}

function directlyConnectedToAllGateways(arch: Architecture, type: ComponentNode['data']['type']): { all: boolean; connected: number; total: number; nodes: ComponentNode[] } {
  const gateways = ofType(arch, 'gateway')
  const sources = ofType(arch, type)
  if (gateways.length === 0) return { all: false, connected: 0, total: 0, nodes: sources }
  const sourceIds = new Set(sources.map((s) => s.id))
  // Connection is considered undirected: a gateway "uses" a Config Store or
  // Secret Manager whether the edge points gateway→store or store→gateway.
  const neighbours = new Map<string, Set<string>>()
  const link = (a: string, b: string): void => {
    if (!neighbours.has(a)) neighbours.set(a, new Set())
    neighbours.get(a)!.add(b)
  }
  for (const e of arch.edges) {
    link(e.source, e.target)
    link(e.target, e.source)
  }
  let connected = 0
  for (const gw of gateways) {
    const adj = neighbours.get(gw.id) ?? new Set<string>()
    if ([...adj].some((id) => sourceIds.has(id))) connected++
  }
  return { all: connected === gateways.length, connected, total: gateways.length, nodes: sources }
}

function totalOfferedLoad(arch: Architecture): number {
  return ofType(arch, 'client').reduce((sum, c) => {
    const cfg = c.data.config as { requestRate?: number }
    return sum + (cfg.requestRate ?? 0)
  }, 0)
}

/**
 * Evaluate the case-study #16 tasks against the current architecture.
 * Tasks 1-4 are structural (checked from the diagram); tasks 5-7 are behavioural
 * and are verified by the user running the simulation / scenarios.
 */
export function checkDesignTasks(arch: Architecture): TaskCheck[] {
  const gateways = ofType(arch, 'gateway')
  const configStores = ofType(arch, 'configStore')
  const secretManagers = ofType(arch, 'secretManager')
  const offered = totalOfferedLoad(arch)

  const lbOk = gatewaysBehindBalance(arch)
  const gwCountOk = gateways.length >= 2
  const configConn = directlyConnectedToAllGateways(arch, 'configStore')
  const secretConn = directlyConnectedToAllGateways(arch, 'secretManager')

  return [
    {
      id: 't1',
      pass: lbOk,
      evidence: lbOk
        ? 'A Load Balancer forwards to at least one gateway.'
        : gateways.length === 0
          ? 'No gateway in the diagram yet.'
          : 'No Load Balancer sits in front of the gateways.',
    },
    {
      id: 't2',
      pass: gwCountOk,
      evidence: gwCountOk ? `${gateways.length} gateway instances configured.` : `Only ${gateways.length} gateway instance (need 2+).`,
    },
    {
      id: 't3',
      pass: configStores.length > 0 && configConn.all,
      evidence:
        configStores.length === 0
          ? 'No Config Store in the diagram.'
          : configConn.all
            ? `Config Store connected to all ${configConn.total} gateways.`
            : `Config Store reaches ${configConn.connected}/${configConn.total} gateways (gateways must watch it).`,
    },
    {
      id: 't4',
      pass: secretManagers.length > 0 && secretConn.all,
      evidence:
        secretManagers.length === 0
          ? 'No Secret Manager in the diagram.'
          : secretConn.all
            ? `Secret Manager connected to all ${secretConn.total} gateways.`
            : `Secret Manager reaches ${secretConn.connected}/${secretConn.total} gateways.`,
    },
    {
      id: 't5',
      pass: Math.abs(offered - 50) <= 5,
      evidence: `Client offers ${Math.round(offered)} req/s (target ≈ 50).`,
    },
    {
      id: 't6',
      pass: gwCountOk && lbOk,
      evidence: gwCountOk && lbOk ? 'Run the failure scenario: a single gateway VM can be taken down.' : 'Needs 2 gateways behind a Load Balancer to be testable.',
    },
    {
      id: 't7',
      pass: configConn.all,
      evidence: configConn.all ? 'Both gateways watch the Config Store, so rule changes reload live.' : 'Gateways must all watch the Config Store for live updates.',
    },
  ]
}
