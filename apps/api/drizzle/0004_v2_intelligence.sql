-- V2 Intelligence Architecture: Living Career Graph + Conversation System
-- Apply with: drizzle-kit migrate  OR  psql -f 0004_v2_intelligence.sql

CREATE TYPE "graph_node_type" AS ENUM (
  'user', 'skill', 'experience', 'project', 'company', 'opportunity',
  'application', 'recruiter', 'interview', 'goal', 'interest', 'resume', 'vvp', 'message'
);

CREATE TYPE "conversation_channel" AS ENUM ('web', 'telegram', 'whatsapp');

CREATE TYPE "message_role" AS ENUM ('user', 'assistant', 'system');

-- ── Living Career Graph ────────────────────────────────────────

CREATE TABLE "graph_nodes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" "graph_node_type" NOT NULL,
  "entity_id" uuid,
  "label" text NOT NULL,
  "attributes" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX "graph_nodes_user_type" ON "graph_nodes"("user_id", "type");

CREATE TABLE "graph_edges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "from_node_id" uuid NOT NULL REFERENCES "graph_nodes"("id") ON DELETE CASCADE,
  "to_node_id" uuid NOT NULL REFERENCES "graph_nodes"("id") ON DELETE CASCADE,
  "relationship" text NOT NULL,
  "evidence" jsonb NOT NULL DEFAULT '[]',
  "confidence" numeric(4,3) NOT NULL DEFAULT 1.000,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX "graph_edges_user_from" ON "graph_edges"("user_id", "from_node_id");
CREATE INDEX "graph_edges_user_rel" ON "graph_edges"("user_id", "relationship");

CREATE TABLE "graph_inferences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "label" text NOT NULL,
  "confidence" numeric(4,3) NOT NULL,
  "evidence" jsonb NOT NULL DEFAULT '{}',
  "computed_at" timestamptz DEFAULT now() NOT NULL,
  "expires_at" timestamptz
);

CREATE INDEX "graph_inferences_user_type" ON "graph_inferences"("user_id", "type", "expires_at");

-- ── Conversation / Copilot ─────────────────────────────────────

CREATE TABLE "conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "channel" "conversation_channel" NOT NULL,
  "external_thread_id" text,
  "workspace_context" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

-- Partial unique index: only enforce uniqueness when external_thread_id is set
CREATE UNIQUE INDEX "conversations_user_channel_thread" ON "conversations"("user_id", "channel", "external_thread_id")
  WHERE "external_thread_id" IS NOT NULL;

CREATE INDEX "conversations_user_channel" ON "conversations"("user_id", "channel");

CREATE TABLE "conversation_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "role" "message_role" NOT NULL,
  "content" text NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX "conversation_messages_conv" ON "conversation_messages"("conversation_id", "created_at");
