'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import ReactFlow, {
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  useReactFlow,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { AnimatePresence } from 'framer-motion'
import { Search, Maximize2, AlertTriangle, Loader2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { api } from '@/lib/api'
import type { KGNode, KGEdge } from '@/lib/api'
import type { RFNode, RFEdge, KGNodeData, KGEdgeData } from './types'
import { nodeTypes } from './NodeTypes'
import { edgeTypes } from './EdgeTypes'
import { applyDagreLayout } from './layout'
import { IntelligencePanel } from './IntelligencePanel'

interface KGExplorerProps {
  initialPathTo?: string
  jumpToNodeId?: string
  initialSearch?: string
}

const NODE_CAP = 50

function toRFNode(n: KGNode, extra: Partial<KGNodeData> = {}): RFNode {
  return {
    id: n.id,
    type: 'kgNode',
    position: { x: 0, y: 0 },
    data: {
      nodeType: n.type,
      label: n.label,
      metadata: n.metadata,
      isExpanded: false,
      isLoading: false,
      hasError: false,
      isPathHighlighted: false,
      isSearchMatch: null,
      ...extra,
    },
  }
}

function toRFEdge(e: KGEdge, extra: Partial<KGEdgeData> = {}): RFEdge {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    type: 'kgEdge',
    data: {
      relationship: e.relationship,
      confidence: e.confidence,
      evidence: e.evidence,
      isPathHighlighted: false,
      ...extra,
    },
    style: { opacity: e.confidence * 0.7 + 0.3 },
  }
}

// BFS reachability from a root node via edges
function reachableFrom(rootId: string, edges: RFEdge[]): Set<string> {
  const reachable = new Set<string>([rootId])
  const queue = [rootId]
  while (queue.length > 0) {
    const cur = queue.shift()!
    for (const e of edges) {
      if (e.source === cur && !reachable.has(e.target)) {
        reachable.add(e.target); queue.push(e.target)
      }
      if (e.target === cur && !reachable.has(e.source)) {
        reachable.add(e.source); queue.push(e.source)
      }
    }
  }
  return reachable
}

