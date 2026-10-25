import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// All money columns are whole rupees (integer). All timestamps are UTC;
// month / week grouping is done in Asia/Kolkata (see src/lib/dates.ts).

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/* ---------- Settings & access ---------- */

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: updatedAt(),
  updatedBy: text("updated_by"),
});

export const admins = pgTable("admins", {
  email: text("email").primaryKey(),
  addedBy: text("added_by"),
  createdAt: createdAt(),
});

/* ---------- Players ---------- */

export const players = pgTable(
  "players",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cricheroesPlayerId: bigint("cricheroes_player_id", { mode: "number" }).unique(),
    // Name and photo as CricHeroes reports them (refreshed every sync)
    chName: text("ch_name"),
    chPhotoUrl: text("ch_photo_url"),
    // Display values; admin edits win over CricHeroes
    name: text("name").notNull(),
    photoUrl: text("photo_url"),
    phone: text("phone"),
    battingStyle: text("batting_style"),
    bowlingStyle: text("bowling_style"),
    // true = Viking Warriors member (charged match fees); false = guest
    isMember: boolean("is_member").notNull().default(true),
    isActive: boolean("is_active").notNull().default(true),
    isCaptain: boolean("is_captain").notNull().default(false),
    nameLocked: boolean("name_locked").notNull().default(false),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("players_name_idx").on(t.name)],
);

/* ---------- Matches ---------- */

export const matches = pgTable(
  "matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cricheroesMatchId: bigint("cricheroes_match_id", { mode: "number" }).unique(),
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    // upcoming | live | past  (CricHeroes `status`)
    status: text("status").notNull(),
    // resulted | abandoned | '' (CricHeroes `match_result`)
    resultType: text("result_type").notNull().default(""),
    // won | lost | tied | abandoned | no_result | null (not finished)
    outcome: text("outcome"),
    resultText: text("result_text"),
    // individual | tournament (admin can override)
    kind: text("kind").notNull().default("individual"),
    tournamentName: text("tournament_name"),
    opponentName: text("opponent_name").notNull(),
    opponentLogo: text("opponent_logo"),
    ground: text("ground"),
    city: text("city"),
    overs: integer("overs"),
    ballType: text("ball_type"),
    ourScore: text("our_score"),
    opponentScore: text("opponent_score"),
    pomCricheroesPlayerId: bigint("pom_cricheroes_player_id", { mode: "number" }),
    scorecardSyncedAt: timestamp("scorecard_synced_at", { withTimezone: true }),
    // Finance
    chargeable: boolean("chargeable").notNull().default(false),
    feePerPlayer: integer("fee_per_player").notNull().default(50),
    // true once an admin edited chargeable / fee / kind: sync no longer overrides those
    financeLocked: boolean("finance_locked").notNull().default(false),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("matches_start_idx").on(t.startTime)],
);

export const matchPlayers = pgTable(
  "match_players",
  {
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    // false = admin marked "did not play" (kept so the sync does not re-add them)
    played: boolean("played").notNull().default(true),
    // cricheroes | admin
    source: text("source").notNull().default("cricheroes"),
    adminLocked: boolean("admin_locked").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.playerId] })],
);

export const playerMatchStats = pgTable(
  "player_match_stats",
  {
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    batted: boolean("batted").notNull().default(false),
    runs: integer("runs").notNull().default(0),
    ballsFaced: integer("balls_faced").notNull().default(0),
    fours: integer("fours").notNull().default(0),
    sixes: integer("sixes").notNull().default(0),
    isOut: boolean("is_out").notNull().default(false),
    dismissal: text("dismissal"),
    ballsBowled: integer("balls_bowled").notNull().default(0),
    maidens: integer("maidens").notNull().default(0),
    runsConceded: integer("runs_conceded").notNull().default(0),
    wickets: integer("wickets").notNull().default(0),
    dotBalls: integer("dot_balls").notNull().default(0),
    wides: integer("wides").notNull().default(0),
    noBalls: integer("no_balls").notNull().default(0),
    catches: integer("catches").notNull().default(0),
    stumpings: integer("stumpings").notNull().default(0),
    runOuts: integer("run_outs").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.playerId] })],
);

/* ---------- Finance: ledger ---------- */

// People who physically hold team money (e.g. Rahul, the accountant)
export const cashHolders = pgTable("cash_holders", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  isDefault: boolean("is_default").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
});

// A one-off collection: tournament share, monthly fee, special match split…
export const collections = pgTable("collections", {
  id: uuid("id").primaryKey().defaultRandom(),
  // tournament | monthly | special | other
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  dueOn: date("due_on", { mode: "string" }).notNull(),
  defaultAmount: integer("default_amount").notNull(),
  createdBy: text("created_by"),
  createdAt: createdAt(),
});

