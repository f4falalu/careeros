// Model Router — see docs/09-AGENTS.md §13 and docs/10-SETTINGS.md §5.
//
// Local path: calls Ollama's native streaming /api/generate API directly.
//   - Stream-based: headers arrive immediately, no HTTP timeout for slow CPU inference.
//   - Works with llama3.2:3b on CPU (no JSON schema mode needed).
// Cloud path: uses @ai-sdk/openai-compatible + generateObject (fast, structured output).
//
// Precedence: privacy block > master fallback switch > tier default.

import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { generateObject } from 'ai'
import { z } from 'zod'
import { config, DEFAULT_LOCAL_MODEL } from '../config.js'

export type ModelKind = 'local' | 'cloud'

export interface RouteDecision {
  modelKind: ModelKind
  modelName: string
  reason: string
}

export function decideRoute(
  taskType: string,
  containsPersonalData: boolean,
  allowCloud = false,
): RouteDecision {
  if (containsPersonalData && config.blockCloudPersonalData) {
    return { modelKind: 'local', modelName: DEFAULT_LOCAL_MODEL, reason: 'privacy: personal data forced local' }
  }
  if (config.cloudFallbackEnabled && allowCloud) {
    return { modelKind: 'cloud', modelName: cloudModel(), reason: `cloud fallback for ${taskType}` }
  }
  return { modelKind: 'local', modelName: DEFAULT_LOCAL_MODEL, reason: 'tier default (local)' }
}

function cloudModel(): string {
  switch (config.cloudProvider) {
    case 'groq': return 'llama-3.3-70b-versatile'
    case 'openrouter': return 'meta-llama/llama-3.1-70b-instruct:free'
    default: return 'llama-3.3-70b-versatile'
  }
}

function cloudHandle(modelName: string) {
  const provider = createOpenAICompatible({
    name: 'groq',
    baseURL: 'https://api.groq.com/openai/v1',
    apiKey: config.groqApiKey,
  })
  return provider(modelName)
}

// Resilience failover: when the local (Ollama) path errors, fall through to cloud —
// but only when cloud is a *permitted* path. Privacy is binding (CLAUDE.md §1/§6):
// personal data forced local never leaks to cloud, even on failure.
function canFailoverToCloud(opts: { containsPersonalData?: boolean }): boolean {
  if (opts.containsPersonalData && config.blockCloudPersonalData) return false
  return config.cloudFallbackEnabled && Boolean(config.groqApiKey)
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// ─────────────────────────────────────────────────────────────
// Local Ollama: streaming native API
// Uses /api/generate with stream:true so response headers arrive instantly,
// preventing undici headersTimeout on slow CPU-only inference.
// ─────────────────────────────────────────────────────────────
async function ollamaGenerate(
  prompt: string,
  model: string,
  timeoutMs = 600_000,
): Promise<string> {
  const res = await fetch(`${config.ollamaBaseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, stream: true }),
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Ollama error ${res.status}: ${body.slice(0, 200)}`)
  }

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let fullText = ''
  let buf = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const chunk = JSON.parse(line) as { response?: string; done?: boolean }
        if (chunk.response) fullText += chunk.response
      } catch { /* ignore malformed chunks */ }
    }
  }

  return fullText
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export async function complete(
  prompt: string,
  opts: { taskType?: string; containsPersonalData?: boolean; allowCloud?: boolean } = {},
) {
  const route = decideRoute(
    opts.taskType ?? 'generic',
    opts.containsPersonalData ?? false,
    opts.allowCloud ?? false,
  )

  if (route.modelKind === 'local') {
    try {
      const text = await ollamaGenerate(prompt, route.modelName)
      return { text, modelKind: route.modelKind, modelName: route.modelName, reason: route.reason }
    } catch (err) {
      if (!canFailoverToCloud(opts)) throw err
      const modelName = cloudModel()
      const { text } = await (await import('ai')).generateText({ model: cloudHandle(modelName), prompt })
      return { text, modelKind: 'cloud', modelName, reason: `failover: local failed (${errMsg(err)})` }
    }
  }

  const { text } = await (await import('ai')).generateText({
    model: cloudHandle(route.modelName),
    prompt,
  })
  return { text, modelKind: route.modelKind, modelName: route.modelName, reason: route.reason }
}

