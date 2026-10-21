import type { LoadBalancingAlgorithm } from './types'

export interface LbTarget {
  id: string
  healthy: boolean
  /** current in-flight requests at the target (used by least-connections) */
  connections: number
  weight: number
}

/**
 * Deterministic load-balancer target selection.
 * Round Robin: cycles through healthy targets in stable id order.
 * Least Connections: picks the healthy target with fewest open connections.
 * Weighted Round Robin: smooth weighted round robin (nginx algorithm).
 */
export function selectTarget(
  algorithm: LoadBalancingAlgorithm,
  targets: LbTarget[],
  state: { rrIndex: number; wrrCurrent: Record<string, number> },
): { target: LbTarget | null; nextState: { rrIndex: number; wrrCurrent: Record<string, number> } } {
  const healthy = targets.filter((t) => t.healthy)
  if (healthy.length === 0) return { target: null, nextState: state }

  if (algorithm === 'round-robin') {
    const idx = state.rrIndex % healthy.length
    const target = healthy[idx]
    return {
      target,
      nextState: { ...state, rrIndex: (state.rrIndex + 1) % healthy.length, wrrCurrent: state.wrrCurrent },
    }
  }

  if (algorithm === 'least-connections') {
    let best = healthy[0]
    for (const t of healthy) {
      if (t.connections < best.connections || (t.connections === best.connections && t.id < best.id)) {
        best = t
      }
    }
    return { target: best, nextState: state }
  }

  // weighted round robin — smooth WRR
  const current: Record<string, number> = { ...state.wrrCurrent }
  let total = 0
  let best: LbTarget | null = null
  for (const t of healthy) {
    const w = Math.max(0, t.weight)
    total += w
    current[t.id] = (current[t.id] ?? 0) + w
    if (!best || (current[t.id] ?? 0) > (current[best.id] ?? 0)) best = t
  }
  if (!best) return { target: null, nextState: state }
  current[best.id] = (current[best.id] ?? 0) - total
  return { target: best, nextState: { ...state, rrIndex: state.rrIndex, wrrCurrent: current } }
}
