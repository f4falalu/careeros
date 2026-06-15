'use client'
import { use } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import {
  ArrowLeft,
  MapPin,
  DollarSign,
  Calendar,
  ExternalLink,
  Zap,
  FileText,
  Wand2,
  Layers,
  Mail,
  Mic,
  Send,
  Building2,
  Target,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Clock,
  Users,
  MessageSquare,
  ChevronRight,
  BookOpen,
} from 'lucide-react'
import { api } from '@/lib/api'
import { cn, titleCase, formatRelative } from '@/lib/utils'
import type { OpportunityDetail, CompanyBrief, Vvp, OutreachMessage, InterviewBrief } from '@/types'

// ── Helpers ───────────────────────────────────────────────────

function MatchBadge({ score, opportunityId }: { score: number; opportunityId?: string }) {
  const color =
    score >= 90 ? 'text-emerald-600 bg-emerald-50 border-emerald-200' :
    score >= 75 ? 'text-amber-600 bg-amber-50 border-amber-200' :
                  'text-[var(--color-muted)] bg-[var(--color-surface-sunken)] border-[var(--color-border)]'
  const badge = (
    <span className={cn('inline-flex items-center gap-1 px-2.5 py-1 rounded-pill border text-[12px] font-bold tabular transition-opacity hover:opacity-80', color)}>
      {score}% Match
    </span>
  )
  if (!opportunityId) return badge
  return (
    <Link href={`/career-intelligence?pathTo=${opportunityId}`} title="See why you match in Career Intelligence">
      {badge}
    </Link>
  )
}

function ScoreBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.round((value / max) * 100)
  const color = pct >= 90 ? '#10B981' : pct >= 75 ? '#F59E0B' : '#9CA3AF'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-[var(--color-surface-sunken)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[11px] font-bold tabular w-8 text-right" style={{ color }}>
        {pct}%
      </span>
    </div>
  )
}

function ActionButton({
  label,
  icon: Icon,
  onClick,
  loading,
  variant = 'default',
  title,
}: {
  label: string
  icon: React.ElementType
  onClick: () => void
  loading?: boolean
  variant?: 'default' | 'primary' | 'danger'
  title?: string
}) {
  return (
    <button
      title={title ?? label}
      onClick={onClick}
      disabled={loading}
      className={cn(
        'flex items-center gap-2 h-9 px-4 rounded-sm text-[12px] font-medium transition-colors disabled:opacity-40',
        variant === 'primary'
          ? 'bg-[var(--color-text)] text-[var(--color-bg)] hover:opacity-80'
          : variant === 'danger'
          ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
          : 'bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)]',
      )}
    >
      <Icon size={13} strokeWidth={1.5} />
      {loading ? 'Working…' : label}
    </button>
  )
}

// ── Section shell ─────────────────────────────────────────────

