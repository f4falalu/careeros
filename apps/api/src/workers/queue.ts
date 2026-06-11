import { Queue } from 'bullmq'
import { config } from '../config.js'

export const QUEUE_NAME = 'careeros-agents'

export const agentQueue = new Queue(QUEUE_NAME, {
  connection: { url: config.redisUrl },
})

export async function enqueueAgent(
  jobName: string,
  data: Record<string, unknown>,
  opts?: { priority?: number },
) {
  return agentQueue.add(jobName, data, {
    // Self-heal transient failures (model/network blips) before giving up.
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 200,
    ...opts,
  })
}
