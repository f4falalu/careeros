import { Hono } from 'hono'
import { graphService, memoryService } from '../services/index.js'
import type { GraphEnrichment } from '../services/graph.js'

const app = new Hono()

// GET /graph/evidence?concept=<string>
app.get('/graph/evidence', async (c) => {
  const userId = c.get('userId')
  const concept = c.req.query('concept') ?? ''
  if (!concept) return c.json({ error: 'concept query param is required' }, 400)
  const evidence = await memoryService.findEvidence(userId, concept)
  return c.json(evidence)
})

// GET /graph/patterns
app.get('/graph/patterns', async (c) => {
  const userId = c.get('userId')
  const patterns = await graphService.findCareerPatterns(userId)
  return c.json(patterns)
})

// GET /graph/skills/:name/relationships
app.get('/graph/skills/:name/relationships', async (c) => {
  const userId = c.get('userId')
  const name = c.req.param('name')
  const relationships = await graphService.findSkillRelationships(userId, name)
  return c.json(relationships)
})

// GET /graph/gaps?opportunityId=<id>
app.get('/graph/gaps', async (c) => {
  const userId = c.get('userId')
  const opportunityId = c.req.query('opportunityId') ?? ''
  if (!opportunityId) return c.json({ error: 'opportunityId query param is required' }, 400)
  const gaps = await graphService.findMissingCapabilities(userId, opportunityId)
  return c.json(gaps)
})

// GET /graph/inferences — returns non-expired inferences grouped by type
app.get('/graph/inferences', async (c) => {
  const userId = c.get('userId')
  const grouped = await graphService.getInferences(userId)
  return c.json(grouped)
})

// POST /graph/infer — trigger all inferences for user, return grouped results
app.post('/graph/infer', async (c) => {
  const userId = c.get('userId')
  await graphService.inferStrengths(userId)
  await graphService.inferWeaknesses(userId)
  await graphService.inferInterests(userId)
  await graphService.inferCareerThemes(userId)
  const grouped = await graphService.getInferences(userId)
  return c.json(grouped)
})

// GET /graph/subgraph?root=<nodeId>&depth=<1-3>
app.get('/graph/subgraph', async (c) => {
  const userId = c.get('userId')
  const root = c.req.query('root') ?? null
  const rawDepth = parseInt(c.req.query('depth') ?? '1', 10)
  const depth = Math.min(Math.max(rawDepth, 1), 3)
  const result = await graphService.getSubgraph(userId, root, depth)
  return c.json(result)
})

// GET /graph/node/:id
app.get('/graph/node/:id', async (c) => {
  const userId = c.get('userId')
  const nodeId = c.req.param('id')
  const detail = await graphService.getNodeDetail(userId, nodeId)
  if (!detail) return c.json({ error: 'Node not found' }, 404)
  return c.json(detail)
})

// GET /graph/paths?from=<nodeId>&to=<nodeId>
app.get('/graph/paths', async (c) => {
  const userId = c.get('userId')
  const from = c.req.query('from') ?? ''
  const to = c.req.query('to') ?? ''
  if (!from || !to) return c.json({ error: 'from and to query params are required' }, 400)
  const path = await graphService.findPath(userId, from, to)
  return c.json({ path })
})

// POST /graph/enrich — upsert nodes and edges into the user's graph
app.post('/graph/enrich', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json() as GraphEnrichment
  await graphService.enrich(userId, body)
  return c.json({ ok: true })
})

export { app as graphRoutes }
