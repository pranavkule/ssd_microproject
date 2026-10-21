import type { ArchitectureEdge, ComponentNode } from './types'

export function nodeById(nodes: ComponentNode[], id: string): ComponentNode | undefined {
  return nodes.find((n) => n.id === id)
}

export function successors(edges: ArchitectureEdge[], id: string): string[] {
  return edges.filter((e) => e.source === id).map((e) => e.target)
}

export function predecessors(edges: ArchitectureEdge[], id: string): string[] {
  return edges.filter((e) => e.target === id).map((e) => e.source)
}

export function edgeBetween(edges: ArchitectureEdge[], source: string, target: string): ArchitectureEdge | undefined {
  return edges.find((e) => e.source === source && e.target === target)
}

/** BFS reachability over directed edges. */
export function isReachable(edges: ArchitectureEdge[], from: string, to: string, maxDepth = 12): boolean {
  if (from === to) return true
  const seen = new Set<string>([from])
  const queue: string[] = [from]
  let depth = 0
  while (queue.length > 0 && depth < maxDepth) {
    const nextQueue: string[] = []
    for (const id of queue) {
      for (const t of successors(edges, id)) {
        if (t === to) return true
        if (!seen.has(t)) {
          seen.add(t)
          nextQueue.push(t)
        }
      }
    }
    queue.splice(0, queue.length, ...nextQueue)
    depth++
  }
  return false
}

/** First hop candidates out of a node, in stable edge order. */
export function nextHops(edges: ArchitectureEdge[], id: string): string[] {
  return successors(edges, id)
}

/** Detect if `candidate` would create a cycle when adding edge source→candidate. */
export function wouldCreateCycle(edges: ArchitectureEdge[], source: string, target: string): boolean {
  return isReachable(edges, target, source)
}
