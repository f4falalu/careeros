'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText, Download, CheckCircle, XCircle, Wand2, Loader2, Building2 } from 'lucide-react'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import type { CompanyBrief, Opportunity, ResumeVersion } from '@/types'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
const TOKEN = process.env.NEXT_PUBLIC_APP_SECRET ?? ''

function ScoreBadge({ score }: { score?: number | string | null }) {
  const n = score != null ? Number(score) : null
  if (n == null || isNaN(n)) return null
  const color = n >= 80 ? 'text-success' : n >= 60 ? 'text-warn' : 'text-danger'
  return <span className={`tabular text-[12px] font-semibold ${color}`}>{Math.round(n)}</span>
}

async function downloadPdf(resumeVersionId: string, label: string) {
  const res = await fetch(`${API_URL}/resume-versions/${resumeVersionId}/pdf`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  })
  if (!res.ok) throw new Error(`PDF fetch failed: ${res.status}`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${label.replace(/[^a-z0-9_-]/gi, '_')}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

function ResumeVersionList({ versions }: { versions: ResumeVersion[] }) {
  const [downloading, setDownloading] = useState<string | null>(null)

  if (versions.length === 0) return null

  return (
    <div className="mt-3 space-y-2">
      {versions.map((v) => (
        <div
          key={v.id}
          className="flex items-center gap-3 p-3 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)]"
        >
          {v.validated ? (
            <CheckCircle size={14} strokeWidth={1.5} className="text-success shrink-0" />
          ) : (
            <XCircle size={14} strokeWidth={1.5} className="text-warn shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-medium text-[var(--color-text)] truncate">{v.label}</p>
            <p className="text-[11px] text-[var(--color-muted)]">
              {formatDate(v.created_at)}
              {v.ats_score != null && (
                <> · ATS <ScoreBadge score={v.ats_score} /></>
              )}
              {!v.validated && (
                <span className="ml-1 text-warn"> · not validated</span>
              )}
            </p>
          </div>
          <button
            onClick={async () => {
              setDownloading(v.id)
              try {
                await downloadPdf(v.id, v.label)
              } catch (err) {
                console.error('[pdf]', err)
              } finally {
                setDownloading(null)
              }
            }}
            disabled={downloading === v.id}
            className="shrink-0 flex items-center gap-1 h-7 px-2.5 rounded-sm text-[11px] font-medium bg-[var(--color-surface-sunken)] text-[var(--color-muted)] hover:bg-[var(--color-border)] transition-colors disabled:opacity-40"
          >
            {downloading === v.id ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <Download size={11} strokeWidth={1.5} />
            )}
            PDF
          </button>
        </div>
      ))}
    </div>
  )
}

function BriefSection({ label, items }: { label: string; items: string[] }) {
  if (!items?.length) return null
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-faint)] mb-1">{label}</p>
      <ul className="space-y-0.5">
        {items.map((item, i) => (
          <li key={i} className="text-[12px] text-[var(--color-muted)] leading-relaxed">· {item}</li>
        ))}
      </ul>
    </div>
  )
}

function CompanyBriefPanel({ brief }: { brief: CompanyBrief }) {
  const c = brief.content
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-[12px] font-semibold uppercase tracking-widest text-[var(--color-muted)] flex items-center gap-1.5">
          <Building2 size={12} strokeWidth={1.5} />
          Company Research
        </h4>
        {brief.is_stale && (
          <span className="text-[10px] text-warn">stale</span>
        )}
      </div>
      {c.business_model && (
        <p className="text-[12px] text-[var(--color-muted)] leading-relaxed">{c.business_model}</p>
      )}
      {c.funding && (
        <p className="text-[11px] font-medium text-[var(--color-text)]">Funding: <span className="font-normal text-[var(--color-muted)]">{c.funding}</span></p>
      )}
      <BriefSection label="Products" items={c.products} />
      <BriefSection label="Recent news" items={c.recent_news} />
      <BriefSection label="Culture signals" items={c.culture_signals} />
      <BriefSection label="Hiring signals" items={c.hiring_signals} />
      <BriefSection label="Competitors" items={c.competitors} />
      {brief.sources?.length > 0 && (
        <p className="text-[10px] text-[var(--color-faint)]">{brief.sources.length} source{brief.sources.length > 1 ? 's' : ''}</p>
      )}
    </div>
  )
}

