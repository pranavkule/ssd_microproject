import { createContext, useContext } from 'react'
import type { CaseStudy, CaseStudyManifestEntry } from './caseStudy'

export interface CaseStudyContextValue {
  manifest: CaseStudyManifestEntry[]
  caseStudy: CaseStudy | null
  loading: boolean
  error: string | null
  selectedId: string
  select: (id: string) => void
}

export const CaseStudyContext = createContext<CaseStudyContextValue | null>(null)

export function useCaseStudy(): CaseStudyContextValue {
  const ctx = useContext(CaseStudyContext)
  if (!ctx) throw new Error('useCaseStudy must be used inside <CaseStudyProvider>')
  return ctx
}
