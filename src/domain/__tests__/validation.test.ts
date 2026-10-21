import { describe, expect, test } from 'vitest'
import { validateConfig } from '../validation'
import type { ComponentConfigMap } from '../types'

describe('validation', () => {
  test('client requires non-empty request mix with positive total', () => {
    const cfg = {
      requestRate: 10,
      requestMix: [],
      timeoutMs: 1000,
      burst: 0,
    } as ComponentConfigMap['client']
    const issues = validateConfig('client', cfg)
    expect(issues.some((i) => i.field === 'requestMix')).toBe(true)
  })

  test('gateway auth failure rate is 0-100', () => {
    const cfg = {
      instanceName: 'gw',
      capacity: 10,
      serviceTimeMs: 5,
      queueLimit: 100,
      authEnabled: true,
      authFailureRate: 120,
      timeoutMs: 1000,
      maxRetries: 1,
    } as ComponentConfigMap['gateway']
    const issues = validateConfig('gateway', cfg)
    expect(issues.some((i) => i.message.toLowerCase().includes('≤ 100'))).toBe(true)
  })
})