function Panel({
  title,
  icon: Icon,
  children,
  className,
}: {
  title: string
  icon?: React.ElementType
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md', className)}>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
        {Icon && <Icon size={13} strokeWidth={1.5} className="text-[var(--color-muted)]" />}
        <h3 className="text-[12px] font-semibold text-[var(--color-text)] uppercase tracking-wide">
          {title}
        </h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

// ── Match analysis ────────────────────────────────────────────

function MatchPanel({ detail }: { detail: OpportunityDetail }) {
  const qc = useQueryClient()
  const runMatch = useMutation({
    mutationFn: () => api.opportunities.match(detail.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      // Refresh after a short delay so the task can settle
      setTimeout(() => qc.invalidateQueries({ queryKey: ['opportunity', detail.id] }), 4000)
    },
  })

  if (!detail.match) {
    return (
      <Panel title="Match Analysis" icon={Target}>
        <div className="text-center py-4">
          <p className="text-[12px] text-[var(--color-faint)] mb-3">
            Run the match agent to see how well your profile fits this role
          </p>
          <button
            onClick={() => runMatch.mutate()}
            disabled={runMatch.isPending}
            className="flex items-center gap-1.5 mx-auto h-8 px-4 rounded-sm text-[12px] font-medium bg-[var(--color-text)] text-[var(--color-bg)] hover:opacity-80 disabled:opacity-40"
          >
            <Zap size={12} strokeWidth={1.5} />
            {runMatch.isPending ? 'Queued…' : 'Compute Match Score'}
          </button>
        </div>
      </Panel>
    )
  }

  const score = Number(detail.match.score)
  const missing = detail.match.missing_skills ?? []
  const required = detail.required_skills ?? []
  const matched = required.filter((s) => !missing.includes(s))

  return (
    <Panel title="Match Analysis" icon={Target}>
      <div className="space-y-4">
        {/* Overall */}
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div
              className={cn(
                'text-[28px] font-bold tabular leading-none',
                score >= 90 ? 'text-emerald-600' : score >= 75 ? 'text-amber-500' : 'text-[var(--color-muted)]',
              )}
            >
              {Math.round(score)}%
            </div>
            <div className="text-[10px] text-[var(--color-faint)] mt-0.5">Overall Match</div>
          </div>
          <div className="flex-1">
            <ScoreBar value={score} />
            {detail.match.rationale && (
              <p className="text-[11px] text-[var(--color-muted)] mt-2 leading-relaxed">
                {detail.match.rationale}
              </p>
            )}
          </div>
        </div>

        {/* Strengths */}
        {matched.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-2">
              Strong Match
            </p>
            <div className="flex flex-wrap gap-1.5">
              {matched.map((s) => (
                <span
                  key={s}
                  className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200"
                >
                  <CheckCircle2 size={9} strokeWidth={2} />
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Gaps */}
        {missing.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-2">
              Gap
            </p>
            <div className="flex flex-wrap gap-1.5">
              {missing.map((s) => (
                <span
                  key={s}
                  className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200"
                >
                  <AlertCircle size={9} strokeWidth={2} />
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        <p className="text-[10px] text-[var(--color-faint)]">
          Computed {formatRelative(detail.match.computed_at)}
        </p>
      </div>
    </Panel>
  )
}

// ── AI Insights panel ─────────────────────────────────────────

function InsightsPanel({ detail, brief }: { detail: OpportunityDetail; brief?: CompanyBrief | null }) {
  return (
    <Panel title="AI Insights" icon={Zap}>
      <div className="space-y-4">
        {/* Pipeline stage if tracked */}
        {detail.application && (
          <div>
            <p className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-1.5">
              Pipeline Stage
            </p>
            <span className={cn('stage-' + detail.application.stage, 'inline-block text-[11px] font-medium px-2.5 py-1 rounded-pill')}>
              {titleCase(detail.application.stage)}
            </span>
          </div>
        )}

        {/* Hiring signals from brief */}
        {brief?.content.hiring_signals && brief.content.hiring_signals.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-1.5">
              Hiring Signals
            </p>
            <div className="space-y-1">
              {brief.content.hiring_signals.map((signal, i) => (
                <div key={i} className="flex items-center gap-2 text-[12px] text-emerald-600">
                  <CheckCircle2 size={10} strokeWidth={2} />
                  {signal}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Funding */}
        {brief?.content.funding && (
          <div>
            <p className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-1">
              Funding
            </p>
            <p className="text-[12px] text-[var(--color-text)]">{brief.content.funding}</p>
          </div>
        )}

        {/* Work model + location */}
        {(detail.work_model || detail.location) && (
          <div>
            <p className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-1.5">
              Setup
            </p>
            <div className="flex flex-wrap gap-1.5">
              {detail.work_model && detail.work_model !== 'unknown' && (
                <span className="text-[11px] px-2 py-0.5 rounded-pill bg-[var(--color-surface-sunken)] text-[var(--color-muted)]">
                  {titleCase(detail.work_model)}
                </span>
              )}
              {detail.location && (
                <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-pill bg-[var(--color-surface-sunken)] text-[var(--color-muted)]">
                  <MapPin size={9} strokeWidth={1.5} />
                  {detail.location}
                </span>
              )}
              {detail.visa_signal && (
                <span className="text-[11px] px-2 py-0.5 rounded-pill bg-[var(--color-surface-sunken)] text-[var(--color-muted)]">
                  {detail.visa_signal}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Required skills quick list */}
        {detail.required_skills && detail.required_skills.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-1.5">
              Required Skills
            </p>
            <div className="flex flex-wrap gap-1">
              {detail.required_skills.map((s) => (
                <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-surface-sunken)] text-[var(--color-faint)]">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </Panel>
  )
}

// ── Company intelligence ──────────────────────────────────────

function CompanyPanel({
  detail,
  brief,
  onResearch,
  researching,
}: {
  detail: OpportunityDetail
  brief?: CompanyBrief | null
  onResearch: () => void
  researching: boolean
}) {
  if (!detail.company) return null

  return (
    <Panel title="Company Intelligence" icon={Building2}>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[14px] font-semibold text-[var(--color-text)]">{detail.company.name}</p>
            {detail.company.industry && (
              <p className="text-[12px] text-[var(--color-muted)]">
                {detail.company.industry}
                {detail.company.hq_location && ` · ${detail.company.hq_location}`}
              </p>
            )}
          </div>
          {!brief && (
            <button
              onClick={onResearch}
              disabled={researching}
              className="shrink-0 flex items-center gap-1.5 h-7 px-3 rounded-sm text-[11px] font-medium border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] disabled:opacity-40"
            >
              <TrendingUp size={11} strokeWidth={1.5} />
              {researching ? 'Researching…' : 'Research'}
            </button>
          )}
        </div>

        {brief ? (
          <div className="space-y-3">
            {brief.content.business_model && (
              <div>
                <p className="text-[10px] font-semibold text-[var(--color-faint)] uppercase tracking-wide mb-1">
                  Business Model
                </p>
                <p className="text-[12px] text-[var(--color-muted)]">{brief.content.business_model}</p>
              </div>
            )}
            {brief.content.products.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-[var(--color-faint)] uppercase tracking-wide mb-1">
                  Products
                </p>
                <div className="flex flex-wrap gap-1">
                  {brief.content.products.map((p, i) => (
                    <span key={i} className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--color-surface-sunken)] text-[var(--color-muted)]">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {brief.content.competitors.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-[var(--color-faint)] uppercase tracking-wide mb-1">
                  Competitors
                </p>
                <p className="text-[12px] text-[var(--color-muted)]">
                  {brief.content.competitors.join(' · ')}
                </p>
              </div>
            )}
            {brief.content.recent_news.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-[var(--color-faint)] uppercase tracking-wide mb-1">
                  Recent News
                </p>
                <div className="space-y-1">
                  {brief.content.recent_news.map((n, i) => (
                    <p key={i} className="text-[11px] text-[var(--color-muted)] flex gap-1.5">
                      <span className="text-[var(--color-faint)]">·</span>
                      {n}
                    </p>
                  ))}
                </div>
              </div>
            )}
            {brief.content.culture_signals.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-[var(--color-faint)] uppercase tracking-wide mb-1">
                  Culture
                </p>
                <div className="flex flex-wrap gap-1">
                  {brief.content.culture_signals.map((s, i) => (
                    <span key={i} className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--color-surface-sunken)] text-[var(--color-muted)]">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <p className="text-[10px] text-[var(--color-faint)]">
              Researched {formatRelative(brief.fetched_at)}
              {brief.is_stale && ' · may be outdated'}
            </p>
          </div>
        ) : (
          <p className="text-[12px] text-[var(--color-faint)]">
            No research yet. Click Research to have the AI agent analyze this company.
          </p>
        )}
      </div>
    </Panel>
  )
}

// ── VVP panel ─────────────────────────────────────────────────

function VvpPanel({
  opportunityId,
  vvps,
  onPropose,
  proposing,
}: {
  opportunityId: string
  vvps: Vvp[]
  onPropose: () => void
  proposing: boolean
}) {
  const proposals = vvps.filter((v) => v.content.phase === 'proposal')
  const artifacts = vvps.filter((v) => v.content.phase === 'artifact')
  const qc = useQueryClient()

  return (
    <Panel title="Value Validation Project" icon={Layers}>
      {vvps.length === 0 ? (
        <div className="text-center py-3">
          <p className="text-[12px] text-[var(--color-faint)] mb-3">
            Stand out by delivering real value before you apply
          </p>
          <button
            onClick={onPropose}
            disabled={proposing}
            className="flex items-center gap-1.5 mx-auto h-8 px-4 rounded-sm text-[12px] font-medium bg-[var(--color-text)] text-[var(--color-bg)] hover:opacity-80 disabled:opacity-40"
          >
            <Layers size={12} strokeWidth={1.5} />
            {proposing ? 'Generating…' : 'Suggest VVP'}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {proposals.map((v) => (
            <div key={v.id} className="border border-[var(--color-border)] rounded-sm p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[12px] font-semibold text-[var(--color-text)]">{v.title}</p>
                  <p className="text-[10px] text-[var(--color-faint)] mt-0.5 capitalize">
                    {v.kind.replace(/_/g, ' ')} · {v.format}
                  </p>
                </div>
                <Link
                  href={`/vvp?id=${v.id}`}
                  className="shrink-0 flex items-center gap-1 text-[11px] text-[var(--color-muted)] hover:text-[var(--color-text)]"
                >
                  Generate <ChevronRight size={11} strokeWidth={1.5} />
                </Link>
              </div>
              {v.content.proposals?.[0]?.premise && (
                <p className="text-[11px] text-[var(--color-muted)] mt-1.5 leading-relaxed">
                  {v.content.proposals[0].premise}
                </p>
              )}
            </div>
          ))}
          {artifacts.map((v) => (
            <div key={v.id} className="border border-emerald-200 bg-emerald-50 rounded-sm p-3">
              <p className="text-[12px] font-semibold text-emerald-700">{v.title}</p>
              <p className="text-[10px] text-emerald-600 mt-0.5">Completed · {titleCase(v.format)}</p>
            </div>
          ))}
          <button
            onClick={onPropose}
            disabled={proposing}
            className="w-full h-7 text-[11px] text-[var(--color-muted)] border border-dashed border-[var(--color-border)] rounded-sm hover:border-[var(--color-muted)] hover:text-[var(--color-text)] disabled:opacity-40 transition-colors"
          >
            {proposing ? 'Generating…' : '+ New VVP suggestion'}
          </button>
        </div>
      )}
    </Panel>
  )
}

// ── Outreach panel ────────────────────────────────────────────

function OutreachPanel({
  opportunityId,
  messages,
  onDraft,
  drafting,
}: {
  opportunityId: string
  messages: OutreachMessage[]
  onDraft: () => void
  drafting: boolean
}) {
  return (
    <Panel title="Outreach" icon={Mail}>
      {messages.length === 0 ? (
        <div className="text-center py-3">
          <p className="text-[12px] text-[var(--color-faint)] mb-3">
            Generate personalized outreach to the hiring team
          </p>
          <button
            onClick={onDraft}
            disabled={drafting}
            className="flex items-center gap-1.5 mx-auto h-8 px-4 rounded-sm text-[12px] font-medium border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] disabled:opacity-40"
          >
            <Mail size={12} strokeWidth={1.5} />
            {drafting ? 'Drafting…' : 'Draft Outreach'}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className="flex items-start justify-between gap-2 p-3 border border-[var(--color-border)] rounded-sm"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'text-[10px] font-medium px-1.5 py-0.5 rounded capitalize',
                    msg.state === 'sent' ? 'bg-emerald-50 text-emerald-600' :
                    msg.state === 'approved' ? 'bg-blue-50 text-blue-600' :
                    'bg-[var(--color-surface-sunken)] text-[var(--color-muted)]',
                  )}>
                    {msg.state}
                  </span>
                  <span className="text-[10px] text-[var(--color-faint)] capitalize">{msg.channel}</span>
                </div>
                <p className="text-[11px] text-[var(--color-muted)] mt-1 line-clamp-2">{msg.body}</p>
              </div>
              <Link
                href={`/outreach?id=${msg.id}`}
                className="shrink-0 text-[var(--color-faint)] hover:text-[var(--color-muted)]"
              >
                <ChevronRight size={13} strokeWidth={1.5} />
              </Link>
            </div>
          ))}
          <button
            onClick={onDraft}
            disabled={drafting}
            className="w-full h-7 text-[11px] text-[var(--color-muted)] border border-dashed border-[var(--color-border)] rounded-sm hover:border-[var(--color-muted)] hover:text-[var(--color-text)] disabled:opacity-40 transition-colors"
          >
            {drafting ? 'Drafting…' : '+ Draft another message'}
          </button>
        </div>
      )}
    </Panel>
  )
}

// ── Interview preview ─────────────────────────────────────────

function InterviewPanel({
  applicationId,
  brief,
  onGenerate,
  generating,
}: {
  applicationId?: string
  brief?: InterviewBrief | null
  onGenerate: () => void
  generating: boolean
}) {
  if (!applicationId) {
    return (
      <Panel title="Interview Preview" icon={Mic}>
        <p className="text-[12px] text-[var(--color-faint)] text-center py-3">
          Track this opportunity first to generate an interview brief
        </p>
      </Panel>
    )
  }

  if (!brief) {
    return (
      <Panel title="Interview Preview" icon={Mic}>
        <div className="text-center py-3">
          <p className="text-[12px] text-[var(--color-faint)] mb-3">
            Preview likely interview questions before you apply
          </p>
          <button
            onClick={onGenerate}
            disabled={generating}
            className="flex items-center gap-1.5 mx-auto h-8 px-4 rounded-sm text-[12px] font-medium border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] disabled:opacity-40"
          >
            <Mic size={12} strokeWidth={1.5} />
            {generating ? 'Generating…' : 'Generate Interview Brief'}
          </button>
        </div>
      </Panel>
    )
  }

  return (
    <Panel title="Interview Preview" icon={Mic}>
      <div className="space-y-4">
        {brief.key_themes.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-2">
              Key Themes
            </p>
            <div className="flex flex-wrap gap-1.5">
              {brief.key_themes.map((t, i) => (
                <span key={i} className="text-[11px] px-2 py-0.5 rounded bg-[var(--color-surface-sunken)] text-[var(--color-muted)]">
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        {brief.likely_questions.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-2">
              Likely Questions
            </p>
            <div className="space-y-2">
              {brief.likely_questions.slice(0, 5).map((q, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-[10px] font-bold text-[var(--color-faint)] w-4 shrink-0 mt-0.5">
                    {i + 1}.
                  </span>
                  <div>
                    <p className="text-[12px] text-[var(--color-text)]">{q.question}</p>
                    <p className="text-[10px] text-[var(--color-faint)] mt-0.5 capitalize">{q.category}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {brief.opening_pitch && (
          <div>
            <p className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-1.5">
              Opening Pitch
            </p>
            <p className="text-[12px] text-[var(--color-muted)] italic leading-relaxed">
              "{brief.opening_pitch}"
            </p>
          </div>
        )}

        <Link
          href="/interviews"
          className="flex items-center gap-1 text-[11px] text-[var(--color-muted)] hover:text-[var(--color-text)]"
        >
          Full interview prep <ChevronRight size={11} strokeWidth={1.5} />
        </Link>
      </div>
    </Panel>
  )
}

// ── Main page ─────────────────────────────────────────────────

export default function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const qc = useQueryClient()

  const { data: detail, isLoading } = useQuery({
    queryKey: ['opportunity', id],
    queryFn: () => api.opportunities.get(id),
    staleTime: 30_000,
  })

  const { data: vvps = [] } = useQuery({
    queryKey: ['vvps', id],
    queryFn: () => api.vvp.listByOpportunity(id),
    enabled: !!detail,
    staleTime: 30_000,
  })

  const { data: outreach = [] } = useQuery({
    queryKey: ['outreach', id],
    queryFn: () => api.opportunities.outreach(id),
    enabled: !!detail,
    staleTime: 30_000,
  })

  const { data: companyDetail } = useQuery({
    queryKey: ['company', detail?.company?.id],
    queryFn: () => api.companies.get(detail!.company!.id),
    enabled: !!detail?.company?.id,
    staleTime: 60_000,
  })

  const { data: interviewData } = useQuery({
    queryKey: ['interview-by-app', detail?.application?.id],
    queryFn: () =>
      detail?.application?.id
        ? api.interviews.getByApplication(detail.application.id)
        : Promise.resolve(null),
    enabled: !!detail?.application?.id,
    staleTime: 30_000,
  })

  // Agent mutations
  const research = useMutation({
    mutationFn: () => api.companies.requestBrief(detail!.company!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      setTimeout(() => qc.invalidateQueries({ queryKey: ['company', detail?.company?.id] }), 6000)
    },
  })

  const proposeVvp = useMutation({
    mutationFn: () => api.vvp.propose(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['vvps', id] })
        // Refresh graph if Career Intelligence is open in another tab
        qc.invalidateQueries({ queryKey: ['kg-subgraph-root'] })
      }, 5000)
    },
  })

  const draftOutreach = useMutation({
    mutationFn: () => api.outreach.draft(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      setTimeout(() => qc.invalidateQueries({ queryKey: ['outreach', id] }), 5000)
    },
  })

  const genResume = useMutation({
    mutationFn: () => api.opportunities.resume(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })

  const genCover = useMutation({
    mutationFn: () => api.opportunities.coverLetter(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })

  const createApp = useMutation({
    mutationFn: () => api.applications.create(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['opportunity', id] })
      qc.invalidateQueries({ queryKey: ['applications'] })
    },
  })

  const autoApply = useMutation({
    mutationFn: () => api.opportunities.apply(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })

  const genInterviewBrief = useMutation({
    mutationFn: () => api.interviews.generateBrief(detail!.application!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      setTimeout(() => qc.invalidateQueries({ queryKey: ['interview-by-app', detail?.application?.id] }), 6000)
    },
  })

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto space-y-4 animate-pulse">
        <div className="h-6 w-32 bg-[var(--color-surface-sunken)] rounded" />
        <div className="h-40 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-64 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md" />
          <div className="h-64 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md" />
        </div>
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="max-w-5xl mx-auto">
        <p className="text-[13px] text-[var(--color-muted)]">Opportunity not found.</p>
        <Link href="/opportunities" className="text-[12px] text-[var(--color-muted)] underline mt-2 block">
          ← Back to Jobs
        </Link>
      </div>
    )
  }

  const brief = companyDetail?.latest_brief ?? null
  const interviewBrief = interviewData?.brief ?? null

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Back */}
      <Link
        href="/opportunities"
        className="flex items-center gap-1.5 text-[12px] text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors w-fit"
      >
        <ArrowLeft size={13} strokeWidth={1.5} />
        Jobs
      </Link>

      {/* Hero card */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap mb-1">
              <h1 className="text-[20px] font-semibold text-[var(--color-text)]">
                {detail.role_title}
              </h1>
              {detail.match && <MatchBadge score={Number(detail.match.score)} opportunityId={detail.id} />}
            </div>
            {detail.company && (
              <p className="text-[14px] text-[var(--color-muted)] mb-3">
                {detail.company.name}
                {detail.company.industry && ` · ${detail.company.industry}`}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              {detail.salary_text && (
                <span className="flex items-center gap-1 text-[12px] text-[var(--color-muted)]">
                  <DollarSign size={11} strokeWidth={1.5} />
                  {detail.salary_text}
                </span>
              )}
              {detail.seniority && (
                <span className="flex items-center gap-1 text-[12px] text-[var(--color-muted)]">
                  <Users size={11} strokeWidth={1.5} />
                  {detail.seniority}
                </span>
              )}
              {detail.location && (
                <span className="flex items-center gap-1 text-[12px] text-[var(--color-muted)]">
                  <MapPin size={11} strokeWidth={1.5} />
                  {detail.location}
                </span>
              )}
              <span className="flex items-center gap-1 text-[12px] text-[var(--color-faint)]">
                <Clock size={11} strokeWidth={1.5} />
                {formatRelative(detail.created_at)}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-1.5 shrink-0">
            {detail.source_url && (
              <a
                href={detail.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 h-8 px-3 rounded-sm text-[12px] border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)]"
              >
                <ExternalLink size={11} strokeWidth={1.5} />
                View Posting
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md p-3">
        <div className="flex items-center gap-2 flex-wrap">
          {!detail.application ? (
            <ActionButton
              label="Track"
              icon={BookOpen}
              onClick={() => createApp.mutate()}
              loading={createApp.isPending}
            />
          ) : null}
          <ActionButton
            label="Tailor Resume"
            icon={FileText}
            onClick={() => genResume.mutate()}
            loading={genResume.isPending}
          />
          <ActionButton
            label="Cover Letter"
            icon={Wand2}
            onClick={() => genCover.mutate()}
            loading={genCover.isPending}
          />
          <ActionButton
            label="Build VVP"
            icon={Layers}
            onClick={() => proposeVvp.mutate()}
            loading={proposeVvp.isPending}
          />
          <ActionButton
            label="Draft Outreach"
            icon={Mail}
            onClick={() => draftOutreach.mutate()}
            loading={draftOutreach.isPending}
          />
          {detail.company?.id && (
            <ActionButton
              label="Research Company"
              icon={Building2}
              onClick={() => research.mutate()}
              loading={research.isPending}
            />
          )}
          <ActionButton
            label="Auto-Apply"
            icon={Send}
            onClick={() => autoApply.mutate()}
            loading={autoApply.isPending}
            variant="danger"
            title="Auto-apply (uses your autonomy settings)"
          />
        </div>
      </div>

      {/* Main 2-col grid */}
      <div className="grid grid-cols-[1fr_340px] gap-4">
        {/* Left column */}
        <div className="space-y-4">
          {/* Job description */}
          {detail.description && (
            <Panel title="Job Details" icon={FileText}>
              <p className="text-[13px] text-[var(--color-muted)] leading-relaxed whitespace-pre-line">
                {detail.description}
              </p>
            </Panel>
          )}

          <MatchPanel detail={detail} />

          <CompanyPanel
            detail={detail}
            brief={brief}
            onResearch={() => research.mutate()}
            researching={research.isPending}
          />
        </div>

        {/* Right column */}
        <div className="space-y-4">
          <InsightsPanel detail={detail} brief={brief} />

          <VvpPanel
            opportunityId={id}
            vvps={vvps}
            onPropose={() => proposeVvp.mutate()}
            proposing={proposeVvp.isPending}
          />

          <OutreachPanel
            opportunityId={id}
            messages={outreach}
            onDraft={() => draftOutreach.mutate()}
            drafting={draftOutreach.isPending}
          />

          <InterviewPanel
            applicationId={detail.application?.id}
            brief={interviewBrief}
            onGenerate={() => genInterviewBrief.mutate()}
            generating={genInterviewBrief.isPending}
          />
        </div>
      </div>
    </div>
  )
}
