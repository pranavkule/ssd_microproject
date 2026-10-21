import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  BaseEdge,
  EdgeLabelRenderer,
  NodeResizer,
  ReactFlowProvider,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
  type OnConnect,
  type NodeChange,
  type EdgeChange,
  type EdgeProps,
  type Connection,
  type Node as FlowNode,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { X } from 'lucide-react'
import type { ArchitectureEdge, CanvasAnnotation, ComponentNode, ComponentType } from '../domain/types'
import { useApp } from '../state/store'
import { COMPONENT_ICONS } from './icons'
import { cx } from './ui'

function ComponentNodeView({ id, data, selected }: { id: string; data: ComponentNode['data']; selected: boolean }) {
  const runtime = useApp((s) => s.runtimes[id])
  const failed = useApp((s) => s.failedNodeIds.includes(id))
  const Icon = COMPONENT_ICONS[data.type]

  const health = failed ? 'down' : runtime?.health ?? 'up'
  const ring =
    health === 'down'
      ? 'border-red-500 bg-red-50 dark:bg-red-950/40'
      : health === 'overloaded'
        ? 'border-orange-500 bg-orange-50/70 dark:bg-orange-950/40'
        : health === 'warning'
          ? 'border-amber-400 bg-amber-50/70 dark:bg-amber-950/40'
          : selected
            ? 'border-accent-500 bg-white dark:bg-app-800'
            : 'border-app-300 bg-white dark:border-app-600 dark:bg-app-800'

  const iconTone =
    health === 'down' ? 'bg-red-100 text-red-600 dark:bg-red-900/60 dark:text-red-300' : 'bg-app-100 text-app-600 dark:bg-app-700 dark:text-app-300'

  const title = [
    data.label,
    runtime ? `Status: ${runtime.statusText}` : '',
    runtime?.activeConfigVersion != null ? `Routing config: v${runtime.activeConfigVersion}` : '',
    failed ? 'FAILED (failure injection active)' : '',
    data.description,
  ]
    .filter(Boolean)
    .join('\n')

  return (
    <div
      title={title}
      className={cx(
        'w-40 min-h-16 min-w-[160px] rounded-lg border-2 px-2.5 py-2 shadow-sm transition-colors',
        ring,
        health === 'overloaded' && 'node-warn',
        health === 'down' && 'opacity-70',
        selected && 'ring-2 ring-accent-500/60',
      )}
    >
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center gap-2">
        <span className={cx('flex h-6 w-6 shrink-0 items-center justify-center rounded', iconTone)}>
          <Icon size={13} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold leading-tight text-app-800 dark:text-app-100">{data.label}</div>
          <div className="truncate text-[9px] uppercase tracking-wide text-app-400">{data.type}</div>
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {failed ? (
          <span className="rounded bg-red-500 px-1 py-px text-[9px] font-bold text-white">DOWN</span>
        ) : runtime ? (
          <>
            <span className="rounded bg-app-100 px-1 py-px font-mono text-[9px] text-app-600 dark:bg-app-700 dark:text-app-300">
              {runtime.inService}/{runtime.capacity}
            </span>
            <span className="rounded bg-app-100 px-1 py-px font-mono text-[9px] text-app-600 dark:bg-app-700 dark:text-app-300">
              q {runtime.queued}
            </span>
          </>
        ) : (
          <span className="rounded bg-app-50 px-1 py-px text-[9px] text-app-400 dark:bg-app-700 dark:text-app-500">idle</span>
        )}

        {runtime?.activeConfigVersion != null && (
          <span
            className={cx(
              'rounded px-1 py-px font-mono text-[9px] font-semibold',
              runtime.pendingConfigVersion != null
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/70 dark:text-amber-300'
                : 'bg-accent-50 text-accent-700 dark:bg-app-700 dark:text-accent-300',
            )}
            title={runtime.configWarning ?? `Active routing configuration v${runtime.activeConfigVersion}`}
          >
            {runtime.pendingConfigVersion != null ? `v${runtime.activeConfigVersion}→v${runtime.pendingConfigVersion}` : `v${runtime.activeConfigVersion}`}
          </span>
        )}

        {runtime?.configWarning && (
          <span className="rounded bg-amber-100 px-1 py-px text-[9px] text-amber-700 dark:bg-amber-900/70 dark:text-amber-300" title={runtime.configWarning}>
            ⚠
          </span>
        )}
      </div>

      {runtime?.utilization >= 0.9 && !failed && (
        <div className="mt-1 text-[9px] font-semibold text-orange-600 dark:text-orange-400">HIGH LOAD {(runtime.utilization * 100).toFixed(0)}%</div>
      )}

      <Handle type="source" position={Position.Right} />
    </div>
  )
}

