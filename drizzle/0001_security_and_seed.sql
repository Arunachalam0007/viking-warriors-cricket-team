-- Supabase exposes every table in `public` through its REST API with the anon key.
-- The app talks to Postgres directly from the server, so no browser access is needed:
-- enable row level security with no policies, which denies anon/authenticated roles.
ALTER TABLE "settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "admins" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "players" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "matches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "match_players" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "player_match_stats" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cash_holders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "collections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "charges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_allocations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "expenses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "income" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sync_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notification_outbox" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Seed data
INSERT INTO "admins" ("email", "added_by") VALUES ('arunsha0007@gmail.com', 'seed') ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "cash_holders" ("name", "is_default") VALUES ('Rahul', true) ON CONFLICT DO NOTHING;
