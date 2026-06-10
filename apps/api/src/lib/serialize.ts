import type { schema } from '../db/index.js'

type AgentTaskRow = typeof schema.agentTasks.$inferSelect

/**
 * Maps an agent_tasks row to the snake_case shape the web client expects
 * (see apps/web/src/types.ts → AgentTask). The API otherwise returns raw
 * camelCase rows; the task feed reads snake_case, so emit it consistently
 * from every place that sends a task (REST routes + the WS broadcast).
 */
export function serializeAgentTask(t: AgentTaskRow) {
  return {
    id: t.id,
    agent_name: t.agentName,
    status: t.status,
    source_channel: t.sourceChannel,
    related_type: t.relatedType,
    related_id: t.relatedId,
    output: t.output,
    tools_used: t.toolsUsed ?? [],
    model_kind: t.modelKind,
    model_name: t.modelName,
    cost_usd: Number(t.costUsd ?? 0),
    error: t.error,
    created_at: t.createdAt,
    finished_at: t.finishedAt,
  }
}
