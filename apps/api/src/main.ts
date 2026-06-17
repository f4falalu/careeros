// CareerOS API — Phase 1. DB layer, REST routes, auth middleware, WebSocket hub.
import { createServer } from 'http'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import postgres from 'postgres'
import Redis from 'ioredis'
import { config, DEFAULT_LOCAL_MODEL } from './config.js'
import { complete, ollamaHealthy } from './router/modelRouter.js'
import { authMiddleware } from './middleware/auth.js'
import { createWsHub } from './ws/index.js'
import { profileRoutes } from './routes/profile.js'
import { achievementsRoutes } from './routes/achievements.js'
import { opportunitiesRoutes } from './routes/opportunities.js'
import { companiesRoutes } from './routes/companies.js'
import { applicationsRoutes } from './routes/applications.js'
import { assetsRoutes } from './routes/assets.js'
import { tasksRoutes } from './routes/tasks.js'
import { actionsRoutes } from './routes/actions.js'
import { intakeRoutes } from './routes/intake.js'
import { settingsRoutes } from './routes/settings.js'
import { vvpRoutes } from './routes/vvp.js'
import { outreachRoutes } from './routes/outreach.js'
import { contactsRoutes } from './routes/contacts.js'
import { startTelegramBot } from './channels/telegram.js'
import { startWhatsappBot } from './channels/whatsapp.js'
import { startAgentWorker } from './workers/agentWorker.js'
import { startDiscoveryWorker } from './workers/discoveryWorker.js'
import { jobBoardsRoutes } from './routes/jobBoards.js'
import { jobTargetsRoutes } from './routes/jobTargets.js'
import { interviewsRoutes } from './routes/interviews.js'
import { followupsRoutes } from './routes/followups.js'
import { strategistRoutes } from './routes/strategist.js'
import { autonomyRoutes } from './routes/autonomy.js'
import { authRoutes } from './routes/auth.js'
import { resumeImportRoutes } from './routes/resumeImport.js'
import { conversationRoutes } from './routes/conversations.js'
import { graphRoutes } from './routes/graph.js'
import { initQdrant } from './lib/qdrant.js'

const app = new Hono()

// ── CORS — dev defaults; override via CORS_ORIGINS (comma-separated) in prod ──
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://127.0.0.1:3000']

app.use('*', cors({
  origin: corsOrigins,
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}))

// ── Public routes ─────────────────────────────────────────────
app.get('/health', async (c) => {
  // DB
  let dbOk = false
  try {
    const sql = postgres(config.databaseUrl, { max: 1, connect_timeout: 3 })
    await sql`SELECT 1`
    await sql.end()
    dbOk = true
  } catch { /* dbOk stays false */ }

  // Redis
  let redisOk = false
  try {
    const redis = new Redis(config.redisUrl, {
      lazyConnect: true,
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
    })
    await redis.connect()
    await redis.ping()
    redis.disconnect()
    redisOk = true
  } catch { /* redisOk stays false */ }

  // Ollama
  const { ok: ollamaOk, models } = await ollamaHealthy()

  return c.json({
    status: dbOk && redisOk ? 'ok' : 'degraded',
    db: dbOk,
    redis: redisOk,
    ollama: ollamaOk,
    ollamaModels: models,
    defaultLocalModel: DEFAULT_LOCAL_MODEL,
    modelTier: config.modelTier,
    cloudFallbackEnabled: config.cloudFallbackEnabled,
    blockCloudPersonalData: config.blockCloudPersonalData,
  })
})

// Phase 0 proof: send a prompt through the router to the local model.
app.post('/dev/llm-roundtrip', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const prompt = (body as Record<string, string>).prompt ?? 'Reply with exactly: CareerOS is alive.'
  try {
    const result = await complete(prompt, { taskType: 'dev_ping', containsPersonalData: false })
    return c.json(result)
  } catch (err) {
    return c.json(
      { error: String(err), hint: 'Is Ollama up and the model pulled? See QUICKSTART.md' },
      500,
    )
  }
})

