import { describe, expect, test } from 'vitest'
import { createDefaultArchitecture } from '../../domain/defaults'
import { SimulationEngine } from '../engine'

describe('simulation engine', () => {
  test('reports a non-zero system P99 after requests complete', () => {
    const engine = new SimulationEngine(createDefaultArchitecture(), { scheduledActions: [] })
    let frame = engine.tick()
    for (let i = 0; i < 200; i++) frame = engine.tick()

    expect(frame.metrics.completed).toBeGreaterThan(0)
    expect(frame.metrics.latencyP99).toBeGreaterThan(0)
    expect(frame.metrics.latencyP99).toBeLessThan(100)
  })

  test('offered load exceeds component capacity and builds queues', () => {
    const measure = (requestRate: number): { queued: number; throughputRps: number; completed: number } => {
      const arch = createDefaultArchitecture()
      const client = arch.nodes.find((node) => node.data.type === 'client')!
      client.data.config = { ...client.data.config, requestRate } as typeof client.data.config
      const rateLimiter = arch.nodes.find((node) => node.data.type === 'rateLimiter')!
      rateLimiter.data.config = {
        ...rateLimiter.data.config,
        requestsPerSecond: 500,
        burstCapacity: 500,
      } as typeof rateLimiter.data.config
      for (const node of arch.nodes) {
        if (node.data.type === 'service') {
          node.data.config = { ...node.data.config, capacity: 1, serviceTimeMs: 100, queueLimit: 100000 }
        } else if (node.data.type === 'database') {
          node.data.config = { ...node.data.config, capacity: 1, queryLatencyMs: 100, queueLimit: 100000 }
        }
      }
      const engine = new SimulationEngine(arch, { scheduledActions: [] })
      let frame = engine.tick()
      for (let i = 0; i < 100; i++) frame = engine.tick()
      return {
        queued: frame.metrics.samples.at(-1)?.totalQueued ?? 0,
        throughputRps: frame.metrics.throughputRps,
        completed: frame.metrics.completed,
      }
    }

    const idle = measure(1)
    const saturated = measure(200)
    // A trickle of traffic never queues; a load beyond backend capacity does.
    expect(idle.queued).toBe(0)
    expect(saturated.queued).toBeGreaterThan(idle.queued)
    expect(saturated.completed).toBeGreaterThan(idle.completed)
  })

  test('round robin distributes traffic across two healthy gateways', () => {
    const arch = createDefaultArchitecture()
    const engine = new SimulationEngine(arch, { scheduledActions: [] })
    const client = arch.nodes.find((n) => n.data.type === 'client')
    if (client) {
      for (let i = 0; i < 40; i++) engine.emitRequest(client.id, 'test', '/users/profile', 'GET')
    }
    for (let i = 0; i < 120; i++) engine.tick()
    engine.drain(200)
    const frame = engine.tick()
    const totals = Object.values(frame.metrics.perGateway)
    expect(totals.reduce((s, v) => s + v, 0)).toBeGreaterThan(0)
    if (totals.length >= 2) {
      expect(totals[0]).toBeGreaterThan(0)
      expect(totals[1]).toBeGreaterThan(0)
      // reasonably balanced
      const diff = Math.abs(totals[0] - totals[1])
      const sum = totals[0] + totals[1]
      expect(diff / (sum || 1)).toBeLessThan(0.4)
    }
  })

  test('failed gateway receives no new requests', () => {
    const arch = createDefaultArchitecture()
    const gws = arch.nodes.filter((n) => n.data.type === 'gateway')
    const engine = new SimulationEngine(arch, { scheduledActions: [] })
    const client = arch.nodes.find((n) => n.data.type === 'client')
    engine.setFailures([gws[0].id])
    if (client) {
      for (let i = 0; i < 30; i++) engine.emitRequest(client.id, 'test', '/products/list', 'GET')
    }
    for (let i = 0; i < 100; i++) engine.tick()
    engine.drain(150)
    const frame = engine.tick()
    const perGw = frame.metrics.perGateway
    if (perGw[gws[0].id] !== undefined) expect(perGw[gws[0].id]).toBe(0)
    const otherTotal = Object.entries(perGw).filter(([id]) => id !== gws[0].id).reduce((s, [, v]) => s + v, 0)
    expect(otherTotal).toBeGreaterThan(0)
  })

  test('unknown route returns 404', () => {
    const arch = createDefaultArchitecture()
    const engine = new SimulationEngine(arch, { scheduledActions: [] })
    const client = arch.nodes.find((n) => n.data.type === 'client')
    if (client) engine.emitRequest(client.id, 'test', '/nonexistent/thing', 'GET')
    for (let i = 0; i < 40; i++) engine.tick()
    engine.drain(60)
    const frame = engine.tick()
    expect(frame.metrics.notFound).toBeGreaterThan(0)
  })
})
