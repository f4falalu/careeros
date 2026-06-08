// Shared tool implementations used by agents.
// SSRF guard applies to user-provided URLs only.
// SearXNG is an internal compose service — it is called directly without the guard.

import { config } from '../../config.js'

// SSRF guard: block private IP ranges for user-supplied URLs
function isPrivateUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1|fd)/.test(hostname)
  } catch {
    return true
  }
}

export async function webFetch(url: string): Promise<{ text: string; ok: boolean }> {
  if (isPrivateUrl(url)) throw new Error(`SSRF blocked: ${url}`)
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15_000),
    headers: { 'User-Agent': 'CareerOS/1.0 (career research bot)' },
  })
  if (!res.ok) return { text: '', ok: false }
  const html = await res.text()
  // Basic HTML → text strip
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 12_000)
  return { text, ok: true }
}

export async function search(
  query: string,
): Promise<Array<{ title: string; url: string; snippet: string }>> {
  const provider = process.env.SEARCH_PROVIDER ?? 'searxng'
  const searxngUrl = process.env.SEARXNG_URL ?? 'http://searxng:8080'

  if (provider === 'searxng') {
    // SearXNG is a known internal compose service — no SSRF guard needed here.
    try {
      const url = `${searxngUrl}/search?q=${encodeURIComponent(query)}&format=json&lang=en`
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
      if (!res.ok) return []
      const data = (await res.json()) as {
        results?: Array<{ title: string; url: string; content: string }>
      }
      return (data.results ?? []).slice(0, 5).map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.content?.slice(0, 300) ?? '',
      }))
    } catch {
      return []
    }
  }

  // Tavily fallback — external HTTPS endpoint, no SSRF concern
  if (!process.env.TAVILY_API_KEY) return []
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query,
        max_results: 5,
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return []
    const data = (await res.json()) as {
      results?: Array<{ title: string; url: string; content: string }>
    }
    return (data.results ?? []).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content?.slice(0, 300) ?? '',
    }))
  } catch {
    return []
  }
}

// Strip common tracking params from URLs before storing
export function cleanUrl(raw: string): string {
  try {
    const u = new URL(raw)
    const tracking = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'fbclid',
      'gclid',
      'ref',
    ]
    tracking.forEach((p) => u.searchParams.delete(p))
    return u.toString()
  } catch {
    return raw
  }
}
