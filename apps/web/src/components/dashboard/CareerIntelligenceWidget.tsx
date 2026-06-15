'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { ArrowRight, Sparkles, TrendingUp, RefreshCw } from 'lucide-react'
import { api } from '@/lib/api'
import type { KGInference } from '@/lib/api'

function MomentumIndicator({ inferences }: { inferences: Record<string, KGInference[]> }) {
  const strengths = inferences.strength ?? []
  const themes = inferences.theme ?? []
  if (strengths.length === 0 && themes.length === 0) return null

  const avgConfidence = strengths.length > 0
    ? Math.round((strengths.reduce((s, i) => s + i.confidence, 0) / strengths.length) * 100)
    : 0

  return (
    <div className="flex items-center gap-1.5 text-[11.5px] text-[var(--color-emerald)]">
      <TrendingUp size={11} strokeWidth={2} />
      <span className="font-medium">{avgConfidence}% Career Momentum</span>
    </div>
  )
}

export function CareerIntelligenceWidget() {
  const qc = useQueryClient()
  const { data: inferences = {}, isLoading } = useQuery({
    queryKey: ['graph-inferences'],
    queryFn: () => api.graph.inferences(),
    staleTime: 5 * 60_000,
  })

  const inferMutation = useMutation({
    mutationFn: () => api.graph.infer(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['graph-inferences'] }),
  })

  const themes: KGInference[] = (inferences.theme ?? []).slice(0, 3)
  const isEmpty = !isLoading && themes.length === 0 && Object.keys(inferences).length === 0

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-[var(--color-violet-dim)] flex items-center justify-center">
            <Sparkles size={10} className="text-[var(--color-violet)]" />
          </div>
          <h3 className="text-[14px] font-semibold text-[var(--color-text)]">Career Intelligence</h3>
        </div>
        <Link
          href="/career-intelligence"
          className="flex items-center gap-1 text-[11.5px] text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
        >
          View Intelligence <ArrowRight size={11} />
        </Link>
      </div>
      <p className="text-[11.5px] text-[var(--color-muted)] mb-4">Your career graph intelligence</p>

      {isLoading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-6 rounded bg-[var(--color-bg)] animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && isEmpty && (
        <div className="text-center py-3">
          <p className="text-[12px] text-[var(--color-muted)] mb-3">
            Your Career Graph is being built — generate insights to see your themes.
          </p>
          <button
            onClick={() => inferMutation.mutate()}
            disabled={inferMutation.isPending}
            className="flex items-center gap-1.5 mx-auto px-3 py-1.5 rounded-md bg-[var(--color-violet)] text-white text-[11.5px] font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            <RefreshCw size={11} className={inferMutation.isPending ? 'animate-spin' : ''} />
            {inferMutation.isPending ? 'Generating…' : 'Generate Insights'}
          </button>
        </div>
      )}

      {!isLoading && !isEmpty && (
        <div className="space-y-3">
          <MomentumIndicator inferences={inferences} />

          <div className="space-y-1.5">
            <p className="text-[10.5px] font-600 uppercase tracking-[0.06em] text-[var(--color-faint)]">
              Career Themes
            </p>
            {themes.length > 0 ? (
              themes.map((theme) => (
                <div key={theme.id} className="flex items-center justify-between">
                  <span className="text-[12.5px] text-[var(--color-text)] font-medium">{theme.label}</span>
                  <div className="flex items-center gap-1.5">
                    <div className="w-16 h-1 rounded-full bg-[var(--color-bg)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[var(--color-violet)]"
                        style={{ width: `${Math.round(theme.confidence * 100)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-[var(--color-faint)] tabular w-6 text-right">
                      {Math.round(theme.confidence * 100)}%
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-[12px] text-[var(--color-faint)]">No themes detected yet</p>
            )}
          </div>

          {(inferences.strength ?? []).length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10.5px] font-600 uppercase tracking-[0.06em] text-[var(--color-faint)]">
                Top Strengths
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(inferences.strength ?? []).slice(0, 4).map((s) => (
                  <span
                    key={s.id}
                    className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--color-emerald-dim)] text-[var(--color-emerald)]"
                  >
                    {s.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
