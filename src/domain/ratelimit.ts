import type { RateLimiterConfig } from './types'

export interface RateLimitState {
  tokens: number
  lastRefillMs: number
  windowStartMs: number
  windowCount: number
  keyState: Record<string, { tokens: number; lastRefillMs: number; windowStartMs: number; windowCount: number }>
}

export function createRateLimitState(config: RateLimiterConfig, nowMs: number): RateLimitState {
  return {
    tokens: config.burstCapacity,
    lastRefillMs: nowMs,
    windowStartMs: nowMs,
    windowCount: 0,
    keyState: {},
  }
}

interface KeyBucket {
  tokens: number
  lastRefillMs: number
  windowStartMs: number
  windowCount: number
}

function allowTokenBucket(bucket: KeyBucket, config: RateLimiterConfig, nowMs: number): boolean {
  const elapsedSec = Math.max(0, nowMs - bucket.lastRefillMs) / 1000
  bucket.tokens = Math.min(config.burstCapacity, bucket.tokens + elapsedSec * config.requestsPerSecond)
  bucket.lastRefillMs = nowMs
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1
    return true
  }
  return false
}

function allowFixedWindow(bucket: KeyBucket, config: RateLimiterConfig, nowMs: number): boolean {
  const windowSec = Math.floor(nowMs / 1000)
  if (windowSec !== bucket.windowStartMs) {
    bucket.windowStartMs = windowSec
    bucket.windowCount = 0
  }
  if (bucket.windowCount < config.requestsPerSecond) {
    bucket.windowCount += 1
    return true
  }
  return false
}

/**
 * Decide whether a request is allowed.
 * `routePath` and `clientId` are only consulted for per-route / per-client scopes.
 */
export function checkRateLimit(
  config: RateLimiterConfig,
  state: RateLimitState,
  nowMs: number,
  routePath?: string,
  clientId?: string,
): { allowed: boolean; state: RateLimitState } {
  const next: RateLimitState = {
    ...state,
    keyState: { ...state.keyState },
  }

  let effective: RateLimiterConfig = config
  let key: string | null = null

  if (config.scope === 'per-route' && routePath) {
    const rule = config.perRouteLimits.find((l) => routePath === l.path || routePath.startsWith(l.path.replace(/\/\*$/, '')))
    if (rule) {
      effective = { ...config, requestsPerSecond: rule.requestsPerSecond }
      key = `route:${rule.path}`
    }
  } else if (config.scope === 'per-client' && clientId) {
    key = `client:${clientId}`
  }

  const globalBucket: KeyBucket = {
    tokens: next.tokens,
    lastRefillMs: next.lastRefillMs,
    windowStartMs: next.windowStartMs,
    windowCount: next.windowCount,
  }

  if (key) {
    const kb: KeyBucket = next.keyState[key] ?? {
      tokens: effective.burstCapacity,
      lastRefillMs: nowMs,
      windowStartMs: Math.floor(nowMs / 1000),
      windowCount: 0,
    }
    const keyAllowed =
      effective.strategy === 'token-bucket' ? allowTokenBucket(kb, effective, nowMs) : allowFixedWindow(kb, effective, nowMs)
    next.keyState[key] = kb
    // per-key limit must also pass the global limiter
    const globalAllowed =
      config.strategy === 'token-bucket' ? allowTokenBucket(globalBucket, config, nowMs) : allowFixedWindow(globalBucket, config, nowMs)
    next.tokens = globalBucket.tokens
    next.lastRefillMs = globalBucket.lastRefillMs
    next.windowStartMs = globalBucket.windowStartMs
    next.windowCount = globalBucket.windowCount
    return { allowed: keyAllowed && globalAllowed, state: next }
  }

  const allowed =
    config.strategy === 'token-bucket' ? allowTokenBucket(globalBucket, config, nowMs) : allowFixedWindow(globalBucket, config, nowMs)
  next.tokens = globalBucket.tokens
  next.lastRefillMs = globalBucket.lastRefillMs
  next.windowStartMs = globalBucket.windowStartMs
  next.windowCount = globalBucket.windowCount
  return { allowed, state: next }
}
