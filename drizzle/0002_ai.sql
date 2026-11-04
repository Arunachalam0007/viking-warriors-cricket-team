CREATE TABLE "ai_content" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"subject_id" text NOT NULL,
	"lang" text NOT NULL,
	"title" text,
	"body" text NOT NULL,
	"facts_hash" text NOT NULL,
	"provider" text,
	"model" text,
	"edited" boolean DEFAULT false NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"feature" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"ok" boolean NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"error" text,
	"client" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_content_subject_uq" ON "ai_content" USING btree ("kind","subject_id","lang");--> statement-breakpoint
CREATE INDEX "ai_usage_at_idx" ON "ai_usage" USING btree ("at");--> statement-breakpoint
-- Server-only tables, like every other table (see 0001)
ALTER TABLE "ai_content" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_usage" ENABLE ROW LEVEL SECURITY;
