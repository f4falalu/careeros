// Model Router (Phase 0) — see docs/09-AGENTS.md §13 and docs/10-SETTINGS.md §5.
//
// Every agent calls route()/complete(); no agent talks to a model directly. Uses the
// OpenAI-compatible provider so ONE pattern covers Ollama (local) + Groq/OpenRouter (free cloud).
// Precedence: privacy block > master fallback switch > tier default. (Cost caps/per-task overrides
// wire in Phase 1 against app_settings.)

import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { generateText, generateObject } from 'ai'
import { z } from 'zod'
import { config, DEFAULT_LOCAL_MODEL } from '../config.js'

export type ModelKind = "local" | "cloud";
export interface RouteDecision {
  modelKind: ModelKind;
  modelName: string;
  reason: string;
}

export function decideRoute(
  taskType: string,
  containsPersonalData: boolean,
  allowCloud = false,
): RouteDecision {
  // 1. Privacy hard override — personal data never leaves the machine.
  if (containsPersonalData && config.blockCloudPersonalData) {
    return { modelKind: "local", modelName: DEFAULT_LOCAL_MODEL, reason: "privacy: personal data forced local" };
  }
  // 2. Master fallback switch + per-call opt-in.
  if (config.cloudFallbackEnabled && allowCloud) {
    return { modelKind: "cloud", modelName: cloudModel(), reason: `cloud fallback for ${taskType}` };
  }
  // 3. Default: local.
  return { modelKind: "local", modelName: DEFAULT_LOCAL_MODEL, reason: "tier default (local)" };
}

function cloudModel(): string {
  // Free providers first; open models, fine for public-data tasks (e.g. research).
  switch (config.cloudProvider) {
    case "groq": return "llama-3.3-70b-versatile";
    case "openrouter": return "meta-llama/llama-3.1-70b-instruct:free";
    default: return "llama-3.3-70b-versatile";
  }
}

// Build an OpenAI-compatible model handle for a given route.
function modelHandle(route: RouteDecision) {
  if (route.modelKind === "local") {
    const ollama = createOpenAICompatible({
      name: "ollama",
      baseURL: `${config.ollamaBaseUrl}/v1`,   // Ollama's OpenAI-compatible endpoint
      apiKey: "ollama",                          // ignored by Ollama, required by the client
    });
    return ollama(route.modelName);
  }
  // Cloud (Groq shown; all are OpenAI-compatible).
  const groq = createOpenAICompatible({
    name: "groq",
    baseURL: "https://api.groq.com/openai/v1",
    apiKey: config.groqApiKey,
  });
  return groq(route.modelName);
}

export async function complete(
  prompt: string,
  opts: { taskType?: string; containsPersonalData?: boolean; allowCloud?: boolean } = {},
) {
  const route = decideRoute(opts.taskType ?? "generic", opts.containsPersonalData ?? false, opts.allowCloud ?? false);
  const { text } = await generateText({ model: modelHandle(route), prompt });
  return { text, modelKind: route.modelKind, modelName: route.modelName, reason: route.reason };
}

// Structured generation with Zod schema validation.
// Uses generateObject from the AI SDK so the model returns a well-typed object directly.
export async function generateStructured<T>(
  prompt: string,
  schema: z.ZodType<T>,
  opts: {
    taskType?: string
    containsPersonalData?: boolean
    allowCloud?: boolean
  } = {},
): Promise<{ data: T; modelKind: ModelKind; modelName: string; reason: string }> {
  const route = decideRoute(
    opts.taskType ?? "generic",
    opts.containsPersonalData ?? false,
    opts.allowCloud ?? false,
  );
  const { object } = await generateObject({ model: modelHandle(route), prompt, schema });
  return {
    data: object,
    modelKind: route.modelKind,
    modelName: route.modelName,
    reason: route.reason,
  };
}

// Used by /health: is Ollama up and which models are pulled?
export async function ollamaHealthy(): Promise<{ ok: boolean; models: string[] }> {
  try {
    const res = await fetch(`${config.ollamaBaseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { ok: false, models: [] };
    const data = (await res.json()) as { models?: { name: string }[] };
    return { ok: true, models: (data.models ?? []).map((m) => m.name) };
  } catch {
    return { ok: false, models: [] };
  }
}
