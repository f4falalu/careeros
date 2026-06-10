import type { JobBoardAdapter, BoardFilters, NormalizedJob } from './index.js'
import { guessWorkModel, extractSkills } from './index.js'

const REMOTIVE_URL = 'https://remotive.com/api/remote-jobs'
const MAX_JOBS = 50

interface RemotiveJob {
  id: number
  url: string
  title: string
  company_name: string
  candidate_required_location: string
  salary: string
  description: string
  tags: string[]
  job_type: string
  date: string
  apply_url?: string
}

export const remotiveAdapter: JobBoardAdapter = {
  board: 'remotive',

  async fetch(filters: BoardFilters): Promise<NormalizedJob[]> {
    const params = new URLSearchParams()
    if (filters.keywords?.length) params.set('search', filters.keywords.join(' '))
    if (filters.category) params.set('category', filters.category)
    params.set('limit', String(MAX_JOBS))

    const url = `${REMOTIVE_URL}?${params}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'CareerOS/1.0 (job discovery)' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw new Error(`Remotive returned ${res.status}`)

    const data = (await res.json()) as { jobs?: RemotiveJob[] }
    const jobs = data.jobs ?? []

    return jobs.slice(0, MAX_JOBS).map((j) => {
      const salaryText = j.salary?.trim() || undefined
      const location = j.candidate_required_location?.trim() || undefined
      const descPlain = j.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      const skills = j.tags?.length
        ? j.tags.map((t) => t.trim()).filter(Boolean).slice(0, 10)
        : extractSkills(descPlain)

      return {
        externalId: String(j.id),
        companyName: j.company_name,
        roleTitle: j.title,
        location,
        workModel: guessWorkModel((location ?? '') + ' ' + (j.job_type ?? '')),
        salaryText,
        requiredSkills: skills,
        description: descPlain.slice(0, 3000),
        applyUrl: j.apply_url || j.url,
        sourceUrl: j.url,
        postedAt: j.date,
      }
    })
  },
}