function OpportunityRow({ opp }: { opp: Opportunity }) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(false)

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['opportunity', opp.id],
    queryFn: () => api.opportunities.get(opp.id),
    enabled: expanded,
    staleTime: 60_000,
  })

  const { data: resumeVersions = [] } = useQuery({
    queryKey: ['resume-versions', opp.id],
    queryFn: () => api.resumes.listByOpportunity(opp.id),
    enabled: expanded,
    staleTime: 30_000,
  })

  const { data: company } = useQuery({
    queryKey: ['company', opp.company_id],
    queryFn: () => api.companies.get(opp.company_id!),
    enabled: expanded && !!opp.company_id,
    staleTime: 5 * 60_000,
  })

  const genResume = useMutation({
    mutationFn: () => api.opportunities.resume(opp.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['opportunity', opp.id] })
      // Poll resume versions after a brief delay so the agent task has time to complete
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['resume-versions', opp.id] })
      }, 3000)
    },
  })

  const latestVersion = resumeVersions[0] ?? null

  return (
    <div className="border-b border-[var(--color-border)] last:border-0">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-4 px-6 py-4 hover:bg-[var(--color-bg)] transition-colors text-left"
      >
        <FileText size={16} strokeWidth={1.5} className="shrink-0 text-[var(--color-muted)]" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-[var(--color-text)] truncate">{opp.role_title}</p>
          <p className="text-[11px] text-[var(--color-muted)]">{formatDate(opp.created_at)}</p>
        </div>

        {detail?.match && (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] uppercase tracking-widest text-[var(--color-faint)]">Match</span>
            <ScoreBadge score={detail.match.score} />
          </div>
        )}

        {resumeVersions.length > 0 && (
          <span className="text-[10px] text-[var(--color-muted)] shrink-0">
            {resumeVersions.length} version{resumeVersions.length > 1 ? 's' : ''}
          </span>
        )}

        <button
          onClick={(e) => { e.stopPropagation(); genResume.mutate() }}
          disabled={genResume.isPending}
          className="shrink-0 flex items-center gap-1.5 h-7 px-3 rounded-sm text-[12px] font-medium bg-[var(--color-surface-sunken)] text-[var(--color-text)] hover:bg-[var(--color-border)] transition-colors disabled:opacity-40"
        >
          {genResume.isPending ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Wand2 size={12} strokeWidth={1.5} />
          )}
          {genResume.isPending ? 'Generating…' : 'Generate'}
        </button>
      </button>

      {expanded && (
        <div className="px-6 pb-4 bg-[var(--color-bg)]">
          {detailLoading ? (
            <div className="h-8 w-48 rounded bg-[var(--color-surface)] animate-pulse" />
          ) : (
            <div className="space-y-4">
              {/* Match score detail */}
              {detail?.match && (
                <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-[12px] font-semibold uppercase tracking-widest text-[var(--color-muted)]">
                      Match Analysis
                    </h4>
                    <span className="tabular text-[20px] font-bold text-[var(--color-text)]">
                      {Math.round(Number(detail.match.score))}
                      <span className="text-[13px] font-normal text-[var(--color-muted)]">/100</span>
                    </span>
                  </div>
                  {detail.match.missing_skills?.length > 0 && (
                    <div className="mb-2">
                      <p className="text-[11px] text-[var(--color-muted)] mb-1">Missing skills</p>
                      <div className="flex flex-wrap gap-1">
                        {detail.match.missing_skills.map((s) => (
                          <span key={s} className="text-[11px] px-2 py-0.5 rounded-pill bg-danger/10 text-danger">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {detail.match.rationale && (
                    <p className="text-[12px] text-[var(--color-muted)] leading-relaxed">
                      {detail.match.rationale}
                    </p>
                  )}
                </div>
              )}

              {/* Required skills */}
              {opp.required_skills?.length > 0 && (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--color-faint)] mb-1.5">
                    Required Skills
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {opp.required_skills.map((s) => (
                      <span key={s} className="text-[11px] px-2 py-0.5 rounded-pill bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)]">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Resume versions */}
              <div>
                <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--color-faint)] mb-1.5">
                  Resume Versions
                </p>
                {resumeVersions.length === 0 ? (
                  <div className="flex items-center gap-2 text-[12px] text-[var(--color-muted)]">
                    <XCircle size={14} strokeWidth={1.5} className="text-[var(--color-faint)]" />
                    No resume generated yet. Click Generate to create one.
                  </div>
                ) : (
                  <ResumeVersionList versions={resumeVersions} />
                )}
              </div>

              {/* Company research brief */}
              {company?.latest_brief && (
                <CompanyBriefPanel brief={company.latest_brief} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function ResumeStudio() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['opportunities', { limit: 100 }],
    queryFn: () => api.opportunities.list({ limit: 100 }),
  })

  const opps = data?.items ?? []

  return (
    <div className="max-w-3xl">
      {/* Intro card */}
      <div className="bg-[#E9EDE3] border-0 rounded-md p-6 mb-6">
        <h2 className="text-[20px] font-semibold text-[#111] mb-1">Resume Studio</h2>
        <p className="text-[13px] text-[#444] leading-relaxed">
          Generate tailored resume versions for each opportunity. Every version is validated against
          your master profile — no fabrication, facts only.
        </p>
      </div>

      {/* Opportunities list */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <h3 className="text-[14px] font-semibold text-[var(--color-text)]">
            Your Jobs ({opps.length})
          </h3>
        </div>

        {isError ? (
          <div className="px-6 py-4 text-[13px] text-danger">
            Failed to load jobs — check that the API is running.
          </div>
        ) : isLoading ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 rounded bg-[var(--color-surface-sunken)] animate-pulse" />
            ))}
          </div>
        ) : opps.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <FileText size={32} strokeWidth={1} className="mx-auto mb-3 text-[var(--color-faint)]" />
            <p className="text-[13px] text-[var(--color-muted)]">
              No jobs yet. Add jobs from the header to start generating resumes.
            </p>
          </div>
        ) : (
          <div>
            {opps.map((opp) => (
              <OpportunityRow key={opp.id} opp={opp} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
