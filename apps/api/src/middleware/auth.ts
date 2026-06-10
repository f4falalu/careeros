import { createMiddleware } from 'hono/factory'
import { and, eq, gt } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { config } from '../config.js'
import { hashToken } from '../lib/password.js'

export const authMiddleware = createMiddleware(async (c, next) => {
  const auth = c.req.header('Authorization')
  if (!auth?.startsWith('Bearer ')) {
    return c.json({ code: 'unauthorized', message: 'Missing token' }, 401)
  }
  const token = auth.slice(7)

  // Path 1 — v1 single-owner bearer token (APP_SECRET). Resolves to the first user.
  if (token === config.appSecret) {
    let [user] = await db.select({ id: schema.users.id }).from(schema.users).limit(1)
    if (!user) {
      ;[user] = await db
        .insert(schema.users)
        .values({ displayName: 'Owner' })
        .returning({ id: schema.users.id })
    }
    c.set('userId', user.id)
    return next()
  }

  // Path 2 — Phase 5 session token. Look up the (non-expired) session by token hash.
  const [session] = await db
    .select({ userId: schema.sessions.userId })
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.tokenHash, hashToken(token)),
        gt(schema.sessions.expiresAt, new Date()),
      ),
    )
    .limit(1)

  if (!session) {
    return c.json({ code: 'unauthorized', message: 'Invalid token' }, 401)
  }

  c.set('userId', session.userId)
  await next()
})

declare module 'hono' {
  interface ContextVariableMap {
    userId: string
  }
}
