'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Layers, Loader2, CheckCircle2, FileText, ExternalLink } from 'lucide-react'
import { api } from '@/lib/api'
import { formatRelative, titleCase } from '@/lib/utils'
import type { Vvp, VvpAngle, VvpArtifact } from '@/types'

// ── Proposal step ─────────────────────────────────────────────

function AngleCard({
  angle,
  index,
  onSelect,
  pending,
}: {
  angle: VvpAngle
  index: number
  onSelect: (i: number) => void
  pending: boolean
}) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md p-4 hover-lift">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-pill bg-[var(--color-surface-sunken)] text-[var(--color-muted)] uppercase tracking-wide">
            {titleCase(angle.kind.replace(/_/g, ' '))}
          </span>
        </div>
        <span className="text-[11px] text-[var(--color-faint)]">#{index + 1}</span>
      </div>
      <h3 className="text-[14px] font-semibold text-[var(--color-text)] mb-1.5">{angle.title}</h3>
      <p className="text-[12px] text-[var(--color-muted)] leading-relaxed mb-2">{angle.premise}</p>
      <p className="text-[11px] text-[var(--color-faint)] italic mb-4">{angle.why_it_lands}</p>
      <button
        onClick={() => onSelect(index)}
        disabled={pending}
        className="flex items-center gap-1.5 h-8 px-3 rounded-sm text-[12px] font-medium bg-[var(--color-text)] text-[var(--color-bg)] hover:opacity-80 disabled:opacity-40 transition-opacity"
      >
        {pending ? <Loader2 size={12} className="animate-spin" /> : <ChevronRight size={12} />}
        Generate this VVP
      </button>
    </div>
  )
}

// ── Artifact view ─────────────────────────────────────────────

