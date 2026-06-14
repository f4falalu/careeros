import { Hono } from 'hono'
import { graphService, memoryService } from '../services/index.js'

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

export { app as graphRoutes }
