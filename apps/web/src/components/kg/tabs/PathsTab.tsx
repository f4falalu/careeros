'use client'
import { useState, useRef, useEffect } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Search, ArrowRight, AlertTriangle, Loader2, PlayCircle } from 'lucide-react'
import { api } from '@/lib/api'
import type { KGNode, KGEdge } from '@/lib/api'

interface PathsTabProps {
  onAnimatePath: (path: string[]) => void
}

function NodeAutocomplete({
  label,
  nodes,
  value,
  onChange,
}: {
  label: string
  nodes: KGNode[]
  value: KGNode | null
  onChange: (node: KGNode | null) => void
}) {
  const [query, setQuery] = useState(value?.label ?? '')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    setQuery(value?.label ?? '')
  }, [value])

  const filtered = query.trim()
    ? nodes.filter((n) => n.label.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : []

  return (
    <div ref={ref} className="relative">
      <p className="text-[10.5px] font-600 uppercase tracking-[0.06em] text-[var(--color-faint)] mb-1">{label}</p>
      <div className="flex items-center gap-2 px-2.5 py-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] focus-within:border-[var(--color-violet)]">
        <Search size={12} className="text-[var(--color-faint)] shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            if (!e.target.value) onChange(null)
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search nodes…"
          className="flex-1 text-[12.5px] text-[var(--color-text)] bg-transparent outline-none placeholder:text-[var(--color-faint)]"
        />
        {value && (
          <button
            onClick={() => { onChange(null); setQuery('') }}
            className="text-[var(--color-faint)] hover:text-[var(--color-muted)] text-[11px]"
          >
            ✕
          </button>
        )}
      </div>

      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[var(--color-border)] rounded-md shadow-lg z-50 overflow-hidden">
          {filtered.map((n) => (
            <button
              key={n.id}
              onClick={() => { onChange(n); setQuery(n.label); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--color-bg)] transition-colors"
            >
              <span className="text-[9.5px] font-bold uppercase tracking-wide text-[var(--color-faint)] w-16 shrink-0">
                {n.type}
              </span>
              <span className="text-[12.5px] text-[var(--color-text)] truncate">{n.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function PathsTab({ onAnimatePath }: PathsTabProps) {
  const [fromNode, setFromNode] = useState<KGNode | null>(null)
  const [toNode, setToNode] = useState<KGNode | null>(null)
  const [pathNodeIds, setPathNodeIds] = useState<string[]>([])

  const { data: subgraphData } = useQuery({
    queryKey: ['kg-subgraph-full-paths'],
    queryFn: () => api.graph.subgraph({ depth: 2 }),
    staleTime: 5 * 60_000,
  })

  const nodes: KGNode[] = subgraphData?.nodes ?? []
  const edges: KGEdge[] = subgraphData?.edges ?? []
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))

  const pathMutation = useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) => api.graph.paths(from, to),
    onSuccess: (data) => setPathNodeIds(data.path),
  })

  const handleFind = () => {
    if (!fromNode || !toNode) return
    pathMutation.mutate({ from: fromNode.id, to: toNode.id })
  }

  const noPath = pathMutation.isSuccess && pathNodeIds.length === 0

  return (
    <div className="p-4 space-y-4">
      <p className="text-[12.5px] text-[var(--color-muted)]">
        Discover how any two nodes in your Career Graph are connected.
      </p>

      <NodeAutocomplete label="From" nodes={nodes} value={fromNode} onChange={setFromNode} />
      <NodeAutocomplete label="To" nodes={nodes} value={toNode} onChange={setToNode} />

      <button
        onClick={handleFind}
        disabled={!fromNode || !toNode || pathMutation.isPending}
        className="w-full flex items-center justify-center gap-2 h-9 rounded-md bg-[var(--color-violet)] text-white text-[12.5px] font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
      >
        {pathMutation.isPending ? (
          <><Loader2 size={13} className="animate-spin" /> Finding path…</>
        ) : (
          <><Search size={13} /> Find Connection</>
        )}
      </button>

      {noPath && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-[var(--color-bg)] border border-[var(--color-border)] text-[12.5px] text-[var(--color-muted)]">
          <AlertTriangle size={14} className="text-amber-400 shrink-0" />
          No direct path found between these nodes.
        </div>
      )}

      {pathNodeIds.length > 0 && (
        <div className="space-y-3">
          <div className="rounded-lg border border-[var(--color-border)] overflow-hidden">
            <div className="px-3 py-2 bg-[var(--color-bg)] border-b border-[var(--color-border)] flex items-center justify-between">
              <span className="text-[11.5px] font-semibold text-[var(--color-text)]">
                Path ({pathNodeIds.length} step{pathNodeIds.length !== 1 ? 's' : ''})
              </span>
              <button
                onClick={() => onAnimatePath(pathNodeIds)}
                className="flex items-center gap-1.5 text-[11.5px] text-[var(--color-violet)] font-medium hover:underline"
              >
                <PlayCircle size={12} /> Animate in graph
              </button>
            </div>
            <div className="p-3 space-y-2">
              {pathNodeIds.map((nodeId, i) => {
                const node = nodeMap.get(nodeId)
                const nextEdge = i < pathNodeIds.length - 1
                  ? edges.find(
                      (e) =>
                        (e.source === nodeId && e.target === pathNodeIds[i + 1]) ||
                        (e.target === nodeId && e.source === pathNodeIds[i + 1]),
                    )
                  : null
                return (
                  <div key={nodeId}>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-[var(--color-violet)] shrink-0" />
                      <span className="text-[12.5px] font-medium text-[var(--color-text)]">
                        {node?.label ?? nodeId}
                      </span>
                      {node && (
                        <span className="text-[10px] text-[var(--color-faint)] uppercase tracking-wide">
                          {node.type}
                        </span>
                      )}
                    </div>
                    {nextEdge && (
                      <div className="flex items-center gap-2 ml-1 my-1">
                        <div className="w-px h-4 bg-[var(--color-border)] ml-0.5" />
                        <span className="text-[10px] text-[var(--color-faint)] font-mono">
                          {nextEdge.relationship}
                        </span>
                        <ArrowRight size={10} className="text-[var(--color-faint)]" />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
