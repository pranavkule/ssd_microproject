import { describe, expect, test } from 'vitest'
import { MetricsCollector, computePercentiles, emptyMetrics } from '../metrics'
import type { SimRequestRecord } from '../../domain/types'

function record(overrides: Partial<SimRequestRecord>): SimRequestRecord {
  return {
    id: 'req-1',
    method: 'GET',
    path: '/x',
    clientId: 'c',
    clientNodeId: 'client-1',
    arrivalTime: 0,
    completionTime: 10,
    statusCode: 200,
    gatewayId: 'gw-1',
    serviceId: 'svc-users',
    routeId: 'r1',
    retries: 0,
    failureReason: null,
    status: 'completed',
    ...overrides,
  }
}

describe('metrics', () => {
  test('percentiles are computed from sorted samples', () => {
    const latencies = Array.from({ length: 100 }, (_, i) => i + 1) // 1..100
    const p = computePercentiles(latencies)
    expect(p.p50).toBe(50)
    expect(p.p95).toBe(95)
    expect(p.p99).toBe(99)
    expect(p.max).toBe(100)
    expect(p.avg).toBeCloseTo(50.5, 1)
  })

  test('empty percentiles return zeros', () => {
    expect(computePercentiles([])).toEqual({ p50: 0, p95: 0, p99: 0, max: 0, avg: 0 })
  })

  test('collector aggregates statuses, gateways and services', () => {
    const m = new MetricsCollector()
    m.recordCompletion(record({ id: 'a', statusCode: 200, gatewayId: 'gw-1', serviceId: 'svc-users' }))
    m.recordCompletion(record({ id: 'b', statusCode: 500, gatewayId: 'gw-2', serviceId: 'svc-orders' }))
    m.recordRateLimited()
    const snap = m.snapshot(1000, 100)
    expect(snap.generated).toBe(0)
    expect(snap.completed).toBe(2)
    expect(snap.succeeded).toBe(1)
    expect(snap.failed).toBe(1)
    expect(snap.rateLimited).toBe(1)
    expect(snap.perGateway['gw-1']).toBe(1)
    expect(snap.perGateway['gw-2']).toBe(1)
    expect(snap.perService['svc-orders']).toBe(1)
    expect(snap.statusCodes['500']).toBe(1)
    expect(snap.errorRate).toBeCloseTo(0.5, 3)
  })

  test('samples are generated at the configured interval', () => {
    const m = new MetricsCollector()
    m.resetWindow(0)
    expect(m.maybeSample(100, 500, 0, 0)).toBeNull()
    m.recordCompletion(record({ id: 'x', arrivalTime: 0, completionTime: 50 }))
    const s = m.maybeSample(500, 500, 3, 0.5)
    expect(s).not.toBeNull()
    expect(s!.time).toBe(0.5)
    expect(s!.rps).toBeCloseTo(2, 1) // 1 completion in 0.5s
    expect(s!.totalQueued).toBe(3)
  })

  test('empty metrics defaults', () => {
    const e = emptyMetrics()
    expect(e.completed).toBe(0)
    expect(e.samples).toEqual([])
  })
})
