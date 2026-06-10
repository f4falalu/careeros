// Boot config from env (see docs/03-RESOURCES.md). Runtime settings live in the DB (docs/10-SETTINGS.md).
import { config as dotenvConfig } from 'dotenv'
dotenvConfig()

export const config = {
  appEnv: process.env.APP_ENV ?? "dev",
  appSecret: process.env.APP_SECRET ?? "change-me",

  databaseUrl: process.env.DATABASE_URL ?? "postgresql://careeros:careeros@postgres:5432/careeros",
  redisUrl: process.env.REDIS_URL ?? "redis://redis:6379/0",

  // Ollama exposes an OpenAI-compatible endpoint at /v1 — we use ONE provider pattern for
  // local + every free-cloud fallback (Groq/OpenAI/OpenRouter are all OpenAI-compatible).
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://ollama:11434",
  modelTier: (process.env.MODEL_TIER ?? "B") as "A" | "B" | "C" | "VPS",

  cloudFallbackEnabled: (process.env.CLOUD_FALLBACK_ENABLED ?? "false") === "true",
  cloudProvider: (process.env.CLOUD_PROVIDER ?? "groq") as "groq" | "gemini" | "openrouter" | "anthropic" | "openai",

  groqApiKey: process.env.GROQ_API_KEY ?? "",
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  openrouterApiKey: process.env.OPENROUTER_API_KEY ?? "",

  // Privacy: when true, anything touching personal data is forced local regardless of fallback.
  blockCloudPersonalData: (process.env.BLOCK_CLOUD_PERSONAL_DATA ?? "true") === "true",
};

// Default local model per tier — see docs/03-RESOURCES.md. Changeable via settings later.
const LOCAL_MODEL_BY_TIER: Record<string, string> = {
  A: "qwen2.5:14b",
  B: "llama3.2:3b",
  C: "llama3.2:3b",
  VPS: "llama3.2:3b",
};
export const DEFAULT_LOCAL_MODEL = LOCAL_MODEL_BY_TIER[config.modelTier] ?? "llama3.2:3b";
