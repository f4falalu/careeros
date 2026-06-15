'use client'
import { useQuery } from '@tanstack/react-query'
import { Loader2, AlertTriangle } from 'lucide-react'
import { api } from '@/lib/api'
import type { KGNode, KGEdge } from '@/lib/api'

interface EvidenceGroup {
  sourceNode: KGNode
  items: Array<{ text: string; confidence: number; relationship: string }>
}

function renderEvidence(ev: unknown): string {
  if (typeof ev === 'string') return ev
  if (typeof ev === 'object' && ev !== null) {
    const o = ev as Record<string, unknown>
    const text = o.text ?? o.content ?? o.description ?? o.summary
    return typeof text === 'string' ? text : JSON.stringify(ev).slice(0, 120)
  }
  return String(ev)
}

export function EvidenceTab() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['kg-subgraph-full-evidence'],
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
        <AlertTriangle size={16} /> Failed to load evidence
      </div>
    )
  }

  const nodes: KGNode[] = data?.nodes ?? []
  const edges: KGEdge[] = data?.edges ?? []
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))

  // Group evidence by source node (project or experience)
  const groupMap = new Map<string, EvidenceGroup>()

  for (const edge of edges) {
    const evidenceItems = (edge.evidence ?? []).filter(Boolean)
    if (evidenceItems.length === 0) continue

    const sourceNode = nodeMap.get(edge.source)
    if (!sourceNode) continue
    if (!['project', 'experience'].includes(sourceNode.type)) continue

    if (!groupMap.has(sourceNode.id)) {
      groupMap.set(sourceNode.id, { sourceNode, items: [] })
    }
    for (const ev of evidenceItems) {
      groupMap.get(sourceNode.id)!.items.push({
        text: renderEvidence(ev),
        confidence: edge.confidence,
        relationship: edge.relationship,
      })
    }
  }

  const groups = [...groupMap.values()].sort((a, b) => b.items.length - a.items.length)

  if (groups.length === 0) {
    return (
      <div className="py-12 text-center text-[13px] text-[var(--color-muted)]">
        No evidence recorded yet. Run the graph backfill to populate evidence from your profile.
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4">
      {groups.map(({ sourceNode, items }) => (
        <section key={sourceNode.id}>
          <div className="flex items-center gap-2 mb-2">
            <span
              className="px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase tracking-wide text-[var(--color-violet)] bg-[var(--color-violet-dim)]"
            >
              {sourceNode.type}
            </span>
            <h3 className="text-[13.5px] font-semibold text-[var(--color-text)]">{sourceNode.label}</h3>
            <span className="text-[11px] text-[var(--color-faint)] ml-auto">{items.length} items</span>
          </div>
          <ul className="space-y-2">
            {items.slice(0, 10).map((item, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <div
                  className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: `hsl(${140 + Math.round(item.confidence * 40)}, 60%, 50%)` }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] text-[var(--color-text)] leading-relaxed">{item.text}</p>
                  <p className="text-[10.5px] text-[var(--color-faint)] mt-0.5">
                    {item.relationship} · {Math.round(item.confidence * 100)}% confidence
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
