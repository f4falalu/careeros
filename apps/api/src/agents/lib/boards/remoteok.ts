import type { JobBoardAdapter, BoardFilters, NormalizedJob } from './index.js'
import { guessWorkModel, extractSkills } from './index.js'

const REMOTEOK_URL = 'https://remoteok.com/api'
const MAX_JOBS = 50

interface RemoteOkJob {
  id?: string | number
  slug?: string
  position: string
  company: string
  location?: string
  salary_min?: number
  salary_max?: number
  tags?: string[]
  url?: string
  description?: string
  date?: string
  apply_url?: string
}

function salaryText(min?: number, max?: number): string | undefined {
  if (!min && !max) return undefined
  if (min && max) return `$${(min / 1000).toFixed(0)}k–$${(max / 1000).toFixed(0)}k`
  if (min) return `$${(min / 1000).toFixed(0)}k+`
  return undefined
}

export const remoteOkAdapter: JobBoardAdapter = {
  board: 'remoteok',

  async fetch(filters: BoardFilters): Promise<NormalizedJob[]> {
    // Remote OK doesn't support query params — we filter client-side
    const res = await fetch(REMOTEOK_URL, {
      headers: {
        'User-Agent': 'CareerOS/1.0 (job discovery)',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) throw new Error(`RemoteOK returned ${res.status}`)

    const raw = (await res.json()) as (RemoteOkJob | { legal?: string })[]
    // First element is attribution metadata — skip it
    const jobs = raw.slice(1) as RemoteOkJob[]

    const keywords = filters.keywords?.map((k) => k.toLowerCase()) ?? []

    return jobs
      .filter((j) => {
        if (!j.position || !j.company) return false
        if (!keywords.length) return true
        const haystack = [j.position, j.company, ...(j.tags ?? []), j.description ?? '']
          .join(' ')
          .toLowerCase()
        return keywords.some((k) => haystack.includes(k))
      })
      .slice(0, MAX_JOBS)
      .map((j) => {
        const id = j.slug ?? j.id ?? `${j.company}-${j.position}`.replace(/\s/g, '-')
        const descPlain = (j.description ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
        const skills = j.tags?.length
          ? j.tags.map((t) => t.trim()).filter(Boolean).slice(0, 10)
          : extractSkills(descPlain)
        const jobUrl = j.url ?? `https://remoteok.com/remote-jobs/${id}`

        return {
          externalId: String(id),
          companyName: j.company,
          roleTitle: j.position,
          location: j.location?.trim() || 'Worldwide',
          workModel: guessWorkModel(j.location ?? 'remote'),
          salaryText: salaryText(j.salary_min, j.salary_max),
          requiredSkills: skills,
          description: descPlain.slice(0, 3000),
          applyUrl: j.apply_url ?? jobUrl,
          sourceUrl: jobUrl,
          postedAt: j.date,
        }
      })
  },
}
