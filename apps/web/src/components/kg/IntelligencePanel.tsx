'use client'
import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { X, ExternalLink, AlertTriangle, RefreshCw, Zap, Target } from 'lucide-react'
import { api } from '@/lib/api'
import type { KGNode, KGEdge } from '@/lib/api'
import { NODE_TYPE_STYLES, truncateLabel, getEntityPath } from './types'

interface PathStep {
  label: string
  nodeType: string
  relationship?: string
}

interface IntelligencePanelProps {
  nodeId: string
  onClose: () => void
  onWhyMatch?: (nodeId: string) => void
  isMobile: boolean
  pathChain?: PathStep[]
}

function EvidenceItem({ item }: { item: unknown }) {
  if (typeof item === 'string') return <li className="text-[12px] text-[var(--color-text)] leading-relaxed">{item}</li>
  if (typeof item === 'object' && item !== null) {
    const obj = item as Record<string, unknown>
    return (
      <li className="text-[12px] text-[var(--color-text)] leading-relaxed">
        {String(obj.text ?? obj.content ?? obj.description ?? obj.summary ?? JSON.stringify(item)).slice(0, 120)}
      </li>
    )
  }
  return null
}

export function IntelligencePanel({ nodeId, onClose, onWhyMatch, isMobile, pathChain }: IntelligencePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['kg-node-detail', nodeId],
    queryFn: () => api.graph.node(nodeId),
    staleTime: 60_000,
  })

  const node: KGNode | undefined = data?.node
  const edges: KGEdge[] = data?.edges ?? []

  // Fix 4 (Req 21): fetch real capability gaps from the dedicated endpoint
  const { data: capabilityGaps = [] } = useQuery({
    queryKey: ['graph-gaps', node?.entityId],
    queryFn: () => api.graph.gaps(node!.entityId!),
    enabled: node?.type === 'opportunity' && !!node.entityId,
    staleTime: 60_000,
  })

  // Close on escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const style = NODE_TYPE_STYLES[node?.type ?? ''] ?? { color: '#9ca3af', bg: '#f9fafb', size: 'md' as const }
  // Fix 4 (Req 21): use entityId so opportunity links resolve to the DB record, not the graph node UUID
  const entityPath = node ? getEntityPath(node.type, node.entityId ?? node.id) : null

  const maxConf = edges.length > 0 ? Math.max(...edges.map((e) => e.confidence)) : null
  const allEvidence = edges.flatMap((e) => e.evidence).filter(Boolean).slice(0, 8)

  const relatedOpps = (node?.type === 'skill' || node?.type === 'project')
    ? edges
        .filter((e) => e.relationship === 'MATCHES' || e.relationship === 'TARGETS' || e.relationship === 'REQUIRED_BY')
        .slice(0, 4)
    : []

  const panelVariants = isMobile
    ? { hidden: { y: '100%', opacity: 0 }, visible: { y: 0, opacity: 1 }, exit: { y: '100%', opacity: 0 } }
    : { hidden: { x: 300, opacity: 0 }, visible: { x: 0, opacity: 1 }, exit: { x: 300, opacity: 0 } }

  const panelClass = isMobile
    ? 'fixed inset-x-0 bottom-0 z-50 max-h-[70vh] rounded-t-2xl bg-white shadow-2xl overflow-y-auto'
    : 'absolute right-0 top-0 h-full w-[300px] z-40 bg-white border-l border-[var(--color-border)] shadow-xl overflow-y-auto'

  return (
    <motion.div
      ref={panelRef}
      className={panelClass}
      variants={panelVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-[var(--color-border)] px-4 py-3 flex items-start justify-between z-10">
        <div className="flex-1 min-w-0">
          {isLoading ? (
            <div className="h-4 w-32 rounded bg-[var(--color-bg)] animate-pulse" />
          ) : node ? (
            <>
              <div className="flex items-center gap-2 mb-0.5">
                <span
                  className="px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase tracking-wide"
                  style={{ color: style.color, backgroundColor: style.bg }}
                >
                  {node.type}
                </span>
                {maxConf !== null && (
                  <span className="text-[10.5px] font-semibold" style={{ color: style.color }}>
                    {Math.round(maxConf * 100)}% confidence
                  </span>
                )}
              </div>
              <h2
                className="text-[14px] font-semibold text-[var(--color-text)] leading-tight"
                title={node.label}
              >
                {truncateLabel(node.label, 50)}
              </h2>
            </>
          ) : null}
        </div>
        <button
          onClick={onClose}
          className="ml-3 shrink-0 p-1 rounded text-[var(--color-faint)] hover:text-[var(--color-muted)] hover:bg-[var(--color-bg)] transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div className="p-4 space-y-4">
        {isLoading && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-4 rounded bg-[var(--color-bg)] animate-pulse" />
            ))}
          </div>
        )}

        {isError && (
          <div className="text-center py-4">
            <AlertTriangle size={18} className="mx-auto mb-2 text-red-400" />
            <p className="text-[12px] text-[var(--color-muted)] mb-3">Failed to load node details.</p>
            <button
              onClick={() => refetch()}
              className="flex items-center gap-1.5 mx-auto px-3 py-1.5 rounded-md bg-[var(--color-bg)] border border-[var(--color-border)] text-[11.5px] text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-colors"
            >
              <RefreshCw size={11} /> Retry
            </button>
          </div>
        )}

        {!isLoading && !isError && node && (
          <>
            {/* Fix 6 (Req 26): path chain displayed after animation completes */}
            {pathChain && pathChain.length > 1 && (
              <section>
                <p className="text-[10.5px] font-600 uppercase tracking-[0.06em] text-[var(--color-faint)] mb-2">
                  Evidence Path
                </p>
                <div className="space-y-0">
                  {pathChain.map((step, i) => (
                    <div key={i}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: NODE_TYPE_STYLES[step.nodeType]?.color ?? '#9ca3af' }}
                        />
                        <span className="text-[12px] font-medium text-[var(--color-text)]">{step.label}</span>
                        <span className="text-[9.5px] text-[var(--color-faint)] uppercase">{step.nodeType}</span>
                      </div>
                      {step.relationship && (
                        <div className="flex items-center gap-2 ml-1 my-0.5">
                          <div className="w-px h-3 bg-[var(--color-border)] ml-0.5" />
                          <span className="text-[10px] text-[var(--color-faint)] font-mono">{step.relationship}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Evidence */}
            {allEvidence.length > 0 && (
              <section>
                <p className="text-[10.5px] font-600 uppercase tracking-[0.06em] text-[var(--color-faint)] mb-2">
                  Evidence
                </p>
                <ul className="space-y-1.5 list-disc list-inside pl-1">
                  {allEvidence.map((ev, i) => (
                    <EvidenceItem key={i} item={ev} />
                  ))}
                </ul>
              </section>
            )}

            {allEvidence.length === 0 && (!pathChain || pathChain.length === 0) && (
              <p className="text-[12px] text-[var(--color-faint)] italic">No evidence recorded for this node yet.</p>
            )}

            {/* Opportunity-specific: Why am I a match + capability gaps */}
            {node.type === 'opportunity' && (
              <>
                {onWhyMatch && (
                  <button
                    onClick={() => onWhyMatch(nodeId)}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-[12px] font-medium hover:bg-amber-100 transition-colors"
                  >
                    <Zap size={12} />
                    Why am I a match?
                  </button>
                )}
                {capabilityGaps.length > 0 && (
                  <section>
                    <p className="text-[10.5px] font-600 uppercase tracking-[0.06em] text-[var(--color-faint)] mb-2">
                      Capability Gaps
                    </p>
                    <div className="space-y-1">
                      {capabilityGaps.map((gap, i) => (
                        <div key={i} className="flex items-center gap-2 text-[12px] text-amber-700">
                          <AlertTriangle size={11} className="shrink-0" />
                          {gap}
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}

            {/* Skill/Project: related opportunities */}
            {(node.type === 'skill' || node.type === 'project') && relatedOpps.length > 0 && (
              <section>
                <p className="text-[10.5px] font-600 uppercase tracking-[0.06em] text-[var(--color-faint)] mb-2">
                  Related Opportunities
                </p>
                <div className="space-y-1">
                  {relatedOpps.map((e) => (
                    <div key={e.id} className="flex items-center gap-2 text-[12px] text-[var(--color-text)]">
                      <Target size={11} className="shrink-0 text-[var(--color-muted)]" />
                      <span>{e.target}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Connections count */}
            {edges.length > 0 && (
              <section>
                <p className="text-[10.5px] font-600 uppercase tracking-[0.06em] text-[var(--color-faint)] mb-1.5">
                  Connections
                </p>
                <p className="text-[12px] text-[var(--color-muted)]">
                  {edges.length} edge{edges.length !== 1 ? 's' : ''} in the graph
                </p>
              </section>
            )}

            {/* View details link */}
            {entityPath && (
              <Link
                href={entityPath}
                className="flex items-center gap-1.5 text-[12px] text-[var(--color-violet)] hover:underline"
              >
                <ExternalLink size={11} />
                View full details
              </Link>
            )}
          </>
        )}
      </div>
    </motion.div>
  )
}
