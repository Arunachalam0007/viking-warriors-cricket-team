import type { UIMessage } from "ai";

/** Shared by the chat route and the chat window (no server-only code here). */

export type ChatMode = "public" | "admin";
export type ChatLang = "auto" | "ta" | "en";

export type ChatPreview = { title: string; lines: string[]; warnings?: string[]; error?: string };

export type ChatMetadata = { model?: string; provider?: "gemini" | "groq" };

export type ChatMessage = UIMessage<ChatMetadata, { preview: ChatPreview }>;

export type ChatRequest = { messages: ChatMessage[]; mode: ChatMode; lang: ChatLang; path?: string };

/** Human labels for the tool activity chips in the chat window. */
export const TOOL_LABELS: Record<string, string> = {
  listPlayers: "Looking up players",
  playerProfile: "Reading player profile",
  leaderboard: "Checking the leaderboard",
  matches: "Checking fixtures and results",
  matchDetail: "Reading the scorecard",
  teamRecord: "Counting wins and losses",
  dues: "Checking match-fee dues",
  siteGuide: "Opening the site guide",
  financeOverview: "Reading team accounts",
  balances: "Reading player balances",
  charges: "Reading match fees",
  matchFees: "Reading fees per match",
  payments: "Reading payments",
  expensesAndIncome: "Reading expenses and income",
  dataChecks: "Running data checks",
  findPlayerByName: "Searching players",
  markFeesPaid: "Mark fees paid",
  markFeeUnpaid: "Mark fee unpaid",
  setPlayed: "Change who played",
  waiveFee: "Waive a fee",
  recordPayment: "Record a payment",
  addExpense: "Add an expense",
  setMatchFee: "Change match fee settings",
};

export const CHANGE_TOOLS = new Set(["markFeesPaid", "markFeeUnpaid", "setPlayed", "waiveFee", "recordPayment", "addExpense", "setMatchFee"]);