function ArtifactView({ vvp }: { vvp: Vvp }) {
  const artifact = vvp.content.artifact as VvpArtifact | undefined
  if (!artifact) return null

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md">
      {/* Header */}
      <div className="px-6 py-5 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-pill bg-[var(--color-surface-sunken)] text-[var(--color-muted)] uppercase tracking-wide">
            {titleCase((vvp.content.angle?.kind ?? 'vvp').replace(/_/g, ' '))}
          </span>
          <span className="text-[10px] text-[var(--color-faint)]">{formatRelative(vvp.created_at)}</span>
        </div>
        <h2 className="text-[18px] font-semibold text-[var(--color-text)]">{artifact.title}</h2>
      </div>

      <div className="px-6 py-5 space-y-6">
        {/* Executive summary */}
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-faint)] mb-2">
            Executive Summary
          </h3>
          <p className="text-[13px] text-[var(--color-muted)] leading-relaxed">
            {artifact.executive_summary}
          </p>
        </div>

        {/* Sections */}
        {artifact.sections.map((s, i) => (
          <div key={i}>
            <h3 className="text-[13px] font-semibold text-[var(--color-text)] mb-1.5">{s.heading}</h3>
            <p className="text-[13px] text-[var(--color-muted)] leading-relaxed whitespace-pre-wrap">{s.body}</p>
          </div>
        ))}

        {/* Recommendations */}
        {artifact.key_recommendations.length > 0 && (
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-faint)] mb-2">
              Key Recommendations
            </h3>
            <ul className="space-y-1.5">
              {artifact.key_recommendations.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] text-[var(--color-muted)]">
                  <CheckCircle2 size={14} className="shrink-0 mt-0.5 text-[var(--color-faint)]" strokeWidth={1.5} />
                  {r}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Next steps */}
        {artifact.next_steps.length > 0 && (
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-faint)] mb-2">
              Next Steps
            </h3>
            <ol className="space-y-1.5">
              {artifact.next_steps.map((step, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] text-[var(--color-muted)]">
                  <span className="shrink-0 w-4 h-4 rounded-full bg-[var(--color-surface-sunken)] flex items-center justify-center text-[10px] font-medium text-[var(--color-faint)] mt-0.5">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Sources */}
        {vvp.sources.length > 0 && (
          <div className="pt-2 border-t border-[var(--color-border)]">
            <h3 className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-faint)] mb-2">
              Sources
            </h3>
            <ul className="space-y-1">
              {vvp.sources.map((s, i) => (
                <li key={i}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[11px] text-[var(--color-faint)] hover:text-[var(--color-muted)] transition-colors"
                  >
                    <ExternalLink size={10} strokeWidth={1.5} />
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

// ── VVP list item ─────────────────────────────────────────────

function VvpListItem({ vvp, onSelect }: { vvp: Vvp; onSelect: () => void }) {
  const phase = vvp.content.phase
  return (
    <button
      onClick={onSelect}
      className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-sm hover:bg-[var(--color-bg)] transition-colors"
    >
      <FileText size={14} strokeWidth={1.5} className="shrink-0 text-[var(--color-faint)]" />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium text-[var(--color-text)] truncate">{vvp.title}</p>
        <p className="text-[10px] text-[var(--color-faint)]">
          {titleCase(phase)} · {formatRelative(vvp.created_at)}
        </p>
      </div>
      {phase === 'artifact' && (
        <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-pill bg-emerald-500/10 text-emerald-600">
          Done
        </span>
      )}
    </button>
  )
}

// ── Main workspace ────────────────────────────────────────────

export function VvpWorkspace() {
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data: vvps = [], isLoading } = useQuery({
    queryKey: ['vvps'],
    queryFn: () => api.vvp.list(),
    staleTime: 30_000,
  })

  const selectedVvp = vvps.find((v) => v.id === selectedId) ?? vvps[0] ?? null

  const generate = useMutation({
    mutationFn: ({ vvpId, angleIndex }: { vvpId: string; angleIndex: number }) =>
      api.vvp.generate(vvpId, angleIndex),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vvps'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
  })

  return (
    <div className="flex h-full">
      {/* Left: list */}
      <div className="w-[260px] shrink-0 border-r border-[var(--color-border)] flex flex-col">
        <div className="px-5 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <Layers size={16} strokeWidth={1.5} className="text-[var(--color-muted)]" />
            <h2 className="text-[14px] font-semibold text-[var(--color-text)]">VVP Workspace</h2>
          </div>
          <p className="text-[11px] text-[var(--color-faint)] mt-1">
            Value Validation Projects
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin text-[var(--color-faint)]" strokeWidth={1.5} />
            </div>
          ) : vvps.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <Layers size={24} className="mx-auto mb-2 text-[var(--color-faint)]" strokeWidth={1} />
              <p className="text-[12px] text-[var(--color-faint)]">
                No VVPs yet. Click the <strong>Layers</strong> icon on any job card to propose angles.
              </p>
            </div>
          ) : (
            vvps.map((v) => (
              <VvpListItem
                key={v.id}
                vvp={v}
                onSelect={() => setSelectedId(v.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Right: detail */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {!selectedVvp ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Layers size={40} strokeWidth={1} className="text-[var(--color-faint)] mb-3" />
            <p className="text-[14px] text-[var(--color-faint)]">Select a VVP or propose one from a job card</p>
          </div>
        ) : selectedVvp.content.phase === 'proposal' ? (
          <div>
            <div className="mb-6">
              <h2 className="text-[20px] font-semibold text-[var(--color-text)] mb-1">
                Choose an angle
              </h2>
              <p className="text-[13px] text-[var(--color-muted)]">
                Select the VVP angle that best fits the role. The agent will generate a full document.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 max-w-2xl">
              {(selectedVvp.content.proposals ?? []).map((angle, i) => (
                <AngleCard
                  key={i}
                  angle={angle}
                  index={i}
                  onSelect={(idx) => generate.mutate({ vvpId: selectedVvp.id, angleIndex: idx })}
                  pending={generate.isPending}
                />
              ))}
            </div>
          </div>
        ) : (
          <ArtifactView vvp={selectedVvp} />
        )}
      </div>
    </div>
  )
}
