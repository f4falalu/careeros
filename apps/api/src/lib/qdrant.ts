import { QdrantClient } from '@qdrant/js-client-rest'

export const QDRANT_COLLECTIONS = [
  'career_conversations',
  'agent_observations',
  'graph_evidence',
  'career_intelligence',
  'opportunity_context',
  'interview_intelligence',
  'outreach_intelligence',
  'vvp_context',
] as const

export type QdrantCollection = (typeof QDRANT_COLLECTIONS)[number]

let _client: QdrantClient | null = null
let _available = false

function getClient(): QdrantClient {
  if (!_client) {
    _client = new QdrantClient({
      url: process.env.QDRANT_URL ?? 'http://localhost:6333',
      ...(process.env.QDRANT_API_KEY ? { apiKey: process.env.QDRANT_API_KEY } : {}),
    })
  }
  return _client
}

export async function initQdrant(): Promise<void> {
  const client = getClient()
  try {
    for (const name of QDRANT_COLLECTIONS) {
      let exists = false
      try {
        await client.getCollection(name)
        exists = true
      } catch {
        exists = false
      }
      if (!exists) {
        await client.createCollection(name, {
          vectors: { size: 768, distance: 'Cosine' },
        })
      }
    }
    _available = true
    console.log(`[qdrant] initialized ${QDRANT_COLLECTIONS.length} collections`)
  } catch (err) {
    console.warn('[qdrant] unreachable at startup — semantic memory degraded:', String(err))
  }
}

export function isQdrantAvailable(): boolean {
  return _available
}

export interface QdrantPointPayload {
  userId: string
  entityType: string
  entityId: string | null
  content: string
  channel: string | null
  agentName: string | null
  createdAt: string
  [key: string]: unknown
}

export async function qdrantUpsert(
  collection: QdrantCollection,
  id: string,
  vector: number[],
  payload: QdrantPointPayload,
): Promise<void> {
  try {
    const client = getClient()
    await client.upsert(collection, {
      points: [{ id, vector, payload }],
    })
  } catch (err) {
    console.error(`[qdrant] upsert error in ${collection}:`, String(err))
  }
}

export async function qdrantSearch(
  collection: QdrantCollection,
  vector: number[],
  filter?: { userId: string; entityType?: string },
  limit = 10,
): Promise<Array<{ id: string; score: number; payload: QdrantPointPayload }>> {
  try {
    const client = getClient()
    const must: Array<{ key: string; match: { value: string } }> = []
    if (filter?.userId) must.push({ key: 'userId', match: { value: filter.userId } })
    if (filter?.entityType) must.push({ key: 'entityType', match: { value: filter.entityType } })

    const results = await client.search(collection, {
      vector,
      limit,
      filter: must.length > 0 ? { must } : undefined,
      with_payload: true,
    })
    return results.map((r) => ({
      id: String(r.id),
      score: r.score,
      payload: r.payload as QdrantPointPayload,
    }))
  } catch (err) {
    console.error(`[qdrant] search error in ${collection}:`, String(err))
    return []
  }
}
