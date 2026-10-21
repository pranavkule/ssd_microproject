import { create } from 'zustand'
import type {
  Architecture,
  ArchitectureEdge,
  CanvasAnnotation,
  ClientConfig,
  ComponentNode,
  ComponentType,
  FlowFrame,
  RouteRule,
  SimEvent,
  SimRequestRecord,
} from '../domain/types'
import { createDefaultArchitecture, defaultConfigFor, COMPONENT_DESCRIPTIONS } from '../domain/defaults'
import { validateConfig } from '../domain/validation'
import { wouldCreateCycle } from '../domain/topology'
import { SimulationEngine, type ScheduledAction } from '../sim/engine'
import { experimentById, labelsFor, defaultParams, type ExperimentDef } from '../sim/experiments'
import { emptyMetrics } from '../sim/metrics'
import { loadLastOrDefault, saveArchitecture, listSaved, deleteSaved, type SavedArchitecture } from '../persistence/storage'
import { exportArchitectureJson, importArchitectureJson, downloadText, metricsToCsv, requestsToCsv } from '../persistence/importExport'
import { DEFAULT_CASE_STUDY_ID } from '../content/defaultCaseStudy'

export type SimStatus = 'idle' | 'running' | 'paused' | 'finished'
export type ThemeMode = 'light' | 'dark'

const HISTORY_LIMIT = 60
const EVENT_LIMIT = 3000

const RESULTS_HEIGHT_KEY = 'ssd-lab.results.height'
export const RESULTS_MIN_HEIGHT = 168
export const RESULTS_COLLAPSED_HEIGHT = 200

function readStoredResultsHeight(): number {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(RESULTS_HEIGHT_KEY) : null
    const parsed = raw ? Number(raw) : NaN
    if (Number.isFinite(parsed) && parsed >= RESULTS_MIN_HEIGHT) return Math.round(parsed)
  } catch {
    /* localStorage unavailable — fall back to the default */
  }
  return RESULTS_COLLAPSED_HEIGHT
}

function writeStoredResultsHeight(px: number): void {
  try {
    localStorage.setItem(RESULTS_HEIGHT_KEY, String(Math.round(px)))
  } catch {
    /* ignore persistence failures */
  }
}

interface UndoState {
  past: string[]
  future: string[]
}

export interface ExperimentState {
  selectedId: string
  params: Record<string, number>
  running: boolean
  finished: boolean
  summary: string
  appliedAt: string | null
}

interface AppState {
  architecture: Architecture
  selectedNodeId: string | null
  selectedEdgeId: string | null
  undo: UndoState

  status: SimStatus
  speed: number
  simTime: number
  metrics: FlowFrame['metrics']
  runtimes: FlowFrame['runtimes']
  events: SimEvent[]
  activeEdges: Record<string, 'ok' | 'fail'>
  edgeCounts: Record<string, number>
  recentRequests: SimRequestRecord[]
  failedNodeIds: string[]
  pendingActions: ScheduledAction[]

  experiment: ExperimentState
  theme: ThemeMode
  monitorTab: 'overview' | 'charts' | 'events' | 'requests' | 'experiments'
  monitorExpanded: boolean
  bottomOpen: boolean
  /** Remembered results-panel height in px (collapsed default ~200). */
  resultsHeight: number
  rightPanelOpen: boolean
  leftPanelOpen: boolean
  paletteShowAll: boolean
  toast: { kind: 'info' | 'error' | 'success'; message: string } | null
  savedList: SavedArchitecture[]
  engineIssue: string | null
  caseStudyId: string

