import "server-only";
import { inArray, sql } from "drizzle-orm";
import { getDb, type Executor } from "@/db";
import { settings } from "@/db/schema";

/** Every admin-editable setting, with its default. Stored as JSON in `settings`. */
export const SETTING_DEFAULTS = {
  team_id: 2921535,
  team_name: "Viking Warriors",
  /** Default fee per player for individual / practice matches (₹) */
  match_fee: 50,
  /** Matches before this IST date are never charged */
  finance_start_date: "2026-10-01",
  /** Matches before this IST date are not imported from CricHeroes */
  sync_start_date: "2026-10-01",
  /** Google Sheet the app mirrors finance into (shared with the service account as Editor) */
  google_sheet_url: "https://docs.google.com/spreadsheets/d/1VyONcRxWboTVJHnOKFkkD-isSz4BkFvdyncW4aUB5Rk/edit?usp=sharing",
  /** Show each player's balance on the public site */
  public_show_balances: true,
  /** UPI ID shown on the public dues page (optional) */
  upi_id: "",
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;
export type Settings = { -readonly [K in SettingKey]: (typeof SETTING_DEFAULTS)[K] extends string ? string : (typeof SETTING_DEFAULTS)[K] extends number ? number : boolean };

export async function getSettings(db: Executor = getDb()): Promise<Settings> {
  const rows = await db.select().from(settings);
  const out = { ...SETTING_DEFAULTS } as Record<string, unknown>;
  for (const r of rows) if (r.key in SETTING_DEFAULTS) out[r.key] = r.value;
  return out as Settings;
}

export async function getSetting<K extends SettingKey>(key: K, db: Executor = getDb()): Promise<Settings[K]> {
  const rows = await db.select().from(settings).where(inArray(settings.key, [key]));
  return (rows[0]?.value ?? SETTING_DEFAULTS[key]) as Settings[K];
}

export async function saveSettings(values: Partial<Settings>, actor: string, db: Executor = getDb()) {
  for (const [key, value] of Object.entries(values)) {
    if (!(key in SETTING_DEFAULTS) || value === undefined) continue;
    await db
      .insert(settings)
      .values({ key, value: value as never, updatedBy: actor })
      .onConflictDoUpdate({ target: settings.key, set: { value: value as never, updatedBy: actor, updatedAt: sql`now()` } });
  }
}

/** Extracts the spreadsheet id from a Google Sheets URL (or returns the id itself). */
export function sheetIdFromUrl(urlOrId: string): string | null {
  const m = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(urlOrId);
  if (m) return m[1];
  return /^[a-zA-Z0-9-_]{20,}$/.test(urlOrId) ? urlOrId : null;
}
