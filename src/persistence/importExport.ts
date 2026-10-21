import type { Architecture, MetricsSnapshot, SimRequestRecord } from '../domain/types'
import { validateImportedArchitecture } from '../domain/validation'
import { normalizeArchitecture } from './storage'

export function exportArchitectureJson(arch: Architecture): string {
  return JSON.stringify(arch, null, 2)
}

export interface ImportResult {
  ok: boolean
  architecture: Architecture | null
  issues: { level: 'error' | 'warning'; message: string }[]
}

export function importArchitectureJson(text: string): ImportResult {
  let doc: unknown
  try {
    doc = JSON.parse(text)
  } catch (e) {
    return { ok: false, architecture: null, issues: [{ level: 'error', message: `Invalid JSON: ${(e as Error).message}` }] }
  }
  const check = validateImportedArchitecture(doc)
  if (!check.ok) return { ok: false, architecture: null, issues: check.issues }
  return { ok: true, architecture: normalizeArchitecture(doc as Architecture), issues: check.issues }
}

export function downloadText(filename: string, text: string, mime = 'application/json'): void {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function csvEscape(v: unknown): string {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function metricsToCsv(samples: MetricsSnapshot['samples']): string {
  const header = 'time_s,rps,succeeded_per_s,failed_per_s,avg_latency_ms,p95_latency_ms,total_queued,avg_utilization'
  const rows = samples.map((s) =>
    [s.time, s.rps, s.succeeded, s.failed, s.avgLatency, s.p95Latency, s.totalQueued, s.avgUtilization].map(csvEscape).join(','),
  )
  return [header, ...rows].join('\n')
}

export function requestsToCsv(requests: SimRequestRecord[]): string {
  const header = 'id,method,path,client,gateway,service,route_id,status,latency_ms,retries,failure_reason'
  const rows = requests.map((r) =>
    [
      r.id,
      r.method,
      r.path,
      r.clientId,
      r.gatewayId ?? '',
      r.serviceId ?? '',
      r.routeId ?? '',
      r.statusCode ?? '',
      r.completionTime != null ? (r.completionTime - r.arrivalTime).toFixed(1) : '',
      r.retries,
      r.failureReason ?? '',
    ]
      .map(csvEscape)
      .join(','),
  )
  return [header, ...rows].join('\n')
}
