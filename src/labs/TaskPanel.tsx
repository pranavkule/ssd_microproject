import { useMemo, useState } from 'react'
import { useApp } from '../state/store'
import { useCaseStudy } from '../content/CaseStudyContext'
import { checkDesignTasks } from './tasks'
import { cx, Button } from '../components/ui'
import { CheckCircle2, Circle, Sparkles, ChevronRight } from 'lucide-react'

const STRUCTURAL_IDS = ['t1', 't2', 't3', 't4']

/**
 * Case-study task checklist. `embedded` renders the compact variant used as a
 * tab inside the simulator's right panel (no quiz, tighter spacing).
 */
export function TaskPanel({ embedded = false }: { embedded?: boolean }) {
  const architecture = useApp((s) => s.architecture)
  const caseStudy = useCaseStudy().caseStudy
  const [checked, setChecked] = useState(false)

  const results = useMemo(() => checkDesignTasks(architecture), [architecture])
  const byId = useMemo(() => Object.fromEntries(results.map((r) => [r.id, r])), [results])

  if (!caseStudy) return null

  const total = caseStudy.tasks.length
  const doneCount = results.filter((r) => r.pass).length
  const passCount = structurePassCount(results)

  return (
    <div className={cx('thin-scroll h-full overflow-y-auto', embedded ? 'p-2.5' : 'p-4')}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          {!embedded && <h2 className="text-base font-semibold text-app-900 dark:text-app-50">Case study tasks</h2>}
          <p className={cx('text-app-500 dark:text-app-400', embedded ? 'text-[11px]' : 'text-xs')}>
            Build the architecture on the canvas to satisfy each task.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-app-100 px-2 py-1 text-[11px] font-semibold text-app-600 dark:bg-app-800 dark:text-app-300">
            {doneCount} / {total} done
            {!embedded && <span className="ml-1 text-app-400">· {passCount}/{STRUCTURAL_IDS.length} structural</span>}
          </span>
          <Button size="sm" variant="primary" onClick={() => setChecked(true)}>
            <Sparkles size={13} /> Check my design
          </Button>
        </div>
      </div>

      <ul className={cx(embedded ? 'space-y-1.5' : 'space-y-2')}>
        {caseStudy.tasks.map((t) => {
          const r = byId[t.id]
          const structural = STRUCTURAL_IDS.includes(t.id)
          const show = structural && (checked || r?.pass)
          const pass = r?.pass ?? false
          return (
            <li
              key={t.id}
              className={cx(
                'flex items-start gap-2 rounded-lg border',
                embedded ? 'p-2' : 'p-3',
                show && pass
                  ? 'border-emerald-300 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/30'
                  : checked && structural && !pass
                    ? 'border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/30'
                    : 'border-app-200 dark:border-app-700',
              )}
            >
              <span className="mt-0.5">
                {pass ? (
                  <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Circle size={16} className={cx('text-app-300 dark:text-app-600', checked && structural && 'text-amber-500')} />
                )}
              </span>
              <div className="min-w-0">
                <div className={cx('font-medium text-app-800 dark:text-app-100', embedded ? 'text-xs' : 'text-sm')}>{t.title}</div>
                {!embedded && <div className="mt-0.5 text-xs text-app-500 dark:text-app-400">{t.detail}</div>}
                {show && r && <div className="mt-1 font-mono text-[11px] text-app-500 dark:text-app-400">{r.evidence}</div>}
                {!structural && (
                  <div className="mt-0.5 flex items-center gap-1 text-[10px] text-app-400">
                    <ChevronRight size={10} /> verify by running
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function structurePassCount(results: { id: string; pass: boolean }[]): number {
  return results.filter((r) => STRUCTURAL_IDS.includes(r.id) && r.pass).length
}
