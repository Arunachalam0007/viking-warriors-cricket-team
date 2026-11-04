import { readFileSync } from "node:fs";
import { join } from "node:path";
import { generateText, simulateReadableStream, streamText } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DB } from "@/db";
import { aiContent, aiUsage, auditLog, charges, players } from "@/db/schema";
import { factsHash, saveAiText } from "@/modules/ai/content";
import { callOrder, fallbackModel, restFor } from "@/modules/ai/models";
import { countQuestion } from "@/modules/ai/rate-limit";
import { speakableText } from "@/modules/ai/speech";
import { composeReminder, draftReminders, groupSummary, lastReminded, whatsappNumber } from "@/modules/ai/reminders";
import { saveSettings } from "@/modules/settings/settings";
import { notificationOutbox } from "@/db/schema";
import { chatText } from "@/components/ai/chat-text";
import { adminTools, type Preview } from "@/modules/ai/tools-admin";
import { parseScorecard, parseTeamMatches, parseTeamMembers } from "@/modules/cricheroes/parser";
import { getChargeRows } from "@/modules/finance/queries";
import { getSettings } from "@/modules/settings/settings";
import { runCricheroesSync, type SyncSource } from "@/modules/sync/sync";
import { createTestDb } from "./helpers/test-db";

// Admin changes refresh the Google Sheet "after the response"; there is no response in a test
vi.mock("next/server", () => ({ after: () => undefined }));

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");
const fixtureSource: SyncSource = {
  teamMatches: async () => parseTeamMatches(fixture("team-matches.html")),
  teamMembers: async () => parseTeamMembers(fixture("team-members.html")),
  scorecard: async () => parseScorecard(fixture("scorecard-27751784.html")),
};

let db: DB;
beforeEach(async () => {
  db = await createTestDb();
  process.env.GEMINI_API_KEY = "test";
  process.env.GROQ_API_KEY = "test";
});

const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } };
const answer = (text: string) => ({ content: [{ type: "text" as const, text }], finishReason: { unified: "stop" as const, raw: "stop" }, usage, warnings: [] });
const quotaError = Object.assign(new Error("You exceeded your current quota"), { statusCode: 429 });

describe("Gemini ⇄ Groq fallback", () => {
  it("alternates providers, primary first", () => {
    const gemini = callOrder("gemini", "chat").slice(0, 4).map((c) => c.provider);
    expect(gemini).toEqual(["gemini", "groq", "gemini", "groq"]);
    expect(callOrder("groq", "chat")[0]).toMatchObject({ provider: "groq", modelId: "openai/gpt-oss-120b" });
    expect(callOrder("gemini", "vision").at(-1)).toMatchObject({ provider: "groq", modelId: "qwen/qwen3.8-27b" });
  });

  it("rests a model for longer on a daily quota than on a per-minute limit", () => {
    expect(restFor(quotaError)).toBe(60_000);
    expect(restFor(Object.assign(new Error("Generate content requests per day limit exceeded"), { statusCode: 429 }))).toBeGreaterThan(60 * 60_000);
    expect(restFor(Object.assign(new Error("bad request"), { statusCode: 400 }))).toBe(0);
  });

  it("answers from the next model when the first is out of quota, and logs both calls", async () => {
    const models = {
      a: new MockLanguageModelV3({ provider: "gemini", modelId: "gemini-a", doGenerate: async () => { throw quotaError; } }),
      b: new MockLanguageModelV3({ provider: "groq", modelId: "groq-b", doGenerate: answer("from Groq") }),
    };
    const model = fallbackModel(
      [{ provider: "gemini", modelId: "gemini-a" }, { provider: "groq", modelId: "groq-b" }],
      { feature: "match_summary" },
      (c) => (c.modelId === "gemini-a" ? models.a : models.b),
    );
    const r = await generateText({ model, prompt: "hi", maxRetries: 0 });
    expect(r.text).toBe("from Groq");
    expect(r.response.modelId).toBe("groq-b");
    await new Promise((res) => setTimeout(res, 50)); // usage rows are written in the background
    const rows = await db.select().from(aiUsage).orderBy(aiUsage.id);
    expect(rows.map((x) => [x.provider, x.ok])).toEqual([["gemini", false], ["groq", true]]);
  });

  it("moves on when a model streams nothing in time (silent overload)", async () => {
    const stalled = new MockLanguageModelV3({
      modelId: "slow",
      doStream: async ({ abortSignal }) => ({
        stream: new ReadableStream({
          start(c) {
            c.enqueue({ type: "stream-start", warnings: [] });
            abortSignal?.addEventListener("abort", () => c.error(abortSignal.reason));
          },
        }),
      }),
    });
    const quick = new MockLanguageModelV3({
      modelId: "quick",
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: "text-start", id: "1" },
            { type: "text-delta", id: "1", delta: "வணக்கம்" },
            { type: "text-end", id: "1" },
            { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
          ],
        }),
      }),
    });
    const model = fallbackModel(
      [{ provider: "gemini", modelId: "slow" }, { provider: "groq", modelId: "quick" }],
      { feature: "chat_public" },
      (c) => (c.modelId === "slow" ? stalled : quick),
      { stream: 100, generate: 100 },
    );
    const r = streamText({ model, prompt: "hi", maxRetries: 0 });
    expect(await r.text).toBe("வணக்கம்");
  });
});