// Anything a player owes
export const charges = pgTable(
  "charges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "restrict" }),
    // match_fee | collection | adjustment
    kind: text("kind").notNull(),
    matchId: uuid("match_id").references(() => matches.id, { onDelete: "set null" }),
    collectionId: uuid("collection_id").references(() => collections.id, { onDelete: "cascade" }),
    // Date the charge belongs to (match date / due date) for month filters
    chargeDate: date("charge_date", { mode: "string" }).notNull(),
    description: text("description").notNull(),
    amount: integer("amount").notNull(),
    waived: boolean("waived").notNull().default(false),
    // set once an admin edits amount / waived: sync never changes it again
    adminLocked: boolean("admin_locked").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("charges_match_player_uq")
      .on(t.matchId, t.playerId)
      .where(sql`${t.kind} = 'match_fee'`),
    uniqueIndex("charges_collection_player_uq")
      .on(t.collectionId, t.playerId)
      .where(sql`${t.kind} = 'collection'`),
    index("charges_player_idx").on(t.playerId),
    index("charges_date_idx").on(t.chargeDate),
  ],
);

// Money received from a player
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "restrict" }),
    amount: integer("amount").notNull(),
    paidOn: date("paid_on", { mode: "string" }).notNull(),
    // cash | upi | bank | other
    mode: text("mode").notNull().default("upi"),
    holderId: uuid("holder_id").references(() => cashHolders.id, { onDelete: "set null" }),
    reference: text("reference"),
    note: text("note"),
    // quick = created by ticking "paid" on a charge; manual = recorded lump sum
    source: text("source").notNull().default("manual"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [index("payments_player_idx").on(t.playerId)],
);

// Which charges a payment settles
export const paymentAllocations = pgTable(
  "payment_allocations",
  {
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    chargeId: uuid("charge_id")
      .notNull()
      .references(() => charges.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
  },
  (t) => [primaryKey({ columns: [t.paymentId, t.chargeId] }), index("alloc_charge_idx").on(t.chargeId)],
);

export const expenses = pgTable("expenses", {
  id: uuid("id").primaryKey().defaultRandom(),
  spentOn: date("spent_on", { mode: "string" }).notNull(),
  // balls | ground | equipment | tournament_fee | food | jersey | other
  category: text("category").notNull(),
  description: text("description").notNull(),
  amount: integer("amount").notNull(),
  holderId: uuid("holder_id").references(() => cashHolders.id, { onDelete: "set null" }),
  paidBy: text("paid_by"),
  mode: text("mode").notNull().default("upi"),
  receiptUrl: text("receipt_url"),
  createdBy: text("created_by"),
  createdAt: createdAt(),
});

export const income = pgTable("income", {
  id: uuid("id").primaryKey().defaultRandom(),
  receivedOn: date("received_on", { mode: "string" }).notNull(),
  // sponsorship | ball_sale | prize_money | other
  category: text("category").notNull(),
  description: text("description").notNull(),
  amount: integer("amount").notNull(),
  holderId: uuid("holder_id").references(() => cashHolders.id, { onDelete: "set null" }),
  mode: text("mode").notNull().default("upi"),
  createdBy: text("created_by"),
  createdAt: createdAt(),
});

/* ---------- Operations ---------- */

export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_at_idx").on(t.at)],
);

export const syncRuns = pgTable("sync_runs", {
  id: serial("id").primaryKey(),
  // cricheroes | sheets
  kind: text("kind").notNull(),
  // cron | manual
  trigger: text("trigger").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  // queued | running | success | failed | skipped
  status: text("status").notNull().default("running"),
  summary: jsonb("summary"),
  error: text("error"),
});

// Queue for future WhatsApp / SMS reminders (phase 2). Rows are created, not yet sent.
export const notificationOutbox = pgTable("notification_outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  playerId: uuid("player_id").references(() => players.id, { onDelete: "cascade" }),
  channel: text("channel").notNull().default("whatsapp"),
  message: text("message").notNull(),
  // pending | sent | failed | cancelled
  status: text("status").notNull().default("pending"),
  error: text("error"),
  createdAt: createdAt(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
});

export type Player = typeof players.$inferSelect;
export type Match = typeof matches.$inferSelect;
export type Charge = typeof charges.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Collection = typeof collections.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type Income = typeof income.$inferSelect;
export type CashHolder = typeof cashHolders.$inferSelect;
