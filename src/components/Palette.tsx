import { useState } from 'react'
import {
  MonitorSmartphone,
  Gauge,
  Scale,
  Route,
  Boxes,
  Database,
  DatabaseZap,
  ListTodo,
  PanelTop,
  Settings2,
  KeyRound,
  Type,
  Square,
  Search,
} from 'lucide-react'
import type { CanvasAnnotation, ComponentType } from '../domain/types'
import { COMPONENT_LABELS, COMPONENT_DESCRIPTIONS } from '../domain/defaults'
import { useApp } from '../state/store'
import { useCaseStudy } from '../content/CaseStudyContext'
import { cx } from './ui'

const PALETTE: { type: ComponentType; icon: typeof Gauge; accent: string }[] = [
  { type: 'client', icon: MonitorSmartphone, accent: 'text-sky-600 bg-sky-50 dark:bg-sky-900/40 dark:text-sky-300' },
  { type: 'rateLimiter', icon: Gauge, accent: 'text-amber-600 bg-amber-50 dark:bg-amber-900/40 dark:text-amber-300' },
  { type: 'loadBalancer', icon: Scale, accent: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/40 dark:text-indigo-300' },
  { type: 'gateway', icon: Route, accent: 'text-accent-600 bg-accent-50 dark:bg-app-700 dark:text-accent-300' },
  { type: 'service', icon: Boxes, accent: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/40 dark:text-emerald-300' },
  { type: 'database', icon: Database, accent: 'text-violet-600 bg-violet-50 dark:bg-violet-900/40 dark:text-violet-300' },
  { type: 'cache', icon: DatabaseZap, accent: 'text-rose-600 bg-rose-50 dark:bg-rose-900/40 dark:text-rose-300' },
  { type: 'queue', icon: ListTodo, accent: 'text-teal-600 bg-teal-50 dark:bg-teal-900/40 dark:text-teal-300' },
  { type: 'sidecar', icon: PanelTop, accent: 'text-orange-600 bg-orange-50 dark:bg-orange-900/40 dark:text-orange-300' },
  { type: 'configStore', icon: Settings2, accent: 'text-fuchsia-600 bg-fuchsia-50 dark:bg-fuchsia-900/40 dark:text-fuchsia-300' },
  { type: 'secretManager', icon: KeyRound, accent: 'text-lime-600 bg-lime-50 dark:bg-lime-900/40 dark:text-lime-300' },
]

const ANNOTATIONS: { type: CanvasAnnotation['type']; label: string; icon: typeof Type }[] = [
  { type: 'note', label: 'Note', icon: Type },
  { type: 'section', label: 'Section', icon: Square },
]

/**
 * Left component palette. Fixed 220px column with its own scroll; the
 * "show all components" toggle is pinned at the bottom so it can never be
 * pushed off screen by a long list.
 */
export function Palette({ fluid = false }: { fluid?: boolean }) {
  const addNode = useApp((s) => s.addNode)
  const addAnnotation = useApp((s) => s.addAnnotation)
  const architecture = useApp((s) => s.architecture)
  const showAll = useApp((s) => s.paletteShowAll)
  const setShowAll = useApp((s) => s.setPaletteShowAll)
  const { caseStudy } = useCaseStudy()
  const [query, setQuery] = useState('')

  const essential = caseStudy?.essentialComponents
  const baseVisible = showAll || !essential || essential.length === 0 ? PALETTE : PALETTE.filter((p) => essential.includes(p.type))
  const hiddenCount = PALETTE.length - baseVisible.length
  const trimmed = query.trim().toLowerCase()
  const visiblePalette = trimmed
    ? baseVisible.filter((p) => COMPONENT_LABELS[p.type].toLowerCase().includes(trimmed))
    : baseVisible

  const handleDragStart = (e: React.DragEvent, type: ComponentType): void => {
    e.dataTransfer.setData('application/breakscale-component', type)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleAdd = (type: ComponentType): void => {
    const offset = (architecture.nodes.length % 6) * 30
    addNode(type, { x: 180 + offset, y: 120 + offset })
  }

  const handleAnnotationDragStart = (e: React.DragEvent, type: CanvasAnnotation['type']): void => {
    e.dataTransfer.setData('application/breakscale-annotation', type)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleAddAnnotation = (type: CanvasAnnotation['type']): void => {
    const offset = (architecture.annotations.length % 6) * 30
    addAnnotation(type, { x: 180 + offset, y: 120 + offset })
  }

  return (
    <aside
      className={cx(
        'flex shrink-0 flex-col border-r border-app-200 bg-white dark:border-app-700 dark:bg-app-900',
        fluid ? 'h-full w-full border-r-0' : 'w-[220px]',
      )}
    >
      <div className="border-b border-app-100 px-3 py-2 dark:border-app-800">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-app-500 dark:text-app-400">Components</h2>
        <div className="relative mt-1.5">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-app-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search components…"
            className="w-full rounded-md border border-app-300 bg-white py-1 pl-6 pr-2 text-[11px] text-app-800 outline-none focus:border-accent-500 dark:border-app-600 dark:bg-app-900 dark:text-app-100"
          />
        </div>
      </div>

      <div className="thin-scroll min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {visiblePalette.map(({ type, icon: Icon, accent }) => (
          <button
            key={type}
            type="button"
            draggable
            onDragStart={(e) => handleDragStart(e, type)}
            onClick={() => handleAdd(type)}
            title={COMPONENT_DESCRIPTIONS[type]}
            className="group flex w-full cursor-grab items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left hover:border-app-200 hover:bg-app-50 active:cursor-grabbing dark:hover:border-app-700 dark:hover:bg-app-800"
          >
            <span className={cx('flex h-6 w-6 shrink-0 items-center justify-center rounded', accent)}>
              <Icon size={13} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium text-app-700 dark:text-app-200">{COMPONENT_LABELS[type]}</span>
            </span>
          </button>
        ))}
        {visiblePalette.length === 0 && (
          <p className="px-1 py-3 text-center text-[11px] text-app-400">No components match “{query}”.</p>
        )}

        {!trimmed && (
          <>
            <div className="px-1 pt-2">
              <h3 className="border-t border-app-100 pt-2 text-[11px] font-semibold uppercase tracking-wide text-app-500 dark:border-app-800 dark:text-app-400">
                Annotate
              </h3>
            </div>
            {ANNOTATIONS.map(({ type, label, icon: Icon }) => (
              <button
                key={type}
                type="button"
                draggable
                onDragStart={(event) => handleAnnotationDragStart(event, type)}
                onClick={() => handleAddAnnotation(type)}
                title={`Add a ${label.toLowerCase()} to the canvas`}
                className="group flex w-full cursor-grab items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left hover:border-app-200 hover:bg-app-50 active:cursor-grabbing dark:hover:border-app-700 dark:hover:bg-app-800"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-app-200 text-app-500 dark:border-app-600 dark:text-app-300">
                  <Icon size={13} />
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-app-700 dark:text-app-200">{label}</span>
              </button>
            ))}
          </>
        )}
      </div>

      {/* Pinned footer: show-all toggle + drag hint. */}
      <div className="shrink-0 border-t border-app-100 p-2 dark:border-app-800">
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setShowAll(!showAll)}
            className="w-full rounded-md border border-dashed border-app-300 px-2 py-1.5 text-[11px] font-medium text-app-500 hover:border-accent-400 hover:text-accent-600 dark:border-app-600 dark:text-app-400"
          >
            {showAll ? 'Show only case-study components' : `Show all components (+${hiddenCount})`}
          </button>
        )}
        <p className="mt-1.5 px-1 text-[10px] leading-relaxed text-app-400">
          Drag from a node's right handle to another node's left handle to connect.
        </p>
      </div>
    </aside>
  )
}
