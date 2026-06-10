// Autonomy control plane — Phase 4.
// Single source of truth the risky agents (apply / scrape / enrich) consult
// before doing anything. Defaults are SAFE: every dangerous capability is OFF
// and auto-apply requires explicit human confirmation. The owner flips these
// per-action in Settings (app_settings.autonomy).

import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db, schema } from '../../db/index.js'

// ─────────────────────────────────────────────────────────────
// Shape + safe defaults
// ─────────────────────────────────────────────────────────────

export const AutonomySchema = z.object({
  autoApply: z.object({
    // Master switch. While false the Apply agent refuses every request.
    enabled: z.boolean().default(false),
    // Human-in-the-loop gate: when true (default) a submission is prepared and
    // parked in `needs_approval`; nothing is submitted until the owner approves.
    requireConfirm: z.boolean().default(true),
    // Per-site opt-in. A submission only proceeds if the apply host matches one
    // of these suffixes (e.g. "greenhouse.io"). Empty = no site allowed.
    allowedSites: z.array(z.string()).default([]),
    // Safety cap: max auto-submitted applications per calendar day.
    dailyLimit: z.number().int().min(0).max(100).default(5),
  }).default({}),
  scraping: z.object({
    // Master switch for the careers-page scraping discovery agent.
    enabled: z.boolean().default(false),
    // Domain suffix allowlist for scrape targets. Empty = no domain allowed.
    allowedDomains: z.array(z.string()).default([]),
  }).default({}),
  crmEnrichment: z.object({
    // Compliant contact/recruiter enrichment from public search. Safe → on.
    enabled: z.boolean().default(true),
  }).default({}),
})

export type AutonomyConfig = z.infer<typeof AutonomySchema>

/** Parse a stored (possibly empty/partial) autonomy blob into a fully-defaulted config. */
export function normalizeAutonomy(raw: unknown): AutonomyConfig {
  const parsed = AutonomySchema.safeParse(raw ?? {})
  // On any malformed stored value fall back to the all-safe defaults.
  return parsed.success ? parsed.data : AutonomySchema.parse({})
}

/** Load the owner's autonomy config, fully defaulted. */
export async function getAutonomy(userId: string): Promise<AutonomyConfig> {
  const [row] = await db
    .select({ autonomy: schema.appSettings.autonomy })
    .from(schema.appSettings)
    .where(eq(schema.appSettings.userId, userId))
    .limit(1)
  return normalizeAutonomy(row?.autonomy)
}

// ─────────────────────────────────────────────────────────────
// Host allowlist
// ─────────────────────────────────────────────────────────────

/**
 * Returns true if the URL's host equals or is a sub-domain of any allowed
 * suffix. Matching is host-suffix based so "jobs.greenhouse.io" matches the
 * suffix "greenhouse.io" but "greenhouse.io.evil.com" does not.
 */
export function hostAllowed(url: string, allowed: string[]): boolean {
  if (allowed.length === 0) return false
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return false
  }
  return allowed.some((suffix) => {
    const s = suffix.trim().toLowerCase().replace(/^\.+/, '')
    if (!s) return false
    return host === s || host.endsWith(`.${s}`)
  })
}
