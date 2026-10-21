import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { CaseStudy, CaseStudyManifestEntry } from './caseStudy'
import { loadCaseStudy, loadCaseStudyManifest } from './loader'
import { DEFAULT_CASE_STUDY_ID, FALLBACK_CASE_STUDY } from './defaultCaseStudy'
import { CaseStudyContext, type CaseStudyContextValue } from './CaseStudyContext'
import { useApp } from '../state/store'

export function CaseStudyProvider({ children }: { children: ReactNode }) {
  const caseStudyId = useApp((s) => s.caseStudyId)
  const setCaseStudyId = useApp((s) => s.setCaseStudyId)

  const [manifest, setManifest] = useState<CaseStudyManifestEntry[]>([])
  const [caseStudy, setCaseStudy] = useState<CaseStudy | null>(FALLBACK_CASE_STUDY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const m = await loadCaseStudyManifest()
        if (cancelled) return
        setManifest(m.caseStudies)
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const entry = manifest.find((m) => m.id === caseStudyId)
    void (async () => {
      try {
        const cs = entry ? await loadCaseStudy(entry) : await loadCaseStudy(caseStudyId)
        if (cancelled) return
        setCaseStudy(cs)
        setError(null)
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [caseStudyId, manifest])

  const select = useCallback(
    (id: string) => {
      setCaseStudyId(id)
    },
    [setCaseStudyId],
  )

  const value = useMemo<CaseStudyContextValue>(
    () => ({
      manifest,
      caseStudy,
      loading,
      error,
      selectedId: caseStudyId || DEFAULT_CASE_STUDY_ID,
      select,
    }),
    [manifest, caseStudy, loading, error, caseStudyId, select],
  )

  return <CaseStudyContext.Provider value={value}>{children}</CaseStudyContext.Provider>
}
