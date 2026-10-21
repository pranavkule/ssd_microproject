import type { Architecture } from '../domain/types'
import { createDefaultArchitecture } from '../domain/defaults'
import { validateImportedArchitecture } from '../domain/validation'
import { FALLBACK_CASE_STUDY } from '../content/defaultCaseStudy'
import { diagramToArchitecture } from '../content/caseStudy'

const STORAGE_KEY = 'breakscale.architectures.v1'
const LAST_KEY = 'breakscale.last.v1'

export interface SavedArchitecture {
  id: string
  name: string
  savedAt: string
  architecture: Architecture
}

export function listSaved(): SavedArchitecture[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SavedArchitecture[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveArchitecture(arch: Architecture): SavedArchitecture {
  const all = listSaved().filter((s) => s.id !== arch.id)
  const entry: SavedArchitecture = {
    id: arch.id,
    name: arch.name,
    savedAt: new Date().toISOString(),
    architecture: structuredClone(arch),
  }
  all.unshift(entry)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all.slice(0, 30)))
  localStorage.setItem(LAST_KEY, JSON.stringify(entry))
  return entry
}

export function deleteSaved(id: string): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(listSaved().filter((s) => s.id !== id)))
}

export function loadLastOrDefault(): { architecture: Architecture; restored: boolean } {
  try {
    const raw = localStorage.getItem(LAST_KEY)
    if (raw) {
      const entry = JSON.parse(raw) as SavedArchitecture
      const check = validateImportedArchitecture(entry.architecture)
      if (check.ok) return { architecture: normalizeArchitecture(entry.architecture), restored: true }
    }
  } catch {
    /* fall through to default */
  }
  return { architecture: createStarterArchitecture(), restored: false }
}

/** The case-study starter diagram, used as the initial canvas on a fresh visit. */
export function createStarterArchitecture(): Architecture {
  return diagramToArchitecture(FALLBACK_CASE_STUDY, FALLBACK_CASE_STUDY.starterDiagram, 'starter')
}

export function normalizeArchitecture(input: Architecture): Architecture {
  const base = createDefaultArchitecture()
  return {
    id: typeof input.id === 'string' && input.id ? input.id : base.id,
    name: typeof input.name === 'string' && input.name ? input.name : base.name,
    description: typeof input.description === 'string' ? input.description : base.description,
    nodes: input.nodes,
    edges: input.edges,
    annotations: Array.isArray(input.annotations) ? input.annotations : [],
    routing: {
      draftRules: input.routing?.draftRules ?? base.routing.draftRules,
      versions: input.routing?.versions?.length ? input.routing.versions : base.routing.versions,
      publishedVersion: input.routing?.publishedVersion ?? base.routing.publishedVersion,
      propagationDelayMs: input.routing?.propagationDelayMs ?? base.routing.propagationDelayMs,
      fallbackRouteId: input.routing?.fallbackRouteId ?? null,
    },
    settings: {
      seed: input.settings?.seed ?? base.settings.seed,
      tickMs: input.settings?.tickMs ?? base.settings.tickMs,
      maxSimSeconds: input.settings?.maxSimSeconds ?? base.settings.maxSimSeconds,
      sampleIntervalMs: input.settings?.sampleIntervalMs ?? base.settings.sampleIntervalMs,
    },
  }
}
