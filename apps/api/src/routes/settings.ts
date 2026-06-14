import { Hono } from 'hono'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { normalizeAutonomy } from '../agents/lib/autonomy.js'
import { PROVIDER_BASE_URLS, SYSTEM_RECOMMENDED } from '../router/modelRouter.js'
import { config } from '../config.js'

const app = new Hono()

// ─────────────────────────────────────────────────────────────
// App settings (routing / inference / search / prefs / privacy)
// ─────────────────────────────────────────────────────────────

// ── GET /settings ─────────────────────────────────────────────
app.get('/', async (c) => {
  const userId = c.get('userId')

  const [settings] = await db
    .select()
    .from(schema.appSettings)
    .where(eq(schema.appSettings.userId, userId))
    .limit(1)

  if (!settings) {
    // Auto-create defaults
    const [created] = await db
      .insert(schema.appSettings)
      .values({ userId })
      .returning()
    return c.json(created)
  }

  return c.json(settings)
})

// ── PATCH /settings ───────────────────────────────────────────
const SettingsInputSchema = z.object({
  routing: z.record(z.unknown()).optional(),
  inference: z.record(z.unknown()).optional(),
  search: z.record(z.unknown()).optional(),
  preferences: z.record(z.unknown()).optional(),
  privacy: z.record(z.unknown()).optional(),
  // Phase 4 autonomy control plane. Validated/normalized against AutonomySchema
  // so a malformed blob can never silently widen what an agent is allowed to do.
  autonomy: z.record(z.unknown()).optional(),
})

app.patch('/', async (c) => {
  const userId = c.get('userId')
  let body: z.infer<typeof SettingsInputSchema>
  try {
    body = SettingsInputSchema.parse(await c.req.json())
  } catch (err) {
    return c.json({ code: 'validation_error', message: String(err) }, 400)
  }

  const existing = await db
    .select({ userId: schema.appSettings.userId })
    .from(schema.appSettings)
    .where(eq(schema.appSettings.userId, userId))
    .limit(1)

  const updateValues: Partial<typeof schema.appSettings.$inferInsert> = {
    updatedAt: new Date(),
  }
  if (body.routing !== undefined) updateValues.routing = body.routing
  if (body.inference !== undefined) updateValues.inference = body.inference
  if (body.search !== undefined) updateValues.search = body.search
  if (body.preferences !== undefined) updateValues.preferences = body.preferences
  if (body.privacy !== undefined) updateValues.privacy = body.privacy
  // Normalize through AutonomySchema before persisting — clamps/defaults every field.
  if (body.autonomy !== undefined) updateValues.autonomy = normalizeAutonomy(body.autonomy)

  let result
  if (existing.length > 0) {
    ;[result] = await db
      .update(schema.appSettings)
      .set(updateValues)
      .where(eq(schema.appSettings.userId, userId))
      .returning()
  } else {
    ;[result] = await db
      .insert(schema.appSettings)
      .values({
        userId,
        routing: body.routing ?? {},
        inference: body.inference ?? {},
        search: body.search ?? {},
        preferences: body.preferences ?? {},
        privacy: body.privacy ?? {},
        autonomy: body.autonomy !== undefined ? normalizeAutonomy(body.autonomy) : {},
      })
      .returning()
  }

  return c.json(result)
})

// ─────────────────────────────────────────────────────────────
// Providers
// ─────────────────────────────────────────────────────────────

// ── GET /settings/providers ───────────────────────────────────
app.get('/providers', async (c) => {
  const userId = c.get('userId')

  const rows = await db
    .select({
      id: schema.providerConfigs.id,
      provider: schema.providerConfigs.provider,
      baseUrl: schema.providerConfigs.baseUrl,
      defaultModel: schema.providerConfigs.defaultModel,
      enabled: schema.providerConfigs.enabled,
      credentialId: schema.providerConfigs.credentialId,
    })
    .from(schema.providerConfigs)
    .where(eq(schema.providerConfigs.userId, userId))

  // Fetch last4 for each credential — never return ciphertext/nonce
  const enriched = await Promise.all(
    rows.map(async (row) => {
      let keyLast4: string | null = null
      let status = 'disconnected'

      if (row.credentialId) {
        const [cred] = await db
          .select({ last4: schema.credentials.last4, credStatus: schema.credentials.status })
          .from(schema.credentials)
          .where(eq(schema.credentials.id, row.credentialId))
          .limit(1)
        if (cred) {
          keyLast4 = cred.last4
          status = cred.credStatus === 'active' ? 'connected' : 'disconnected'
        }
      }

      return {
        id: row.id,
        provider: row.provider,
        base_url: row.baseUrl,
        default_model: row.defaultModel,
        enabled: row.enabled,
        key_last4: keyLast4,
        status,
      }
    }),
  )

  return c.json(enriched)
})