// Structured generation with Zod schema.
// Local: generateText via Ollama streaming + JSON parsing + validation (+ 1 retry on schema fail).
// Cloud: generateObject (native structured output).
export async function generateStructured<T>(
  prompt: string,
  schema: z.ZodType<T>,
  opts: { taskType?: string; containsPersonalData?: boolean; allowCloud?: boolean } = {},
): Promise<{ data: T; modelKind: ModelKind; modelName: string; reason: string }> {
  const route = decideRoute(
    opts.taskType ?? 'generic',
    opts.containsPersonalData ?? false,
    opts.allowCloud ?? false,
  )

  if (route.modelKind === 'cloud') {
    const { object } = await generateObject({ model: cloudHandle(route.modelName), prompt, schema })
    return { data: object, modelKind: route.modelKind, modelName: route.modelName, reason: route.reason }
  }

  // Local first; fall through to cloud structured output if local errors AND cloud is permitted.
  try {
    return await localStructured(prompt, schema, route)
  } catch (err) {
    if (!canFailoverToCloud(opts)) throw err
    const modelName = cloudModel()
    const { object } = await generateObject({ model: cloudHandle(modelName), prompt, schema })
    return { data: object, modelKind: 'cloud', modelName, reason: `failover: local failed (${errMsg(err)})` }
  }
}

// Local structured generation: stream text via Ollama, parse JSON, validate against
// the Zod schema (+ 1 retry on schema fail). Throws on unrecoverable failure so the
// caller can decide whether to fail over to cloud.
async function localStructured<T>(
  prompt: string,
  schema: z.ZodType<T>,
  route: RouteDecision,
): Promise<{ data: T; modelKind: ModelKind; modelName: string; reason: string }> {
  const systemHint = `Respond with a single valid JSON object and NOTHING else — no markdown fences, no prose, no explanation.`
  const text = await ollamaGenerate(`${systemHint}\n\n${prompt}`, route.modelName)

  const parsed = tryParseJson(text)
  if (parsed === null) {
    throw new Error(`Model did not return a JSON object. Raw: ${text.slice(0, 300)}`)
  }

  const result = schema.safeParse(parsed)
  if (result.success) {
    return { data: result.data, modelKind: route.modelKind, modelName: route.modelName, reason: route.reason }
  }

  // Retry once with field hints
  const hints = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
  const retryText = await ollamaGenerate(
    `${systemHint}\nFix these issues and return ONLY corrected JSON:\n${hints}\n\nOriginal:\n${JSON.stringify(parsed)}\n\n${prompt}`,
    route.modelName,
  )

  const retryParsed = tryParseJson(retryText)
  if (retryParsed !== null) {
    const retryResult = schema.safeParse(retryParsed)
    if (retryResult.success) {
      return { data: retryResult.data, modelKind: route.modelKind, modelName: route.modelName, reason: route.reason }
    }
  }

  throw new Error(`Schema validation failed: ${result.error.message}`)
}

function tryParseJson(text: string): unknown {
  // Try the whole string first, then extract the largest {...} block
  try { return JSON.parse(text.trim()) } catch { /* fall through */ }
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  try { return JSON.parse(match[0]) } catch { return null }
}

// Health check
export async function ollamaHealthy(): Promise<{ ok: boolean; models: string[] }> {
  try {
    const res = await fetch(`${config.ollamaBaseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return { ok: false, models: [] }
    const data = (await res.json()) as { models?: { name: string }[] }
    return { ok: true, models: (data.models ?? []).map((m) => m.name) }
  } catch {
    return { ok: false, models: [] }
  }
}
