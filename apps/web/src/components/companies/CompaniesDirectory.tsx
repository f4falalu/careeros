'use client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, ExternalLink, FileText, Loader2, Sparkles } from 'lucide-react'
import { api } from '@/lib/api'
import type { CompanyListItem } from '@/types'

function CompanyCard({ company }: { company: CompanyListItem }) {
  const qc = useQueryClient()

  const brief = useMutation({
    mutationFn: () => api.companies.requestBrief(company.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
  })

  const meta = [company.industry, company.hq_location, company.size_band].filter(Boolean)

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md p-5 hover-lift flex flex-col">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-sm bg-[var(--color-bg)] border border-[var(--color-border)] flex items-center justify-center shrink-0">
          <Building2 size={16} strokeWidth={1.5} className="text-[var(--color-muted)]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-[var(--color-text)] truncate">{company.name}</p>
          {company.domain && (
            <a
              href={`https://${company.domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[12px] text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
            >
              {company.domain}
              <ExternalLink size={11} strokeWidth={1.5} />
            </a>
          )}
        </div>
      </div>

      {meta.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {meta.map((m) => (
            <span
              key={m}
              className="text-[11px] text-[var(--color-muted)] px-2 py-0.5 rounded-pill bg-[var(--color-bg)] border border-[var(--color-border)]"
            >
              {m}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mt-4 pt-4 border-t border-[var(--color-border)]">
        <span className="text-[12px] text-[var(--color-muted)]">
          {company.opportunity_count} {company.opportunity_count === 1 ? 'job' : 'jobs'}
        </span>
        {company.has_brief ? (
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-success">
            <FileText size={13} strokeWidth={1.5} />
            Brief ready
          </span>
        ) : (
          <button
            onClick={() => brief.mutate()}
            disabled={brief.isPending}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors disabled:opacity-50"
          >
            {brief.isPending ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Sparkles size={13} strokeWidth={1.5} />
            )}
            {brief.isPending ? 'Queued…' : 'Research'}
          </button>
        )}
      </div>
    </div>
  )
}

export function CompaniesDirectory() {
  const { data: companies = [], isLoading, isError } = useQuery({
    queryKey: ['companies'],
    queryFn: () => api.companies.list(),
  })

  return (
    <div className="space-y-6 max-w-[1440px]">
      <p className="text-[13px] text-[var(--color-muted)]">
        Companies pulled from your saved jobs. Generate a research brief to prep outreach and interviews.
      </p>

      {isError ? (
        <div className="px-4 py-3 rounded-md bg-danger/10 text-danger text-[12px]">
          Failed to load companies — make sure the API is running.
        </div>
      ) : isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-40 rounded-md bg-[var(--color-surface-sunken)] animate-pulse" />
          ))}
        </div>
      ) : companies.length === 0 ? (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md px-6 py-16 text-center">
          <Building2 size={24} strokeWidth={1.5} className="mx-auto text-[var(--color-faint)]" />
          <p className="mt-3 text-[14px] font-medium text-[var(--color-text)]">No companies yet</p>
          <p className="mt-1 text-[13px] text-[var(--color-muted)]">
            Add a job and CareerOS will track the company here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {companies.map((company) => (
            <CompanyCard key={company.id} company={company} />
          ))}
        </div>
      )}
    </div>
  )
}
