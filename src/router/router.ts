import { useEffect, useState } from 'react'

/**
 * Minimal, dependency-free route model.
 *
 * The site supports both hash routing (`#/labs/ssd/tasks`) — required when the app
 * is embedded in an iframe on another origin — and plain pathname routing
 * (`/labs/ssd/tasks`). The current path is read from whichever is present.
 */
export function getCurrentPath(): string {
  if (typeof window === 'undefined') return '/'
  const hash = window.location.hash
  if (hash && hash.startsWith('#/')) return hash.slice(1)
  return window.location.pathname + window.location.search
}

export function navigate(path: string): void {
  if (typeof window === 'undefined') return
  const target = path.startsWith('/') ? path : `/${path}`
  // Prefer hash navigation so the app works inside a cross-origin iframe
  // where history.pushState to arbitrary paths may be disallowed.
  window.location.hash = `#${target}`
}

/** Subscribe to hash/popstate changes and return the current path. */
export function useRoute(): string {
  const [path, setPath] = useState(getCurrentPath())
  useEffect(() => {
    const onChange = (): void => setPath(getCurrentPath())
    window.addEventListener('hashchange', onChange)
    window.addEventListener('popstate', onChange)
    return () => {
      window.removeEventListener('hashchange', onChange)
      window.removeEventListener('popstate', onChange)
    }
  }, [])
  return path
}

/** Split a path into decoded segments, e.g. `/labs/ssd/tasks` -> ['labs','ssd','tasks']. */
export function segments(path: string): string[] {
  return path
    .split('?')[0]
    .split('/')
    .filter(Boolean)
    .map((s) => decodeURIComponent(s))
}
