CREATE TABLE "admins" (
	"email" text PRIMARY KEY NOT NULL,
	"added_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_holders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_holders_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"match_id" uuid,
	"collection_id" uuid,
	"charge_date" date NOT NULL,
	"description" text NOT NULL,
	"amount" integer NOT NULL,
	"waived" boolean DEFAULT false NOT NULL,
	"admin_locked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"due_on" date NOT NULL,
	"default_amount" integer NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"spent_on" date NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"amount" integer NOT NULL,
	"holder_id" uuid,
	"paid_by" text,
	"mode" text DEFAULT 'upi' NOT NULL,
	"receipt_url" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "income" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"received_on" date NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"amount" integer NOT NULL,
	"holder_id" uuid,
	"mode" text DEFAULT 'upi' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_players" (
	"match_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"played" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'cricheroes' NOT NULL,
	"admin_locked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_players_match_id_player_id_pk" PRIMARY KEY("match_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cricheroes_match_id" bigint,
	"start_time" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"result_type" text DEFAULT '' NOT NULL,
	"outcome" text,
	"result_text" text,
	"kind" text DEFAULT 'individual' NOT NULL,
	"tournament_name" text,
	"opponent_name" text NOT NULL,
	"opponent_logo" text,
	"ground" text,
	"city" text,
	"overs" integer,
	"ball_type" text,
	"our_score" text,
	"opponent_score" text,
	"pom_cricheroes_player_id" bigint,
	"scorecard_synced_at" timestamp with time zone,
	"chargeable" boolean DEFAULT false NOT NULL,
	"fee_per_player" integer DEFAULT 50 NOT NULL,
	"finance_locked" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "matches_cricheroes_match_id_unique" UNIQUE("cricheroes_match_id")
);
--> statement-breakpoint
CREATE TABLE "notification_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid,
	"channel" text DEFAULT 'whatsapp' NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"payment_id" uuid NOT NULL,
	"charge_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	CONSTRAINT "payment_allocations_payment_id_charge_id_pk" PRIMARY KEY("payment_id","charge_id")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"paid_on" date NOT NULL,
	"mode" text DEFAULT 'upi' NOT NULL,
	"holder_id" uuid,
	"reference" text,
	"note" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_match_stats" (
	"match_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"batted" boolean DEFAULT false NOT NULL,
	"runs" integer DEFAULT 0 NOT NULL,
	"balls_faced" integer DEFAULT 0 NOT NULL,
	"fours" integer DEFAULT 0 NOT NULL,
	"sixes" integer DEFAULT 0 NOT NULL,
	"is_out" boolean DEFAULT false NOT NULL,
	"dismissal" text,
	"balls_bowled" integer DEFAULT 0 NOT NULL,
	"maidens" integer DEFAULT 0 NOT NULL,
	"runs_conceded" integer DEFAULT 0 NOT NULL,
	"wickets" integer DEFAULT 0 NOT NULL,
	"dot_balls" integer DEFAULT 0 NOT NULL,
	"wides" integer DEFAULT 0 NOT NULL,
	"no_balls" integer DEFAULT 0 NOT NULL,
	"catches" integer DEFAULT 0 NOT NULL,
	"stumpings" integer DEFAULT 0 NOT NULL,
	"run_outs" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "player_match_stats_match_id_player_id_pk" PRIMARY KEY("match_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cricheroes_player_id" bigint,
	"ch_name" text,
	"ch_photo_url" text,
	"name" text NOT NULL,
	"photo_url" text,
	"phone" text,
	"batting_style" text,
	"bowling_style" text,
	"is_member" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_captain" boolean DEFAULT false NOT NULL,
	"name_locked" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_cricheroes_player_id_unique" UNIQUE("cricheroes_player_id")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"trigger" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"summary" jsonb,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_holder_id_cash_holders_id_fk" FOREIGN KEY ("holder_id") REFERENCES "public"."cash_holders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income" ADD CONSTRAINT "income_holder_id_cash_holders_id_fk" FOREIGN KEY ("holder_id") REFERENCES "public"."cash_holders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_charge_id_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."charges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_holder_id_cash_holders_id_fk" FOREIGN KEY ("holder_id") REFERENCES "public"."cash_holders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_match_stats" ADD CONSTRAINT "player_match_stats_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_match_stats" ADD CONSTRAINT "player_match_stats_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE UNIQUE INDEX "charges_match_player_uq" ON "charges" USING btree ("match_id","player_id") WHERE "charges"."kind" = 'match_fee';--> statement-breakpoint
CREATE UNIQUE INDEX "charges_collection_player_uq" ON "charges" USING btree ("collection_id","player_id") WHERE "charges"."kind" = 'collection';--> statement-breakpoint
CREATE INDEX "charges_player_idx" ON "charges" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "charges_date_idx" ON "charges" USING btree ("charge_date");--> statement-breakpoint
CREATE INDEX "matches_start_idx" ON "matches" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX "alloc_charge_idx" ON "payment_allocations" USING btree ("charge_id");--> statement-breakpoint
CREATE INDEX "payments_player_idx" ON "payments" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "players_name_idx" ON "players" USING btree ("name");