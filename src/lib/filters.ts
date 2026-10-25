import { z } from "zod";
import type { FinanceFilter } from "@/modules/finance/queries";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const financeFilterSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  from: date.optional(),
  to: date.optional(),
  matchId: z.uuid().optional(),
  playerId: z.uuid().optional(),
  status: z.enum(["paid", "unpaid", "partial", "waived", "due"]).optional(),
  kind: z.enum(["match_fee", "collection", "adjustment"]).optional(),
});

/** Reads finance filters from URL search params, dropping anything invalid. */
export function parseFinanceFilter(params: Record<string, string | string[] | undefined> | URLSearchParams): FinanceFilter {
  const get = (k: string) => {
    const v = params instanceof URLSearchParams ? params.get(k) : params[k];
    return (Array.isArray(v) ? v[0] : v) || undefined;
  };
  const raw = Object.fromEntries(
    ["month", "from", "to", "matchId", "playerId", "status", "kind"].map((k) => [k, get(k)]),
  );
  const out: FinanceFilter = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined) continue;
    const field = financeFilterSchema.shape[k as keyof FinanceFilter].safeParse(v);
    if (field.success) (out as Record<string, unknown>)[k] = field.data;
  }
  return out;
}