// ── Auth middleware — applied per-prefix ──────────────────────
app.use('/profile/*', authMiddleware)
app.use('/profile/resume-import/*', authMiddleware)
app.use('/achievements/*', authMiddleware)
app.use('/opportunities/*', authMiddleware)
app.use('/companies/*', authMiddleware)
app.use('/applications/*', authMiddleware)
app.use('/resumes/*', authMiddleware)
app.use('/tasks/*', authMiddleware)
app.use('/actions/*', authMiddleware)
app.use('/intake/*', authMiddleware)
app.use('/settings/*', authMiddleware)
app.use('/outreach/*', authMiddleware)
app.use('/vvps/*', authMiddleware)
app.use('/contacts/*', authMiddleware)
app.use('/job-boards/*', authMiddleware)
app.use('/job-targets/*', authMiddleware)
app.use('/interviews/*', authMiddleware)
app.use('/followups/*', authMiddleware)
app.use('/strategist/*', authMiddleware)
app.use('/conversations/*', authMiddleware)
app.use('/graph/*', authMiddleware)

// ── Mount route handlers ──────────────────────────────────────
app.route('/profile', profileRoutes)
app.route('/profile/resume-import', resumeImportRoutes)
app.route('/achievements', achievementsRoutes)
app.route('/opportunities', opportunitiesRoutes)
app.route('/companies', companiesRoutes)
app.route('/applications', applicationsRoutes)
// assets routes serve two mount points: /opportunities/:id/resume, /opportunities/:id/cover-letter, /resumes/:id
app.route('/', assetsRoutes)
app.route('/tasks', tasksRoutes)
app.route('/actions', actionsRoutes)
app.route('/intake', intakeRoutes)
app.route('/settings', settingsRoutes)

app.route('/outreach', outreachRoutes)
app.route('/contacts', contactsRoutes)
app.route('/job-boards', jobBoardsRoutes)
app.route('/job-targets', jobTargetsRoutes)
// VVP routes: /vvps/* and /opportunities/:id/vvp/* are co-mounted at root
app.route('/', vvpRoutes)
// Phase 3 routes: interviews at /, followups at /outreach (extension), strategist at /strategist
app.route('/', interviewsRoutes)
app.route('/', followupsRoutes)
app.route('/strategist', strategistRoutes)
// Phase 4 autonomy triggers: /opportunities/:id/apply, /contacts/:id/enrich, /job-boards/scrape
app.route('/', autonomyRoutes)
// Phase 5 (foundation) auth scaffold — public (register/login) + session-guarded (me/logout)
app.route('/auth', authRoutes)
// v2 intelligence routes
app.route('/', conversationRoutes)
app.route('/', graphRoutes)

// ── Create Node HTTP server + attach WebSocket hub ────────────
const port = 8000

const server = createServer((req, res) => {
  // Convert incoming Node request to a Fetch Request for Hono
  const url = `http://localhost:${port}${req.url ?? '/'}`
  const headers: Record<string, string> = {}
  for (const [key, val] of Object.entries(req.headers)) {
    if (val !== undefined) {
      headers[key] = Array.isArray(val) ? val.join(', ') : val
    }
  }

  const chunks: Buffer[] = []
  req.on('data', (chunk: Buffer) => chunks.push(chunk))
  req.on('end', () => {
    const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined
    const fetchReq = new Request(url, {
      method: req.method ?? 'GET',
      headers,
      body: body && body.length > 0 ? body : undefined,
    })

    app
      .fetch(fetchReq)
      .then(async (honoRes) => {
        const resHeaders: Record<string, string> = {}
        honoRes.headers.forEach((val, key) => {
          resHeaders[key] = val
        })
        res.writeHead(honoRes.status, resHeaders)
        const buf = await honoRes.arrayBuffer()
        res.end(Buffer.from(buf))
      })
      .catch((err) => {
        console.error('[server] Unhandled error:', err)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Internal server error' }))
      })
  })
})

// Attach WebSocket hub to the same HTTP server
createWsHub(server)

server.listen(port, () => {
  console.log(`CareerOS API on http://localhost:${port}`)
  console.log(`WebSocket available at ws://localhost:${port}/ws`)

  // Initialize Qdrant collections (soft-fail — API still starts if Qdrant is down)
  initQdrant().catch((err) => console.error('[qdrant] init failed (non-fatal):', err))

  // Start async workers (after server is bound so port is confirmed open)
  startAgentWorker()
  startDiscoveryWorker()
  startTelegramBot().catch((err) => console.error('[telegram] failed to start:', err))
  startWhatsappBot().catch((err) => console.error('[whatsapp] failed to start:', err))
})