// ── POST /settings/providers ──────────────────────────────────
const ProviderInputSchema = z.object({
  provider: z.enum(['openrouter', 'anthropic', 'openai', 'groq', 'gemini', 'ollama']),
  base_url: z.string().optional(),
  default_model: z.string().optional(),
  api_key: z.string().optional(), // plaintext, write-only — encrypted at rest
  enabled: z.boolean().optional(),
})

app.post('/providers', async (c) => {
  const userId = c.get('userId')
  let body: z.infer<typeof ProviderInputSchema>
  try {
    body = ProviderInputSchema.parse(await c.req.json())
  } catch (err) {
    return c.json({ code: 'validation_error', message: String(err) }, 400)
  }

  let credentialId: string | undefined

  if (body.api_key) {
    // In Phase 1 we store the key in a simple form.
    // In production this MUST be AES-GCM encrypted; for now we base64-encode to satisfy the schema.
    // TODO Phase 2: replace with real encryption using APP_SECRET-derived key.
    const encoded = Buffer.from(body.api_key).toString('base64')
    const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(12))).toString('base64')
    const last4 = body.api_key.slice(-4) || null

    // Upsert credential: retire existing active cred for this label, create new
    const existingCreds = await db
      .select()
      .from(schema.credentials)
      .where(
        and(
          eq(schema.credentials.userId, userId),
          eq(schema.credentials.label, body.provider),
          eq(schema.credentials.status, 'active'),
        ),
      )

    // Mark existing as retiring
    for (const cred of existingCreds) {
      await db
        .update(schema.credentials)
        .set({ status: 'retiring', rotatedAt: new Date() })
        .where(eq(schema.credentials.id, cred.id))
    }

    const [newCred] = await db
      .insert(schema.credentials)
      .values({
        userId,
        label: body.provider,
        kind: 'api_key',
        ciphertext: encoded,
        nonce,
        last4,
        status: 'active',
      })
      .returning()

    credentialId = newCred.id
  }

  // Upsert provider config
  const [existing] = await db
    .select({ id: schema.providerConfigs.id })
    .from(schema.providerConfigs)
    .where(
      and(
        eq(schema.providerConfigs.userId, userId),
        eq(schema.providerConfigs.provider, body.provider),
      ),
    )
    .limit(1)

  let providerConfig
  if (existing) {
    const updates: Partial<typeof schema.providerConfigs.$inferInsert> = {}
    if (body.base_url !== undefined) updates.baseUrl = body.base_url
    if (body.default_model !== undefined) updates.defaultModel = body.default_model
    if (body.enabled !== undefined) updates.enabled = body.enabled
    if (credentialId) updates.credentialId = credentialId

    ;[providerConfig] = await db
      .update(schema.providerConfigs)
      .set(updates)
      .where(eq(schema.providerConfigs.id, existing.id))
      .returning()
  } else {
    ;[providerConfig] = await db
      .insert(schema.providerConfigs)
      .values({
        userId,
        provider: body.provider,
        baseUrl: body.base_url,
        defaultModel: body.default_model,
        credentialId,
        enabled: body.enabled ?? true,
      })
      .returning()
  }

  return c.json({
    id: providerConfig.id,
    provider: providerConfig.provider,
    base_url: providerConfig.baseUrl,
    default_model: providerConfig.defaultModel,
    enabled: providerConfig.enabled,
    key_last4: body.api_key ? body.api_key.slice(-4) : null,
    status: 'connected',
  })
})

// ── POST /settings/providers/:id/test ────────────────────────
app.post('/providers/:id/test', async (c) => {
  // Phase 1 stub — real connectivity test in Phase 2
  return c.json({ ok: true, latency_ms: null, detail: 'Connection test not yet implemented (Phase 2)', models: null })
})

// ── POST /settings/providers/:id/rotate ──────────────────────
app.post('/providers/:id/rotate', async (c) => {
  return c.json({ code: 'not_implemented', message: 'Key rotation available in Phase 2' }, 501)
})

