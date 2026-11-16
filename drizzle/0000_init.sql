CREATE TYPE "public"."client_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."connection_scope" AS ENUM('agency', 'client');--> statement-breakpoint
CREATE TYPE "public"."device" AS ENUM('desktop', 'mobile');--> statement-breakpoint
CREATE TYPE "public"."integration_type" AS ENUM('gsc', 'ga4', 'gbp');--> statement-breakpoint
CREATE TYPE "public"."link_status" AS ENUM('live', 'pending', 'lost');--> statement-breakpoint
CREATE TYPE "public"."rank_frequency" AS ENUM('daily', 'weekly', 'monthly', 'manual');--> statement-breakpoint
CREATE TYPE "public"."rank_task_kind" AS ENUM('organic', 'maps');--> statement-breakpoint
CREATE TYPE "public"."rank_task_status" AS ENUM('posted', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."report_frequency" AS ENUM('weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."token_type" AS ENUM('invite', 'reset');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'staff', 'client');--> statement-breakpoint
CREATE TABLE "api_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"cache_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"type" "integration_type" NOT NULL,
	"connection_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"external_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_users" (
	"client_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_users_client_id_user_id_pk" PRIMARY KEY("client_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"domain" text NOT NULL,
	"website_url" text NOT NULL,
	"business_name" text,
	"timezone" text DEFAULT 'Europe/London' NOT NULL,
	"country_code" text DEFAULT 'GB' NOT NULL,
	"status" "client_status" DEFAULT 'active' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"rank_frequency" "rank_frequency" DEFAULT 'daily' NOT NULL,
	"rank_depth" integer DEFAULT 100 NOT NULL,
	"rank_weekday" integer DEFAULT 1 NOT NULL,
	"default_location_code" integer DEFAULT 2826 NOT NULL,
	"default_location_name" text DEFAULT 'United Kingdom' NOT NULL,
	"default_language_code" text DEFAULT 'en' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitor_ranks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"keyword_id" uuid NOT NULL,
	"competitor_id" uuid NOT NULL,
	"checked_on" date NOT NULL,
	"position" integer,
	"url" text,
	"local_pack_position" integer
);
--> statement-breakpoint
CREATE TABLE "competitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" "connection_scope" NOT NULL,
	"client_id" uuid,
	"google_email" text NOT NULL,
	"google_sub" text NOT NULL,
	"refresh_token_enc" text NOT NULL,
	"access_token_enc" text,
	"access_token_expires_at" timestamp with time zone,
	"granted_scopes" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_error" text,
	"connected_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "keywords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"keyword" text NOT NULL,
	"location_code" integer NOT NULL,
	"location_name" text NOT NULL,
	"language_code" text DEFAULT 'en' NOT NULL,
	"device" "device" DEFAULT 'desktop' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"track_maps" boolean DEFAULT false NOT NULL,
	"search_volume" integer,
	"cpc" numeric(10, 2),
	"volume_updated_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"source_url" text NOT NULL,
	"source_domain" text NOT NULL,
	"target_url" text NOT NULL,
	"anchor_text" text DEFAULT '' NOT NULL,
	"link_type" text DEFAULT 'guest_post' NOT NULL,
	"rel" text DEFAULT 'dofollow' NOT NULL,
	"domain_rating" integer,
	"status" "link_status" DEFAULT 'live' NOT NULL,
	"built_on" date NOT NULL,
	"client_note" text DEFAULT '' NOT NULL,
	"cost" numeric(10, 2),
	"internal_note" text DEFAULT '' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"code" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"country_iso" text NOT NULL,
	"parent_code" integer
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rank_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"keyword_id" uuid NOT NULL,
	"checked_on" date NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"position" integer,
	"absolute_position" integer,
	"url" text,
	"local_pack_position" integer,
	"maps_position" integer,
	"serp_features" text[] DEFAULT '{}'::text[] NOT NULL,
	"results_count" bigint,
	"source" text DEFAULT 'dataforseo' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rank_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"keyword_id" uuid NOT NULL,
	"kind" "rank_task_kind" NOT NULL,
	"for_date" date NOT NULL,
	"provider_task_id" text,
	"status" "rank_task_status" DEFAULT 'posted' NOT NULL,
	"error" text,
	"cost" numeric(10, 5),
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "rank_tasks_provider_task_id_unique" UNIQUE("provider_task_id")
);
--> statement-breakpoint
CREATE TABLE "report_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"schedule_id" uuid,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" text NOT NULL,
	"recipients" text[] DEFAULT '{}'::text[] NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"frequency" "report_frequency" DEFAULT 'monthly' NOT NULL,
	"day_of_week" integer DEFAULT 1 NOT NULL,
	"day_of_month" integer DEFAULT 1 NOT NULL,
	"recipients" text[] DEFAULT '{}'::text[] NOT NULL,
	"sections" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"next_run_on" date NOT NULL,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "token_type" NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text,
	"role" "user_role" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "api_cache" ADD CONSTRAINT "api_cache_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_integrations" ADD CONSTRAINT "client_integrations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_integrations" ADD CONSTRAINT "client_integrations_connection_id_google_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."google_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_users" ADD CONSTRAINT "client_users_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_users" ADD CONSTRAINT "client_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_ranks" ADD CONSTRAINT "competitor_ranks_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_ranks" ADD CONSTRAINT "competitor_ranks_keyword_id_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."keywords"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_ranks" ADD CONSTRAINT "competitor_ranks_competitor_id_competitors_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_connections" ADD CONSTRAINT "google_connections_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_connections" ADD CONSTRAINT "google_connections_connected_by_user_id_users_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keywords" ADD CONSTRAINT "keywords_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_results" ADD CONSTRAINT "rank_results_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_results" ADD CONSTRAINT "rank_results_keyword_id_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."keywords"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_tasks" ADD CONSTRAINT "rank_tasks_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_tasks" ADD CONSTRAINT "rank_tasks_keyword_id_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."keywords"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_runs" ADD CONSTRAINT "report_runs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_runs" ADD CONSTRAINT "report_runs_schedule_id_report_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."report_schedules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tokens" ADD CONSTRAINT "user_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_cache_unique" ON "api_cache" USING btree ("client_id","cache_key");--> statement-breakpoint
CREATE UNIQUE INDEX "client_integrations_unique" ON "client_integrations" USING btree ("client_id","type");--> statement-breakpoint
CREATE INDEX "client_users_user_idx" ON "client_users" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "competitor_ranks_unique" ON "competitor_ranks" USING btree ("keyword_id","competitor_id","checked_on");--> statement-breakpoint
CREATE INDEX "competitor_ranks_client_date_idx" ON "competitor_ranks" USING btree ("client_id","checked_on");--> statement-breakpoint
CREATE UNIQUE INDEX "competitors_unique" ON "competitors" USING btree ("client_id","domain");--> statement-breakpoint
CREATE INDEX "google_connections_client_idx" ON "google_connections" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "keywords_unique" ON "keywords" USING btree ("client_id","keyword","location_code","language_code","device");--> statement-breakpoint
CREATE INDEX "keywords_client_idx" ON "keywords" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "links_client_date_idx" ON "links" USING btree ("client_id","built_on");--> statement-breakpoint
CREATE INDEX "locations_country_idx" ON "locations" USING btree ("country_iso");--> statement-breakpoint
CREATE INDEX "login_attempts_key_idx" ON "login_attempts" USING btree ("key","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rank_results_unique" ON "rank_results" USING btree ("keyword_id","checked_on");--> statement-breakpoint
CREATE INDEX "rank_results_client_date_idx" ON "rank_results" USING btree ("client_id","checked_on");--> statement-breakpoint
CREATE INDEX "rank_tasks_status_idx" ON "rank_tasks" USING btree ("status","posted_at");--> statement-breakpoint
CREATE INDEX "rank_tasks_keyword_date_idx" ON "rank_tasks" USING btree ("keyword_id","for_date","kind");--> statement-breakpoint
CREATE INDEX "report_runs_client_idx" ON "report_runs" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX "report_schedules_due_idx" ON "report_schedules" USING btree ("is_active","next_run_on");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");