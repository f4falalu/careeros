'use client'
import { useQuery } from '@tanstack/react-query'
import { Loader2, ArrowRight, AlertTriangle } from 'lucide-react'
import { api } from '@/lib/api'
import type { KGNode, KGEdge } from '@/lib/api'

interface SkillRow {
  node: KGNode
  evidenceCount: number
  maxConfidence: number
}

interface SkillsTabProps {
  onExploreNode: (nodeId: string) => void
}

export function SkillsTab({ onExploreNode }: SkillsTabProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['kg-subgraph-full-skills'],
    queryFn: () => api.graph.subgraph({ depth: 2 }),
    staleTime: 5 * 60_000,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={18} className="animate-spin text-[var(--color-violet)]" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center py-12 gap-2 text-[var(--color-muted)]">
        <AlertTriangle size={16} /> Failed to load skills
      </div>
    )
  }

  const nodes: KGNode[] = data?.nodes ?? []
  const edges: KGEdge[] = data?.edges ?? []

  const skillNodes = nodes.filter((n) => n.type === 'skill')

  const rows: SkillRow[] = skillNodes
    .map((node) => {
      const connected = edges.filter((e) => e.source === node.id || e.target === node.id)
      const evidenceCount = connected.reduce((sum, e) => sum + (e.evidence?.length ?? 0), 0)
      const maxConfidence = connected.length > 0 ? Math.max(...connected.map((e) => e.confidence)) : 0
      return { node, evidenceCount, maxConfidence }
    })
    .sort((a, b) => b.evidenceCount - a.evidenceCount || b.maxConfidence - a.maxConfidence)

  if (rows.length === 0) {
    return (
      <div className="py-12 text-center text-[13px] text-[var(--color-muted)]">
        No skills found in your Career Graph yet.
      </div>
    )
  }

  return (
    <div className="divide-y divide-[var(--color-border)]">
      <div className="px-4 py-2.5 grid grid-cols-[1fr_80px_80px_100px] text-[10.5px] font-600 uppercase tracking-[0.06em] text-[var(--color-faint)]">
        <span>Skill</span>
        <span className="text-center">Evidence</span>
        <span className="text-center">Confidence</span>
        <span />
      </div>
      {rows.map(({ node, evidenceCount, maxConfidence }) => (
        <div
          key={node.id}
          className="px-4 py-3 grid grid-cols-[1fr_80px_80px_100px] items-center hover:bg-[var(--color-bg)] transition-colors"
        >
          <span className="text-[13px] font-medium text-[var(--color-text)]">{node.label}</span>
          <span className="text-center text-[12.5px] text-[var(--color-muted)] tabular">{evidenceCount}</span>
          <div className="flex items-center justify-center gap-1.5">
            <div className="w-12 h-1.5 rounded-full bg-[var(--color-bg)] overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--color-emerald)]"
                style={{ width: `${Math.round(maxConfidence * 100)}%` }}
              />
            </div>
            <span className="text-[11px] text-[var(--color-faint)] tabular">{Math.round(maxConfidence * 100)}%</span>
          </div>
          <button
            onClick={() => onExploreNode(node.id)}
            className="flex items-center gap-1 text-[11.5px] text-[var(--color-violet)] hover:underline justify-end"
          >
            Explore in graph <ArrowRight size={10} />
          </button>
        </div>
      ))}
    </div>
  )
}
