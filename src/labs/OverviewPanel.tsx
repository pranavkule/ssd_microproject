import { useEffect, useState } from 'react'
import { useCaseStudy } from '../content/CaseStudyContext'
import { loadTabMarkdown } from '../content/loader'
import { Markdown } from './Markdown'
import { EmptyState } from '../components/ui'
import { FileText } from 'lucide-react'

export function OverviewPanel() {
  const caseStudy = useCaseStudy().caseStudy
  const [md, setMd] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const text = await loadTabMarkdown('overview')
        if (!cancelled) setMd(text)
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="thin-scroll h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-3xl">
        {caseStudy && (
          <div className="mb-4 rounded-lg border border-app-200 bg-white p-3 dark:border-app-700 dark:bg-app-800">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-accent-600 dark:text-accent-400">
              Case study #{caseStudy.number}
            </div>
            <h1 className="text-lg font-semibold text-app-900 dark:text-app-50">{caseStudy.title}</h1>
            <p className="mt-1 text-xs text-app-500 dark:text-app-400">{caseStudy.infrastructure}</p>
          </div>
        )}
        {error ? (
          <EmptyState icon={<FileText size={30} />} title="Could not load overview" hint={error} />
        ) : (
          <Markdown source={md} />
        )}
      </div>
    </div>
  )
}