// ── DELETE /settings/providers/:id ───────────────────────────
app.delete('/providers/:id', async (c) => {
  const userId = c.get('userId')
  const { id } = c.req.param()

  const [config] = await db
    .select()
    .from(schema.providerConfigs)
    .where(and(eq(schema.providerConfigs.id, id), eq(schema.providerConfigs.userId, userId)))
    .limit(1)

  if (!config) {
    return c.json({ code: 'not_found', message: 'Provider not found' }, 404)
  }

  await db.delete(schema.providerConfigs).where(eq(schema.providerConfigs.id, id))

  return c.body(null, 204)
})

// ─────────────────────────────────────────────────────────────
// Agent Routing — per-agent model assignments
// ─────────────────────────────────────────────────────────────

const AgentRouteSchema = z.object({
  provider: z.enum(['openrouter', 'anthropic', 'openai', 'groq', 'gemini', 'ollama']),
  model: z.string().min(1),
})

const AgentRoutingInputSchema = z.object({
  defaultProvider: z.enum(['openrouter', 'anthropic', 'openai', 'groq', 'gemini', 'ollama']).optional(),
  agentRoutes: z.record(AgentRouteSchema).optional(),
})

// ── GET /settings/agent-routing ───────────────────────────────
app.get('/agent-routing', async (c) => {
  const userId = c.get('userId')

  const [settings] = await db
    .select({ routing: schema.appSettings.routing })
    .from(schema.appSettings)
    .where(eq(schema.appSettings.userId, userId))
    .limit(1)

  const routing = (settings?.routing ?? {}) as Record<string, unknown>

  return c.json({
    defaultProvider: (routing.defaultProvider as string | undefined) ?? null,
    agentRoutes: (routing.agentRoutes ?? {}) as Record<string, { provider: string; model: string }>,
    systemRecommended: SYSTEM_RECOMMENDED,
  })
})

// ── PUT /settings/agent-routing ───────────────────────────────
app.put('/agent-routing', async (c) => {
  const userId = c.get('userId')
  let body: z.infer<typeof AgentRoutingInputSchema>
  try {
    body = AgentRoutingInputSchema.parse(await c.req.json())
  } catch (err) {
    return c.json({ code: 'validation_error', message: String(err) }, 400)
  }

  const [existing] = await db
    .select({ routing: schema.appSettings.routing })
    .from(schema.appSettings)
    .where(eq(schema.appSettings.userId, userId))
    .limit(1)

  const currentRouting = (existing?.routing ?? {}) as Record<string, unknown>
  const newRouting: Record<string, unknown> = { ...currentRouting }

  if (body.defaultProvider !== undefined) newRouting.defaultProvider = body.defaultProvider
  if (body.agentRoutes !== undefined) newRouting.agentRoutes = body.agentRoutes

  if (existing) {
    await db
      .update(schema.appSettings)
      .set({ routing: newRouting, updatedAt: new Date() })
      .where(eq(schema.appSettings.userId, userId))
  } else {
    await db
      .insert(schema.appSettings)
      .values({ userId, routing: newRouting })
  }

  return c.json({
    defaultProvider: (newRouting.defaultProvider as string | undefined) ?? null,
    agentRoutes: (newRouting.agentRoutes ?? {}) as Record<string, { provider: string; model: string }>,
    systemRecommended: SYSTEM_RECOMMENDED,
  })
})

// ─────────────────────────────────────────────────────────────
// Channels
// ─────────────────────────────────────────────────────────────

const VALID_CHANNELS = ['telegram', 'whatsapp'] as const
type ValidChannel = (typeof VALID_CHANNELS)[number]

// ── GET /settings/channels ────────────────────────────────────
// Status is derived from users.telegramUserId / users.whatsappNumber.
// channel_configs stores connection metadata (username, etc.) written by the bot.
app.get('/channels', async (c) => {
  const userId = c.get('userId')

  const [user] = await db
    .select({ telegramUserId: schema.users.telegramUserId, whatsappNumber: schema.users.whatsappNumber })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1)

  const configs = await db
    .select({ channel: schema.channelConfigs.channel, config: schema.channelConfigs.config })
    .from(schema.channelConfigs)
    .where(eq(schema.channelConfigs.userId, userId))

  const telegramConfig = configs.find(r => r.channel === 'telegram')
  const whatsappConfig = configs.find(r => r.channel === 'whatsapp')

  return c.json([
    {
      channel: 'telegram',
      status: user?.telegramUserId ? 'connected' : 'disconnected',
      connected_as: user?.telegramUserId
        ? ((telegramConfig?.config as Record<string, unknown>)?.username as string | null) ?? null
        : null,
    },
    {
      channel: 'whatsapp',
      status: user?.whatsappNumber ? 'connected' : 'disconnected',
      connected_as: user?.whatsappNumber ?? null,
    },
  ])
})

