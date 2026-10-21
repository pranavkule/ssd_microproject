import type { Architecture } from '../domain/types'
import { importArchitectureJson } from './importExport'
import { normalizeArchitecture } from './storage'

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(encoded: string): string {
  const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(b64)
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/** Compact share payload: only what is needed to rebuild the scenario. */
export function encodeShareUrl(arch: Architecture): string {
  const payload = {
    v: 1,
    n: arch.name,
    d: arch.description,
    nodes: arch.nodes,
    edges: arch.edges,
    annotations: arch.annotations,
    r: {
      dr: arch.routing.draftRules,
      pv: arch.routing.publishedVersion,
      pd: arch.routing.propagationDelayMs,
      fb: arch.routing.fallbackRouteId,
      vs: arch.routing.versions.slice(-10),
    },
    s: arch.settings,
  }
  return toBase64Url(JSON.stringify(payload))
}

export function buildShareUrl(arch: Architecture): string {
  const base = window.location.href.split('?')[0].split('#')[0]
  return `${base}?scenario=${encodeShareUrl(arch)}`
}

export function readShareUrl(): Architecture | null {
  const params = new URLSearchParams(window.location.search)
  const encoded = params.get('scenario')
  if (!encoded) return null
  try {
    const json = fromBase64Url(encoded)
    const doc = JSON.parse(json) as Record<string, unknown>
    const arch: Architecture = {
      id: `share-${Date.now()}`,
      name: String(doc.n ?? 'Shared scenario'),
      description: String(doc.d ?? ''),
      nodes: doc.nodes as Architecture['nodes'],
      edges: doc.edges as Architecture['edges'],
      annotations: Array.isArray(doc.annotations) ? doc.annotations as Architecture['annotations'] : [],
      routing: {
        draftRules: (doc.r as Record<string, unknown>)?.dr as Architecture['routing']['draftRules'],
        versions: (doc.r as Record<string, unknown>)?.vs as Architecture['routing']['versions'],
        publishedVersion: Number((doc.r as Record<string, unknown>)?.pv ?? 1),
        propagationDelayMs: Number((doc.r as Record<string, unknown>)?.pd ?? 2000),
        fallbackRouteId: ((doc.r as Record<string, unknown>)?.fb as string | null) ?? null,
      },
      settings: doc.s as Architecture['settings'],
    }
    const check = importArchitectureJson(JSON.stringify(arch))
    if (check.ok && check.architecture) return normalizeArchitecture(check.architecture)
    return null
  } catch {
    return null
  }
}

export function clearShareParam(): void {
  const url = new URL(window.location.href)
  url.searchParams.delete('scenario')
  window.history.replaceState({}, '', url.toString())
}
