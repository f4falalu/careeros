import { Hono } from 'hono'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { normalizeAutonomy } from '../agents/lib/autonomy.js'

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
  provider: z.enum(['openrouter', 'anthropic', 'openai', 'ollama']),
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
// Channels
// ─────────────────────────────────────────────────────────────

// ── GET /settings/channels ────────────────────────────────────
app.get('/channels', async (c) => {
  const userId = c.get('userId')

  const rows = await db
    .select({
      channel: schema.channelConfigs.channel,
      enabled: schema.channelConfigs.enabled,
      status: schema.channelConfigs.status,
      config: schema.channelConfigs.config,
      lastCheckedAt: schema.channelConfigs.lastCheckedAt,
    })
    .from(schema.channelConfigs)
    .where(eq(schema.channelConfigs.userId, userId))

  return c.json(rows)
})

// ── PUT /settings/channels/:channel ──────────────────────────
const ChannelInputSchema = z.object({
  token: z.string().optional(),
  allowed_user_ids: z.array(z.string()).optional(),
  base_url: z.string().optional(),
  session: z.string().optional(),
  enabled: z.boolean().optional(),
})

app.put('/channels/:channel', async (c) => {
  const userId = c.get('userId')
  const { channel } = c.req.param()

  if (!['telegram', 'whatsapp'].includes(channel)) {
    return c.json({ code: 'validation_error', message: 'Invalid channel' }, 400)
  }

  let body: z.infer<typeof ChannelInputSchema>
  try {
    body = ChannelInputSchema.parse(await c.req.json())
  } catch (err) {
    return c.json({ code: 'validation_error', message: String(err) }, 400)
  }

  const [existing] = await db
    .select({ id: schema.channelConfigs.id })
    .from(schema.channelConfigs)
    .where(and(eq(schema.channelConfigs.userId, userId), eq(schema.channelConfigs.channel, channel)))
    .limit(1)

  // Build config object (never store token in plaintext config — store masked)
  const configData: Record<string, unknown> = {}
  if (body.allowed_user_ids) configData.allowed_user_ids = body.allowed_user_ids
  if (body.base_url) configData.base_url = body.base_url
  if (body.session) configData.session = body.session

  // Store token encrypted if provided
  let credentialId: string | null = null
  if (body.token) {
    const encoded = Buffer.from(body.token).toString('base64')
    const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(12))).toString('base64')
    const last4 = body.token.slice(-4) || null

    const [cred] = await db
      .insert(schema.credentials)
      .values({
        userId,
        label: `channel:${channel}`,
        kind: 'bearer',
        ciphertext: encoded,
        nonce,
        last4,
        status: 'active',
      })
      .returning()
    credentialId = cred.id
  }

  let result
  if (existing) {
    const updates: Partial<typeof schema.channelConfigs.$inferInsert> = {
      config: configData,
      lastCheckedAt: new Date(),
    }
    if (body.enabled !== undefined) updates.enabled = body.enabled
    if (credentialId) updates.credentialId = credentialId

    ;[result] = await db
      .update(schema.channelConfigs)
      .set(updates)
      .where(eq(schema.channelConfigs.id, existing.id))
      .returning()
  } else {
    ;[result] = await db
      .insert(schema.channelConfigs)
      .values({
        userId,
        channel,
        credentialId,
        config: configData,
        enabled: body.enabled ?? false,
        status: 'disconnected',
        lastCheckedAt: new Date(),
      })
      .returning()
  }

  return c.json({
    channel: result.channel,
    enabled: result.enabled,
    status: result.status,
    config: result.config,
    lastCheckedAt: result.lastCheckedAt,
  })
})

// ── POST /settings/channels/:channel/test ────────────────────
app.post('/channels/:channel/test', async (c) => {
  return c.json({ ok: true, latency_ms: null, detail: 'Channel test not yet implemented (Phase 2)' })
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

// ── GET /settings/models ──────────────────────────────────────
app.get('/models', async (c) => {
  return c.json({
    ollama_models: [],
    cloud_models: [],
    embedding_model: 'nomic-embed-text',
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
