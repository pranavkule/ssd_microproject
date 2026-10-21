import { useEffect, useState, type ReactNode } from 'react'
import { useApp } from '../state/store'
import { TopBar } from '../components/TopBar'
import { Palette } from '../components/Palette'
import { FlowCanvas } from '../components/FlowCanvas'
import { ConfigPanel } from '../components/ConfigPanel'
import { MonitorPanel } from '../components/MonitorPanel'
import { cx } from '../components/ui'
import { CheckCircle2, Info, AlertTriangle, XCircle } from 'lucide-react'

const MOBILE_BREAKPOINT = 900

/**
 * The interactive simulator body: toolbar, palette, canvas, configuration panel
 * and the collapsible results panel. The whole thing is a flex column at the
 * viewport height so the canvas always gets the remaining space and the page
 * itself never scrolls.
 */
export function SimulatorApp({ caseBar }: { caseBar?: ReactNode }) {
  const theme = useApp((s) => s.theme)
  const leftOpen = useApp((s) => s.leftPanelOpen)
  const rightOpen = useApp((s) => s.rightPanelOpen)
  const toast = useApp((s) => s.toast)
  const isNarrow = useIsNarrow()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.style.colorScheme = theme
  }, [theme])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const s = useApp.getState()
      const target = e.target as HTMLElement | null
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        s.undoAction()
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault()
        s.redoAction()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        s.save()
      } else if (!typing && e.key === ' ') {
        e.preventDefault()
        if (s.status === 'running') s.pause()
        else if (s.status === 'paused') s.resume()
        else s.run()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => useApp.getState().setToast(null), 4200)
    return () => clearTimeout(t)
  }, [toast])

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-app-100 dark:bg-app-950">
      {caseBar}
      <TopBar />

      <div className="flex min-h-[420px] flex-1 overflow-hidden">
        {/* On wide screens the palette / config panel are inline columns. */}
        {!isNarrow && leftOpen && <Palette />}
        <main className="relative min-w-0 flex-1">
          <FlowCanvas />
        </main>
        {!isNarrow && rightOpen && <ConfigPanel />}
      </div>

      {isNarrow && (
        <MobileSheets leftOpen={leftOpen} rightOpen={rightOpen} />
      )}

      <MonitorPanel />

      {toast && (
        <div
          className={cx(
            'fixed bottom-4 right-4 z-50 flex max-w-md items-start gap-2 rounded-lg border px-3 py-2 text-xs shadow-xl',
            toast.kind === 'success' && 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
            toast.kind === 'error' && 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200',
            toast.kind === 'info' && 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200',
          )}
        >
          {toast.kind === 'success' && <CheckCircle2 size={14} className="mt-px shrink-0" />}
          {toast.kind === 'error' && <XCircle size={14} className="mt-px shrink-0" />}
          {toast.kind === 'info' && (toast.message.toLowerCase().includes('fail') ? <AlertTriangle size={14} className="mt-px shrink-0" /> : <Info size={14} className="mt-px shrink-0" />)}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  )
}

/** Below 900px the palette and config panel slide up as bottom drawers. */
function MobileSheets({ leftOpen, rightOpen }: { leftOpen: boolean; rightOpen: boolean }) {
  const setLeftPanelOpen = useApp((s) => s.setLeftPanelOpen)
  const setRightPanelOpen = useApp((s) => s.setRightPanelOpen)

  return (
    <>
      {leftOpen && (
        <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-h-[70dvh] w-full overflow-hidden rounded-t-xl border-t border-app-200 bg-white shadow-2xl dark:border-app-700 dark:bg-app-900">
          <div className="flex items-center justify-between border-b border-app-100 px-3 py-1.5 dark:border-app-800">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-app-500 dark:text-app-400">Components</span>
            <button type="button" onClick={() => setLeftPanelOpen(false)} className="text-[11px] text-app-400 hover:text-app-700 dark:hover:text-app-200">
              Close
            </button>
          </div>
          <div className="max-h-[60dvh] overflow-y-auto">
            <Palette fluid />
          </div>
        </div>
      )}
      {rightOpen && (
        <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-h-[70dvh] w-full overflow-hidden rounded-t-xl border-t border-app-200 bg-white shadow-2xl dark:border-app-700 dark:bg-app-900">
          <div className="flex items-center justify-between border-b border-app-100 px-3 py-1.5 dark:border-app-800">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-app-500 dark:text-app-400">Configuration</span>
            <button type="button" onClick={() => setRightPanelOpen(false)} className="text-[11px] text-app-400 hover:text-app-700 dark:hover:text-app-200">
              Close
            </button>
          </div>
          <div className="max-h-[60dvh] overflow-y-auto">
            <ConfigPanel sheet />
          </div>
        </div>
      )}
    </>
  )
}

/** Track the sub-900px breakpoint without pulling in a media-query library. */
function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT)
  useEffect(() => {
    const onResize = (): void => setNarrow(window.innerWidth < MOBILE_BREAKPOINT)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return narrow
}
