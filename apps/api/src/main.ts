// CareerOS API — Phase 0. Proves the stack: DB, Redis, Ollama, and a local round-trip via the router.
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import postgres from "postgres";
import Redis from "ioredis";
import { config, DEFAULT_LOCAL_MODEL } from "./config";
import { complete, ollamaHealthy } from "./router/modelRouter";

const app = new Hono();

app.get("/health", async (c) => {
  // DB
  let dbOk = false;
  try {
    const sql = postgres(config.databaseUrl, { max: 1, connect_timeout: 3 });
    await sql`SELECT 1`;
    await sql.end();
    dbOk = true;
  } catch { /* dbOk stays false */ }

  // Redis
  let redisOk = false;
  try {
    const redis = new Redis(config.redisUrl, { lazyConnect: true, connectTimeout: 3000, maxRetriesPerRequest: 1 });
    await redis.connect();
    await redis.ping();
    redis.disconnect();
    redisOk = true;
  } catch { /* redisOk stays false */ }

  // Ollama
  const { ok: ollamaOk, models } = await ollamaHealthy();

  return c.json({
    status: dbOk && redisOk ? "ok" : "degraded",
    db: dbOk,
    redis: redisOk,
    ollama: ollamaOk,
    ollamaModels: models,
    defaultLocalModel: DEFAULT_LOCAL_MODEL,
    modelTier: config.modelTier,
    cloudFallbackEnabled: config.cloudFallbackEnabled,
    blockCloudPersonalData: config.blockCloudPersonalData,
  });
});

// Phase 0 proof: send a prompt through the router to the local model.
app.post("/dev/llm-roundtrip", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const prompt = body.prompt ?? "Reply with exactly: CareerOS is alive.";
  try {
    const result = await complete(prompt, { taskType: "dev_ping", containsPersonalData: false });
    return c.json(result);
  } catch (err) {
    return c.json({ error: String(err), hint: "Is Ollama up and the model pulled? See QUICKSTART.md" }, 500);
  }
});

const port = 8000;
serve({ fetch: app.fetch, port });
console.log(`CareerOS API on http://localhost:${port}`);
