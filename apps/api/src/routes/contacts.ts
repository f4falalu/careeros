import { Hono } from 'hono'
import { z } from 'zod'
import { and, desc, eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'

const app = new Hono()

const VALID_ROLES = ['recruiter', 'hiring_manager', 'founder', 'referral', 'other'] as const

const ContactSchema = z.object({
  name: z.string().min(1).max(200),
  role: z.enum(VALID_ROLES).default('other'),
  title: z.string().max(200).optional(),
  email: z.string().email().optional(),
  linkedin_url: z.string().url().optional(),
  company_id: z.string().uuid().optional(),
})

// ── GET /contacts ─────────────────────────────────────────────
app.get('/', async (c) => {
  const userId = c.get('userId')
  const companyId = c.req.query('company_id')

  const conditions = [eq(schema.contacts.userId, userId)]
  if (companyId) {
    conditions.push(eq(schema.contacts.companyId, companyId))
  }

  const contacts = await db
    .select()
    .from(schema.contacts)
    .where(and(...conditions))
    .orderBy(desc(schema.contacts.createdAt))
    .limit(200)

  return c.json(contacts)
})

// ── POST /contacts ────────────────────────────────────────────
app.post('/', async (c) => {
  const userId = c.get('userId')

  let body: z.infer<typeof ContactSchema>
  try {
    body = ContactSchema.parse(await c.req.json())
  } catch (err) {
    return c.json({ code: 'validation_error', message: String(err) }, 400)
  }

  const [contact] = await db
    .insert(schema.contacts)
    .values({
      userId,
      name: body.name,
      role: body.role,
      title: body.title ?? null,
      email: body.email ?? null,
      linkedinUrl: body.linkedin_url ?? null,
      companyId: body.company_id ?? null,
    })
    .returning()

  return c.json(contact, 201)
})

// ── GET /contacts/:id ─────────────────────────────────────────
app.get('/:id', async (c) => {
  const userId = c.get('userId')
  const contactId = c.req.param('id')

  const [contact] = await db
    .select()
    .from(schema.contacts)
    .where(and(eq(schema.contacts.id, contactId), eq(schema.contacts.userId, userId)))
    .limit(1)

  if (!contact) {
    return c.json({ code: 'not_found', message: 'Contact not found' }, 404)
  }

  return c.json(contact)
})

// ── PATCH /contacts/:id ───────────────────────────────────────
app.patch('/:id', async (c) => {
  const userId = c.get('userId')
  const contactId = c.req.param('id')

  let body: Partial<z.infer<typeof ContactSchema>>
  try {
    body = ContactSchema.partial().parse(await c.req.json())
  } catch (err) {
    return c.json({ code: 'validation_error', message: String(err) }, 400)
  }

  const [existing] = await db
    .select()
    .from(schema.contacts)
    .where(and(eq(schema.contacts.id, contactId), eq(schema.contacts.userId, userId)))
    .limit(1)

  if (!existing) {
    return c.json({ code: 'not_found', message: 'Contact not found' }, 404)
  }

  const [updated] = await db
    .update(schema.contacts)
    .set({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.role !== undefined && { role: body.role }),
      ...(body.title !== undefined && { title: body.title ?? null }),
      ...(body.email !== undefined && { email: body.email ?? null }),
      ...(body.linkedin_url !== undefined && { linkedinUrl: body.linkedin_url ?? null }),
      ...(body.company_id !== undefined && { companyId: body.company_id ?? null }),
    })
    .where(eq(schema.contacts.id, contactId))
    .returning()

  return c.json(updated)
})

// ── DELETE /contacts/:id ──────────────────────────────────────
app.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const contactId = c.req.param('id')

  const [existing] = await db
    .select()
    .from(schema.contacts)
    .where(and(eq(schema.contacts.id, contactId), eq(schema.contacts.userId, userId)))
    .limit(1)

  if (!existing) {
    return c.json({ code: 'not_found', message: 'Contact not found' }, 404)
  }

  await db.delete(schema.contacts).where(eq(schema.contacts.id, contactId))

  return c.json({ deleted: true })
})

export { app as contactsRoutes }
