CREATE TABLE "rate_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date,
	"payload" jsonb NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "rate_versions_one_open_per_kind" ON "rate_versions" ("kind") WHERE "valid_to" IS NULL;
