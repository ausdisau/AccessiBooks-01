CREATE TABLE IF NOT EXISTS "account_link_audits" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"provider" varchar NOT NULL,
	"provider_sub" varchar NOT NULL,
	"email" varchar,
	"previous_auth_provider" varchar,
	"outcome" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "account_link_audits" ADD CONSTRAINT "account_link_audits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_account_link_audits_user" ON "account_link_audits" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_account_link_audits_created" ON "account_link_audits" ("created_at");
