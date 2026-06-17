// Job Targets — the intent layer.
// Pure functions that classify a job against a Target's conditions and assign a fit tier.
// Used at ingestion (coarse pre-filter) and in the match agent (fine tier assignment).
//
// Conditions split into two classes per the spec:
//   - Hard gates: a locked condition that is *confirmed-violated* rejects the job for that Target.
//   - Soft signals: role titles / keywords are intent hints, never hard filters — a capability
//     (skill-overlap) match can still surface a different-titled job as an `adjacent` fit.

import type { JobTarget } from '../db/schema.js'

export type ConditionResult = 'met' | 'violated' | 'unconfirmed' | 'na'
export type FitTier = 'on_target' | 'unconfirmed' | 'adjacent'

// Minimal job shape satisfied by both NormalizedJob (discovery worker) and opportunity rows.
export interface TargetableJob {
  roleTitle: string
  location?: string | null
  workModel?: 'remote' | 'hybrid' | 'onsite' | 'unknown' | null
  salaryText?: string | null
  seniority?: string | null
  requiredSkills?: string[] | null
  description?: string | null
}

// Condition keys used both here and as the `locks` jsonb keys on a Target.
export const CONDITIONS = ['location', 'work_model', 'seniority', 'min_salary'] as const
export type Condition = (typeof CONDITIONS)[number]

export const CAPABILITY_THRESHOLD = 50

const REMOTE_TOKENS = ['remote', 'worldwide', 'anywhere', 'global']

const SENIORITY_KEYWORDS: Record<string, string[]> = {
  intern: ['intern', 'internship'],
  junior: ['junior', 'jr.', 'entry level', 'entry-level', 'graduate'],
  mid: ['mid-level', 'mid level', 'intermediate'],
  senior: ['senior', 'sr.', 'staff'],
  lead: ['lead', 'principal', 'head of'],
  exec: ['director', 'vp', 'vice president', 'chief', 'executive'],
}

export function isLocked(target: JobTarget, condition: Condition): boolean {
  const locks = (target.locks ?? {}) as Record<string, unknown>
  return locks[condition] === true
}

// ── Per-condition classification ──────────────────────────────

export function classifyWorkModel(target: JobTarget, job: TargetableJob): ConditionResult {
  const wanted = target.workModels ?? []
  if (wanted.length === 0) return 'na'
  const wm = job.workModel ?? 'unknown'
  if (wm === 'unknown') return 'unconfirmed'
  return wanted.includes(wm) ? 'met' : 'violated'
}

export function classifyLocation(target: JobTarget, job: TargetableJob): ConditionResult {
  const wanted = (target.locations ?? []).map((l) => l.toLowerCase().trim()).filter(Boolean)
  if (wanted.length === 0) return 'na'
  const wantsRemote = wanted.some((l) => REMOTE_TOKENS.includes(l))
  // A remote listing satisfies a remote-style location intent regardless of location text.
  if (wantsRemote && job.workModel === 'remote') return 'met'
  const loc = (job.location ?? '').toLowerCase().trim()
  if (!loc) return 'unconfirmed'
  if (wantsRemote && REMOTE_TOKENS.some((t) => loc.includes(t))) return 'met'
  return wanted.some((l) => loc.includes(l) || l.includes(loc)) ? 'met' : 'violated'
}

export function classifyMinSalary(target: JobTarget, job: TargetableJob): ConditionResult {
  const min = target.minSalary
  if (min == null) return 'na'
  const text = (job.salaryText ?? '').trim()
  if (!text) return 'unconfirmed'
  const nums = text.replace(/[,_]/g, '').match(/\d{3,}/g)
  if (!nums || nums.length === 0) return 'unconfirmed'
  const top = Math.max(...nums.map(Number))
  return top >= min ? 'met' : 'violated'
}

export function classifySeniority(target: JobTarget, job: TargetableJob): ConditionResult {
  const wanted = (target.seniority ?? []).map((s) => s.toLowerCase().trim()).filter(Boolean)
  if (wanted.length === 0) return 'na'
  // Detect from the explicit seniority field + title (most reliable; avoids JD-body noise).
  const hay = `${job.seniority ?? ''} ${job.roleTitle ?? ''}`.toLowerCase()
  const detected: string[] = []
  for (const [level, kws] of Object.entries(SENIORITY_KEYWORDS)) {
    if (kws.some((k) => hay.includes(k))) detected.push(level)
  }
  if (detected.length === 0) return 'unconfirmed'
  return detected.some((d) => wanted.includes(d)) ? 'met' : 'violated'
}

export function classifyCondition(
  target: JobTarget,
  job: TargetableJob,
  condition: Condition,
): ConditionResult {
  switch (condition) {
    case 'work_model': return classifyWorkModel(target, job)
    case 'location': return classifyLocation(target, job)
    case 'min_salary': return classifyMinSalary(target, job)
    case 'seniority': return classifySeniority(target, job)
  }
}

export interface LockedEval {
  violated: boolean
  unconfirmed: boolean
}

// Evaluate only the conditions the user has *locked* (strict gates).
export function evaluateLockedConditions(target: JobTarget, job: TargetableJob): LockedEval {
  let violated = false
  let unconfirmed = false
  for (const cond of CONDITIONS) {
    if (!isLocked(target, cond)) continue
    const r = classifyCondition(target, job, cond)
    if (r === 'violated') violated = true
    else if (r === 'unconfirmed') unconfirmed = true
  }
  return { violated, unconfirmed }
}

// ── Intent (soft) matching ────────────────────────────────────

function intentTerms(target: JobTarget): string[] {
  return [...(target.roleTitles ?? []), ...(target.keywords ?? [])]
    .map((t) => t.toLowerCase().trim())
    .filter(Boolean)
}

// True when a role-title/keyword phrase appears in the job *title* — the user's explicit intent.
export function intentMatches(target: JobTarget, job: TargetableJob): boolean {
  const terms = intentTerms(target)
  if (terms.length === 0) return false
  const title = (job.roleTitle ?? '').toLowerCase()
  return terms.some((t) => title.includes(t))
}

// ── Ingestion coarse pre-filter ───────────────────────────────
// Keep a board job only if, for this Target, no locked condition is confirmed-violated AND
// an intent term appears in the title or description (so capability-relevant, different-titled
// jobs still get in and are tiered as `adjacent` later by the match agent).
export function isCoarselyRelevant(target: JobTarget, job: TargetableJob): boolean {
  if (evaluateLockedConditions(target, job).violated) return false
  const terms = intentTerms(target)
  if (terms.length === 0) return true // pure-condition Target: keep anything not violated
  const hay = `${job.roleTitle ?? ''} ${job.description ?? ''}`.toLowerCase()
  return terms.some((t) => hay.includes(t))
}

// ── Fine tier assignment (match agent) ────────────────────────
// Returns the tier for an opportunity↔target link, or null when the job must not link
// to this Target (a locked condition is confirmed-violated, or it's neither an intent
// nor a strong-enough capability match).
export function evaluateTarget(
  target: JobTarget,
  job: TargetableJob,
  capabilityScore: number | null,
): { tier: FitTier } | null {
  const locked = evaluateLockedConditions(target, job)
  if (locked.violated) return null // hard gate — rejected even if capability is high

  if (intentMatches(target, job)) {
    return { tier: locked.unconfirmed ? 'unconfirmed' : 'on_target' }
  }
  // Title/keywords don't match → capability (KG/skill-overlap) decides — the standout behavior.
  if (capabilityScore != null && capabilityScore >= CAPABILITY_THRESHOLD) {
    return { tier: 'adjacent' }
  }
  return null
}
