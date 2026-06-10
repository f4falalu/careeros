import * as cheerio from 'cheerio'
import type { JobBoardAdapter, BoardFilters, NormalizedJob } from './index.js'
import { guessWorkModel, extractSkills } from './index.js'

// Official per-category RSS feeds. Only these are used — no scraping.
const CATEGORY_FEEDS: Record<string, string> = {
  programming:  'https://weworkremotely.com/categories/remote-programming-jobs.rss',
  devops:       'https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss',
  design:       'https://weworkremotely.com/categories/remote-design-jobs.rss',
  product:      'https://weworkremotely.com/categories/remote-product-jobs.rss',
  data:         'https://weworkremotely.com/categories/remote-data-science-jobs.rss',
  all:          'https://weworkremotely.com/remote-jobs.rss',
}
const MAX_JOBS = 30

async function fetchFeed(url: string): Promise<NormalizedJob[]> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'CareerOS/1.0 (job discovery)' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`WWR RSS returned ${res.status} for ${url}`)

  const xml = await res.text()
  const $ = cheerio.load(xml, { xmlMode: true })
  const jobs: NormalizedJob[] = []

  $('item').each((_, el) => {
    const rawTitle = $(el).find('title').text().trim()
    const link = $(el).find('link').text().trim() || $(el).find('guid').text().trim()
    const desc = $(el).find('description').text().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    const region = $(el).find('region').text().trim()
    const jobType = $(el).find('job-type').text().trim()
    const pubDate = $(el).find('pubDate').text().trim()

    // WWR title format: "Company Name: Job Title" — split on first ":"
    const colonIdx = rawTitle.indexOf(':')
    const company = colonIdx > 0 ? rawTitle.slice(0, colonIdx).trim() : 'Unknown'
    const role = colonIdx > 0 ? rawTitle.slice(colonIdx + 1).trim() : rawTitle

    // Stable external id from URL slug
    const urlMatch = link.match(/\/(\d+)/)
    const externalId = urlMatch ? urlMatch[1] : Buffer.from(link).toString('base64').slice(0, 24)

    const skills = extractSkills(desc + ' ' + rawTitle)

    jobs.push({
      externalId,
      companyName: company,
      roleTitle: role,
      location: region || 'Worldwide',
      workModel: guessWorkModel(region + ' ' + jobType),
      requiredSkills: skills,
      description: desc.slice(0, 3000),
      applyUrl: link,
      sourceUrl: link,
      postedAt: pubDate || undefined,
    })
  })

  return jobs.slice(0, MAX_JOBS)
}

export const weworkRemotelyAdapter: JobBoardAdapter = {
  board: 'weworkremotely',

  async fetch(filters: BoardFilters): Promise<NormalizedJob[]> {
    const category = filters.category ?? 'all'
    const feedUrl = CATEGORY_FEEDS[category] ?? CATEGORY_FEEDS['all']
    const jobs = await fetchFeed(feedUrl)

    // Client-side keyword filter
    const keywords = filters.keywords?.map((k) => k.toLowerCase()) ?? []
    if (!keywords.length) return jobs

    return jobs.filter((j) => {
      const haystack = [j.roleTitle, j.companyName, j.description].join(' ').toLowerCase()
      return keywords.some((k) => haystack.includes(k))
    })
  },
}
