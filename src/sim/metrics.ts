import type { MetricsSnapshot, SimRequestRecord, TickSample } from '../domain/types'

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx]
}

export function computePercentiles(latencies: number[]): { p50: number; p95: number; p99: number; max: number; avg: number } {
  if (latencies.length === 0) return { p50: 0, p95: 0, p99: 0, max: 0, avg: 0 }
  const sorted = [...latencies].sort((a, b) => a - b)
  const avg = sorted.reduce((s, v) => s + v, 0) / sorted.length
  return {
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted[sorted.length - 1],
    avg,
  }
}

export function emptyMetrics(): MetricsSnapshot {
  return {
    generated: 0,
    accepted: 0,
    completed: 0,
    succeeded: 0,
    failed: 0,
    rateLimited: 0,
    authFailed: 0,
    timeouts: 0,
    retries: 0,
    notFound: 0,
    serviceUnavailable: 0,
    cacheHits: 0,
    cacheMisses: 0,
    statusCodes: {},
    perGateway: {},
    perService: {},
    perRoute: {},
    latencyAvg: 0,
    latencyP50: 0,
    latencyP95: 0,
    latencyP99: 0,
    latencyMax: 0,
    currentRps: 0,
    throughputRps: 0,
    errorRate: 0,
    samples: [],
  }
}

export class MetricsCollector {
  generated = 0
  accepted = 0
  completed = 0
  succeeded = 0
  failed = 0
  rateLimited = 0
  authFailed = 0
  timeouts = 0
  retries = 0
  notFound = 0
  serviceUnavailable = 0
  cacheHits = 0
  cacheMisses = 0
  statusCodes: Record<string, number> = {}
  perGateway: Record<string, number> = {}
  perService: Record<string, number> = {}
  perRoute: Record<string, number> = {}

  private latencies: number[] = []
  private latencySum = 0
  private maxLatency = 0
  private windowCompleted = 0
  private windowFailed = 0
  private windowLatencySum = 0
  private lastSampleAt = 0
  private samples: TickSample[] = []
  private readonly maxSamples = 360
  private readonly latencyWindow = 800

  recordGenerated(): void {
    this.generated++
  }

  recordAccepted(): void {
    this.accepted++
  }

  recordRateLimited(): void {
    this.rateLimited++
  }

  recordRetry(): void {
    this.retries++
  }

  recordCache(hit: boolean): void {
    if (hit) this.cacheHits++
    else this.cacheMisses++
  }

  private completeStatus(status: number): void {
    const key = String(status)
    this.statusCodes[key] = (this.statusCodes[key] ?? 0) + 1
    this.completed++
    if (status >= 200 && status < 400) this.succeeded++
    else {
      this.failed++
      this.windowFailed++
      if (status === 401) this.authFailed++
      if (status === 404) this.notFound++
      if (status === 503) this.serviceUnavailable++
      if (status === 504) this.timeouts++
    }
  }

  recordCompletion(req: SimRequestRecord): void {
    const status = req.statusCode ?? 0
    this.completeStatus(status)
    const latency = (req.completionTime ?? req.arrivalTime) - req.arrivalTime
    this.latencySum += latency
    this.windowLatencySum += latency
    this.windowCompleted++
    if (latency > this.maxLatency) this.maxLatency = latency
    this.latencies.push(latency)
    if (this.latencies.length > this.latencyWindow) this.latencies.shift()
    if (req.gatewayId) this.perGateway[req.gatewayId] = (this.perGateway[req.gatewayId] ?? 0) + 1
    if (req.serviceId) this.perService[req.serviceId] = (this.perService[req.serviceId] ?? 0) + 1
    if (req.routeId) this.perRoute[req.routeId] = (this.perRoute[req.routeId] ?? 0) + 1
  }

  maybeSample(nowMs: number, sampleIntervalMs: number, totalQueued: number, avgUtilization: number): TickSample | null {
    if (nowMs - this.lastSampleAt < sampleIntervalMs) return null
    const elapsedSec = Math.max(0.001, (nowMs - this.lastSampleAt) / 1000)
    const rps = this.windowCompleted / elapsedSec
    const failedRps = this.windowFailed / elapsedSec
    const avgLatency = this.windowCompleted > 0 ? this.windowLatencySum / this.windowCompleted : 0
    const p = computePercentiles(this.latencies)
    const sample: TickSample = {
      time: nowMs / 1000,
      rps: round2(rps),
      succeeded: round2(rps - failedRps),
      failed: round2(failedRps),
      avgLatency: round2(avgLatency),
      p95Latency: round2(p.p95),
      totalQueued,
      avgUtilization: round2(avgUtilization),
    }
    this.samples.push(sample)
    if (this.samples.length > this.maxSamples) this.samples.shift()
    this.windowCompleted = 0
    this.windowFailed = 0
    this.windowLatencySum = 0
    this.lastSampleAt = nowMs
    return sample
  }

  resetWindow(nowMs: number): void {
    this.lastSampleAt = nowMs
    this.windowCompleted = 0
    this.windowFailed = 0
    this.windowLatencySum = 0
  }

  snapshot(nowMs: number, tickMs: number): MetricsSnapshot {
    const p = computePercentiles(this.latencies)
    const windowSec = Math.max(0.001, tickMs / 1000)
    return {
      generated: this.generated,
      accepted: this.accepted,
      completed: this.completed,
      succeeded: this.succeeded,
      failed: this.failed,
      rateLimited: this.rateLimited,
      authFailed: this.authFailed,
      timeouts: this.timeouts,
      retries: this.retries,
      notFound: this.notFound,
      serviceUnavailable: this.serviceUnavailable,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      statusCodes: { ...this.statusCodes },
      perGateway: { ...this.perGateway },
      perService: { ...this.perService },
      perRoute: { ...this.perRoute },
      latencyAvg: round2(this.completed > 0 ? this.latencySum / this.completed : 0),
      latencyP50: round2(p.p50),
      latencyP95: round2(p.p95),
      latencyP99: round2(p.p99),
      latencyMax: round2(p.max),
      currentRps: round2(this.windowCompleted / windowSec),
      throughputRps: round2(nowMs > 0 ? this.completed / (nowMs / 1000) : 0),
      errorRate: round4(this.completed > 0 ? this.failed / this.completed : 0),
      samples: [...this.samples],
    }
  }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000
}