type AnnotationFlowNode = FlowNode<{ text: string; annotationType: CanvasAnnotation['type'] }>
type CanvasNode = ComponentNode | AnnotationFlowNode

function AnnotationNodeView({ id, data, selected }: { id: string; data: AnnotationFlowNode['data']; selected: boolean }) {
  const updateAnnotation = useApp((s) => s.updateAnnotation)
  const removeAnnotation = useApp((s) => s.removeAnnotation)
  const isNote = data.annotationType === 'note'

  return (
    <div
      className={cx(
        'relative h-full w-full overflow-hidden rounded-md border shadow-sm',
        isNote
          ? 'border-amber-300 bg-amber-100/95 text-app-800 dark:border-amber-700 dark:bg-amber-950/90 dark:text-amber-100'
          : 'border-dashed border-accent-400 bg-accent-50/50 text-app-700 dark:border-accent-500 dark:bg-accent-950/30 dark:text-app-200',
        selected && 'ring-2 ring-accent-500/70',
      )}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={isNote ? 140 : 180}
        minHeight={isNote ? 100 : 120}
        onResize={(_, params) => updateAnnotation(id, { width: params.width, height: params.height })}
        lineClassName="!border-accent-500"
        handleClassName="!h-2 !w-2 !border-accent-600 !bg-white"
      />
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          removeAnnotation(id)
        }}
        onKeyDown={(event) => event.stopPropagation()}
        aria-label={`Remove ${isNote ? 'note' : 'section'}`}
        title={`Remove ${isNote ? 'note' : 'section'}`}
        className="nodrag nowheel absolute right-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded bg-white/80 text-app-500 shadow-sm hover:bg-red-100 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:bg-app-900/80 dark:text-app-300 dark:hover:bg-red-950 dark:hover:text-red-300"
      >
        <X size={13} />
      </button>
      {isNote ? (
        <textarea
          value={data.text}
          onChange={(event) => updateAnnotation(id, { text: event.target.value })}
          onKeyDown={(event) => event.stopPropagation()}
          aria-label="Note text"
          className="nodrag nowheel h-full w-full resize-none border-0 bg-transparent p-3 pr-9 text-xs leading-relaxed text-inherit outline-none placeholder:text-app-400 focus:ring-1 focus:ring-accent-500/40"
        />
      ) : (
        <div className="flex h-full flex-col">
          <input
            value={data.text}
            onChange={(event) => updateAnnotation(id, { text: event.target.value })}
            onKeyDown={(event) => event.stopPropagation()}
            aria-label="Section title"
            className="nodrag nowheel w-full border-0 border-b border-dashed border-accent-300 bg-accent-100/60 px-3 py-2 pr-9 text-xs font-semibold text-inherit outline-none focus:ring-1 focus:ring-accent-500/40 dark:border-accent-700 dark:bg-accent-900/40"
          />
          <div className="pointer-events-none flex-1" />
        </div>
      )}
    </div>
  )
}

function TrafficEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style }: EdgeProps) {
  const active = useApp((s) => s.activeEdges[id])
  const count = useApp((s) => s.edgeCounts[id])
  const selected = useApp((s) => s.selectedEdgeId === id)
  const path = useMemo(() => {
    // straight-ish bezier
    const cx1 = sourcePosition === Position.Right ? sourceX + 30 : sourceX - 30
    const cx2 = targetPosition === Position.Left ? targetX - 30 : targetX + 30
    return `M ${sourceX},${sourceY} C ${cx1},${sourceY} ${cx2},${targetY} ${targetX},${targetY}`
  }, [sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition])

  const stroke = active === 'fail' ? '#ef4444' : selected ? '#2563eb' : '#94a3b8'

  return (
    <g className={active ? 'edge-active' : undefined}>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ ...style, stroke, strokeWidth: selected ? 2.2 : 1.6 }} />
      {count !== undefined && count > 0 && (
        <EdgeLabelRenderer>
          <div
            style={{
              transform: `translate(-50%, -50%) translate(${(sourceX + targetX) / 2}px, ${(sourceY + targetY) / 2}px)`,
            }}
            className={cx(
              'pointer-events-none absolute rounded px-1 py-px font-mono text-[9px] font-semibold shadow-sm',
              active === 'fail'
                ? 'bg-red-500 text-white'
                : active === 'ok'
                  ? 'bg-accent-600 text-white'
                  : 'border border-app-200 bg-white/90 text-app-500 dark:border-app-600 dark:bg-app-800/90 dark:text-app-300',
            )}
          >
            {count}
          </div>
        </EdgeLabelRenderer>
      )}
    </g>
  )
}

const nodeTypes = { component: ComponentNodeView, note: AnnotationNodeView, section: AnnotationNodeView }
const edgeTypes = { traffic: TrafficEdge }

