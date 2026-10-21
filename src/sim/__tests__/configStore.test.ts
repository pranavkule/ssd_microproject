import { describe, expect, test } from 'vitest'
import { createDefaultArchitecture } from '../../domain/defaults'
import { SimulationEngine } from '../engine'
import type { RouteRule } from '../../domain/types'

describe('dynamic routing & config propagation', () => {
  test('gateways activate a newly published version after the propagation delay', () => {
    const arch = createDefaultArchitecture()
    arch.routing.propagationDelayMs = 1500
    const engine = new SimulationEngine(arch, { scheduledActions: [] })

    const gws = arch.nodes.filter((n) => n.data.type === 'gateway')
    expect(gws.every((g) => g.data.type === 'gateway')).toBe(true)

    const rules: RouteRule[] = structuredClone(arch.routing.draftRules).map((r) =>
      r.path.startsWith('/orders') ? { ...r, destinationId: 'svc-users' } : r,
    )

    // before publish: still on v1
    engine.tick()
    let frame = engine.tick()
    for (const gw of gws) {
      expect(frame.runtimes[gw.id].activeConfigVersion).toBe(1)
      expect(frame.runtimes[gw.id].pendingConfigVersion).toBeNull()
    }

    engine.publishRules(rules, 'test publish')

    // immediately after publish: pending, not yet activated
    frame = engine.tick()
    for (const gw of gws) {
      expect(frame.runtimes[gw.id].pendingConfigVersion).toBe(2)
      expect(frame.runtimes[gw.id].activeConfigVersion).toBe(1)
    }

    // after propagation delay passes
    for (let i = 0; i < 30; i++) frame = engine.tick()
    for (const gw of gws) {
      expect(frame.runtimes[gw.id].activeConfigVersion).toBe(2)
      expect(frame.runtimes[gw.id].pendingConfigVersion).toBeNull()
    }
  })

  test('gateways retain last valid config when Config Store is down', () => {
    const arch = createDefaultArchitecture()
    arch.routing.propagationDelayMs = 1000
    const engine = new SimulationEngine(arch, { scheduledActions: [] })
    const gws = arch.nodes.filter((n) => n.data.type === 'gateway')
    const store = arch.nodes.find((n) => n.data.type === 'configStore')!

    engine.setFailures([store.id])
    const rules = structuredClone(arch.routing.draftRules)
    engine.publishRules(rules.map((r) => ({ ...r, priority: 99 })), 'update during outage')

    for (let i = 0; i < 40; i++) engine.tick()
    const frame = engine.tick()
    for (const gw of gws) {
      // never activated v2 because store is down
      expect(frame.runtimes[gw.id].activeConfigVersion).toBe(1)
      expect(frame.runtimes[gw.id].configWarning).toBeTruthy()
    }

    // recover: gateway should eventually pull the pending version
    engine.setFailures([])
    for (let i = 0; i < 30; i++) engine.tick()
    const frame2 = engine.tick()
    for (const gw of gws) {
      expect(frame2.runtimes[gw.id].activeConfigVersion).toBe(2)
    }
  })

  test('published rules route requests to the new destination', () => {
    const arch = createDefaultArchitecture()
    arch.routing.propagationDelayMs = 500
    // silence the default client so only our injected requests are measured
    const client = arch.nodes.find((n) => n.data.type === 'client')!
    client.data.config = { ...client.data.config, requestRate: 0, burst: 0 } as typeof client.data.config
    const engine = new SimulationEngine(arch, { scheduledActions: [] })

    // move /orders/* to user service
    const rules = structuredClone(arch.routing.draftRules).map((r) =>
      r.path.startsWith('/orders') ? { ...r, destinationId: 'svc-users' } : r,
    )
    engine.publishRules(rules, 'canary')
    for (let i = 0; i < 20; i++) engine.tick() // propagate

    for (let i = 0; i < 20; i++) engine.emitRequest(client.id, 't', '/orders/99', 'GET')
    for (let i = 0; i < 60; i++) engine.tick()
    engine.drain(100)

    const frame = engine.tick()
    expect(frame.metrics.perService['svc-users']).toBeGreaterThan(0)
    expect(frame.metrics.perService['svc-orders'] ?? 0).toBe(0)
  })
})
