import { describe, expect, test } from 'vitest'
import { importArchitectureJson, exportArchitectureJson, metricsToCsv } from '../importExport'
import { createDefaultArchitecture } from '../../domain/defaults'

describe('import/export', () => {
  test('round-trips the default architecture', () => {
    const arch = createDefaultArchitecture()
    const json = exportArchitectureJson(arch)
    const result = importArchitectureJson(json)
    expect(result.ok).toBe(true)
    expect(result.architecture).not.toBeNull()
    expect(result.architecture!.nodes.length).toBe(arch.nodes.length)
    expect(result.architecture!.edges.length).toBe(arch.edges.length)
    expect(result.architecture!.routing.publishedVersion).toBe(1)
  })

  test('round-trips canvas annotations', () => {
    const arch = createDefaultArchitecture()
    arch.annotations.push({
      id: 'note-1',
      type: 'note',
      position: { x: 120, y: 240 },
      width: 220,
      height: 150,
      text: 'Remember to scale the database',
    })
    const result = importArchitectureJson(exportArchitectureJson(arch))
    expect(result.ok).toBe(true)
    expect(result.architecture?.annotations).toEqual(arch.annotations)
  })

  test('rejects invalid JSON', () => {
    const result = importArchitectureJson('{ not json')
    expect(result.ok).toBe(false)
    expect(result.issues.some((i) => i.level === 'error')).toBe(true)
  })

  test('rejects unknown component types', () => {
    const bad = JSON.stringify({ nodes: [{ id: 'n1', type: 'wormhole', data: { config: {} }, position: { x: 0, y: 0 } }], edges: [] })
    const result = importArchitectureJson(bad)
    expect(result.ok).toBe(false)
    expect(result.issues.some((i) => i.message.includes('unsupported component type'))).toBe(true)
  })

  test('rejects edges with missing endpoints', () => {
    const bad = JSON.stringify({
      nodes: [{ id: 'n1', type: 'client', data: { config: { requestRate: 1, requestMix: [{ path: '/a', method: 'GET', weight: 1 }], timeoutMs: 100, burst: 0 } }, position: { x: 0, y: 0 } }],
      edges: [{ id: 'e1', source: 'n1', target: 'missing-node' }],
    })
    const result = importArchitectureJson(bad)
    expect(result.ok).toBe(false)
    expect(result.issues.some((i) => i.message.includes('unknown target'))).toBe(true)
  })

  test('metrics csv has header and rows', () => {
    const csv = metricsToCsv([{ time: 1, rps: 2, succeeded: 1, failed: 1, avgLatency: 5, p95Latency: 9, totalQueued: 0, avgUtilization: 0.1 }])
    const lines = csv.split('\n')
    expect(lines[0]).toContain('time_s')
    expect(lines[1]).toContain('1,2')
  })
})