describe("AI texts", () => {
  it("hashes facts the same whatever the key order", () => {
    expect(factsHash({ a: 1, b: { c: 2, d: 3 } })).toBe(factsHash({ b: { d: 3, c: 2 }, a: 1 }));
    expect(factsHash({ a: 1 })).not.toBe(factsHash({ a: 2 }));
  });

  it("never overwrites a text an admin edited", async () => {
    const row = { kind: "match_summary" as const, subjectId: "m1", lang: "en" as const, title: "T", body: "AI text", factsHash: "h1", provider: "gemini", model: "x" };
    await saveAiText(db, row);
    await db.update(aiContent).set({ body: "Admin text", edited: true });
    await saveAiText(db, { ...row, body: "New AI text", factsHash: "h2" });
    const [saved] = await db.select().from(aiContent);
    expect(saved.body).toBe("Admin text");
  });
});

describe("Public chat", () => {
  it("counts questions but never blocks them", async () => {
    for (let i = 0; i < 30; i++) await countQuestion(db, "visitor-1");
    const rows = await db.select().from(aiUsage).where(eq(aiUsage.model, "question"));
    expect(rows).toHaveLength(30);
  });

  it("turns a markdown answer into plain sentences for the voice", () => {
    const md = "**கடைசி போட்டி:** [Yogi](/players/1) 45 ரன்\n\n| Player | Runs |\n|---|---|\n| Yogi | 206 |\n- Santhosh 173";
    const plain = speakableText(md);
    expect(plain).toContain("கடைசி போட்டி: Yogi 45 ரன்");
    expect(plain).not.toMatch(/[*\[\]()#]|---|\/players/);
    expect(plain).toContain("Yogi , 206");
    expect(plain).toContain("Santhosh 173");
  });

  it("shows Tamil, English or mixed suggestions and voice to match the language switch", () => {
    const tamil = /[\u0B80-\u0BFF]/;
    const here = { match: false, player: false };
    expect(chatText("ta").suggestions(false, here).every((s) => tamil.test(s))).toBe(true);
    expect(chatText("en").suggestions(false, here).some((s) => tamil.test(s))).toBe(false);
    const auto = chatText("auto").suggestions(false, here);
    expect(auto.some((s) => tamil.test(s)) && auto.some((s) => !tamil.test(s))).toBe(true);
    expect([chatText("ta").micLang, chatText("en").micLang]).toEqual(["ta-IN", "en-IN"]);
    expect(chatText("ta").speechLang("Yogi scored 45")).toBe("ta-IN");
    expect(chatText("auto").speechLang("Yogi scored 45")).toBe("en-IN");
    expect(chatText("auto").speechLang("யோகி 45 ரன்")).toBe("ta-IN");
  });
});

describe("Admin assistant changes", () => {
  it("previews a change without saving it, and saves it only when executed", async () => {
    await runCricheroesSync("manual", fixtureSource, db);
    const due = await getChargeRows(db, { kind: "match_fee", status: "due" });
    expect(due.length).toBeGreaterThan(0);
    const matchId = due[0].matchId!;
    const dueInMatch = due.filter((c) => c.matchId === matchId);

    const written: { id?: string; data: Preview }[] = [];
    const writer = { write: (part: { id?: string; data: Preview }) => written.push(part), merge: () => undefined, onError: undefined } as never;
    const tools = adminTools({ db, settings: await getSettings(db), actor: "admin@test", writer });
    const markFeesPaid = tools.markFeesPaid as unknown as {
      needsApproval: (input: unknown, o: { toolCallId: string; messages: [] }) => Promise<boolean>;
      execute: (input: unknown, o: unknown) => Promise<{ done: boolean; marked: string[] }>;
    };
    const input = { matchId, mode: "upi" };

    // 1. Preview: names and total, nothing saved yet
    expect(await markFeesPaid.needsApproval(input, { toolCallId: "call-1", messages: [] })).toBe(true);
    expect(written[0].id).toBe("call-1");
    expect(written[0].data.title).toMatch(new RegExp(`Mark ${dueInMatch.length} fee`));
    expect(written[0].data.lines.join(" ")).toContain(dueInMatch[0].playerName);
    expect(await getChargeRows(db, { matchId, kind: "match_fee", status: "due" })).toHaveLength(dueInMatch.length);

    // 2. Confirmed: saved, with an audit entry naming the admin
    const res = await markFeesPaid.execute(input, {});
    expect(res.done).toBe(true);
    expect(await getChargeRows(db, { matchId, kind: "match_fee", status: "due" })).toHaveLength(0);
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.action, "ai.match.mark_paid"));
    expect(entry.actor).toBe("admin@test");

    // 3. Nothing left to pay: the preview reports it and skips approval
    expect(await markFeesPaid.needsApproval(input, { toolCallId: "call-2", messages: [] })).toBe(false);
    expect(written[1].data.error).toMatch(/Nobody has an unpaid fee/);
  });

  it("does not invent ids: an unknown player is refused at preview", async () => {
    await runCricheroesSync("manual", fixtureSource, db);
    const [c] = await db.select().from(charges).where(and(eq(charges.kind, "match_fee"), sql`true`)).limit(1);
    const written: { data: Preview }[] = [];
    const tools = adminTools({ db, settings: await getSettings(db), actor: "admin@test", writer: { write: (p: { data: Preview }) => written.push(p) } as never });
    const waive = tools.waiveFee as unknown as { needsApproval: (i: unknown, o: { toolCallId: string; messages: [] }) => Promise<boolean> };
    expect(await waive.needsApproval({ matchId: c.matchId, playerId: "00000000-0000-4000-8000-000000000000", waived: true }, { toolCallId: "x", messages: [] })).toBe(false);
    expect(written[0].data.error).toMatch(/No player/);
  });
});

