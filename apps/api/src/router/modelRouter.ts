import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { generateObject, generateText } from 'ai'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { config, DEFAULT_LOCAL_MODEL } from '../config.js'
import { db, schema } from '../db/index.js'

export type ModelKind = 'local' | 'cloud'

export interface RouteDecision {
  modelKind: ModelKind
  modelName: string
  reason: string
}

// ─────────────────────────────────────────────────────────────
// Provider base URLs (all use OpenAI-compatible API)
// ─────────────────────────────────────────────────────────────
export const PROVIDER_BASE_URLS: Record<string, string> = {
  openrouter: 'https://openrouter.ai/api/v1',
  anthropic:  'https://api.anthropic.com/v1',
  openai:     'https://api.openai.com/v1',
  groq:       'https://api.groq.com/openai/v1',
  gemini:     'https://generativelanguage.googleapis.com/v1beta/openai/',
  ollama:     `${config.ollamaBaseUrl}/v1`,
}

// System-recommended model per task type — used when a user has a provider key
// configured but hasn't set a custom route for a specific task.
export const SYSTEM_RECOMMENDED: Record<string, { provider: string; model: string }> = {
  research:   { provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet' },
  resume:     { provider: 'openrouter', model: 'google/gemini-2.5-pro-preview' },
  cover:      { provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet' },
  vvp:        { provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet' },
  interview:  { provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet' },
  outreach:   { provider: 'openrouter', model: 'openai/gpt-4o' },
  strategist: { provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet' },
  apply:      { provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet' },
  followup:   { provider: 'openrouter', model: 'openai/gpt-4o' },
  match:      { provider: 'openrouter', model: 'meta-llama/llama-3.3-70b-instruct' },
  intake:     { provider: 'openrouter', model: 'meta-llama/llama-3.3-70b-instruct' },
  enrich:     { provider: 'openrouter', model: 'meta-llama/llama-3.1-8b-instruct:free' },
  tracker:    { provider: 'openrouter', model: 'meta-llama/llama-3.1-8b-instruct:free' },
  scrape:     { provider: 'openrouter', model: 'meta-llama/llama-3.1-8b-instruct:free' },
}

// ─────────────────────────────────────────────────────────────
// DB-backed user route resolution
// ─────────────────────────────────────────────────────────────
type ResolvedRoute = {
  provider: string
  model: string
  apiKey: string
  baseUrl: string
}

async function loadUserRoute(userId: string, taskType: string): Promise<ResolvedRoute | null> {
  const [settings] = await db
    .select({ routing: schema.appSettings.routing })
    .from(schema.appSettings)
    .where(eq(schema.appSettings.userId, userId))
    .limit(1)

  const routing = (settings?.routing ?? {}) as Record<string, unknown>
  const agentRoutes = (routing.agentRoutes ?? {}) as Record<string, { provider: string; model: string }>
  const customRoute = agentRoutes[taskType]

  // Determine provider: custom route > defaultProvider > system recommended
  let provider: string
  let model: string

  if (customRoute?.provider && customRoute?.model) {
    provider = customRoute.provider
    model = customRoute.model
  } else {
    const defaultProvider = routing.defaultProvider as string | undefined
    const sysRec = SYSTEM_RECOMMENDED[taskType]
    provider = defaultProvider ?? sysRec?.provider ?? 'openrouter'
    model = sysRec?.model ?? 'meta-llama/llama-3.1-8b-instruct:free'
  }

  // Load the provider config + credential for this user
  const [providerCfg] = await db
    .select({
      credentialId: schema.providerConfigs.credentialId,
      baseUrl:      schema.providerConfigs.baseUrl,
      enabled:      schema.providerConfigs.enabled,
    })
    .from(schema.providerConfigs)
    .where(and(
      eq(schema.providerConfigs.userId, userId),
      eq(schema.providerConfigs.provider, provider),
    ))
    .limit(1)

  if (!providerCfg?.enabled || !providerCfg.credentialId) return null

  const [cred] = await db
    .select({ ciphertext: schema.credentials.ciphertext })
    .from(schema.credentials)
    .where(and(
      eq(schema.credentials.id, providerCfg.credentialId),
      eq(schema.credentials.status, 'active'),
    ))
    .limit(1)

  if (!cred) return null

  // Decode key (Phase 1: base64; Phase 2: AES-GCM — see settings.ts)
  const apiKey = Buffer.from(cred.ciphertext, 'base64').toString('utf8')
  const baseUrl = providerCfg.baseUrl ?? PROVIDER_BASE_URLS[provider] ?? PROVIDER_BASE_URLS.openrouter

  return { provider, model, apiKey, baseUrl }
}

function buildHandle(provider: string, model: string, apiKey: string, baseUrl: string) {
  const client = createOpenAICompatible({ name: provider, baseURL: baseUrl, apiKey })
  return client(model)
}

// ─────────────────────────────────────────────────────────────
// Legacy env-var routing (used when no userId is provided)
// ─────────────────────────────────────────────────────────────
export function decideRoute(
  taskType: string,
  containsPersonalData: boolean,
  allowCloud = false,
): RouteDecision {
  if (containsPersonalData && config.blockCloudPersonalData) {
    return { modelKind: 'local', modelName: DEFAULT_LOCAL_MODEL, reason: 'privacy: personal data forced local' }
  }
  if (config.cloudFallbackEnabled && allowCloud) {
    return { modelKind: 'cloud', modelName: envCloudModel(), reason: `cloud fallback for ${taskType}` }
  }
  return { modelKind: 'local', modelName: DEFAULT_LOCAL_MODEL, reason: 'tier default (local)' }
}

function envCloudModel(): string {
  switch (config.cloudProvider) {
    case 'openrouter': return 'meta-llama/llama-3.3-70b-instruct'
    case 'groq':       return 'llama-3.3-70b-versatile'
    default:           return 'llama-3.3-70b-versatile'
  }
}

function envCloudHandle(modelName: string) {
  const baseURL = PROVIDER_BASE_URLS[config.cloudProvider] ?? PROVIDER_BASE_URLS.openrouter
  const apiKey = config.cloudProvider === 'groq'
    ? config.groqApiKey
    : config.openrouterApiKey

  const client = createOpenAICompatible({ name: config.cloudProvider, baseURL, apiKey })
  return client(modelName)
}

function canFailoverToCloud(opts: { containsPersonalData?: boolean }): boolean {
  if (opts.containsPersonalData && config.blockCloudPersonalData) return false
  return config.cloudFallbackEnabled && Boolean(config.groqApiKey || config.openrouterApiKey)
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// ─────────────────────────────────────────────────────────────
// Ollama streaming (local path)
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
  opts: {
    taskType?: string
    containsPersonalData?: boolean
    allowCloud?: boolean
    userId?: string
  } = {},
) {
  const taskType = opts.taskType ?? 'generic'

  // DB-backed user route takes priority
  if (opts.userId) {
    try {
      const route = await loadUserRoute(opts.userId, taskType)
      if (route) {
        const handle = buildHandle(route.provider, route.model, route.apiKey, route.baseUrl)
        const { text } = await generateText({ model: handle, prompt })
        return { text, modelKind: 'cloud' as ModelKind, modelName: route.model, reason: `user route: ${route.provider}/${route.model}` }
      }
    } catch (err) {
      // Route load failed — fall through to env-var path
      console.warn('[modelRouter] user route load failed, falling back:', errMsg(err))
    }
  }

  const route = decideRoute(taskType, opts.containsPersonalData ?? false, opts.allowCloud ?? false)

  if (route.modelKind === 'local') {
    try {
      const text = await ollamaGenerate(prompt, route.modelName)
      return { text, modelKind: route.modelKind, modelName: route.modelName, reason: route.reason }
    } catch (err) {
      if (!canFailoverToCloud(opts)) throw err
      const modelName = envCloudModel()
      const { text } = await generateText({ model: envCloudHandle(modelName), prompt })
      return { text, modelKind: 'cloud' as ModelKind, modelName, reason: `failover: local failed (${errMsg(err)})` }
    }
  }

  const { text } = await generateText({ model: envCloudHandle(route.modelName), prompt })
  return { text, modelKind: route.modelKind, modelName: route.modelName, reason: route.reason }
}

export async function generateStructured<T>(
  prompt: string,
  schema: z.ZodType<T>,
  opts: {
    taskType?: string
    containsPersonalData?: boolean
    allowCloud?: boolean
    userId?: string
  } = {},
): Promise<{ data: T; modelKind: ModelKind; modelName: string; reason: string }> {
  const taskType = opts.taskType ?? 'generic'

  // DB-backed user route takes priority
  if (opts.userId) {
    try {
      const route = await loadUserRoute(opts.userId, taskType)
      if (route) {
        const handle = buildHandle(route.provider, route.model, route.apiKey, route.baseUrl)
        const { object } = await generateObject({ model: handle, prompt, schema })
        return { data: object, modelKind: 'cloud', modelName: route.model, reason: `user route: ${route.provider}/${route.model}` }
      }
    } catch (err) {
      console.warn('[modelRouter] user route load failed, falling back:', errMsg(err))
    }
  }

  const route = decideRoute(taskType, opts.containsPersonalData ?? false, opts.allowCloud ?? false)

  if (route.modelKind === 'cloud') {
    const { object } = await generateObject({ model: envCloudHandle(route.modelName), prompt, schema })
    return { data: object, modelKind: route.modelKind, modelName: route.modelName, reason: route.reason }
  }

  try {
    return await localStructured(prompt, schema, route)
  } catch (err) {
    if (!canFailoverToCloud(opts)) throw err
    const modelName = envCloudModel()
    const { object } = await generateObject({ model: envCloudHandle(modelName), prompt, schema })
    return { data: object, modelKind: 'cloud', modelName, reason: `failover: local failed (${errMsg(err)})` }
  }
}

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
  try { return JSON.parse(text.trim()) } catch { /* fall through */ }
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  try { return JSON.parse(match[0]) } catch { return null }
}

// Embed text using Ollama's nomic-embed-text model (768-dim).
// Returns a zero vector if Ollama is unavailable so callers never crash.
export async function embed(text: string): Promise<number[]> {
  try {
    const res = await fetch(`${config.ollamaBaseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'nomic-embed-text', prompt: text.slice(0, 8_000) }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw new Error(`Ollama embed HTTP ${res.status}`)
    const data = (await res.json()) as { embedding: number[] }
    return data.embedding
  } catch (err) {
    console.error('[modelRouter] embed error:', String(err))
    return new Array(768).fill(0)
  }
}

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
