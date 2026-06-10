// Phase 5 (foundation) — real-auth scaffold.
//
// Provides email/password registration + login issuing opaque session tokens,
// alongside the v1 single-owner bearer token (which keeps working — see
// middleware/auth.ts). This is a reviewed-before-use scaffold (SECURITY.md B3):
// it does NOT yet implement email verification, password reset, rate limiting,
// or lockout. Do not expose publicly until those are human-designed.

import { Hono } from 'hono'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { authMiddleware } from '../middleware/auth.js'
import { hashPassword, verifyPassword, newSessionToken, hashToken } from '../lib/password.js'

const app = new Hono()

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

async function issueSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = newSessionToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await db.insert(schema.sessions).values({ userId, tokenHash: hashToken(token), expiresAt })
  return { token, expiresAt }
}

const CredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  display_name: z.string().max(200).optional(),
})

// ── POST /auth/register ───────────────────────────────────────
app.post('/register', async (c) => {
  let body: z.infer<typeof CredentialsSchema>
  try {
    body = CredentialsSchema.parse(await c.req.json())
  } catch (err) {
    return c.json({ code: 'validation_error', message: String(err) }, 400)
  }

  const [existing] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, body.email))
    .limit(1)
  if (existing) {
    return c.json({ code: 'conflict', message: 'Email already registered' }, 409)
  }

  const [user] = await db
    .insert(schema.users)
    .values({
      email: body.email,
      displayName: body.display_name ?? null,
      passwordHash: hashPassword(body.password),
    })
    .returning({ id: schema.users.id, email: schema.users.email, displayName: schema.users.displayName })

  const { token, expiresAt } = await issueSession(user.id)
  return c.json({ token, expires_at: expiresAt, user }, 201)
})

// ── POST /auth/login ──────────────────────────────────────────
app.post('/login', async (c) => {
  let body: { email: string; password: string }
  try {
    body = z.object({ email: z.string().email(), password: z.string() }).parse(await c.req.json())
  } catch (err) {
    return c.json({ code: 'validation_error', message: String(err) }, 400)
  }

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, body.email))
    .limit(1)

  // Same response whether the user is missing or the password is wrong.
  if (!user || !verifyPassword(body.password, user.passwordHash)) {
    return c.json({ code: 'unauthorized', message: 'Invalid email or password' }, 401)
  }

  const { token, expiresAt } = await issueSession(user.id)
  return c.json({
    token,
    expires_at: expiresAt,
    user: { id: user.id, email: user.email, displayName: user.displayName },
  })
})

// ── Authenticated sub-routes ──────────────────────────────────
app.use('/me', authMiddleware)
app.use('/logout', authMiddleware)

// GET /auth/me
app.get('/me', async (c) => {
  const userId = c.get('userId')
  const [user] = await db
    .select({ id: schema.users.id, email: schema.users.email, displayName: schema.users.displayName })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1)
  return c.json(user ?? null)
})

// POST /auth/logout — revoke the presented session token (no-op for bearer owner).
app.post('/logout', async (c) => {
  const auth = c.req.header('Authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (token) {
    await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, hashToken(token)))
  }
  return c.body(null, 204)
})

export { app as authRoutes }
