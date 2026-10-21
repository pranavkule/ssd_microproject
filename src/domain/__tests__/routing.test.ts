import { describe, expect, test } from 'vitest'
import { matchRoute, pathMatches } from '../routing'
import type { RouteRule } from '../types'

const baseRule = (overrides: Partial<RouteRule>): RouteRule => ({
  id: 'r1',
  path: '/users/*',
  matchType: 'prefix',
  methods: ['ANY'],
  destinationId: 'svc-users',
  priority: 10,
  enabled: true,
  ...overrides,
})

describe('path matching', () => {
  test('prefix matches subpaths', () => {
    expect(pathMatches('/users/*', '/users/42', 'prefix')).toBe(true)
    expect(pathMatches('/users/*', '/users', 'prefix')).toBe(true)
    expect(pathMatches('/products/*', '/users/42', 'prefix')).toBe(false)
  })

  test('exact matches only exact', () => {
    expect(pathMatches('/orders', '/orders', 'exact')).toBe(true)
    expect(pathMatches('/orders', '/orders/1', 'exact')).toBe(false)
  })

  test('fallback used when nothing matches', () => {
    const rules: RouteRule[] = [
      baseRule({ id: 'users', path: '/users/*', destinationId: 'svc-users' }),
    ]
    const fallback: RouteRule = baseRule({ id: 'fb', path: '/*', matchType: 'prefix', destinationId: 'svc-default', enabled: true })
    const res = matchRoute([...rules, fallback], '/search', 'GET', fallback.id)
    expect(res?.rule.id).toBe('fb')
    expect(res?.kind).toBe('fallback')
  })

  test('404 when no route and no fallback', () => {
    const res = matchRoute([], '/unknown', 'GET', null)
    expect(res).toBeNull()
  })

  test('priority selects higher priority rule', () => {
    const r1 = baseRule({ id: 'users', path: '/api/*', destinationId: 'svc-users', priority: 1 })
    const r2 = baseRule({ id: 'orders', path: '/api/orders/*', destinationId: 'svc-orders', priority: 20 })
    const res = matchRoute([r1, r2], '/api/orders/123', 'GET')
    expect(res?.rule.id).toBe('orders')
  })
})
