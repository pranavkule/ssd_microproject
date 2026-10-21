import { describe, expect, test } from 'vitest'
import { selectTarget, type LbTarget } from '../loadbalancing'

describe('load balancing', () => {
  test('round robin cycles through healthy targets', () => {
    const state = { rrIndex: 0, wrrCurrent: {} }
    const targets: LbTarget[] = [
      { id: 'gw1', healthy: true, connections: 1, weight: 1 },
      { id: 'gw2', healthy: true, connections: 2, weight: 1 },
    ]
    const s1 = selectTarget('round-robin', targets, state)
    expect(s1.target?.id).toBe('gw1')
    const s2 = selectTarget('round-robin', targets, { ...state, rrIndex: s1.nextState.rrIndex })
    expect(s2.target?.id).toBe('gw2')
    const s3 = selectTarget('round-robin', targets, { ...state, rrIndex: s2.nextState.rrIndex })
    expect(s3.target?.id).toBe('gw1')
  })

  test('round robin skips unhealthy targets', () => {
    const state = { rrIndex: 0, wrrCurrent: {} }
    const targets: LbTarget[] = [
      { id: 'gw1', healthy: false, connections: 0, weight: 1 },
      { id: 'gw2', healthy: true, connections: 0, weight: 1 },
      { id: 'gw3', healthy: false, connections: 5, weight: 1 },
    ]
    const s1 = selectTarget('round-robin', targets, state)
    expect(s1.target?.id).toBe('gw2')
    const s2 = selectTarget('round-robin', targets, s1.nextState)
    expect(s2.target?.id).toBe('gw2')
  })

  test('least connections prefers fewer connections', () => {
    const targets: LbTarget[] = [
      { id: 'gw1', healthy: true, connections: 4, weight: 1 },
      { id: 'gw2', healthy: true, connections: 1, weight: 1 },
      { id: 'gw3', healthy: true, connections: 2, weight: 1 },
    ]
    const s = selectTarget('least-connections', targets, { rrIndex: 0, wrrCurrent: {} })
    expect(s.target?.id).toBe('gw2')
  })

  test('returns null when no healthy targets', () => {
    const targets: LbTarget[] = [
      { id: 'gw1', healthy: false, connections: 10, weight: 1 },
    ]
    const s = selectTarget('round-robin', targets, { rrIndex: 0, wrrCurrent: {} })
    expect(s.target).toBeNull()
  })

  test('weighted round robin favors higher weight', () => {
    const targets: LbTarget[] = [
      { id: 'gw1', healthy: true, connections: 0, weight: 1 },
      { id: 'gw2', healthy: true, connections: 0, weight: 3 },
    ]
    const state = { rrIndex: 0, wrrCurrent: {} }
    const picks: string[] = []
    let st = state
    for (let i = 0; i < 6; i++) {
      const r = selectTarget('weighted-round-robin', targets, st)
      picks.push(r.target!.id)
      st = r.nextState
    }
    // smooth WRR gives 3x gw2 compared to gw1
    expect(picks.filter((p) => p === 'gw2').length).toBeGreaterThan(picks.filter((p) => p === 'gw1').length)
  })
})
