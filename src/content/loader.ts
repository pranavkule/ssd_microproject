import type { CaseStudy, CaseStudyManifest, CaseStudyManifestEntry } from './caseStudy'

/**
 * Content is served from `public/content/**` and fetched at runtime so it can be
 * edited without rebuilding and so the app works when embedded in an iframe.
 * `import.meta.env.BASE_URL` keeps the paths correct under a sub-path deploy.
 */
function contentUrl(path: string): string {
  const base = import.meta.env.BASE_URL ?? '/'
  const trimmed = path.replace(/^\/+/, '')
  return `${base}${trimmed}`
}

export async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(contentUrl(path))
  if (!res.ok) throw new Error(`Failed to load ${path} (HTTP ${res.status})`)
  return (await res.json()) as T
}

export async function fetchText(path: string): Promise<string> {
  const res = await fetch(contentUrl(path))
  if (!res.ok) throw new Error(`Failed to load ${path} (HTTP ${res.status})`)
  return res.text()
}

export function loadCaseStudyManifest(): Promise<CaseStudyManifest> {
  return fetchJson<CaseStudyManifest>('content/case-studies/index.json')
}

export function loadCaseStudy(entry: CaseStudyManifestEntry | string): Promise<CaseStudy> {
  const path = typeof entry === 'string' ? `content/case-studies/${entry}.json` : entry.path
  return fetchJson<CaseStudy>(path)
}

export function loadTabMarkdown(tabId: string): Promise<string> {
  return fetchText(`content/tabs/${tabId}.md`)
}

export function loadTabJson<T>(tabId: string): Promise<T> {
  return fetchJson<T>(`content/tabs/${tabId}.json`)
}