describe("WhatsApp dues reminders", () => {
  it("builds the message from the ledger, with Ragul's GPay number", () => {
    const msg = composeReminder({
      name: "Yogi M",
      owes: 150,
      unpaid: ["18 Oct vs Ruff Rulers – ₹50", "25 Oct vs Jaguar CC – ₹50", "1 Nov vs K K Guys – ₹50"],
      opening: "உங்கள் match fee பற்றிய சின்ன நினைவூட்டல்.",
      lang: "ta",
      teamName: "Viking Warriors",
      settings: { gpay_name: "Ragul", gpay_number: "9876543210", upi_id: "" },
    });
    expect(msg).toContain("வணக்கம் *Yogi*!");
    expect(msg).toContain("*Match fee பாக்கி: ₹150*");
    expect(msg).toContain("• 1 Nov vs K K Guys – ₹50");
    expect(msg).toContain("💵 Ragul-இடம் cash அல்லது GPay: *98765 43210*");
    const en = composeReminder({ name: "Yogi", owes: 50, unpaid: ["1 Nov vs K K Guys – ₹50"], opening: "Hi", lang: "en", teamName: "Viking Warriors", settings: { gpay_name: "Ragul", gpay_number: "", upi_id: "" } });
    expect(en).toContain("Pay Ragul by cash or UPI");
  });

  it("uses Ragul's player mobile number when no GPay number is saved", async () => {
    await runCricheroesSync("manual", fixtureSource, db);
    await db.insert(players).values({ name: "Ragul RD", phone: "9123456780", isMember: true });
    const { payContact } = await import("@/modules/ai/reminders");
    const contact = await payContact(db, { ...(await getSettings(db)), gpay_name: "Ragul", gpay_number: "" });
    expect(contact.gpay_number).toBe("9123456780");
    expect(composeReminder({ name: "Yogi", owes: 50, unpaid: [], opening: "Hi", lang: "en", teamName: "Viking Warriors", settings: contact })).toContain("Pay Ragul by cash or GPay: *91234 56780*");
  });

  it("formats numbers for wa.me", () => {
    expect(whatsappNumber("98765 43210")).toBe("919876543210");
    expect(whatsappNumber("+91 98765-43210")).toBe("919876543210");
    expect(whatsappNumber("09876543210")).toBe("919876543210");
  });

  it("drafts exact messages even with no AI available, and tracks who was reminded", async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GROQ_API_KEY;
    await runCricheroesSync("manual", fixtureSource, db);
    await saveSettings({ gpay_name: "Ragul", gpay_number: "9876543210" }, "test", db);
    const drafts = await draftReminders(db);
    expect(drafts.length).toBeGreaterThan(0);
    const d = drafts[0];
    expect(d.ta).toContain(`₹${d.owes}`);
    expect(d.en).toContain("💵 Pay Ragul by cash or GPay: *98765 43210*");
    expect(d.en).toContain("A quick, friendly reminder");

    const group = await groupSummary(db);
    expect(group.en).toContain("*Total: ₹");
    expect(group.ta).toContain("GPay");

    await db.insert(notificationOutbox).values({ playerId: d.playerId, message: d.en, status: "sent", sentAt: new Date() });
    expect((await lastReminded(db)).has(d.playerId)).toBe(true);
  });
});