  // architecture editing
  setArchitecture: (arch: Architecture, options?: { resetHistory?: boolean }) => void
  addNode: (type: ComponentType, position: { x: number; y: number }) => void
  removeNode: (id: string) => void
  removeEdge: (id: string) => void
  addEdge: (edge: ArchitectureEdge) => string | null
  updateNodePosition: (id: string, pos: { x: number; y: number }) => void
  addAnnotation: (type: CanvasAnnotation['type'], position: { x: number; y: number }) => void
  updateAnnotation: (id: string, patch: Partial<Pick<CanvasAnnotation, 'position' | 'width' | 'height' | 'text'>>) => void
  removeAnnotation: (id: string) => void
  updateNodeConfig: (id: string, patch: Record<string, unknown>) => { ok: boolean; issues: ReturnType<typeof validateConfig> }
  updateLabel: (id: string, label: string) => void
  select: (nodeId: string | null, edgeId?: string | null) => void
  undoAction: () => void
  redoAction: () => void
  resetToDefault: () => void
  loadCaseStudyDiagram: (arch: Architecture, options?: { resetHistory?: boolean; message?: string }) => void
  setCaseStudyId: (id: string) => void

  // routing
  setDraftRules: (rules: RouteRule[]) => void
  setPropagationDelay: (ms: number) => void
  setFallbackRoute: (ruleId: string | null) => void
  publishConfig: (note?: string) => void

  // simulation
  run: () => void
  pause: () => void
  resume: () => void
  resetSim: () => void
  setSpeed: (s: number) => void
  setOfferedLoad: (requestsPerSecond: number) => void
  toggleFailure: (nodeId: string) => void
  sendTestRequest: (path: string, method: string) => void

  // experiments
  selectExperiment: (id: string) => void
  setExperimentParam: (key: string, value: number) => void
  runExperiment: () => void
  stopExperiment: () => void
  resetExperiment: () => void

  // persistence
  save: () => void
  load: (id: string) => void
  refreshSaved: () => void
  deleteSavedEntry: (id: string) => void
  exportJson: () => void
  importJson: (text: string) => void
  exportCsv: () => void
  exportRequestsCsv: () => void

  // ui
  setTheme: (t: ThemeMode) => void
  setMonitorTab: (t: AppState['monitorTab']) => void
  setMonitorExpanded: (expanded: boolean) => void
  setBottomOpen: (open: boolean) => void
  setResultsHeight: (px: number) => void
  setRightPanelOpen: (open: boolean) => void
  setLeftPanelOpen: (open: boolean) => void
  setPaletteShowAll: (showAll: boolean) => void
  setToast: (t: AppState['toast']) => void
}

let engine: SimulationEngine | null = null
let ticker: ReturnType<typeof setInterval> | null = null
let tickCounter = 0

function serialize(arch: Architecture): string {
  return JSON.stringify(arch)
}

