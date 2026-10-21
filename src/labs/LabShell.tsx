import { useEffect, useState } from 'react'
import { LAB, LAB_TABS } from '../theme/design-tokens'
import { navigate, segments, useRoute } from '../router/router'
import { useCaseStudy } from '../content/CaseStudyContext'
import { SiteNavbar } from './SiteNavbar'
import { SimulatorApp } from './SimulatorApp'
import { Markdown } from './Markdown'
import { OverviewPanel } from './OverviewPanel'
import { TaskPanel } from './TaskPanel'
import { ReferencesPanel } from './ReferencesPanel'
import { QuizPanel } from './QuizPanel'
import { loadTabMarkdown } from '../content/loader'
import { diagramToArchitecture } from '../content/caseStudy'
import { useApp } from '../state/store'
import { EmptyState } from '../components/ui'
import { cx } from '../components/ui'
import { GitBranch, Play, Sparkles, RotateCcw, FileText } from 'lucide-react'

/** Map the second URL segment to a lab tab id (defaults to `simulation`). */
function tabFromRoute(path: string): string {
  const parts = segments(path)
  const idx = parts.indexOf(LAB.id)
  const tab = idx >= 0 ? parts[idx + 1] : undefined
  return LAB_TABS.some((t) => t.id === tab) ? (tab as string) : 'simulation'
}

export function LabShell() {
  const path = useRoute()
  const tab = tabFromRoute(path)
  const { manifest, caseStudy, loading, selectedId, select } = useCaseStudy()

  useEffect(() => {
    if (!LAB_TABS.some((t) => t.id === tab)) return
    const parts = segments(path)
    if (parts[0] === 'labs' && parts[1] === LAB.id && parts.length === 2) {
      navigate(`${LAB.path}/simulation`)
    }
  }, [path, tab])

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-app-100 dark:bg-app-950">
      <SiteNavbar activeTab={tab} />

      {tab === 'simulation' ? (
        <SimulatorApp
          caseBar={
            <CaseStudyBar
              manifest={manifest}
              loading={loading}
              selectedId={selectedId}
              select={select}
              taskSummary={
                caseStudy ? `${caseStudy.tasks.length} tasks · ${caseStudy.quiz.length} questions` : ''
              }
            />
          }
        />
      ) : (
        <>
          <CaseStudyBar
            manifest={manifest}
            loading={loading}
            selectedId={selectedId}
            select={select}
            taskSummary={caseStudy ? `${caseStudy.tasks.length} tasks · ${caseStudy.quiz.length} questions` : ''}
          />
          <TabRow tab={tab} />
          <div className="min-h-0 flex-1">
            {tab === 'aim' && <MarkdownPanel tabId="overview" />}
            {tab === 'theory' && <OverviewPanel />}
            {tab === 'tasks' && <TaskPanel />}
            {tab === 'quiz' && <QuizPanel />}
            {tab === 'references' && <ReferencesPanel />}
          </div>
        </>
      )}
    </div>
  )
}

function TabRow({ tab }: { tab: string }) {
  return (
    <nav className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-app-200 bg-white px-3 dark:border-app-800 dark:bg-app-900">
      {LAB_TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => navigate(`${LAB.path}/${t.id}`)}
          className={cx(
            'relative -mb-px shrink-0 border-b-2 px-3 py-2 text-xs font-semibold transition-colors',
            t.id === tab
              ? 'border-accent-600 text-accent-700 dark:text-accent-300'
              : 'border-transparent text-app-500 hover:text-app-800 dark:text-app-400 dark:hover:text-app-200',
          )}
        >
          {t.label}
        </button>
      ))}
    </nav>
  )
}

interface CaseStudyBarProps {
  manifest: ReturnType<typeof useCaseStudy>['manifest']
  loading: boolean
  selectedId: string
  select: (id: string) => void
  taskSummary: string
}

