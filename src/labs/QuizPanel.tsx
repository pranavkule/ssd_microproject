import { useState } from 'react'
import { useCaseStudy } from '../content/CaseStudyContext'
import { EmptyState } from '../components/ui'
import { HelpCircle, GraduationCap } from 'lucide-react'

/** Standalone quiz tab: one expandable card per case-study question. */
export function QuizPanel() {
  const caseStudy = useCaseStudy().caseStudy
  const [open, setOpen] = useState<number | null>(null)

  if (!caseStudy) return null
  if (caseStudy.quiz.length === 0) {
    return <EmptyState icon={<GraduationCap size={30} />} title="No quiz for this case study" />
  }

  return (
    <div className="thin-scroll h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-app-900 dark:text-app-50">Check your understanding</h2>
          <p className="text-xs text-app-500 dark:text-app-400">
            {caseStudy.quiz.length} questions on the {caseStudy.title} design.
          </p>
        </div>
        <ul className="space-y-2">
          {caseStudy.quiz.map((item, i) => (
            <li key={i} className="rounded-lg border border-app-200 bg-white dark:border-app-700 dark:bg-app-800">
              <button
                type="button"
                onClick={() => setOpen(open === i ? null : i)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-app-800 dark:text-app-100"
              >
                <HelpCircle size={14} className="shrink-0 text-accent-500" />
                <span className="min-w-0 flex-1">{item.q}</span>
              </button>
              {open === i && (
                <div className="border-t border-app-100 px-3 py-2 text-xs text-app-600 dark:border-app-800 dark:text-app-300">
                  {item.a}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
