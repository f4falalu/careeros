'use client'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, AlertTriangle, ChevronDown, RefreshCw } from 'lucide-react'
import { api } from '@/lib/api'
import type { KGInference } from '@/lib/api'

const SECTION_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  strength: { label: 'Strengths',     color: '#10b981', bg: '#ecfdf5' },
  weakness: { label: 'Weaknesses',    color: '#f59e0b', bg: '#fffbeb' },
  interest: { label: 'Interests',     color: '#6366f1', bg: '#eef2ff' },
  theme:    { label: 'Career Themes', color: '#06b6d4', bg: '#ecfeff' },
}

function InferenceCard({
  inference,
  color,
  bg,
  onExplore,
}: {
  inference: KGInference
  color: string
  bg: string
  onExplore?: (nodeId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const evidence = inference.evidence as Record<string, unknown> | null
  const hasDetails = Boolean(evidence && (evidence.nodeId || evidence.count || evidence.source))

  return (
    <div
      className="rounded-lg border overflow-hidden transition-colors"
      style={{ borderColor: open ? color : '#e5e7eb', backgroundColor: open ? bg : 'white' }}
    >
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-1 h-4 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-[13px] font-medium text-[var(--color-text)]">{inference.label}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] font-semibold tabular" style={{ color }}>
            {Math.round(inference.confidence * 100)}%
          </span>
          {hasDetails && (
            <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown size={12} className="text-[var(--color-faint)]" />
            </motion.div>
          )}
        </div>
      </button>

      <AnimatePresence>
        {open && hasDetails && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 pt-1 space-y-1.5 border-t" style={{ borderColor: `${color}33` }}>
              {evidence?.count !== undefined && (
                <p className="text-[11.5px] text-[var(--color-muted)]">
                  Demonstrated <strong>{String(evidence.count)}</strong> times across your graph
                </p>
              )}
              {Boolean(evidence?.source) && (
                <p className="text-[11.5px] text-[var(--color-muted)]">
                  Source: <span className="font-medium">{String(evidence!.source)}</span>
                </p>
              )}
              {Boolean(evidence?.nodeId) && onExplore && (
                <button
                  onClick={() => onExplore(String(evidence?.nodeId))}
                  className="text-[11.5px] font-medium hover:underline"
                  style={{ color }}
                >
                  Explore in graph →
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

interface InsightsTabProps {
  onExploreNode: (nodeId: string) => void
}

export function InsightsTab({ onExploreNode }: InsightsTabProps) {
  const qc = useQueryClient()
  const { data: inferences = {}, isLoading, isError } = useQuery({
    queryKey: ['graph-inferences'],
    queryFn: () => api.graph.inferences(),
    staleTime: 5 * 60_000,
  })

  const inferMutation = useMutation({
    mutationFn: () => api.graph.infer(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['graph-inferences'] }),
  })

  const isEmpty = !isLoading && Object.values(inferences).every((arr: KGInference[]) => arr.length === 0)

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
        <AlertTriangle size={16} /> Failed to load insights
      </div>
    )
  }

  if (isEmpty) {
    return (
      <div className="py-12 text-center space-y-3 px-6">
        <p className="text-[13px] text-[var(--color-muted)]">
          No insights generated yet. Run the inference engine to discover your career patterns.
        </p>
        <button
          onClick={() => inferMutation.mutate()}
          disabled={inferMutation.isPending}
          className="flex items-center gap-2 mx-auto px-4 py-2 rounded-md bg-[var(--color-violet)] text-white text-[12.5px] font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          <RefreshCw size={12} className={inferMutation.isPending ? 'animate-spin' : ''} />
          {inferMutation.isPending ? 'Generating…' : 'Generate Insights'}
        </button>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-6">
      {Object.entries(SECTION_CONFIG).map(([type, config]) => {
        const items: KGInference[] = (inferences[type] ?? []).slice(0, 10)
        if (items.length === 0) return null
        return (
          <section key={type}>
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-[12px] font-600 uppercase tracking-[0.06em]" style={{ color: config.color }}>
                {config.label}
              </h3>
              <span className="text-[11px] text-[var(--color-faint)]">{items.length} detected</span>
            </div>
            <div className="space-y-2">
              {items.map((inf) => (
                <InferenceCard
                  key={inf.id}
                  inference={inf}
                  color={config.color}
                  bg={config.bg}
                  onExplore={onExploreNode}
                />
              ))}
            </div>
          </section>
        )
      })}

      <div className="pt-2 border-t border-[var(--color-border)]">
        <button
          onClick={() => inferMutation.mutate()}
          disabled={inferMutation.isPending}
          className="flex items-center gap-1.5 text-[11.5px] text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors disabled:opacity-50"
        >
          <RefreshCw size={11} className={inferMutation.isPending ? 'animate-spin' : ''} />
          {inferMutation.isPending ? 'Refreshing…' : 'Refresh Insights'}
        </button>
      </div>
    </div>
  )
}
