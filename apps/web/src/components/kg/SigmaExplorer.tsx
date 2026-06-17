'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Graph from 'graphology'
import Sigma from 'sigma'
import forceAtlas2 from 'graphology-layout-forceatlas2'
import type { Attributes } from 'graphology-types'
import { AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { Search, Maximize2, Plus, Minus, AlertTriangle, Loader2, Sparkles, X, CornerDownLeft, Activity, Clock } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { KGNode, KGEdge } from '@/lib/api'
import { NODE_TYPE_STYLES } from './types'
import { IntelligencePanel } from './IntelligencePanel'

interface SigmaExplorerProps {
  initialPathTo?: string
  jumpToNodeId?: string
  initialSearch?: string
}

// ── Visual constants ──────────────────────────────────────────────
const SIZE_BY_TYPE: Record<string, number> = {
  user: 22, opportunity: 14, experience: 13, skill: 11, project: 11,
  company: 11, goal: 8, inference: 8, agent_activity: 9,
}
const sizeFor = (t: string) => SIZE_BY_TYPE[t] ?? 10
const colorFor = (t: string) => NODE_TYPE_STYLES[t]?.color ?? '#9ca3af'

// ── Timeline mode: lane order (top→bottom) + geometry ──────────────
const TIMELINE_LANES = ['goal', 'opportunity', 'experience', 'company', 'project', 'skill', 'agent_activity', 'prediction']
const TIMELINE_HALF_W = 520
const TIMELINE_LANE_GAP = 78
const YEAR_MS = 365.25 * 24 * 3600 * 1000

// Resolve the date a node sits at on the timeline: a real career date from its
// attributes when present, else when it entered the graph.
function nodeDateMs(n: KGNode): number {
  const m = (n.metadata ?? {}) as Record<string, unknown>
  const raw = (m.endDate ?? m.startDate ?? m.occurredAt ?? n.createdAt) as string | undefined
  const t = raw ? Date.parse(raw) : NaN
  return Number.isNaN(t) ? Date.now() : t
}
const fmtDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short' })

const CANVAS_BG = '#0b0f1a'
const EDGE_DIM = 'rgba(148,163,184,0.16)'
const PATH_COLOR = '#f59e0b'
const NODE_DIM = '#27303f'
const PREDICTION_COLOR = '#ec4899'

// Confidence heatmap buckets (how strongly a node is evidenced)
const HEAT_STRONG = '#22c55e'
const HEAT_MEDIUM = '#f59e0b'
const HEAT_WEAK = '#ef4444'
const heatColor = (c: number) => (c >= 0.75 ? HEAT_STRONG : c >= 0.5 ? HEAT_MEDIUM : HEAT_WEAK)

// ── BFS reachability from `start`, never passing through `blocked` ──
function reachableExcluding(graph: Graph, start: string, blocked: string): Set<string> {
  const seen = new Set<string>([start])
  const queue = [start]
  while (queue.length) {
    const cur = queue.shift()!
    graph.forEachNeighbor(cur, (nb) => {
      if (nb === blocked || seen.has(nb)) return
      seen.add(nb)
      queue.push(nb)
    })
  }
  return seen
}

function userNodeId(graph: Graph): string | null {
  let found: string | null = null
  graph.forEachNode((id, attrs) => {
    if (!found && attrs.kgType === 'user') found = id
  })
  return found
}

export function SigmaExplorer({ initialPathTo, jumpToNodeId, initialSearch }: SigmaExplorerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<Graph | null>(null)
  const rendererRef = useRef<Sigma | null>(null)
  const rafRef = useRef<number | null>(null)

  // Display-state refs read by the Sigma reducers (always-fresh, no stale closures)
  const hoveredRef = useRef<string | null>(null)
  const selectedRef = useRef<string | null>(null)
  const searchRef = useRef<string>((initialSearch ?? '').trim().toLowerCase())
  const pathNodesRef = useRef<Set<string>>(new Set())
  const pathEdgeKeysRef = useRef<Set<string>>(new Set())
  const highlightRef = useRef<Set<string>>(new Set())
  const heatmapRef = useRef<boolean>(false)
  const confMapRef = useRef<Map<string, number>>(new Map())
  const timelineRef = useRef<boolean>(false)
  const timeCutoffRef = useRef<number>(Number.POSITIVE_INFINITY)

  const expandedRef = useRef<Set<string>>(new Set())
  const inFlightRef = useRef<Set<string>>(new Set())
  const predictionsAddedRef = useRef(false)

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState(initialSearch ?? '')
  const [activePath, setActivePath] = useState<string[]>([])
  const [pathAnimating, setPathAnimating] = useState(false)
  const [copilotHighlight, setCopilotHighlight] = useState<string[]>([])
  const [copilotQuestion, setCopilotQuestion] = useState('')
  const [copilotAnswer, setCopilotAnswer] = useState<string | null>(null)
  const [copilotLoading, setCopilotLoading] = useState(false)
  const [heatmap, setHeatmap] = useState(false)
  const [timeline, setTimeline] = useState(false)
  const [timeBounds, setTimeBounds] = useState<{ min: number; max: number } | null>(null)
  const [timeCutoff, setTimeCutoff] = useState(1) // 0..1 scrubber position
  const [totalNodes, setTotalNodes] = useState(0)
  const [isMobile, setIsMobile] = useState(false)
  const [ready, setReady] = useState(false)

  const refresh = useCallback(() => rendererRef.current?.refresh(), [])

  // Per-node confidence = strength of its evidence link to the user (falls back
  // to its strongest incident edge). Drives the heatmap colouring.
  const computeConfMap = useCallback(() => {
    const graph = graphRef.current
    if (!graph) return
    const uid = userNodeId(graph)
    const map = new Map<string, number>()
    graph.forEachNode((id) => {
      if (id === uid) return
      if (graph.getNodeAttribute(id, 'kgType') === 'prediction') return
      let toUser = -1
      let anyEdge = -1
      graph.forEachEdge(id, (_e, attrs, s, t) => {
        const c = attrs.conf as number
        if (typeof c !== 'number') return
        if (c > anyEdge) anyEdge = c
        const other = s === id ? t : s
        if (other === uid && c > toUser) toUser = c
      })
      const best = toUser >= 0 ? toUser : anyEdge
      if (best >= 0) map.set(id, best)
    })
    confMapRef.current = map
  }, [])

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // ── Initial subgraph (shares cache key with the old explorer) ──
  const { data: initialData, isLoading, isError } = useQuery({
    queryKey: ['kg-subgraph-root', 2],
    queryFn: () => api.graph.subgraph({ depth: 2 }),
    staleTime: 60_000,
  })

  // Predicted next career directions (graph-derived; rendered as ghost nodes)
  const { data: predictions } = useQuery({
    queryKey: ['kg-predictions'],
    queryFn: () => api.graph.predictions(),
    staleTime: 120_000,
  })

  // ── Layout: animated ForceAtlas2 with the user pinned at the centroid ──
  const runLayout = useCallback((fit: boolean) => {
    const graph = graphRef.current
    const renderer = rendererRef.current
    if (!graph || !renderer || graph.order === 0) return
    if (rafRef.current) cancelAnimationFrame(rafRef.current)

    const settings = forceAtlas2.inferSettings(graph)
    settings.gravity = 3
    settings.scalingRatio = 14
    settings.slowDown = 3

    let frame = 0
    const maxFrames = 16
    const step = () => {
      forceAtlas2.assign(graph, { iterations: 6, settings })
      // Pin the user node to the origin so it reads as the gravitational centroid.
      const uid = userNodeId(graph)
      if (uid) {
        const ux = graph.getNodeAttribute(uid, 'x') as number
        const uy = graph.getNodeAttribute(uid, 'y') as number
        graph.forEachNode((id) => {
          graph.setNodeAttribute(id, 'x', (graph.getNodeAttribute(id, 'x') as number) - ux)
          graph.setNodeAttribute(id, 'y', (graph.getNodeAttribute(id, 'y') as number) - uy)
        })
      }
      renderer.refresh()
      frame += 1
      if (frame < maxFrames) {
        rafRef.current = requestAnimationFrame(step)
      } else if (fit) {
        renderer.getCamera().animatedReset({ duration: 400 })
      }
    }
    step()
  }, [])

  // ── Timeline layout: x = time, y = lane by type. No physics — manual x,y. ──
  const runTimeline = useCallback((fit: boolean) => {
    const graph = graphRef.current
    const renderer = rendererRef.current
    if (!graph || !renderer || graph.order === 0) return
    if (rafRef.current) cancelAnimationFrame(rafRef.current)

    // Time bounds across all dated, non-user nodes.
    let min = Number.POSITIVE_INFINITY
    let max = Number.NEGATIVE_INFINITY
    graph.forEachNode((id, attrs) => {
      if (attrs.kgType === 'user') return
      const t = attrs.tdate as number
      if (typeof t !== 'number') return
      if (t < min) min = t
      if (t > max) max = t
    })
    if (!Number.isFinite(min) || !Number.isFinite(max)) return
    if (max - min < YEAR_MS) { min -= YEAR_MS / 2; max += YEAR_MS / 2 } // pad a too-narrow range
    const span = max - min
    const xFor = (t: number) => ((t - min) / span - 0.5) * 2 * TIMELINE_HALF_W
    const laneY = (type: string) => {
      const i = TIMELINE_LANES.indexOf(type)
      const idx = i === -1 ? TIMELINE_LANES.length : i
      return (idx - (TIMELINE_LANES.length - 1) / 2) * TIMELINE_LANE_GAP
    }

    graph.forEachNode((id, attrs) => {
      if (attrs.kgType === 'user') {
        // Anchor "you" at the left edge, vertically centred.
        graph.setNodeAttribute(id, 'x', -TIMELINE_HALF_W - 90)
        graph.setNodeAttribute(id, 'y', 0)
        return
      }
      graph.setNodeAttribute(id, 'x', xFor(attrs.tdate as number))
      graph.setNodeAttribute(id, 'y', laneY(attrs.kgType as string))
    })

    setTimeBounds({ min, max })
    setTimeCutoff(1)
    timeCutoffRef.current = max
    renderer.refresh()
    if (fit) renderer.getCamera().animatedReset({ duration: 400 })
  }, [])

  // Pick the active layout (timeline vs force-directed).
  const relayout = useCallback((fit: boolean) => {
    if (timelineRef.current) runTimeline(fit)
    else runLayout(fit)
  }, [runTimeline, runLayout])

  // ── Merge a subgraph payload into the live graphology instance ──
  const mergeSubgraph = useCallback((nodes: KGNode[], edges: KGEdge[], anchorId?: string) => {
    const graph = graphRef.current
    if (!graph) return { addedNodes: 0 }
    const ax = anchorId && graph.hasNode(anchorId) ? (graph.getNodeAttribute(anchorId, 'x') as number) : 0
    const ay = anchorId && graph.hasNode(anchorId) ? (graph.getNodeAttribute(anchorId, 'y') as number) : 0

    const incoming = nodes.filter((n) => !graph.hasNode(n.id))
    incoming.forEach((n, i) => {
      // Seed new nodes in a ring around their anchor so FA2 starts from a sane spot.
      const a = (i / Math.max(incoming.length, 1)) * 2 * Math.PI
      const r = 60 + Math.random() * 40
      graph.addNode(n.id, {
        x: ax + r * Math.cos(a) + (Math.random() - 0.5) * 10,
        y: ay + r * Math.sin(a) + (Math.random() - 0.5) * 10,
        size: sizeFor(n.type),
        color: colorFor(n.type),
        label: n.label,
        kgType: n.type,
        tdate: nodeDateMs(n),
      })
    })

    edges.forEach((e) => {
      if (e.source === e.target) return
      if (!graph.hasNode(e.source) || !graph.hasNode(e.target)) return
      // One visual line per directed pair (graphology rejects parallel edges).
      if (graph.hasEdge(e.source, e.target)) return
      graph.addEdgeWithKey(e.id, e.source, e.target, {
        size: Math.max(1, e.confidence * 2.5),
        kgRel: e.relationship,
        conf: e.confidence,
        baseColor: EDGE_DIM,
      })
    })

    return { addedNodes: incoming.length }
  }, [])

  // ── Expand a node: fetch its 1-hop neighbourhood and merge ──
  const expandNode = useCallback(async (nodeId: string) => {
    if (inFlightRef.current.has(nodeId)) return
    inFlightRef.current.add(nodeId)
    try {
      const data = await api.graph.subgraph({ root: nodeId, depth: 1 })
      mergeSubgraph(data.nodes, data.edges, nodeId)
      expandedRef.current.add(nodeId)
      setTotalNodes(graphRef.current?.order ?? 0)
      relayout(false)
    } catch {
      // swallow — node stays unexpanded
    } finally {
      inFlightRef.current.delete(nodeId)
    }
  }, [mergeSubgraph, relayout])

  // ── Collapse a node: drop the subtree it exclusively introduced ──
  const collapseNode = useCallback((nodeId: string) => {
    const graph = graphRef.current
    if (!graph) return
    const uid = userNodeId(graph)
    if (!uid) return
    if (activePath.includes(nodeId)) setActivePath([])

    const keep = reachableExcluding(graph, uid, nodeId)
    keep.add(nodeId)
    graph.forEachNode((id) => {
      if (id !== uid && !keep.has(id)) graph.dropNode(id)
    })
    expandedRef.current.delete(nodeId)
    setTotalNodes(graph.order)
    relayout(false)
  }, [activePath, relayout])

  // ── Path tracing: "Why am I a match?" → reveal + glow the path ──
  const handleWhyMatch = useCallback(async (targetNodeId: string) => {
    const graph = graphRef.current
    if (!graph) return
    const uid = userNodeId(graph)
    if (!uid) return
    setPathAnimating(true)
    try {
      const { path } = await api.graph.paths(uid, targetNodeId)
      if (path.length === 0) { setPathAnimating(false); return }
      for (const id of path) {
        if (!graph.hasNode(id)) await expandNode(id)
      }
      const revealed: string[] = []
      for (const id of path) {
        await new Promise<void>((res) => setTimeout(res, 280))
        revealed.push(id)
        setActivePath([...revealed])
      }
    } catch {
      // silent
    } finally {
      setPathAnimating(false)
    }
  }, [expandNode])

  // ── Graph Copilot: ask a question → answer + highlight/animate ──
  const clearCopilot = useCallback(() => {
    setCopilotHighlight([])
    setCopilotAnswer(null)
    setActivePath([])
  }, [])

  const handleAsk = useCallback(async (question: string) => {
    const text = question.trim()
    if (!text || copilotLoading) return
    setCopilotLoading(true)
    setCopilotAnswer(null)
    setCopilotHighlight([])
    setActivePath([])
    try {
      const res = await api.graph.ask(text)
      setCopilotAnswer(res.answer)
      const graph = graphRef.current
      if (res.path.length > 1) {
        // Animated, glowing path (reuses the path renderer).
        for (const id of res.path) {
          if (graph && !graph.hasNode(id)) await expandNode(id)
        }
        const revealed: string[] = []
        for (const id of res.path) {
          await new Promise<void>((r) => setTimeout(r, 240))
          revealed.push(id)
          setActivePath([...revealed])
        }
      } else if (res.highlightNodeIds.length > 0) {
        const present = graph ? res.highlightNodeIds.filter((id) => graph.hasNode(id)) : []
        setCopilotHighlight(present)
      }
      if (res.focusNodeId && graph?.hasNode(res.focusNodeId)) {
        setSelectedNodeId(res.focusNodeId)
        selectedRef.current = res.focusNodeId
      }
      rendererRef.current?.getCamera().animatedReset({ duration: 350 })
    } catch {
      setCopilotAnswer('Something went wrong reaching your career graph. Is the API running?')
    } finally {
      setCopilotLoading(false)
    }
  }, [copilotLoading, expandNode])

  // ── Build Sigma once the container + initial data are ready ──
  useEffect(() => {
    if (!containerRef.current || !initialData || rendererRef.current) return
    if (initialData.nodes.length === 0) return

    const graph = new Graph()
    graphRef.current = graph

    const uNode = initialData.nodes.find((n) => n.type === 'user')
    const ordered = uNode
      ? [uNode, ...initialData.nodes.filter((n) => n.id !== uNode.id)]
      : initialData.nodes
    ordered.forEach((n, i) => {
      const a = (i / ordered.length) * 2 * Math.PI
      const r = n.type === 'user' ? 0 : 250
      graph.addNode(n.id, {
        x: r * Math.cos(a), y: r * Math.sin(a),
        size: sizeFor(n.type), color: colorFor(n.type),
        label: n.label, kgType: n.type, tdate: nodeDateMs(n),
      })
    })
    initialData.edges.forEach((e) => {
      if (e.source === e.target) return
      if (!graph.hasNode(e.source) || !graph.hasNode(e.target)) return
      if (graph.hasEdge(e.source, e.target)) return
      graph.addEdgeWithKey(e.id, e.source, e.target, {
        size: Math.max(1, e.confidence * 2.5), kgRel: e.relationship, conf: e.confidence, baseColor: EDGE_DIM,
      })
    })
    setTotalNodes(initialData.total)

    const renderer = new Sigma(graph, containerRef.current, {
      renderLabels: true,
      labelColor: { color: '#cbd5e1' },
      labelFont: 'Inter, system-ui, sans-serif',
      labelSize: 11,
      labelWeight: '500',
      labelDensity: 0.7,
      labelGridCellSize: 70,
      defaultEdgeColor: EDGE_DIM,
      zIndex: true,
      nodeReducer: (node: string, data: Attributes) => {
        const res: Attributes = { ...data }
        // Timeline scrubber: hide nodes dated after the cutoff.
        if (timelineRef.current && data.kgType !== 'user') {
          const td = data.tdate as number
          if (typeof td === 'number' && td > timeCutoffRef.current) {
            res.hidden = true
            return res
          }
        }
        // Heatmap base colour (overridden below only for dimmed states).
        if (heatmapRef.current) {
          const c = confMapRef.current.get(node)
          if (c !== undefined) res.color = heatColor(c)
        }
        const hovered = hoveredRef.current
        const selected = selectedRef.current
        const q = searchRef.current
        const path = pathNodesRef.current

        if (path.size > 0) {
          if (path.has(node)) { res.zIndex = 2; res.forceLabel = true }
          else { res.color = NODE_DIM; res.label = '' }
          return res
        }
        const highlight = highlightRef.current
        if (highlight.size > 0) {
          if (highlight.has(node)) { res.zIndex = 2; res.forceLabel = true; res.highlighted = true }
          else { res.color = NODE_DIM; res.label = '' }
          return res
        }
        if (q) {
          const match = (data.label as string)?.toLowerCase().includes(q)
          if (match) { res.forceLabel = true; res.zIndex = 2 }
          else { res.color = NODE_DIM; res.label = '' }
          return res
        }
        if (hovered) {
          const graph = graphRef.current!
          if (node === hovered || graph.areNeighbors(hovered, node)) {
            res.zIndex = 2; res.forceLabel = true
          } else {
            res.color = NODE_DIM; res.label = ''
          }
        }
        if (node === selected) {
          res.highlighted = true
          res.zIndex = 3
          res.forceLabel = true
        }
        return res
      },
      edgeReducer: (edge: string, data: Attributes) => {
        const res: Attributes = { ...data, color: (data.baseColor as string) ?? EDGE_DIM }
        const graph = graphRef.current!
        const [s, t] = graph.extremities(edge)
        // Timeline scrubber: hide an edge once either endpoint is past the cutoff.
        if (timelineRef.current) {
          const ts = graph.getNodeAttribute(s, 'tdate') as number
          const tt = graph.getNodeAttribute(t, 'tdate') as number
          const cut = timeCutoffRef.current
          if ((typeof ts === 'number' && ts > cut) || (typeof tt === 'number' && tt > cut)) {
            res.hidden = true
            return res
          }
        }
        const pathEdges = pathEdgeKeysRef.current
        const hovered = hoveredRef.current

        if (pathNodesRef.current.size > 0) {
          if (pathEdges.has(`${s}|${t}`) || pathEdges.has(`${t}|${s}`)) {
            res.color = PATH_COLOR; res.size = Math.max(res.size as number, 2.5); res.zIndex = 2
          } else {
            res.color = 'rgba(148,163,184,0.05)'
          }
          return res
        }
        if (hovered && (s === hovered || t === hovered)) {
          res.color = 'rgba(148,163,184,0.5)'; res.zIndex = 2
        }
        return res
      },
    })
    rendererRef.current = renderer
    setReady(true)

    renderer.on('clickNode', ({ node }) => {
      const g = graphRef.current
      // Prediction ghost nodes aren't in the DB — show their rationale, don't expand.
      if (g && g.getNodeAttribute(node, 'kgType') === 'prediction') {
        const p = g.getNodeAttribute(node, 'prediction') as { rationale: string; confidence: number } | undefined
        const label = g.getNodeAttribute(node, 'label') as string
        if (p) setCopilotAnswer(`Predicted direction — ${label} (${Math.round(p.confidence * 100)}% fit). ${p.rationale}`)
        return
      }
      setSelectedNodeId(node)
      selectedRef.current = node
      if (expandedRef.current.has(node)) collapseNode(node)
      else void expandNode(node)
    })
    renderer.on('enterNode', ({ node }) => {
      hoveredRef.current = node
      if (containerRef.current) containerRef.current.style.cursor = 'pointer'
      renderer.refresh()
    })
    renderer.on('leaveNode', () => {
      hoveredRef.current = null
      if (containerRef.current) containerRef.current.style.cursor = 'default'
      renderer.refresh()
    })
    renderer.on('clickStage', () => {
      setSelectedNodeId(null)
      selectedRef.current = null
      setActivePath([])
      setCopilotHighlight([])
      renderer.refresh()
    })

    // Seed search box if provided, then settle the layout.
    searchRef.current = (initialSearch ?? '').trim().toLowerCase()
    runLayout(true)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      renderer.kill()
      rendererRef.current = null
      graphRef.current = null
    }
  // Build exactly once when data arrives. Handlers are stable via useCallback.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData])

  // ── Sync search box → reducer ──
  useEffect(() => {
    searchRef.current = searchQuery.trim().toLowerCase()
    refresh()
  }, [searchQuery, refresh])

  // ── Sync active path → reducers ──
  useEffect(() => {
    pathNodesRef.current = new Set(activePath)
    const edgeKeys = new Set<string>()
    for (let i = 0; i < activePath.length - 1; i++) {
      edgeKeys.add(`${activePath[i]}|${activePath[i + 1]}`)
      edgeKeys.add(`${activePath[i + 1]}|${activePath[i]}`)
    }
    pathEdgeKeysRef.current = edgeKeys
    refresh()
  }, [activePath, refresh])

  // ── Sync copilot highlight set → reducer ──
  useEffect(() => {
    highlightRef.current = new Set(copilotHighlight)
    refresh()
  }, [copilotHighlight, refresh])

  // ── Sync heatmap mode (recompute when toggled or graph grows) → reducer ──
  useEffect(() => {
    heatmapRef.current = heatmap
    if (heatmap) computeConfMap()
    refresh()
  }, [heatmap, totalNodes, computeConfMap, refresh])

  // ── Toggle timeline mode → swap layouts ──
  useEffect(() => {
    if (!ready) return
    timelineRef.current = timeline
    if (timeline) {
      runTimeline(true)
    } else {
      setTimeBounds(null)
      timeCutoffRef.current = Number.POSITIVE_INFINITY
      runLayout(true)
    }
    refresh()
  }, [timeline, ready, runTimeline, runLayout, refresh])

  // ── Scrubber position → cutoff date → reducer ──
  useEffect(() => {
    if (!timeBounds) return
    timeCutoffRef.current = timeBounds.min + (timeBounds.max - timeBounds.min) * timeCutoff
    refresh()
  }, [timeCutoff, timeBounds, refresh])

  // ── Inject predicted career-direction nodes (ghost nodes off the user) ──
  useEffect(() => {
    if (!ready || predictionsAddedRef.current) return
    const graph = graphRef.current
    if (!graph || !predictions || predictions.length === 0) return
    const uid = userNodeId(graph)
    if (!uid) return
    predictionsAddedRef.current = true
    const list = predictions.slice(0, 4)
    list.forEach((m, i) => {
      const id = `pred:${i}`
      if (graph.hasNode(id)) return
      const spread = list.length > 1 ? (i / (list.length - 1) - 0.5) : 0
      graph.addNode(id, {
        x: spread * 260,
        y: -220 - Math.random() * 30,
        size: 9 + m.confidence * 6,
        color: PREDICTION_COLOR,
        label: m.roleType,
        kgType: 'prediction',
        // Predictions are future-facing → sit at the right edge of the timeline.
        tdate: Date.now() + YEAR_MS,
        prediction: { rationale: m.rationale, confidence: m.confidence },
      })
      graph.addEdgeWithKey(`prededge:${i}`, uid, id, {
        size: 1.5, kgRel: 'PREDICTED', conf: m.confidence, baseColor: 'rgba(236,72,153,0.35)',
      })
    })
    setTotalNodes(graph.order)
    relayout(true)
  }, [ready, predictions, relayout])

  // ── External: jump to a node (from Skills/Insights tabs) ──
  useEffect(() => {
    if (!jumpToNodeId || !graphRef.current?.hasNode(jumpToNodeId)) return
    setSelectedNodeId(jumpToNodeId)
    selectedRef.current = jumpToNodeId
    void expandNode(jumpToNodeId)
    rendererRef.current?.getCamera().animatedReset({ duration: 350 })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpToNodeId])

  // ── External: pre-trace a path to an opportunity (from match badge link) ──
  useEffect(() => {
    if (!initialPathTo || !ready) return
    void handleWhyMatch(initialPathTo)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPathTo, ready])

  // ── Path chain shown in the panel after the animation settles ──
  const pathChain = useMemo(() => {
    const graph = graphRef.current
    if (!graph || activePath.length === 0) return []
    return activePath.map((id, i) => {
      const next = activePath[i + 1]
      let relationship: string | undefined
      if (next && graph.hasNode(id) && graph.hasNode(next)) {
        graph.forEachEdge(id, (_e, attrs, s, t) => {
          if (!relationship && ((s === id && t === next) || (s === next && t === id))) {
            relationship = attrs.kgRel as string
          }
        })
      }
      return {
        label: graph.hasNode(id) ? (graph.getNodeAttribute(id, 'label') as string) : id,
        nodeType: graph.hasNode(id) ? (graph.getNodeAttribute(id, 'kgType') as string) : '',
        relationship,
      }
    })
  }, [activePath])

  const camera = () => rendererRef.current?.getCamera()
  const isEmpty = !isLoading && !isError && (initialData?.nodes.length ?? 0) === 0

  return (
    <div className="relative flex-1 h-full" style={{ minHeight: 400 }}>
      {/* Force-directed canvas */}
      <div ref={containerRef} className="absolute inset-0" style={{ background: CANVAS_BG }} />

      {/* Search + fit */}
      <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
        <div className="flex items-center gap-2 bg-[#161c2b]/90 border border-white/10 rounded-md shadow-lg px-2.5 py-1.5 backdrop-blur">
          <Search size={12} className="text-slate-400 shrink-0" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search nodes…"
            className="text-[12px] text-slate-100 placeholder:text-slate-500 bg-transparent outline-none w-36"
          />
        </div>
        <button
          onClick={() => setHeatmap((v) => !v)}
          title="Confidence heatmap"
          className={
            'flex items-center gap-1.5 rounded-md shadow-lg px-2.5 py-1.5 text-[11.5px] font-medium border backdrop-blur transition-colors ' +
            (heatmap
              ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
              : 'bg-[#161c2b]/90 border-white/10 text-slate-300 hover:text-white')
          }
        >
          <Activity size={12} />
          Heatmap
        </button>
        <button
          onClick={() => setTimeline((v) => !v)}
          title="Timeline mode"
          className={
            'flex items-center gap-1.5 rounded-md shadow-lg px-2.5 py-1.5 text-[11.5px] font-medium border backdrop-blur transition-colors ' +
            (timeline
              ? 'bg-indigo-500/15 border-indigo-400/40 text-indigo-300'
              : 'bg-[#161c2b]/90 border-white/10 text-slate-300 hover:text-white')
          }
        >
          <Clock size={12} />
          Timeline
        </button>
      </div>

      {/* Graph Copilot — ask your career graph */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 w-[min(560px,calc(100%-120px))] flex flex-col items-center gap-2">
        <div className="w-full flex items-center gap-2 bg-[#161c2b]/95 border border-indigo-400/25 rounded-full shadow-xl px-3.5 py-2 backdrop-blur">
          <Sparkles size={14} className="text-indigo-300 shrink-0" />
          <input
            value={copilotQuestion}
            onChange={(e) => setCopilotQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { void handleAsk(copilotQuestion); } }}
            placeholder="Ask your career graph… e.g. why am I a strong candidate?"
            className="flex-1 text-[12.5px] text-slate-100 placeholder:text-slate-500 bg-transparent outline-none"
          />
          {copilotLoading ? (
            <Loader2 size={14} className="animate-spin text-indigo-300 shrink-0" />
          ) : (
            <button
              onClick={() => void handleAsk(copilotQuestion)}
              disabled={!copilotQuestion.trim()}
              className="shrink-0 flex items-center gap-1 text-[10.5px] text-slate-400 hover:text-indigo-200 disabled:opacity-40 transition-colors"
              title="Ask"
            >
              <CornerDownLeft size={12} />
            </button>
          )}
        </div>

        {/* Suggestion chips */}
        {!copilotAnswer && !copilotLoading && (
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {['Why am I a strong candidate?', "What's holding me back?", 'Show my strongest skills'].map((s) => (
              <button
                key={s}
                onClick={() => { setCopilotQuestion(s); void handleAsk(s) }}
                className="text-[11px] text-slate-300 bg-[#161c2b]/80 border border-white/10 rounded-full px-2.5 py-1 hover:border-indigo-400/40 hover:text-white transition-colors backdrop-blur"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Answer card */}
        {copilotAnswer && (
          <div className="w-full flex items-start gap-2.5 bg-[#161c2b]/95 border border-indigo-400/25 rounded-xl shadow-xl px-3.5 py-3 backdrop-blur">
            <Sparkles size={14} className="text-indigo-300 shrink-0 mt-0.5" />
            <p className="flex-1 text-[12.5px] leading-relaxed text-slate-100">{copilotAnswer}</p>
            <button
              onClick={clearCopilot}
              className="shrink-0 text-slate-400 hover:text-white transition-colors"
              title="Clear"
            >
              <X size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Zoom controls */}
      <div className="absolute bottom-4 left-3 z-20 flex flex-col gap-1">
        {[
          { icon: Plus, fn: () => camera()?.animatedZoom({ duration: 250 }), title: 'Zoom in' },
          { icon: Minus, fn: () => camera()?.animatedUnzoom({ duration: 250 }), title: 'Zoom out' },
          { icon: Maximize2, fn: () => camera()?.animatedReset({ duration: 350 }), title: 'Fit to screen' },
        ].map(({ icon: Icon, fn, title }) => (
          <button
            key={title}
            onClick={fn}
            title={title}
            className="w-8 h-8 flex items-center justify-center bg-[#161c2b]/90 border border-white/10 rounded-md shadow-lg text-slate-300 hover:text-white hover:bg-[#1e2535] transition-colors backdrop-blur"
          >
            <Icon size={13} />
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 right-3 z-20 hidden sm:flex flex-col gap-1 bg-[#161c2b]/90 border border-white/10 rounded-md shadow-lg px-3 py-2 backdrop-blur">
        {heatmap ? (
          <>
            <p className="text-[9px] uppercase tracking-wide text-slate-500 mb-0.5">Evidence strength</p>
            {([['Strong', HEAT_STRONG], ['Medium', HEAT_MEDIUM], ['Weak', HEAT_WEAK]] as const).map(([label, color]) => (
              <div key={label} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                <span className="text-[10.5px] text-slate-300">{label}</span>
              </div>
            ))}
          </>
        ) : (
          <>
            {([
              ['user', 'you'], ['skill', 'skill'], ['experience', 'experience'],
              ['project', 'project'], ['company', 'company'], ['opportunity', 'opportunity'],
              ['goal', 'goal'], ['agent_activity', 'activity'],
            ] as const).map(([t, label]) => (
              <div key={t} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: colorFor(t) }} />
                <span className="text-[10.5px] text-slate-300 capitalize">{label}</span>
              </div>
            ))}
            {predictions && predictions.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: PREDICTION_COLOR }} />
                <span className="text-[10.5px] text-slate-300">predicted</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Timeline scrubber */}
      {timeline && timeBounds && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-[min(620px,calc(100%-160px))] bg-[#161c2b]/95 border border-indigo-400/25 rounded-lg shadow-xl px-4 py-2.5 backdrop-blur">
          <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1.5">
            <span>{fmtDate(timeBounds.min)}</span>
            <span className="text-indigo-300 font-medium text-[11px] flex items-center gap-1">
              <Clock size={10} /> {fmtDate(timeBounds.min + (timeBounds.max - timeBounds.min) * timeCutoff)}
            </span>
            <span>{fmtDate(timeBounds.max)}</span>
          </div>
          <input
            type="range" min={0} max={1} step={0.001} value={timeCutoff}
            onChange={(e) => setTimeCutoff(parseFloat(e.target.value))}
            className="w-full accent-indigo-400 cursor-pointer"
            aria-label="Timeline scrubber"
          />
        </div>
      )}

      {/* Node cap notice */}
      {!timeline && totalNodes >= 50 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 text-[11px] text-slate-300 bg-[#161c2b]/90 border border-white/10 rounded-full px-3 py-1 shadow-lg whitespace-nowrap backdrop-blur">
          Showing {totalNodes} connections — click nodes to explore further
        </div>
      )}

      {/* Path tracing indicator / clear */}
      {pathAnimating && (
        <div className="absolute top-3 right-[316px] z-20 flex items-center gap-2 text-[11.5px] text-amber-300 bg-amber-950/60 border border-amber-500/30 rounded-md px-3 py-1.5 shadow-lg backdrop-blur">
          <Loader2 size={11} className="animate-spin" /> Tracing path…
        </div>
      )}
      {activePath.length > 0 && !pathAnimating && (
        <button
          onClick={() => setActivePath([])}
          className="absolute top-3 right-[316px] z-20 text-[11px] text-slate-300 bg-[#161c2b]/90 border border-white/10 rounded-md px-2.5 py-1.5 shadow-lg hover:text-white transition-colors backdrop-blur"
        >
          Clear path
        </button>
      )}

      {/* Overlays */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: CANVAS_BG }}>
          <div className="text-center space-y-2">
            <Loader2 size={22} className="animate-spin mx-auto text-indigo-400" />
            <p className="text-[12.5px] text-slate-400">Loading your Career Graph…</p>
          </div>
        </div>
      )}
      {isError && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: CANVAS_BG }}>
          <div className="text-center space-y-2">
            <AlertTriangle size={22} className="mx-auto text-red-400" />
            <p className="text-[13px] text-slate-400">Failed to load graph. Make sure the API is running.</p>
          </div>
        </div>
      )}
      {isEmpty && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: CANVAS_BG }}>
          <div className="text-center max-w-xs space-y-3 px-6">
            <p className="text-[14px] font-semibold text-slate-100">Your Career Graph is being built</p>
            <p className="text-[12.5px] text-slate-400">Complete your profile to start seeing connections.</p>
            <Link
              href="/profile"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-indigo-500 text-white text-[12.5px] font-medium hover:opacity-90 transition-opacity"
            >
              Complete your profile →
            </Link>
          </div>
        </div>
      )}

      {/* Intelligence Panel */}
      <AnimatePresence>
        {selectedNodeId && (
          <IntelligencePanel
            key={selectedNodeId}
            nodeId={selectedNodeId}
            onClose={() => { setSelectedNodeId(null); selectedRef.current = null; refresh() }}
            onWhyMatch={handleWhyMatch}
            isMobile={isMobile}
            pathChain={!pathAnimating && pathChain.length > 1 ? pathChain : undefined}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