export const useApp = create<AppState>((set, get) => {
  const initial = loadLastOrDefault()

  const pushHistory = (): void => {
    const s = get()
    const snap = serialize(s.architecture)
    if (s.undo.past[s.undo.past.length - 1] === snap) return
    set({
      undo: {
        past: [...s.undo.past.slice(-HISTORY_LIMIT + 1), snap],
        future: [],
      },
    })
  }

  const syncEngine = (): void => {
    if (!engine) return
    try {
      engine.updateArchitecture(get().architecture)
      engine.setFailures(get().failedNodeIds)
    } catch (e) {
      set({ engineIssue: (e as Error).message })
    }
  }

  const stopTicker = (): void => {
    if (ticker) {
      clearInterval(ticker)
      ticker = null
    }
  }

  const startTicker = (): void => {
    stopTicker()
    const intervalMs = 100
    ticker = setInterval(() => {
      const s = get()
      if (s.status !== 'running' || !engine) return
      try {
        const ticks = Math.max(1, Math.round(s.speed))
        let frame: FlowFrame | null = null
        for (let i = 0; i < ticks; i++) {
          frame = engine.tick()
          tickCounter++
          if (engine.isFinished()) break
        }
        if (frame) {
          set({
            simTime: frame.simTime,
            metrics: frame.metrics,
            runtimes: frame.runtimes,
            activeEdges: frame.activeEdges,
            edgeCounts: frame.edgeCounts,
            recentRequests: frame.recentRequests,
            events: appendEvents(s.events, frame.events),
          })
        }
        if (engine.isFinished()) {
          stopTicker()
          const finished = get()
          set({ status: 'finished' })
          const exp = finished.experiment
          if (exp.running) {
            const def = experimentById(exp.selectedId)
            if (def) {
              set({
                experiment: {
                  ...exp,
                  running: false,
                  finished: true,
                  summary: def.summarize(finished.metrics, labelsFor(finished.architecture)),
                },
              })
            }
          }
        }
      } catch (e) {
        stopTicker()
        set({ status: 'paused', engineIssue: `Simulation error: ${(e as Error).message}` })
      }
    }, intervalMs)
  }

  const applyArchitectureChange = (mutator: (arch: Architecture) => Architecture | null, options?: { skipHistory?: boolean }): boolean => {
    const current = get().architecture
    const result = mutator(structuredClone(current))
    if (result === null) return false
    if (!options?.skipHistory) pushHistory()
    set({ architecture: result })
    syncEngine()
    return true
  }

  const baseExperimentState = (): ExperimentState => {
    const def = experimentById('normal')!
    return {
      selectedId: 'normal',
      params: defaultParams(def),
      running: false,
      finished: false,
      summary: '',
      appliedAt: null,
    }
  }

  return {
    architecture: initial.architecture,
    selectedNodeId: null,
    selectedEdgeId: null,
    undo: { past: [], future: [] },

    status: 'idle',
    speed: 2,
    simTime: 0,
    metrics: emptyMetrics(),
    runtimes: {},
    events: [],
    activeEdges: {},
    edgeCounts: {},
    recentRequests: [],
    failedNodeIds: [],
    pendingActions: [],

    experiment: baseExperimentState(),
    theme: 'light',
    monitorTab: 'overview',
    monitorExpanded: false,
    bottomOpen: true,
    resultsHeight: readStoredResultsHeight(),
    rightPanelOpen: typeof window !== 'undefined' ? window.innerWidth >= 1100 : true,
    leftPanelOpen: typeof window !== 'undefined' ? window.innerWidth >= 900 : true,
    paletteShowAll: false,
    toast: null,
    savedList: listSaved(),
    engineIssue: null,
    caseStudyId: DEFAULT_CASE_STUDY_ID,

    setArchitecture: (arch, options) => {
      if (options?.resetHistory) {
        set({ architecture: arch, undo: { past: [], future: [] } })
      } else {
        pushHistory()
        set({ architecture: arch })
      }
      syncEngine()
    },

    addNode: (type, position) => {
      const s = get()
      const id = `${type}-${Math.random().toString(36).slice(2, 7)}`
      const count = s.architecture.nodes.filter((n) => n.data.type === type).length + 1
      const label = defaultLabel(type, count)
      const node: ComponentNode = {
        id,
        type: 'component',
        position,
        data: {
          label,
          type,
          config: defaultConfigFor(type),
          description: COMPONENT_DESCRIPTIONS[type],
        },
      }
      applyArchitectureChange((arch) => ({ ...arch, nodes: [...arch.nodes, node] }))
      set({ selectedNodeId: id, selectedEdgeId: null })
    },

    removeNode: (id) => {
      applyArchitectureChange((arch) => ({
        ...arch,
        nodes: arch.nodes.filter((n) => n.id !== id),
        edges: arch.edges.filter((e) => e.source !== id && e.target !== id),
      }))
      set({ selectedNodeId: null, failedNodeIds: get().failedNodeIds.filter((f) => f !== id) })
    },

    removeEdge: (id) => {
      applyArchitectureChange((arch) => ({ ...arch, edges: arch.edges.filter((e) => e.id !== id) }))
      set({ selectedEdgeId: null })
    },

    addEdge: (edge) => {
      const s = get()
      if (s.architecture.edges.some((e) => e.source === edge.source && e.target === edge.target)) {
        set({ toast: { kind: 'error', message: 'These components are already connected.' } })
        return null
      }
      if (wouldCreateCycle(s.architecture.edges, edge.source, edge.target)) {
        set({ toast: { kind: 'error', message: 'Connection rejected: it would create a cycle.' } })
        return null
      }
      const ok = applyArchitectureChange((arch) => ({ ...arch, edges: [...arch.edges, edge] }))
      return ok ? edge.id : null
    },

    updateNodePosition: (id, pos) => {
      applyArchitectureChange(
        (arch) => ({
          ...arch,
          nodes: arch.nodes.map((n) => (n.id === id ? { ...n, position: pos } : n)),
        }),
        { skipHistory: true },
      )
    },

    addAnnotation: (type, position) => {
      const annotation: CanvasAnnotation = {
        id: `annotation-${Math.random().toString(36).slice(2, 8)}`,
        type,
        position,
        width: type === 'note' ? 220 : 360,
        height: type === 'note' ? 150 : 240,
        text: type === 'note' ? 'Add your note...' : 'Section',
      }
      applyArchitectureChange((arch) => ({ ...arch, annotations: [...arch.annotations, annotation] }))
    },

    updateAnnotation: (id, patch) => {
      applyArchitectureChange(
        (arch) => ({
          ...arch,
          annotations: arch.annotations.map((annotation) =>
            annotation.id === id ? { ...annotation, ...patch } : annotation,
          ),
        }),
        { skipHistory: true },
      )
    },

    removeAnnotation: (id) => {
      applyArchitectureChange((arch) => ({
        ...arch,
        annotations: arch.annotations.filter((annotation) => annotation.id !== id),
      }))
    },

    updateNodeConfig: (id, patch) => {
      const s = get()
      const node = s.architecture.nodes.find((n) => n.id === id)
      if (!node) return { ok: false, issues: [] }
      const newConfig = { ...node.data.config, ...patch } as ComponentNode['data']['config']
      const issues = validateConfig(node.data.type, newConfig)
      if (issues.length > 0) return { ok: false, issues }
      applyArchitectureChange((arch) => ({
        ...arch,
        nodes: arch.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, config: newConfig } } : n)),
      }))
      return { ok: true, issues: [] }
    },

    updateLabel: (id, label) => {
      applyArchitectureChange((arch) => ({
        ...arch,
        nodes: arch.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, label } } : n)),
      }))
    },

    select: (nodeId, edgeId = null) => {
      set({ selectedNodeId: nodeId, selectedEdgeId: edgeId })
    },

    undoAction: () => {
      const s = get()
      if (s.undo.past.length === 0) return
      const prev = s.undo.past[s.undo.past.length - 1]
      set({
        architecture: JSON.parse(prev) as Architecture,
        undo: { past: s.undo.past.slice(0, -1), future: [serialize(s.architecture), ...s.undo.future].slice(0, HISTORY_LIMIT) },
      })
      syncEngine()
    },

    redoAction: () => {
      const s = get()
      if (s.undo.future.length === 0) return
      const next = s.undo.future[0]
      set({
        architecture: JSON.parse(next) as Architecture,
        undo: { past: [...s.undo.past, serialize(s.architecture)].slice(-HISTORY_LIMIT), future: s.undo.future.slice(1) },
      })
      syncEngine()
    },

    resetToDefault: () => {
      pushHistory()
      set({
        architecture: createDefaultArchitecture(),
        selectedNodeId: null,
        selectedEdgeId: null,
        failedNodeIds: [],
        experiment: baseExperimentState(),
      })
      get().resetSim()
      set({ toast: { kind: 'success', message: 'Default case-study architecture restored.' } })
    },

    loadCaseStudyDiagram: (arch, options) => {
      get().resetSim()
      set({
        architecture: arch,
        selectedNodeId: null,
        selectedEdgeId: null,
        failedNodeIds: [],
        pendingActions: [],
        undo: options?.resetHistory === false ? get().undo : { past: [], future: [] },
      })
      if (options?.message) set({ toast: { kind: 'info', message: options.message } })
    },

    setCaseStudyId: (caseStudyId) => set({ caseStudyId }),

    setDraftRules: (rules) => {
      applyArchitectureChange((arch) => ({ ...arch, routing: { ...arch.routing, draftRules: rules } }))
    },

    setPropagationDelay: (ms) => {
      applyArchitectureChange((arch) => ({ ...arch, routing: { ...arch.routing, propagationDelayMs: ms } }))
    },

    setFallbackRoute: (ruleId) => {
      applyArchitectureChange((arch) => ({ ...arch, routing: { ...arch.routing, fallbackRouteId: ruleId } }))
    },

    publishConfig: (note = 'Manual publish') => {
      if (!engine) {
        set({ toast: { kind: 'error', message: 'Start the simulation before publishing configuration.' } })
        return
      }
      const s = get()
      try {
        engine.publishRules(structuredClone(s.architecture.routing.draftRules), note)
        set({ toast: { kind: 'success', message: `Configuration published — propagating after ${s.architecture.routing.propagationDelayMs}ms.` } })
      } catch (e) {
        set({ toast: { kind: 'error', message: (e as Error).message } })
      }
    },

    run: () => {
      const s = get()
      stopTicker()
      const scheduled = s.pendingActions
      try {
        engine = new SimulationEngine(s.architecture, { scheduledActions: scheduled })
        engine.setFailures(s.failedNodeIds)
      } catch (e) {
        set({ engineIssue: (e as Error).message, toast: { kind: 'error', message: `Failed to start: ${(e as Error).message}` } })
        return
      }
      tickCounter = 0
      set({
        status: 'running',
        simTime: 0,
        metrics: emptyMetrics(),
        runtimes: {},
        events: appendEvents([], [{ id: ++eventSeed, time: 0, type: 'sim.started', severity: 'info', componentId: null, requestId: null, message: `Simulation started (seed ${s.architecture.settings.seed})` }]),
        activeEdges: {},
        edgeCounts: {},
        recentRequests: [],
        engineIssue: null,
        experiment: { ...s.experiment, running: s.experiment.appliedAt !== null, finished: false, summary: '' },
        // Pressing Run opens the results panel on its first tab.
        monitorTab: 'overview',
        bottomOpen: true,
        monitorExpanded: true,
      })
      startTicker()
    },

    pause: () => {
      stopTicker()
      set({ status: 'paused' })
    },

    resume: () => {
      if (!engine) {
        get().run()
        return
      }
      set({ status: 'running' })
      startTicker()
    },

    resetSim: () => {
      stopTicker()
      engine = null
      set({
        status: 'idle',
        simTime: 0,
        metrics: emptyMetrics(),
        runtimes: {},
        events: [],
        activeEdges: {},
        edgeCounts: {},
        recentRequests: [],
        experiment: { ...get().experiment, running: false, finished: false, summary: '' },
      })
    },

    setSpeed: (speed) => set({ speed }),

    setOfferedLoad: (requestsPerSecond) => {
      if (!Number.isFinite(requestsPerSecond) || requestsPerSecond < 1 || requestsPerSecond > 5000) {
        set({ toast: { kind: 'error', message: 'Offered load must be between 1 and 5,000 requests per second.' } })
        return
      }
      const clients = get().architecture.nodes.filter((node) => node.data.type === 'client')
      if (clients.length === 0) {
        set({ toast: { kind: 'error', message: 'Add a client component to set the offered load.' } })
        return
      }
      const currentRates = clients.map((node) => (node.data.config as ClientConfig).requestRate)
      const currentTotal = currentRates.reduce((sum, rate) => sum + rate, 0)
      const rates = currentRates.map((rate) =>
        currentTotal > 0 ? (requestsPerSecond * rate) / currentTotal : requestsPerSecond / clients.length,
      )
      let clientIndex = 0
      applyArchitectureChange(
        (arch) => ({
          ...arch,
          nodes: arch.nodes.map((node) => {
            if (node.data.type !== 'client') return node
            const config = node.data.config as ClientConfig
            return {
              ...node,
              data: {
                ...node.data,
                config: { ...config, requestRate: rates[clientIndex++] },
              },
            }
          }),
        }),
        { skipHistory: true },
      )
    },

    toggleFailure: (nodeId) => {
      const failed = get().failedNodeIds.includes(nodeId)
      const next = failed ? get().failedNodeIds.filter((f) => f !== nodeId) : [...get().failedNodeIds, nodeId]
      set({ failedNodeIds: next })
      if (engine) {
        engine.setFailures(next)
        const label = get().architecture.nodes.find((n) => n.id === nodeId)?.data.label ?? nodeId
        if (!failed) {
          get().setToast({ kind: 'info', message: `${label} taken down (failure injection).` })
        } else {
          get().setToast({ kind: 'info', message: `${label} restored.` })
        }
      }
    },

    sendTestRequest: (path, method) => {
      if (!engine) {
        set({ toast: { kind: 'error', message: 'Start the simulation first.' } })
        return
      }
      const client = get().architecture.nodes.find((n) => n.data.type === 'client')
      if (!client) {
        set({ toast: { kind: 'error', message: 'No client node in the architecture.' } })
        return
      }
      engine.emitRequest(client.id, 'manual-test', path, method as 'GET')
    },

    selectExperiment: (id) => {
      const def = experimentById(id)
      if (!def) return
      set({
        experiment: {
          selectedId: id,
          params: defaultParams(def),
          running: false,
          finished: false,
          summary: '',
          appliedAt: null,
        },
        pendingActions: [],
      })
    },

    setExperimentParam: (key, value) => {
      const s = get()
      set({ experiment: { ...s.experiment, params: { ...s.experiment.params, [key]: value } } })
    },

    runExperiment: () => {
      const s = get()
      const def = experimentById(s.experiment.selectedId)
      if (!def) return
      const applied = def.apply(s.architecture, s.experiment.params)
      pushHistory()
      const scheduled = applied.scheduled
      get().resetSim()
      set({
        architecture: applied.arch,
        pendingActions: scheduled,
        failedNodeIds: [],
        experiment: {
          ...s.experiment,
          appliedAt: new Date().toISOString(),
          running: true,
          finished: false,
          summary: '',
        },
      })
      // start immediately with scheduled actions
      const arch = get().architecture
      try {
        engine = new SimulationEngine(arch, { scheduledActions: scheduled })
      } catch (e) {
        set({ engineIssue: (e as Error).message })
        return
      }
      tickCounter = 0
      set({
        status: 'running',
        simTime: 0,
        metrics: emptyMetrics(),
        runtimes: {},
        events: appendEvents([], [{ id: ++eventSeed, time: 0, type: 'experiment.started', severity: 'info', componentId: null, requestId: null, message: `Experiment "${def.name}" started` }]),
        activeEdges: {},
        edgeCounts: {},
        recentRequests: [],
        bottomOpen: true,
        monitorExpanded: true,
        monitorTab: 'experiments',
      })
      startTicker()
    },

    stopExperiment: () => {
      get().pause()
      set({ experiment: { ...get().experiment, running: false } })
    },

    resetExperiment: () => {
      get().resetSim()
      set({
        pendingActions: [],
        failedNodeIds: [],
        experiment: baseExperimentState(),
        architecture: createDefaultArchitecture(),
      })
      set({ toast: { kind: 'info', message: 'Scenario reset to the default architecture.' } })
    },

    save: () => {
      const entry = saveArchitecture(get().architecture)
      set({ savedList: listSaved(), toast: { kind: 'success', message: `Saved "${entry.name}" locally.` } })
    },

    load: (id) => {
      const entry = listSaved().find((s) => s.id === id)
      if (!entry) {
        set({ toast: { kind: 'error', message: 'Saved scenario not found.' } })
        return
      }
      get().resetSim()
      get().setArchitecture(structuredClone(entry.architecture), { resetHistory: true })
      set({ toast: { kind: 'success', message: `Loaded "${entry.name}".` } })
    },

    refreshSaved: () => set({ savedList: listSaved() }),

    deleteSavedEntry: (id) => {
      deleteSaved(id)
      set({ savedList: listSaved() })
    },

    exportJson: () => {
      const arch = get().architecture
      downloadText(`${arch.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`, exportArchitectureJson(arch))
      set({ toast: { kind: 'success', message: 'Architecture exported as JSON.' } })
    },

    importJson: (text) => {
      const result = importArchitectureJson(text)
      if (!result.ok || !result.architecture) {
        const errors = result.issues.filter((i) => i.level === 'error').map((i) => i.message).join('; ')
        set({ toast: { kind: 'error', message: `Import failed: ${errors}` } })
        return
      }
      get().resetSim()
      get().setArchitecture(result.architecture, { resetHistory: true })
      const warnings = result.issues.filter((i) => i.level === 'warning').map((i) => i.message)
      set({
        toast: {
          kind: 'success',
          message: warnings.length > 0 ? `Imported with ${warnings.length} warning(s): ${warnings[0]}` : 'Architecture imported successfully.',
        },
      })
    },

    exportCsv: () => {
      const s = get()
      downloadText('simulation-metrics.csv', metricsToCsv(s.metrics.samples), 'text/csv')
      set({ toast: { kind: 'success', message: 'Metrics CSV exported.' } })
    },

    exportRequestsCsv: () => {
      const s = get()
      downloadText('simulation-requests.csv', requestsToCsv(s.recentRequests), 'text/csv')
      set({ toast: { kind: 'success', message: 'Request log CSV exported.' } })
    },

    setTheme: (theme) => set({ theme }),
    setMonitorTab: (monitorTab) => set({ monitorTab, bottomOpen: true, monitorExpanded: true }),
    setMonitorExpanded: (monitorExpanded) => set({ monitorExpanded }),
    setBottomOpen: (bottomOpen) => set({ bottomOpen, monitorExpanded: bottomOpen }),
    setResultsHeight: (resultsHeight) => {
      const clamped = Math.max(RESULTS_MIN_HEIGHT, Math.round(resultsHeight))
      set({ resultsHeight: clamped })
      writeStoredResultsHeight(clamped)
    },
    setRightPanelOpen: (rightPanelOpen) => set({ rightPanelOpen }),
    setLeftPanelOpen: (leftPanelOpen) => set({ leftPanelOpen }),
    setPaletteShowAll: (paletteShowAll) => set({ paletteShowAll }),
    setToast: (toast) => set({ toast }),
  }
})

let eventSeed = 1000000

function appendEvents(existing: SimEvent[], incoming: SimEvent[]): SimEvent[] {
  if (incoming.length === 0) return existing
  const next = [...existing, ...incoming.map((e) => (e.id > eventSeed ? e : { ...e, id: ++eventSeed }))]
  return next.slice(-EVENT_LIMIT)
}

function defaultLabel(type: ComponentType, index: number): string {
  const names: Record<ComponentType, string> = {
    client: 'Client',
    rateLimiter: 'Rate Limiter',
    loadBalancer: 'Load Balancer',
    gateway: 'API Gateway',
    service: 'Service',
    database: 'Database',
    cache: 'Cache',
    queue: 'Message Queue',
    sidecar: 'Sidecar Proxy',
    configStore: 'Config Store',
    secretManager: 'Secret Manager',
  }
  return `${names[type]} ${index}`
}

export { experimentById }
export type { ExperimentDef }