function CanvasInner() {
  const architecture = useApp((s) => s.architecture)
  const addEdge = useApp((s) => s.addEdge)
  const updateNodePosition = useApp((s) => s.updateNodePosition)
  const updateAnnotation = useApp((s) => s.updateAnnotation)
  const removeAnnotation = useApp((s) => s.removeAnnotation)
  const removeNode = useApp((s) => s.removeNode)
  const removeEdge = useApp((s) => s.removeEdge)
  const select = useApp((s) => s.select)
  const addNode = useApp((s) => s.addNode)
  const addAnnotation = useApp((s) => s.addAnnotation)
  const { screenToFlowPosition } = useReactFlow()
  const { fitView } = useReactFlow()

  const [rfNodes, setRfNodes] = useState<CanvasNode[]>(architecture.nodes)
  const [rfEdges, setRfEdges] = useState<ArchitectureEdge[]>(architecture.edges)

  // Fit the whole diagram into view whenever a different architecture is loaded
  // (initial visit, case-study starter/reference, import).  Node positions change
  // first, so wait a frame before fitting.  40px padding keeps labels readable.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      fitView({ padding: 0.16, maxZoom: 1.1, minZoom: 0.85, duration: 200 })
    })
    return () => cancelAnimationFrame(raf)
  }, [architecture.id, fitView])

  // Re-fit when the canvas is resized (window resize, panel toggles, results
  // panel drag).  Debounced so continuous drags don't thrash the viewport.
  useEffect(() => {
    let raf = 0
    const onResize = (): void => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => fitView({ padding: 0.16, maxZoom: 1.1, minZoom: 0.85, duration: 120 }))
    }
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [fitView])

  useEffect(() => {
    setRfNodes((prev) => {
      const components = architecture.nodes.map((node) => {
        const old = prev.find((previous) => previous.id === node.id)
        return old?.measured ? { ...node, measured: old.measured, selected: old.selected } : { ...node, selected: old?.selected }
      })
      const annotations: AnnotationFlowNode[] = architecture.annotations.map((annotation) => {
        const old = prev.find((previous) => previous.id === annotation.id)
        return {
          id: annotation.id,
          type: annotation.type,
          position: annotation.position,
          data: { text: annotation.text, annotationType: annotation.type },
          width: annotation.width,
          height: annotation.height,
          style: { width: annotation.width, height: annotation.height },
          selected: old?.selected,
          measured: old?.measured,
          zIndex: 0,
        }
      })
      return [...annotations, ...components]
    })
  }, [architecture.nodes, architecture.annotations])

  useEffect(() => {
    setRfEdges((prev) => architecture.edges.map((e) => ({ ...e, selected: prev.find((p) => p.id === e.id)?.selected ?? false })))
  }, [architecture.edges])

  const onNodesChange = useCallback((changes: NodeChange<CanvasNode>[]) => {
    setRfNodes((nds) => {
      const filtered = changes.filter((c) => c.type !== 'position' || !c.dragging)
      return applyNodeChanges(filtered, nds)
    })
    for (const change of changes) {
      if (change.type === 'remove') {
        if (architecture.annotations.some((annotation) => annotation.id === change.id)) removeAnnotation(change.id)
        else removeNode(change.id)
      }
    }
  }, [architecture.annotations, removeAnnotation, removeNode])

  const onEdgesChange = useCallback(
    (changes: EdgeChange<ArchitectureEdge>[]) => {
      setRfEdges((eds) => applyEdgeChanges(changes, eds))
      for (const change of changes) {
        if (change.type === 'remove') removeEdge(change.id)
      }
    },
    [removeEdge],
  )

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return
      const id = `e-${connection.source}-${connection.target}-${Math.random().toString(36).slice(2, 6)}`
      const newEdge: ArchitectureEdge = { id, source: connection.source, target: connection.target }
      const created = addEdge(newEdge)
      if (!created) {
        // rollback optimistic edge in local state
        setRfEdges((eds) => eds.filter((e) => e.id !== id))
      }
    },
    [addEdge],
  )

  const onNodeDragStop = useCallback(
    (_: unknown, node: CanvasNode) => {
      const position = { x: Math.round(node.position.x), y: Math.round(node.position.y) }
      if (node.type === 'note' || node.type === 'section') updateAnnotation(node.id, { position })
      else updateNodePosition(node.id, position)
    },
    [updateAnnotation, updateNodePosition],
  )

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      const annotationType = event.dataTransfer.getData('application/breakscale-annotation')
      if (annotationType === 'note' || annotationType === 'section') {
        addAnnotation(annotationType, position)
        return
      }
      const type = event.dataTransfer.getData('application/breakscale-component')
      if (type) addNode(type as ComponentType, position)
    },
    [screenToFlowPosition, addNode, addAnnotation],
  )

  return (
    <div className="flex h-full w-full flex-col">
      <div className="relative min-h-0 flex-1" onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStop={onNodeDragStop}
          onNodeClick={(_, node) => select(node.id, null)}
          onEdgeClick={(_, edge) => select(null, edge.id)}
          onPaneClick={() => select(null, null)}
          defaultEdgeOptions={{ type: 'traffic', animated: false }}
          fitView
          fitViewOptions={{ padding: 0.16, maxZoom: 1.1, minZoom: 0.85 }}
          minZoom={0.85}
          maxZoom={2.5}
          proOptions={{ hideAttribution: true }}
          deleteKeyCode={['Backspace', 'Delete']}
          onMoveEnd={() => undefined}
        >
          <Background color="#cbd5e1" gap={22} size={1} />
          <Controls showInteractive={false} className="!bottom-3 !left-3" />
        </ReactFlow>
      </div>
      {/* One-line helper hint lives below the canvas, never on top of nodes. */}
      <div className="shrink-0 border-t border-app-200 bg-white px-3 py-1 text-[10px] text-app-500 dark:border-app-700 dark:bg-app-900 dark:text-app-400">
        Select a node to configure · Del to remove · scroll to zoom
      </div>
    </div>
  )
}

export function FlowCanvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  )
}