export function KGExplorer({ initialPathTo, jumpToNodeId, initialSearch }: KGExplorerProps) {
  const [rfNodes, setRFNodes, onNodesChange] = useNodesState<KGNodeData>([])
  const [rfEdges, setRFEdges, onEdgesChange] = useEdgesState<KGEdgeData>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState(initialSearch ?? '')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [activePath, setActivePath] = useState<string[]>([])
  const [pathAnimating, setPathAnimating] = useState(false)
  const [totalNodes, setTotalNodes] = useState(0)
  const [isMobile, setIsMobile] = useState(false)
  const { fitView } = useReactFlow()
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const inFlightRef = useRef<Set<string>>(new Set())
  const initializedRef = useRef(false)

  useEffect(() => {
    function check() { setIsMobile(window.innerWidth < 768) }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Initial subgraph
  const { data: initialData, isLoading: initialLoading, isError: initialError } = useQuery({
    queryKey: ['kg-subgraph-root'],
    queryFn: () => api.graph.subgraph({ depth: 1 }),
    staleTime: 60_000,
  })

  useEffect(() => {
    if (!initialData || initializedRef.current) return
    initializedRef.current = true
    if (initialData.nodes.length === 0) return
    const nodes = initialData.nodes.map((n) => toRFNode(n))
    const edges = initialData.edges.map((e) => toRFEdge(e))
    const laid = applyDagreLayout(nodes, edges)
    setRFNodes(laid)
    setRFEdges(edges)
    setTotalNodes(initialData.total)
    setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 50)
  }, [initialData, setRFNodes, setRFEdges, fitView])

  // Jump to node from Skills tab
  useEffect(() => {
    if (!jumpToNodeId || rfNodes.length === 0) return
    void expandNodeById(jumpToNodeId)
    setSelectedNodeId(jumpToNodeId)
  // expandNodeById is stable via useCallback
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpToNodeId])

  // Pre-trigger path discovery if a target node ID is passed
  useEffect(() => {
    if (!initialPathTo || rfNodes.length === 0) return
    void handleWhyMatch(initialPathTo)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPathTo, rfNodes.length > 0])

  // Search filter
  useEffect(() => {
    const q = searchQuery.trim().toLowerCase()
    setRFNodes((prev) =>
      prev.map((n) => ({
        ...n,
        data: { ...n.data, isSearchMatch: q ? n.data.label.toLowerCase().includes(q) : null },
      })),
    )
  }, [searchQuery, setRFNodes])

  // Path highlight
  useEffect(() => {
    const pathSet = new Set(activePath)
    const pathEdgeKeys = new Set<string>()
    for (let i = 0; i < activePath.length - 1; i++) {
      pathEdgeKeys.add(`${activePath[i]}|${activePath[i + 1]}`)
      pathEdgeKeys.add(`${activePath[i + 1]}|${activePath[i]}`)
    }
    setRFNodes((prev) =>
      prev.map((n) => ({
        ...n,
        data: { ...n.data, isPathHighlighted: pathSet.has(n.id) },
        style: activePath.length > 0 && !pathSet.has(n.id) ? { opacity: 0.15 } : undefined,
      })),
    )
    setRFEdges((prev) =>
      prev.map((e) => ({
        ...e,
        data: { ...e.data!, isPathHighlighted: pathEdgeKeys.has(`${e.source}|${e.target}`) },
      })),
    )
  }, [activePath, setRFNodes, setRFEdges])

  const mergeSubgraph = useCallback((nodes: KGNode[], edges: KGEdge[], currentNodes: RFNode[], currentEdges: RFEdge[]) => {
    const existingNodeIds = new Set(currentNodes.map((n) => n.id))
    const existingEdgeIds = new Set(currentEdges.map((e) => e.id))
    const newNodes = nodes.filter((n) => !existingNodeIds.has(n.id)).map((n) => toRFNode(n))
    const newEdges = edges.filter((e) => !existingEdgeIds.has(e.id)).map((e) => toRFEdge(e))
    const mergedNodes = [...currentNodes, ...newNodes]
    const mergedEdges = [...currentEdges, ...newEdges]
    const laid = applyDagreLayout(mergedNodes, mergedEdges)
    setRFNodes(laid)
    setRFEdges(mergedEdges)
    return { nodes: laid, edges: mergedEdges }
  }, [setRFNodes, setRFEdges])

  const expandNodeById = useCallback(async (nodeId: string) => {
    if (inFlightRef.current.has(nodeId)) return

    inFlightRef.current.add(nodeId)
    setRFNodes((prev) =>
      prev.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, isLoading: true, hasError: false } } : n),
    )

    try {
      // We need access to current nodes/edges without a closure — capture via a promise
      const data = await api.graph.subgraph({ root: nodeId, depth: 1 })
      setRFNodes((currentNodes) => {
        setRFEdges((currentEdges) => {
          mergeSubgraph(data.nodes, data.edges, currentNodes, currentEdges)
          return currentEdges // setRFEdges returns are ignored here; mergeSubgraph calls setRFEdges
        })
        return currentNodes.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, isLoading: false, isExpanded: true, hasError: false } } : n,
        )
      })
      setExpandedIds((prev) => new Set(prev).add(nodeId))
      setTotalNodes(data.total)
      setTimeout(() => fitView({ padding: 0.15, duration: 350 }), 150)
    } catch {
      setRFNodes((prev) =>
        prev.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, isLoading: false, hasError: true } } : n),
      )
    } finally {
      inFlightRef.current.delete(nodeId)
    }
  }, [mergeSubgraph, fitView, setRFNodes, setRFEdges])

  const collapseNode = useCallback((nodeId: string) => {
    if (activePath.includes(nodeId)) setActivePath([])

    setRFEdges((prevEdges) => {
      const remainingEdges = prevEdges.filter((e) => e.source !== nodeId && e.target !== nodeId)
      setRFNodes((prevNodes) => {
        const userNodeId = prevNodes.find((n) => n.data.nodeType === 'user')?.id
        const reachable = userNodeId ? reachableFrom(userNodeId, remainingEdges) : new Set<string>()
        reachable.add(nodeId) // keep the collapsed node itself

        const keptNodes = prevNodes
          .filter((n) => reachable.has(n.id))
          .map((n) => n.id === nodeId ? { ...n, data: { ...n.data, isExpanded: false } } : n)
        return applyDagreLayout(keptNodes, remainingEdges)
      })
      return remainingEdges
    })
    setExpandedIds((prev) => { const s = new Set(prev); s.delete(nodeId); return s })
  }, [activePath, setRFNodes, setRFEdges])

  const handleNodeClick = useCallback((_: React.MouseEvent, node: RFNode) => {
    // Clear in-flight debounce
    if (debounceRef.current[node.id]) clearTimeout(debounceRef.current[node.id])

    setSelectedNodeId((prev) => (prev === node.id ? null : node.id))

    debounceRef.current[node.id] = setTimeout(() => {
      if (expandedIds.has(node.id)) {
        collapseNode(node.id)
      } else {
        void expandNodeById(node.id)
      }
    }, 200)
  }, [expandedIds, expandNodeById, collapseNode])

  const handleWhyMatch = useCallback(async (opportunityNodeId: string) => {
    const userNode = rfNodes.find((n) => n.data.nodeType === 'user')
    if (!userNode) return
    setPathAnimating(true)
    try {
      const { path } = await api.graph.paths(userNode.id, opportunityNodeId)
      if (path.length === 0) { setPathAnimating(false); return }

      // Ensure all path nodes are visible
      const existingIds = new Set(rfNodes.map((n) => n.id))
      for (const id of path) {
        if (!existingIds.has(id)) await expandNodeById(id)
      }

      // Reveal path step by step
      const revealed: string[] = []
      for (const nodeId of path) {
        await new Promise<void>((res) => setTimeout(res, 300))
        revealed.push(nodeId)
        setActivePath([...revealed])
      }
    } catch {
      // silent
    } finally {
      setPathAnimating(false)
    }
  }, [rfNodes, expandNodeById])

  const isEmpty = !initialLoading && !initialError && rfNodes.length === 0

  return (
    <div className="relative flex-1 h-full" style={{ minHeight: 400 }}>
      {/* Search + fit */}
      <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
        <div className="flex items-center gap-2 bg-white border border-[var(--color-border)] rounded-md shadow-sm px-2.5 py-1.5">
          <Search size={12} className="text-[var(--color-faint)] shrink-0" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search nodes…"
            className="text-[12px] text-[var(--color-text)] placeholder:text-[var(--color-faint)] bg-transparent outline-none w-32"
          />
        </div>
        <button
          onClick={() => fitView({ padding: 0.2, duration: 400 })}
          className="w-7 h-7 flex items-center justify-center bg-white border border-[var(--color-border)] rounded-md shadow-sm text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
          title="Fit to screen"
        >
          <Maximize2 size={12} />
        </button>
      </div>

      {/* Node cap notice */}
      {totalNodes >= NODE_CAP && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 text-[11px] text-[var(--color-muted)] bg-white border border-[var(--color-border)] rounded-full px-3 py-1 shadow-sm whitespace-nowrap">
          Showing {NODE_CAP} of {totalNodes} connections — click nodes to explore further
        </div>
      )}

      {/* Path tracing indicator */}
      {pathAnimating && (
        <div className="absolute top-3 right-[316px] z-20 flex items-center gap-2 text-[11.5px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-1.5 shadow-sm">
          <Loader2 size={11} className="animate-spin" /> Tracing path…
        </div>
      )}
      {activePath.length > 0 && !pathAnimating && (
        <button
          onClick={() => setActivePath([])}
          className="absolute top-3 right-[316px] z-20 text-[11px] text-[var(--color-muted)] bg-white border border-[var(--color-border)] rounded-md px-2.5 py-1.5 shadow-sm hover:text-[var(--color-text)] transition-colors"
        >
          Clear path
        </button>
      )}

      {/* Overlays */}
      {initialLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/70 z-10">
          <div className="text-center space-y-2">
            <Loader2 size={22} className="animate-spin mx-auto text-[var(--color-violet)]" />
            <p className="text-[12.5px] text-[var(--color-muted)]">Loading your Career Graph…</p>
          </div>
        </div>
      )}
      {initialError && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center space-y-2">
            <AlertTriangle size={22} className="mx-auto text-red-400" />
            <p className="text-[13px] text-[var(--color-muted)]">Failed to load graph. Make sure the API is running.</p>
          </div>
        </div>
      )}
      {isEmpty && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center max-w-xs space-y-3 px-6">
            <p className="text-[14px] font-semibold text-[var(--color-text)]">Your Career Graph is being built</p>
            <p className="text-[12.5px] text-[var(--color-muted)]">Complete your profile to start seeing connections.</p>
            <Link
              href="/profile"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[var(--color-violet)] text-white text-[12.5px] font-medium hover:opacity-90 transition-opacity"
            >
              Complete your profile →
            </Link>
          </div>
        </div>
      )}

      {/* React Flow */}
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={() => { setSelectedNodeId(null); setActivePath([]) }}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.15}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
      >
        <Controls showInteractive={false} />
        <Background gap={20} color="#f3f4f6" />
      </ReactFlow>

      {/* Intelligence Panel */}
      <AnimatePresence>
        {selectedNodeId && (
          <IntelligencePanel
            key={selectedNodeId}
            nodeId={selectedNodeId}
            onClose={() => setSelectedNodeId(null)}
            onWhyMatch={handleWhyMatch}
            isMobile={isMobile}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
