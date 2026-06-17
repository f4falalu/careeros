CREATE TYPE "public"."target_status" AS ENUM('active', 'paused');--> statement-breakpoint
CREATE TYPE "public"."fit_tier" AS ENUM('on_target', 'unconfirmed', 'adjacent');--> statement-breakpoint
CREATE TABLE "job_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"role_titles" text[] DEFAULT '{}',
	"keywords" text[] DEFAULT '{}',
	"seniority" text[] DEFAULT '{}',
	"locations" text[] DEFAULT '{}',
	"work_models" "work_model"[] DEFAULT '{}',
	"min_salary" integer,
	"locks" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "target_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"fit_tier" "fit_tier" NOT NULL,
	"capability_score" numeric(4, 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_targets" ADD CONSTRAINT "job_targets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_targets" ADD CONSTRAINT "opportunity_targets_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_targets" ADD CONSTRAINT "opportunity_targets_target_id_job_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."job_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_targets_user" ON "job_targets" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "opportunity_targets_unique" ON "opportunity_targets" USING btree ("opportunity_id","target_id");--> statement-breakpoint
CREATE INDEX "opportunity_targets_target" ON "opportunity_targets" USING btree ("target_id");--> statement-breakpoint
INSERT INTO "job_targets" ("user_id", "label", "keywords", "locations", "min_salary", "locks", "status")
SELECT DISTINCT ON (s."user_id")
	s."user_id",
	'Imported search',
	COALESCE(ARRAY(SELECT jsonb_array_elements_text(s."filters"->'keywords')), '{}'),
	COALESCE(ARRAY(SELECT jsonb_array_elements_text(s."filters"->'regions')), '{}'),
	CASE WHEN s."filters" ? 'minSalary' THEN (s."filters"->>'minSalary')::integer ELSE NULL END,
	'{}'::jsonb,
	'active'
FROM "job_board_sources" s
WHERE s."filters" IS NOT NULL AND s."filters" <> '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "job_board_sources" DROP COLUMN "filters";