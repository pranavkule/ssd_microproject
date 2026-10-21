import { EXPERIMENTS, experimentById } from '../sim/experiments'
import { useApp } from '../state/store'
import { Button, cx, FieldRow, inputCls, EmptyState } from './ui'
import { FlaskConical, Play, RotateCcw, Square, CheckCircle2 } from 'lucide-react'

export function ExperimentPanel() {
  const experiment = useApp((s) => s.experiment)
  const selectExperiment = useApp((s) => s.selectExperiment)
  const setExperimentParam = useApp((s) => s.setExperimentParam)
  const runExperiment = useApp((s) => s.runExperiment)
  const stopExperiment = useApp((s) => s.stopExperiment)
  const resetExperiment = useApp((s) => s.resetExperiment)
  const status = useApp((s) => s.status)
  const metrics = useApp((s) => s.metrics)

  const def = experimentById(experiment.selectedId)

  return (
    <div className="flex h-full">
      <div className="thin-scroll w-56 shrink-0 overflow-y-auto border-r border-app-200 p-2 dark:border-app-700">
        <div className="mb-2 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-app-500">
          <FlaskConical size={12} /> Scenarios
        </div>
        {EXPERIMENTS.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => selectExperiment(e.id)}
            className={cx(
              'mb-1 w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors',
              experiment.selectedId === e.id
                ? 'bg-accent-50 font-semibold text-accent-700 ring-1 ring-accent-500 dark:bg-app-700 dark:text-accent-200'
                : 'text-app-600 hover:bg-app-50 dark:text-app-300 dark:hover:bg-app-800',
            )}
          >
            {e.name}
          </button>
        ))}
      </div>

      <div className="thin-scroll flex-1 overflow-y-auto p-3">
        {!def ? (
          <EmptyState title="Pick an experiment" />
        ) : (
          <>
            <h3 className="text-sm font-semibold text-app-900 dark:text-app-50">{def.name}</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-app-500 dark:text-app-400">{def.description}</p>

            {def.params.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {def.params.map((p) => (
                  <FieldRow key={p.key} label={p.label} unit={p.unit}>
                    <input
                      type="number"
                      min={p.min}
                      max={p.max}
                      step={p.step}
                      value={experiment.params[p.key] ?? p.default}
                      disabled={experiment.running}
                      onChange={(e) => setExperimentParam(p.key, Number(e.target.value))}
                      className={inputCls}
                    />
                  </FieldRow>
                ))}
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="primary" size="sm" onClick={runExperiment} disabled={experiment.running}>
                <Play size={12} /> Run experiment
              </Button>
              <Button variant="secondary" size="sm" onClick={stopExperiment} disabled={!experiment.running || status !== 'running'}>
                <Square size={12} /> Pause
              </Button>
              <Button variant="secondary" size="sm" onClick={resetExperiment} disabled={experiment.running}>
                <RotateCcw size={12} /> Reset scenario
              </Button>
            </div>

            {experiment.running && (
              <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-accent-600">
                <span className="h-2 w-2 animate-pulse rounded-full bg-accent-500" /> Experiment running… scheduled actions fire at their simulation timestamps.
              </p>
            )}

            {experiment.finished && def && (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/40">
                <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 size={13} /> Results summary (from live metrics)
                </div>
                <p className="text-[11px] leading-relaxed text-emerald-800 dark:text-emerald-200">{experiment.summary}</p>
              </div>
            )}

            {experiment.appliedAt && !experiment.finished && !experiment.running && (
              <p className="mt-3 text-[11px] text-app-400">Experiment applied. Press Run experiment to execute it again.</p>
            )}

            <div className="mt-4 border-t border-app-100 pt-3 dark:border-app-800">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-app-500">Live counters</div>
              <div className="grid grid-cols-4 gap-1.5 text-center">
                <Counter label="Gen" value={metrics.generated} />
                <Counter label="Done" value={metrics.completed} />
                <Counter label="OK" value={metrics.succeeded} tone="ok" />
                <Counter label="Fail" value={metrics.failed} tone="bad" />
                <Counter label="429" value={metrics.rateLimited} tone="warn" />
                <Counter label="401" value={metrics.authFailed} tone="warn" />
                <Counter label="404" value={metrics.notFound} tone="warn" />
                <Counter label="504" value={metrics.timeouts} tone="bad" />
              </div>
              <div className="mt-2 text-[11px] leading-relaxed text-app-500 dark:text-app-400">
                Latency avg <span className="font-mono">{metrics.latencyAvg}ms</span> · p95 <span className="font-mono">{metrics.latencyP95}ms</span> · p99{' '}
                <span className="font-mono">{metrics.latencyP99}ms</span> · error rate{' '}
                <span className="font-mono">{(metrics.errorRate * 100).toFixed(1)}%</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Counter({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'bad' | 'warn' }) {
  const tones = { ok: 'text-emerald-600 dark:text-emerald-400', bad: 'text-red-600 dark:text-red-400', warn: 'text-amber-600 dark:text-amber-400' }
  return (
    <div className="rounded border border-app-200 py-1 dark:border-app-700">
      <div className={cx('font-mono text-xs font-bold', tone ? tones[tone] : 'text-app-800 dark:text-app-100')}>{value}</div>
      <div className="text-[9px] uppercase text-app-400">{label}</div>
    </div>
  )
}
