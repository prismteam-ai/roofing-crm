CREATE TYPE "public"."activity_type" AS ENUM('created', 'note', 'status_change');--> statement-breakpoint
CREATE TYPE "public"."lead_priority" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new', 'contacted', 'qualified', 'quoted', 'won', 'lost');--> statement-breakpoint
CREATE TABLE "knowledge_chunks" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"title" text NOT NULL,
	"section" text NOT NULL,
	"body" text NOT NULL,
	"tsv" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce("knowledge_chunks"."title", '') || ' ' || coalesce("knowledge_chunks"."section", '')), 'A') || setweight(to_tsvector('english', coalesce("knowledge_chunks"."body", '')), 'B')) STORED,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_activities" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "lead_activities_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"lead_id" integer NOT NULL,
	"type" "activity_type" NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_permits" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "lead_permits_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"lead_id" integer NOT NULL,
	"permit_number" text NOT NULL,
	"status" text,
	"is_open" boolean DEFAULT false NOT NULL,
	"days_open" integer,
	"issue_date" text,
	"close_date" text,
	"improvement_type" text,
	"contractor_name" text,
	"contractor_qualifier" text,
	"contractor_phone" text,
	"contractor_license" text,
	"bbb_rating" text,
	"bbb_accredited" boolean,
	"bbb_profile_url" text,
	"source_url" text
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "leads_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"parcel_id" text NOT NULL,
	"address" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"priority" "lead_priority" DEFAULT 'medium' NOT NULL,
	"signal" text DEFAULT 'none' NOT NULL,
	"property_type" text,
	"built_year" integer,
	"roof_age_years" integer,
	"roof_age_basis" text,
	"open_roof_permit_count" integer DEFAULT 0 NOT NULL,
	"oldest_open_roof_permit_days" integer,
	"owner_name" text,
	"owner_mail_state" text,
	"owner_out_of_state" boolean,
	"market_value" double precision,
	"last_sale_date" text,
	"notes" text,
	"source_urls" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_permits" ADD CONSTRAINT "lead_permits_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_chunks_tsv_idx" ON "knowledge_chunks" USING gin ("tsv");--> statement-breakpoint
CREATE INDEX "lead_activities_lead_idx" ON "lead_activities" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "lead_permits_lead_idx" ON "lead_permits" USING btree ("lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_parcel_id_uq" ON "leads" USING btree ("parcel_id");--> statement-breakpoint
CREATE INDEX "leads_status_idx" ON "leads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "leads_roof_age_idx" ON "leads" USING btree ("roof_age_years");