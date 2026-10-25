import { istDate } from "@/lib/dates";

export type MatchKind = "individual" | "tournament";
export type ChargeStatus = "unpaid" | "partial" | "paid" | "waived";

/** CricHeroes puts a tournament name on tournament matches; everything else is an individual match. */
export function defaultMatchKind(tournamentName: string | null | undefined): MatchKind {
  return tournamentName && tournamentName.trim() ? "tournament" : "individual";
}

/**
 * Club rule: ₹50 per member for completed or abandoned individual / practice
 * matches on or after the finance start date. Upcoming, live and tournament
 * matches are never charged automatically.
 */
export function isChargeableByDefault(
  match: { status: string; kind: string; startTime: Date | string },
  financeStartDate: string,
): boolean {
  return match.status === "past" && match.kind === "individual" && istDate(match.startTime) >= financeStartDate;
}

export function chargeStatus(amount: number, paid: number, waived: boolean): ChargeStatus {
  if (waived) return "waived";
  if (paid >= amount) return "paid";
  if (paid > 0) return "partial";
  return "unpaid";
}

export function matchOutcome(
  m: { status: string; result: string; winningTeamId: number },
  teamId: number,
): "won" | "lost" | "tied" | "abandoned" | "no_result" | null {
  if (m.status !== "past") return null;
  if (m.result === "abandoned") return "abandoned";
  if (m.winningTeamId === teamId) return "won";
  if (m.winningTeamId > 0) return "lost";
  if (m.result === "tied" || m.result === "tie") return "tied";
  return "no_result";
}
