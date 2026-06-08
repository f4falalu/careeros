import { createMiddleware } from 'hono/factory'
import { db, schema } from '../db/index.js'
import { config } from '../config.js'
import { eq } from 'drizzle-orm'

export const authMiddleware = createMiddleware(async (c, next) => {
  const auth = c.req.header('Authorization')
  if (!auth?.startsWith('Bearer ')) {
    return c.json({ code: 'unauthorized', message: 'Missing token' }, 401)
  }
  const token = auth.slice(7)
  if (token !== config.appSecret) {
    return c.json({ code: 'unauthorized', message: 'Invalid token' }, 401)
  }

  // Get or create the single user (v1: token = identity)
  let [user] = await db.select().from(schema.users).limit(1)
  if (!user) {
    ;[user] = await db
      .insert(schema.users)
      .values({ displayName: 'Owner' })
      .returning()
  }
  c.set('userId', user.id)
  await next()
})

declare module 'hono' {
  interface ContextVariableMap {
    userId: string
  }
}
