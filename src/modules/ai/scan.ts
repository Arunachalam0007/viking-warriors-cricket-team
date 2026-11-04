import "server-only";
import { generateText, Output } from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "@/db";
import { payments, players } from "@/db/schema";
import { formatDate, todayIst } from "@/lib/dates";
import { rupees } from "@/lib/format";
import { getPlayerBalances } from "@/modules/finance/queries";
import { aiModel } from "./models";

/*
 * Reads a UPI / bank payment screenshot (GPay, PhonePe, Paytm, bank app) and suggests the
 * payment to record. The AI only reads the picture and guesses the player; the admin checks the
 * filled-in form and presses "Record payment" as usual. The image is not stored.
 */

const extracted = z.object({
  isPaymentScreenshot: z.boolean().describe("false if the image is not a payment confirmation"),
  status: z.enum(["success", "pending", "failed", "unknown"]),
  amount: z.number().nullable().describe("Amount in rupees, a whole number"),
  date: z.string().nullable().describe("Payment date as YYYY-MM-DD"),
  app: z.string().nullable().describe("GPay, PhonePe, Paytm, a bank name…"),
  payerName: z.string().nullable().describe("Who paid (the sender)"),
  payeeName: z.string().nullable().describe("Who received the money"),
  reference: z.string().nullable().describe("UPI transaction id / UTR / reference number"),
  matchedPlayerId: z.string().nullable().describe("id from the player list whose name best matches the payer, or null if none is a clear match"),
  matchConfidence: z.enum(["high", "medium", "low", "none"]),
});

export type ScanResult = {
  ok: boolean;
  error?: string;
  status?: string;
  amount?: number | null;
  paidOn?: string | null;
  app?: string | null;
  payerName?: string | null;
  payeeName?: string | null;
  reference?: string | null;
  playerId?: string | null;
  playerName?: string | null;
  confidence?: string;
  warnings: string[];
  model?: string;
};

export async function scanPaymentImage(db: Executor, image: string): Promise<ScanResult> {
  const roster = await db.select({ id: players.id, name: players.name, chName: players.chName, isMember: players.isMember }).from(players);
  const model = await aiModel("payment_scan");
  const { output, response } = await generateText({
    model,
    output: Output.object({ schema: extracted }),
    maxRetries: 0,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              "This should be a screenshot of a UPI or bank payment made to an amateur cricket team in India for match fees.",
              "Read it carefully and return the fields. Use null for anything you cannot read; never guess digits.",
              `Today is ${todayIst()}. If the year is not shown, assume the most recent past date.`,
              "Then match the payer's name to one player from this list (names may be shortened, initials, or in a different order):",
              JSON.stringify(roster.map((p) => ({ id: p.id, name: p.name, alsoKnownAs: p.chName !== p.name ? p.chName : undefined }))),
            ].join("\n"),
          },
          { type: "image", image },
        ],
      },
    ],
  });

  const warnings: string[] = [];
  if (!output.isPaymentScreenshot) return { ok: false, error: "This doesn't look like a payment screenshot.", warnings };
  if (output.status === "failed") warnings.push("The screenshot shows a FAILED payment.");
  if (output.status === "pending") warnings.push("The screenshot shows a PENDING payment — check it went through.");

  const amount = output.amount !== null && Number.isFinite(output.amount) ? Math.round(output.amount) : null;
  if (amount !== null && output.amount !== amount) warnings.push(`Amount rounded to ${rupees(amount)} (the app shows paise).`);

  const date = output.date && /^\d{4}-\d{2}-\d{2}$/.test(output.date) && output.date <= todayIst() ? output.date : null;
  if (output.date && !date) warnings.push(`Could not use the date “${output.date}”; check it.`);

  const player = roster.find((p) => p.id === output.matchedPlayerId) ?? null;
  if (!player) warnings.push(output.payerName ? `No player clearly matches “${output.payerName}”. Pick the player.` : "Pick the player who paid.");
  else if (output.matchConfidence === "low" || output.matchConfidence === "medium") warnings.push(`“${output.payerName}” looks like ${player.name}, but check.`);
  if (player && !player.isMember) warnings.push(`${player.name} is a guest; guests are not charged match fees.`);

  if (output.reference) {
    const [dupe] = await db.select({ id: payments.id, paidOn: payments.paidOn, amount: payments.amount }).from(payments).where(eq(payments.reference, output.reference.trim()));
    if (dupe) warnings.push(`A payment with this reference is already recorded (${rupees(dupe.amount)} on ${formatDate(dupe.paidOn)}). It may be a duplicate.`);
  }
  if (player && amount) {
    const b = (await getPlayerBalances(db)).find((x) => x.playerId === player.id);
    if (b && b.balance <= 0) warnings.push(`${player.name} owes nothing now; this would become advance credit.`);
  }

  return {
    ok: true,
    status: output.status,
    amount,
    paidOn: date,
    app: output.app,
    payerName: output.payerName,
    payeeName: output.payeeName,
    reference: output.reference?.trim() || null,
    playerId: player?.id ?? null,
    playerName: player?.name ?? null,
    confidence: output.matchConfidence,
    warnings,
    model: response.modelId,
  };
}