// ── POST /settings/channels/:channel/connect ─────────────────
// Generates a one-time link token and returns the deep link.
// The bot receives the token, maps the user's account, and marks it used.
app.post('/channels/:channel/connect', async (c) => {
  const userId = c.get('userId')
  const channel = c.req.param('channel') as ValidChannel

  if (!VALID_CHANNELS.includes(channel)) {
    return c.json({ code: 'validation_error', message: 'Invalid channel' }, 400)
  }

  // 36-char hex token
  const token = Array.from(crypto.getRandomValues(new Uint8Array(18)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes

  await db.insert(schema.channelLinkTokens).values({ userId, channel, token, expiresAt })

  const deepLink =
    channel === 'telegram'
      ? `https://t.me/${config.telegramBotUsername}?start=${token}`
      : `https://wa.me/${config.whatsappNumber}?text=CONNECT-${token}`

  return c.json({ channel, deep_link: deepLink, expires_at: expiresAt.toISOString() })
})

// ── POST /settings/channels/:channel/disconnect ───────────────
app.post('/channels/:channel/disconnect', async (c) => {
  const userId = c.get('userId')
  const channel = c.req.param('channel') as ValidChannel

  if (!VALID_CHANNELS.includes(channel)) {
    return c.json({ code: 'validation_error', message: 'Invalid channel' }, 400)
  }

  if (channel === 'telegram') {
    await db.update(schema.users).set({ telegramUserId: null }).where(eq(schema.users.id, userId))
  } else {
    await db.update(schema.users).set({ whatsappNumber: null }).where(eq(schema.users.id, userId))
  }

  const [existing] = await db
    .select({ id: schema.channelConfigs.id })
    .from(schema.channelConfigs)
    .where(and(eq(schema.channelConfigs.userId, userId), eq(schema.channelConfigs.channel, channel)))
    .limit(1)

  if (existing) {
    await db
      .update(schema.channelConfigs)
      .set({ status: 'disconnected', enabled: false, config: {}, lastCheckedAt: new Date() })
      .where(eq(schema.channelConfigs.id, existing.id))
  }

  return c.body(null, 204)
})

// ─────────────────────────────────────────────────────────────
// Integrations
// ─────────────────────────────────────────────────────────────

// ── GET /settings/integrations ────────────────────────────────
app.get('/integrations', async (c) => {
  const userId = c.get('userId')

  const rows = await db
    .select({
      kind: schema.integrations.kind,
      status: schema.integrations.status,
      config: schema.integrations.config,
      lastSyncAt: schema.integrations.lastSyncAt,
    })
    .from(schema.integrations)
    .where(eq(schema.integrations.userId, userId))

  return c.json(rows)
})

// ── POST /settings/integrations/:kind/connect ─────────────────
app.post('/integrations/:kind/connect', async (c) => {
  return c.json({ auth_url: null, status: 'not_implemented' })
})

// ── POST /settings/integrations/:kind/disconnect ──────────────
app.post('/integrations/:kind/disconnect', async (c) => {
  return c.body(null, 204)
})

// ── GET /settings/integrations/:kind/callback ─────────────────
app.get('/integrations/:kind/callback', async (c) => {
  return c.json({ status: 'not_implemented' })
})

// ─────────────────────────────────────────────────────────────
// Models
// ─────────────────────────────────────────────────────────────

// ── GET /settings/models?provider=openrouter ──────────────────
// Returns available models for a provider. For OpenRouter, fetches live from their API
// using the user's stored key. For others, returns a curated static list.
app.get('/models', async (c) => {
  const userId = c.get('userId')
  const provider = c.req.query('provider') ?? 'openrouter'

  if (provider === 'openrouter') {
    // Try user's stored key first, then env var
    let apiKey: string | null = null

    const [providerCfg] = await db
      .select({ credentialId: schema.providerConfigs.credentialId })
      .from(schema.providerConfigs)
      .where(and(eq(schema.providerConfigs.userId, userId), eq(schema.providerConfigs.provider, 'openrouter')))
      .limit(1)

    if (providerCfg?.credentialId) {
      const [cred] = await db
        .select({ ciphertext: schema.credentials.ciphertext })
        .from(schema.credentials)
        .where(and(eq(schema.credentials.id, providerCfg.credentialId), eq(schema.credentials.status, 'active')))
        .limit(1)
      if (cred) apiKey = Buffer.from(cred.ciphertext, 'base64').toString('utf8')
    }

    if (!apiKey) apiKey = process.env.OPENROUTER_API_KEY ?? null

    if (apiKey) {
      try {
        const res = await fetch('https://openrouter.ai/api/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(8000),
        })
        if (res.ok) {
          const data = (await res.json()) as { data: Array<{ id: string; name: string; context_length: number; pricing: { prompt: string; completion: string } }> }
          return c.json({
            provider: 'openrouter',
            models: data.data.map((m) => ({
              id: m.id,
              name: m.name,
              context_length: m.context_length,
              pricing: m.pricing,
            })),
          })
        }
      } catch { /* fall through to static list */ }
    }
  }

  // Static curated lists for each provider
  const STATIC_MODELS: Record<string, Array<{ id: string; name: string }>> = {
    anthropic: [
      { id: 'claude-opus-4-8',            name: 'Claude Opus 4.8' },
      { id: 'claude-sonnet-4-6',           name: 'Claude Sonnet 4.6' },
      { id: 'claude-haiku-4-5-20251001',   name: 'Claude Haiku 4.5' },
      { id: 'claude-3-5-sonnet-20241022',  name: 'Claude 3.5 Sonnet' },
      { id: 'claude-3-5-haiku-20241022',   name: 'Claude 3.5 Haiku' },
    ],
    openai: [
      { id: 'gpt-4o',           name: 'GPT-4o' },
      { id: 'gpt-4o-mini',      name: 'GPT-4o Mini' },
      { id: 'o3',               name: 'o3' },
      { id: 'o4-mini',          name: 'o4-mini' },
    ],
    groq: [
      { id: 'llama-3.3-70b-versatile',     name: 'Llama 3.3 70B' },
      { id: 'llama-3.1-8b-instant',        name: 'Llama 3.1 8B (fast)' },
      { id: 'gemma2-9b-it',                name: 'Gemma2 9B' },
      { id: 'mixtral-8x7b-32768',          name: 'Mixtral 8x7B' },
    ],
    gemini: [
      { id: 'gemini-2.5-pro-preview',      name: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.0-flash',            name: 'Gemini 2.0 Flash' },
      { id: 'gemini-1.5-pro',              name: 'Gemini 1.5 Pro' },
      { id: 'gemini-1.5-flash',            name: 'Gemini 1.5 Flash' },
    ],
    openrouter: [
      { id: 'anthropic/claude-3.5-sonnet',              name: 'Claude 3.5 Sonnet' },
      { id: 'anthropic/claude-opus-4',                  name: 'Claude Opus 4' },
      { id: 'openai/gpt-4o',                            name: 'GPT-4o' },
      { id: 'google/gemini-2.5-pro-preview',            name: 'Gemini 2.5 Pro' },
      { id: 'meta-llama/llama-3.3-70b-instruct',        name: 'Llama 3.3 70B' },
      { id: 'meta-llama/llama-3.1-8b-instruct:free',    name: 'Llama 3.1 8B (free)' },
      { id: 'deepseek/deepseek-r1',                     name: 'DeepSeek R1' },
      { id: 'google/gemini-2.0-flash-001',              name: 'Gemini 2.0 Flash' },
    ],
    ollama: [],
  }

  return c.json({
    provider,
    models: STATIC_MODELS[provider] ?? [],
  })
})

// ── POST /settings/models/pull ────────────────────────────────
app.post('/models/pull', async (c) => {
  return c.json({ code: 'not_implemented', message: 'Model pull available in Phase 2' }, 501)
})

// ─────────────────────────────────────────────────────────────
// Usage
// ─────────────────────────────────────────────────────────────

// ── GET /settings/usage ───────────────────────────────────────
app.get('/usage', async (c) => {
  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return c.json({
    month,
    total_usd: 0,
    by_model: [],
    cost_cap_usd: null,
  })
})

export { app as settingsRoutes }