function CaseStudyBar({ manifest, loading, selectedId, select, taskSummary }: CaseStudyBarProps) {
  const { caseStudy } = useCaseStudy()
  const loadCaseStudyDiagram = useApp((s) => s.loadCaseStudyDiagram)

  const loadStarter = (): void => {
    if (!caseStudy) return
    loadCaseStudyDiagram(diagramToArchitecture(caseStudy, caseStudy.starterDiagram, 'starter'), {
      resetHistory: true,
      message: `Loaded the starter diagram for "${caseStudy.title}".`,
    })
  }

  const loadReference = (): void => {
    if (!caseStudy || caseStudy.referenceDiagram.nodes.length === 0) return
    loadCaseStudyDiagram(diagramToArchitecture(caseStudy, caseStudy.referenceDiagram, 'reference'), {
      resetHistory: true,
      message: `Loaded the reference diagram for "${caseStudy.title}".`,
    })
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-app-200 bg-white px-3 py-2 dark:border-app-800 dark:bg-app-900">
      <GitBranch size={14} className="text-app-400" />
      <label className="text-[11px] font-medium text-app-500 dark:text-app-400" htmlFor="case-study-select">
        Case study
      </label>
      <select
        id="case-study-select"
        value={selectedId}
        onChange={(e) => select(e.target.value)}
        className="rounded-md border border-app-300 bg-white px-2 py-1 text-xs text-app-800 outline-none focus:border-accent-500 dark:border-app-600 dark:bg-app-900 dark:text-app-100"
      >
        {manifest.length === 0 && (
          <option value={selectedId}>
            #{caseStudy?.number ?? 16} · {caseStudy?.title ?? 'Loading…'}
          </option>
        )}
        {manifest.map((m) => (
          <option key={m.id} value={m.id}>
            #{m.number} · {m.title}
          </option>
        ))}
      </select>
      {loading && <span className="text-[11px] text-app-400">loading…</span>}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={loadStarter}
          className="inline-flex items-center gap-1 rounded-md border border-app-300 px-2 py-1 text-[11px] font-medium text-app-600 hover:bg-app-50 dark:border-app-600 dark:text-app-300 dark:hover:bg-app-800"
        >
          <Sparkles size={12} /> Starter
        </button>
        <button
          type="button"
          onClick={loadReference}
          disabled={!caseStudy || caseStudy.referenceDiagram.nodes.length === 0}
          className="inline-flex items-center gap-1 rounded-md border border-app-300 px-2 py-1 text-[11px] font-medium text-app-600 hover:bg-app-50 disabled:opacity-40 dark:border-app-600 dark:text-app-300 dark:hover:bg-app-800"
        >
          <RotateCcw size={12} /> Reference
        </button>
      </div>
      <span className="ml-auto hidden text-[11px] text-app-400 sm:block">{taskSummary}</span>
    </div>
  )
}

/** Aim tab: reuses the case-study overview markdown as the lab's aim/intro. */
function MarkdownPanel({ tabId }: { tabId: string }) {
  const [md, setMd] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const text = await loadTabMarkdown(tabId)
        if (!cancelled) setMd(text)
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tabId])

  return (
    <div className="thin-scroll h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-3xl">
        {error ? (
          <EmptyState icon={<FileText size={30} />} title="Could not load content" hint={error} />
        ) : (
          <Markdown source={md} />
        )}
      </div>
    </div>
  )
}

/** Placeholder used by the home route of the shared site. */
export function HomeLanding() {
  return (
    <div className="flex h-[100dvh] flex-col bg-app-100 dark:bg-app-950">
      <SiteNavbar activeTab="home" />
      <div className="thin-scroll flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-2xl font-semibold text-app-900 dark:text-app-50">System Design Studio</h1>
          <p className="mt-2 max-w-xl text-sm text-app-600 dark:text-app-300">
            Interactive labs with a deterministic distributed-systems simulator. Build an architecture, run it, break it and watch it recover.
          </p>
          <button
            type="button"
            onClick={() => navigate(`${LAB.path}/simulation`)}
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700"
          >
            <Play size={14} /> Open the {LAB.shortLabel} lab
          </button>
        </div>
      </div>
    </div>
  )
}
