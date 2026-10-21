import type { HttpMethod, RouteRule } from './types'

/**
 * Convert a path pattern to a matcher.
 * - exact: "/users" matches only "/users"
 * - prefix: "/users" matches "/users", "/users/123", "/users/123/posts"
 * Supports a single trailing wildcard segment: "/users/*" behaves like prefix "/users".
 */
export function normalizePath(path: string): string {
  let p = path.trim()
  if (!p.startsWith('/')) p = '/' + p
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1)
  return p
}

export function pathMatches(pattern: string, path: string, matchType: 'exact' | 'prefix'): boolean {
  const p = normalizePath(pattern)
  const target = normalizePath(path)

  if (p.endsWith('/*')) {
    const base = p.slice(0, -2)
    if (base === '') return true
    return target === base || target.startsWith(base + '/')
  }
  if (p === '/*' || p === '/') {
    return matchType === 'prefix'
  }
  if (matchType === 'exact') {
    return target === p
  }
  return target === p || target.startsWith(p + '/')
}

export function methodMatches(allowed: HttpMethod[], method: HttpMethod): boolean {
  if (!allowed || allowed.length === 0) return true
  if (allowed.includes('ANY')) return true
  return allowed.includes(method)
}

export function specificity(rule: RouteRule): number {
  const p = normalizePath(rule.path)
  const wildcardBonus = p.endsWith('/*') ? 0 : 10
  return rule.priority * 1000 + p.length * 10 + wildcardBonus
}

export interface RouteMatch {
  rule: RouteRule
  kind: 'match' | 'fallback'
}

/**
 * Select the best matching route for a request.
 * Rules are filtered by enabled, method, then ordered by priority (desc),
 * then path length (desc), then exact-before-prefix.
 * Returns null when nothing matches and no fallback is enabled.
 */
export function matchRoute(
  rules: RouteRule[],
  path: string,
  method: HttpMethod,
  fallbackRuleId?: string | null,
): RouteMatch | null {
  const candidates = rules.filter(
    (r) => r.enabled && r.id !== fallbackRuleId && methodMatches(r.methods, method) && pathMatches(r.path, path, r.matchType),
  )

  if (candidates.length > 0) {
    candidates.sort((a, b) => specificity(b) - specificity(a) || a.id.localeCompare(b.id))
    return { rule: candidates[0], kind: 'match' }
  }

  if (fallbackRuleId) {
    const fb = rules.find((r) => r.id === fallbackRuleId)
    if (fb && fb.enabled) return { rule: fb, kind: 'fallback' }
  }
  return null
}

export function validateRuleSyntax(rule: RouteRule): string | null {
  if (!rule.path || rule.path.trim() === '') return 'Path pattern is required'
  if (!rule.path.startsWith('/')) return 'Path must start with "/"'
  if (rule.path.includes('*') && !rule.path.endsWith('/*') && rule.path !== '/*') {
    return 'Wildcard "*" is only supported as the final segment (e.g. /users/*)'
  }
  if (rule.matchType === 'exact' && rule.path.includes('*')) {
    return 'Exact matches cannot contain "*"'
  }
  if (!rule.methods || rule.methods.length === 0) return 'At least one HTTP method is required'
  if (!rule.destinationId) return 'A destination service is required'
  return null
}
