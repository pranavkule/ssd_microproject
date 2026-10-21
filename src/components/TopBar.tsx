import { useRef, useState } from 'react'
import {
  Play,
  Pause,
  RotateCcw,
  Save,
  FolderOpen,
  Upload,
  Download,
  Undo2,
  Redo2,
  Plus,
  Sun,
  Moon,
  Share2,
  Activity,
  PanelLeft,
  PanelRight,
  MoreHorizontal,
} from 'lucide-react'
import { useApp } from '../state/store'
import { Button, cx, Divider } from './ui'
import { buildShareUrl } from '../persistence/shareUrl'

/** Student-facing build: hides authoring-only actions (New / Save / Load / Import / Share). */
export const studentMode = true

export function TopBar() {
  const architecture = useApp((s) => s.architecture)
  const status = useApp((s) => s.status)
  const speed = useApp((s) => s.speed)
  const completedRequests = useApp((s) => s.metrics.completed)
  const latencyP99 = useApp((s) => s.metrics.latencyP99)
  const canUndo = useApp((s) => s.undo.past.length > 0)
  const canRedo = useApp((s) => s.undo.future.length > 0)
  const theme = useApp((s) => s.theme)
  const run = useApp((s) => s.run)
  const pause = useApp((s) => s.pause)
  const resume = useApp((s) => s.resume)
  const resetSim = useApp((s) => s.resetSim)
  const undoAction = useApp((s) => s.undoAction)
  const redoAction = useApp((s) => s.redoAction)
  const save = useApp((s) => s.save)
  const exportJson = useApp((s) => s.exportJson)
  const importJson = useApp((s) => s.importJson)
  const setTheme = useApp((s) => s.setTheme)
  const setSpeed = useApp((s) => s.setSpeed)
  const setOfferedLoad = useApp((s) => s.setOfferedLoad)
  const leftPanelOpen = useApp((s) => s.leftPanelOpen)
  const rightPanelOpen = useApp((s) => s.rightPanelOpen)
  const setLeftPanelOpen = useApp((s) => s.setLeftPanelOpen)
  const setRightPanelOpen = useApp((s) => s.setRightPanelOpen)
  const setToast = useApp((s) => s.setToast)
  const resetToDefault = useApp((s) => s.resetToDefault)
  const refreshSaved = useApp((s) => s.refreshSaved)
  const savedList = useApp((s) => s.savedList)
  const load = useApp((s) => s.load)

  const clientNodes = architecture.nodes.filter((node) => node.data.type === 'client')
  const offeredLoad = clientNodes.reduce((total, node) => {
    const config = node.data.config as { requestRate: number }
    return total + config.requestRate
  }, 0)
  const loadPosition = Math.round((Math.log(Math.max(1, Math.min(5000, offeredLoad))) / Math.log(5000)) * 1000)

  const fileRef = useRef<HTMLInputElement>(null)
  const [loadOpen, setLoadOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  const onImportFile = async (file: File | undefined): Promise<void> => {
    if (!file) return
    const text = await file.text()
    importJson(text)
  }

  const onShare = async (): Promise<void> => {
    const url = buildShareUrl(useApp.getState().architecture)
    try {
      await navigator.clipboard.writeText(url)
      setToast({ kind: 'success', message: 'Share URL copied to clipboard.' })
    } catch {
      setToast({ kind: 'info', message: 'Share URL generated (copy it from the address bar after loading).' })
      window.history.replaceState({}, '', url)
    }
  }

  const statusChip: Record<string, { label: string; cls: string }> = {
    idle: { label: 'Idle', cls: 'bg-app-100 text-app-600 dark:bg-app-800 dark:text-app-300' },
    running: { label: 'Running', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300' },
    paused: { label: 'Paused', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300' },
    finished: { label: 'Finished', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300' },
  }
  const chip = statusChip[status]

  return (
    <header className="relative flex h-14 shrink-0 items-center gap-2 overflow-x-auto border-b border-app-200 bg-white px-3 dark:border-app-700 dark:bg-app-900">
      {/* Run / Reset — always first and always visible. */}
      <div className="flex shrink-0 items-center gap-1">
        {status === 'running' ? (
          <Button size="sm" variant="secondary" onClick={pause} title="Pause simulation">
            <Pause size={13} /> Pause
          </Button>
        ) : status === 'paused' ? (
          <Button size="sm" variant="primary" onClick={resume} title="Resume simulation">
            <Play size={13} /> Resume
          </Button>
        ) : (
          <Button size="sm" variant="primary" onClick={run} title="Run simulation">
            <Play size={13} /> Run
          </Button>
        )}
        <Button size="sm" variant="secondary" onClick={resetSim} title="Reset simulation (keeps architecture)">
          <RotateCcw size={13} /> Reset
        </Button>
        <span className={cx('hidden items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide xl:flex', chip.cls)}>
          <span className={cx('h-1.5 w-1.5 rounded-full bg-current', status === 'running' && 'animate-pulse')} />
          {chip.label}
        </span>
      </div>

      <Divider />

      {/* Primary simulation controls — visible from 1100px up. */}
      <div className="hidden min-[1100px]:flex min-[1100px]:items-center min-[1100px]:gap-2">
        <div className="flex items-center gap-1 rounded-md border border-app-200 px-1 py-0.5 dark:border-app-700">
          <Activity size={12} className="mx-1 text-app-400" />
          {[1, 2, 4, 8].map((sp) => (
            <button
              key={sp}
              type="button"
              onClick={() => setSpeed(sp)}
              className={cx(
                'rounded px-1.5 py-0.5 text-[10px] font-semibold',
                speed === sp ? 'bg-accent-600 text-white' : 'text-app-500 hover:bg-app-100 dark:hover:bg-app-800',
              )}
              title={`Run ${sp}× faster`}
            >
              {sp}×
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 rounded-md border border-app-200 px-2.5 py-1 dark:border-app-700">
          <div className="min-w-20">
            <div className="text-[9px] font-semibold uppercase tracking-wide text-app-400">Offered load</div>
            <div className="whitespace-nowrap font-mono text-sm font-semibold leading-tight text-app-900 dark:text-app-50">
              {Math.round(offeredLoad).toLocaleString()}
              <span className="ml-1 font-sans text-[10px] font-medium text-app-500 dark:text-app-400">req/s</span>
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={1000}
            step={1}
            value={loadPosition}
            disabled={clientNodes.length === 0}
            onChange={(event) => setOfferedLoad(Math.round(Math.exp((Number(event.target.value) / 1000) * Math.log(5000))))}
            aria-label="Offered load in requests per second"
            className="block h-4 w-32 cursor-pointer accent-accent-500 disabled:cursor-not-allowed disabled:opacity-40"
          />
        </div>

        <div className="min-w-20 px-1 text-right">
          <div className="text-[9px] font-semibold uppercase tracking-wide text-app-400">System P99</div>
          <div
            title="End-to-end P99 latency for completed requests. It may stay flat while the rate limiter prevents downstream congestion."
            className="whitespace-nowrap font-mono text-lg font-bold leading-tight text-app-900 dark:text-app-50"
          >
            {completedRequests > 0 ? `${latencyP99.toFixed(0)}ms` : '—'}
          </div>
        </div>
      </div>

      {/* Spacer pushes the trailing tools to the right. */}
      <div className="min-w-2 flex-1" />

      {/* Secondary / authoring controls — collapse into "…" below 1100px. */}
      <div className="hidden shrink-0 items-center gap-1 min-[1100px]:flex">
        {!studentMode && (
          <>
            <Button size="sm" variant="ghost" title="New architecture (reset to default)" onClick={resetToDefault}>
              <Plus size={13} /> New
            </Button>
            <Button size="sm" variant="ghost" title="Save architecture to this browser" onClick={save}>
              <Save size={13} /> Save
            </Button>
            <Button size="sm" variant="ghost" title="Load a saved architecture" onClick={() => { refreshSaved(); setLoadOpen((v) => !v) }}>
              <FolderOpen size={13} /> Load
            </Button>
            <Button size="sm" variant="ghost" title="Import architecture from JSON file" onClick={() => fileRef.current?.click()}>
              <Upload size={13} /> Import
            </Button>
          </>
        )}
        <Button size="sm" variant="ghost" title="Export architecture as JSON" onClick={exportJson}>
          <Download size={13} /> Export
        </Button>
        {!studentMode && (
          <Button size="sm" variant="ghost" title="Copy shareable scenario URL" onClick={() => void onShare()}>
            <Share2 size={13} /> Share
          </Button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => void onImportFile(e.target.files?.[0])}
      />

      <div className="flex shrink-0 items-center gap-1">
        <Button size="sm" variant="ghost" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undoAction}>
          <Undo2 size={13} />
        </Button>
        <Button size="sm" variant="ghost" title="Redo (Ctrl+Y)" disabled={!canRedo} onClick={redoAction}>
          <Redo2 size={13} />
        </Button>
      </div>

      <Divider />

      <div className="flex shrink-0 items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        >
          {theme === 'light' ? <Moon size={13} /> : <Sun size={13} />}
        </Button>
        <Button size="sm" variant="ghost" title="Toggle component palette" onClick={() => setLeftPanelOpen(!leftPanelOpen)} active={leftPanelOpen}>
          <PanelLeft size={13} />
        </Button>
        <Button size="sm" variant="ghost" title="Toggle configuration panel" onClick={() => setRightPanelOpen(!rightPanelOpen)} active={rightPanelOpen}>
          <PanelRight size={13} />
        </Button>

        {/* Overflow menu for narrow (<1100px) viewports. */}
        <div className="relative min-[1100px]:hidden">
          <Button size="sm" variant="ghost" title="More controls" onClick={() => setMoreOpen((v) => !v)}>
            <MoreHorizontal size={15} />
          </Button>
          {moreOpen && (
            <div className="absolute right-0 top-9 z-50 w-56 rounded-lg border border-app-200 bg-white p-2 shadow-xl dark:border-app-700 dark:bg-app-800">
              <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-app-400">Speed</div>
              <div className="flex items-center gap-1 px-1 pb-2">
                {[1, 2, 4, 8].map((sp) => (
                  <button
                    key={sp}
                    type="button"
                    onClick={() => setSpeed(sp)}
                    className={cx(
                      'flex-1 rounded px-1.5 py-1 text-[11px] font-semibold',
                      speed === sp ? 'bg-accent-600 text-white' : 'text-app-500 hover:bg-app-100 dark:hover:bg-app-700',
                    )}
                  >
                    {sp}×
                  </button>
                ))}
              </div>
              <div className="border-t border-app-100 px-1 pt-2 dark:border-app-700">
                <div className="pb-1 text-[10px] font-semibold uppercase tracking-wide text-app-400">Offered load</div>
                <input
                  type="range"
                  min={0}
                  max={1000}
                  step={1}
                  value={loadPosition}
                  disabled={clientNodes.length === 0}
                  onChange={(event) => setOfferedLoad(Math.round(Math.exp((Number(event.target.value) / 1000) * Math.log(5000))))}
                  aria-label="Offered load in requests per second"
                  className="block h-4 w-full cursor-pointer accent-accent-500 disabled:opacity-40"
                />
              </div>
              <div className="mt-1 flex items-center gap-1 border-t border-app-100 px-1 pt-2 dark:border-app-700">
                <Button size="sm" variant="ghost" onClick={exportJson}>
                  <Download size={13} /> Export
                </Button>
                {!studentMode && (
                  <Button size="sm" variant="ghost" onClick={save}>
                    <Save size={13} /> Save
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {loadOpen && (
        <div className="absolute left-3 top-14 z-50 w-80 rounded-lg border border-app-200 bg-white p-2 shadow-xl dark:border-app-700 dark:bg-app-800">
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="text-xs font-semibold text-app-700 dark:text-app-200">Saved scenarios</span>
            <Button size="sm" variant="ghost" onClick={() => setLoadOpen(false)}>
              ✕
            </Button>
          </div>
          <div className="thin-scroll max-h-64 overflow-y-auto">
            {savedList.length === 0 ? (
              <p className="px-1 py-3 text-xs text-app-400">Nothing saved yet. Use Save to store this architecture in your browser.</p>
            ) : (
              savedList.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-2 rounded px-1 py-1.5 hover:bg-app-50 dark:hover:bg-app-700"
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => {
                      load(s.id)
                      setLoadOpen(false)
                    }}
                  >
                    <div className="truncate text-xs font-medium text-app-800 dark:text-app-100">{s.name}</div>
                    <div className="text-[10px] text-app-400">{new Date(s.savedAt).toLocaleString()}</div>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </header>
  )
}
