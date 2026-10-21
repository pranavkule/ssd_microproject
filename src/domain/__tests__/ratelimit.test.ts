import { describe, expect, test } from 'vitest'
import { checkRateLimit, createRateLimitState } from '../ratelimit'
import type { RateLimiterConfig } from '../types'

describe('rate limiting', () => {
  test('token bucket admits up to burst then refills', () => {
    const cfg: RateLimiterConfig = {
      requestsPerSecond: 10,
      burstCapacity: 2,
      strategy: 'token-bucket',
      scope: 'global',
      perRouteLimits: [],
    }
    let state = createRateLimitState(cfg, 0)
    const r1 = checkRateLimit(cfg, state, 0)
    expect(r1.allowed).toBe(true)
    state = r1.state
    const r2 = checkRateLimit(cfg, state, 0)
    expect(r2.allowed).toBe(true)
    state = r2.state
    const r3 = checkRateLimit(cfg, state, 0)
    expect(r3.allowed).toBe(false)
    state = r3.state
    // after 200ms, refill +2 tokens/sec => +0.4; bucket caps at 2
    const r4 = checkRateLimit(cfg, state, 200)
    expect(r4.allowed).toBe(true)
  })

  test('fixed window limits to configured count', () => {
    const cfg: RateLimiterConfig = {
      requestsPerSecond: 3,
      burstCapacity: 3,
      strategy: 'fixed-window',
      scope: 'global',
      perRouteLimits: [],
    }
    let state = createRateLimitState(cfg, 1000)
    for (let i = 0; i < 3; i++) {
      const r = checkRateLimit(cfg, state, 1000)
      expect(r.allowed).toBe(true)
      state = r.state
    }
    const r = checkRateLimit(cfg, state, 1000)
    expect(r.allowed).toBe(false)
    // next second window resets
    const rNext = checkRateLimit(cfg, state, 2000)
    expect(rNext.allowed).toBe(true)
  })
})
