'use client'
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil, MapPin, Shield, Globe, Check, X } from 'lucide-react'
import { api } from '@/lib/api'
import type { Profile } from '@/types'
import { AIEnhanceField } from './AIEnhanceField'

const LINK_KEYS = ['linkedin', 'portfolio', 'github', 'twitter', 'notion'] as const

interface Props {
  profile: Profile | null
}

export function HeroSection({ profile }: Props) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    headline: profile?.headline ?? '',
    bio: profile?.bio ?? '',
    location: profile?.location ?? '',
    work_auth: profile?.work_auth ?? '',
    languages: (profile?.languages ?? []).join(', '),
    ...Object.fromEntries(LINK_KEYS.map((k) => [k, profile?.links?.[k] ?? ''])),
  })

  const save = useMutation({
    mutationFn: () =>
      api.profile.update({
        headline: form.headline || undefined,
        bio: form.bio || undefined,
        location: form.location || undefined,
        work_auth: form.work_auth || undefined,
        languages: form.languages
          ? form.languages.split(',').map((l) => l.trim()).filter(Boolean)
          : [],
        links: Object.fromEntries(
          LINK_KEYS.filter((k) => (form as Record<string, string>)[k]).map((k) => [k, (form as Record<string, string>)[k]]),
        ),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile'] })
      setEditing(false)
    },
  })

  if (editing) {
    return (
      <section
        id="hero"
        className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md p-6 space-y-5"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-[var(--color-text)]">Basic Info</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="flex items-center gap-1 h-7 px-3 rounded-sm text-[12px] font-medium bg-[var(--color-text)] text-[var(--color-bg)] hover:opacity-80 disabled:opacity-40"
            >
              <Check size={11} strokeWidth={2} />
              Save
            </button>
            <button
              onClick={() => setEditing(false)}
              className="flex items-center gap-1 h-7 px-2.5 rounded-sm text-[12px] text-[var(--color-muted)] hover:bg-[var(--color-surface-sunken)]"
            >
              <X size={12} strokeWidth={1.5} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-[11px] font-medium text-[var(--color-muted)] mb-1">
              Headline
            </label>
            <AIEnhanceField
              as="input"
              fieldType="headline"
              value={form.headline}
              onChange={(v) => setForm((f) => ({ ...f, headline: v }))}
              placeholder="e.g. AI Product Manager · GenAI Consultant"
              className="w-full px-3 py-2 rounded-sm border border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-[13px] text-[var(--color-text)] placeholder:text-[var(--color-faint)] focus:outline-none focus:border-[var(--color-muted)]"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-[11px] font-medium text-[var(--color-muted)] mb-1">
              Bio
            </label>
            <AIEnhanceField
              as="textarea"
              rows={4}
              fieldType="bio"
              value={form.bio}
              onChange={(v) => setForm((f) => ({ ...f, bio: v }))}
              placeholder="2–3 sentences describing who you are and what you do"
              className="w-full px-3 py-2 rounded-sm border border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-[13px] text-[var(--color-text)] placeholder:text-[var(--color-faint)] focus:outline-none focus:border-[var(--color-muted)] resize-none"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-[var(--color-muted)] mb-1">
              Location
            </label>
            <input
              className="w-full px-3 py-2 rounded-sm border border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-[13px] text-[var(--color-text)] placeholder:text-[var(--color-faint)] focus:outline-none focus:border-[var(--color-muted)]"
              placeholder="e.g. Lagos, Nigeria"
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-[var(--color-muted)] mb-1">
              Work Authorization
            </label>
            <input
              className="w-full px-3 py-2 rounded-sm border border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-[13px] text-[var(--color-text)] placeholder:text-[var(--color-faint)] focus:outline-none focus:border-[var(--color-muted)]"
              placeholder="e.g. Visa sponsorship required"
              value={form.work_auth}
              onChange={(e) => setForm((f) => ({ ...f, work_auth: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-[var(--color-muted)] mb-1">
              Languages (comma-separated)
            </label>
            <input
              className="w-full px-3 py-2 rounded-sm border border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-[13px] text-[var(--color-text)] placeholder:text-[var(--color-faint)] focus:outline-none focus:border-[var(--color-muted)]"
              placeholder="English, Hausa, French"
              value={form.languages}
              onChange={(e) => setForm((f) => ({ ...f, languages: e.target.value }))}
            />
          </div>
        </div>

        <div>
          <p className="text-[11px] font-medium text-[var(--color-muted)] mb-2">Links</p>
          <div className="grid grid-cols-2 gap-3">
            {LINK_KEYS.map((key) => (
              <div key={key}>
                <label className="block text-[10px] text-[var(--color-faint)] mb-1 capitalize">
                  {key}
                </label>
                <input
                  className="w-full px-3 py-1.5 rounded-sm border border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-[12px] text-[var(--color-text)] placeholder:text-[var(--color-faint)] focus:outline-none focus:border-[var(--color-muted)]"
                  placeholder={`${key}.com/…`}
                  value={(form as Record<string, string>)[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        </div>
      </section>
    )
  }

  return (
    <section
      id="hero"
      className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md p-6"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          {profile?.headline ? (
            <p className="text-[13px] font-semibold text-[var(--color-text)] mb-2">
              {profile.headline}
            </p>
          ) : (
            <p className="text-[13px] text-[var(--color-faint)] italic mb-2">
              No headline yet — add a brief professional title
            </p>
          )}

          {profile?.bio ? (
            <p className="text-[13px] text-[var(--color-muted)] leading-relaxed mb-4 max-w-2xl">
              {profile.bio}
            </p>
          ) : (
            <p className="text-[13px] text-[var(--color-faint)] italic mb-4">No bio yet</p>
          )}

          <div className="flex flex-wrap gap-3">
            {profile?.location && (
              <span className="flex items-center gap-1.5 text-[12px] text-[var(--color-muted)]">
                <MapPin size={12} strokeWidth={1.5} className="text-[var(--color-faint)]" />
                {profile.location}
              </span>
            )}
            {profile?.work_auth && (
              <span className="flex items-center gap-1.5 text-[12px] text-[var(--color-muted)]">
                <Shield size={12} strokeWidth={1.5} className="text-[var(--color-faint)]" />
                {profile.work_auth}
              </span>
            )}
            {profile?.languages && profile.languages.length > 0 && (
              <span className="flex items-center gap-1.5 text-[12px] text-[var(--color-muted)]">
                <Globe size={12} strokeWidth={1.5} className="text-[var(--color-faint)]" />
                {profile.languages.join(' · ')}
              </span>
            )}
          </div>

          {profile?.links && Object.keys(profile.links).length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {Object.entries(profile.links).map(([key, url]) => (
                <a
                  key={key}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-medium px-2.5 py-1 rounded-pill bg-[var(--color-surface-sunken)] text-[var(--color-muted)] hover:text-[var(--color-text)] capitalize transition-colors"
                >
                  {key}
                </a>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => {
            setForm({
              headline: profile?.headline ?? '',
              bio: profile?.bio ?? '',
              location: profile?.location ?? '',
              work_auth: profile?.work_auth ?? '',
              languages: (profile?.languages ?? []).join(', '),
              ...Object.fromEntries(LINK_KEYS.map((k) => [k, profile?.links?.[k] ?? ''])),
            })
            setEditing(true)
          }}
          className="ml-4 shrink-0 p-2 rounded-sm text-[var(--color-faint)] hover:text-[var(--color-muted)] hover:bg-[var(--color-surface-sunken)] transition-colors"
        >
          <Pencil size={14} strokeWidth={1.5} />
        </button>
      </div>
    </section>
  )
}
