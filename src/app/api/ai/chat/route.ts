import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, stepCountIs, streamText } from "ai";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { getViewer } from "@/lib/auth";
import type { ChatMessage, ChatRequest } from "@/modules/ai/chat-types";
import { aiModel, configuredProviders, FAST_OPTIONS, providerOf } from "@/modules/ai/models";
import { houseRules, TEAM_NAME_TA } from "@/modules/ai/prompts";
import { countQuestion, visitorId } from "@/modules/ai/rate-limit";
import { adminTools } from "@/modules/ai/tools-admin";
import { publicTools } from "@/modules/ai/tools-public";
import { getSettings } from "@/modules/settings/settings";

// "AI-Viking-Bot": the chat window posts here. mode "admin" needs an admin session.
export const maxDuration = 60;

const MAX_HISTORY = 24;

function systemPrompt(o: { teamName: string; admin: boolean; lang: ChatRequest["lang"]; path?: string; holders?: string }) {
  return [
    houseRules(o.teamName),
    `You are "AI-Viking-Bot", the team's assistant on its website${o.admin ? ", talking to a team admin" : ""}.`,
    o.lang === "ta"
      ? `Always answer in Tamil (team name ${TEAM_NAME_TA}).`
      : o.lang === "en"
        ? "Always answer in English."
        : "Answer in the language of the user's last message: Tamil (Tamil script or Tamil typed in English letters, 'Tanglish') gets a Tamil answer, English gets English.",
    "Always look facts up with the tools before answering; never answer stats, fixtures or money from memory. To find a player, call listPlayers and match the name yourself.",
    "Answers are read on phones: keep them short (under 120 words unless asked for more). Use markdown: **bold** for key numbers, bullet lists, and small tables for rankings.",
    "Link players and matches with markdown links using the url field the tools return, e.g. [Yogi](/players/…). Only use urls that tools returned.",
    "Answer questions about the team, its players, matches, stats, match fees and how to use this website. For anything else, say politely that you only help with Viking Warriors matters.",
    o.admin
      ? [
          "This user is an admin: you can see all money details and phone numbers, and you can make changes with the change tools (markFeesPaid, markFeeUnpaid, setPlayed, waiveFee, recordPayment, addExpense, setMatchFee).",
          "Before a change, look up the exact match and player ids with the read tools. Call each change tool once; the admin sees a preview and confirms or cancels it. After a confirmed change, say in one line what was done. If it was cancelled, acknowledge and do nothing else.",
          o.holders ? `Cash holders: ${o.holders}.` : "",
        ].join("\n")
      : "Never reveal phone numbers, who holds the team's cash, payment details or expenses; those are for admins. You cannot change anything; for corrections, tell the visitor to contact an admin.",
    o.path ? `The user is currently on the page ${o.path} (a /matches/<id> or /players/<id> page means "this match" / "this player").` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** True when the message's change previews were all answered, and all with Cancel. */
function allDenied(message: ChatMessage) {
  const answered = message.parts.flatMap((p) => {
    const approval = (p as { approval?: { approved?: boolean } }).approval;
    return p.type.startsWith("tool-") && approval && approval.approved !== undefined ? [approval.approved] : [];
  });
  const waiting = message.parts.some((p) => (p as { state?: string }).state === "approval-requested");
  return answered.length > 0 && !waiting && answered.every((a) => a === false);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as ChatRequest | null;
  if (!body || !Array.isArray(body.messages)) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const db = getDb();
  const [settings, viewer] = await Promise.all([getSettings(db), getViewer()]);
  const admin = body.mode === "admin";
  if (admin && !viewer?.isAdmin) return NextResponse.json({ error: "Please log in as an admin to use admin mode." }, { status: 403 });
  if (!settings.ai_enabled || configuredProviders().length === 0) return NextResponse.json({ error: "AI-Viking-Bot is switched off right now." }, { status: 503 });
  if (!admin && !settings.ai_public_chat && !viewer?.isAdmin) return NextResponse.json({ error: "AI-Viking-Bot is switched off right now." }, { status: 503 });

  const client = visitorId(request);
  // A new question (not an approval continuing the last answer) is counted for Admin → AI; no limit
  const last = body.messages.at(-1);
  if (!admin && last?.role === "user") await countQuestion(db, client).catch(() => undefined);

  const messages = body.messages.slice(-MAX_HISTORY) as ChatMessage[];
  const holders = admin ? (await db.query.cashHolders.findMany()).filter((h) => h.isActive).map((h) => `${h.name}${h.isDefault ? " (default)" : ""}`).join(", ") : undefined;
  const model = await aiModel(admin ? "chat_admin" : "chat_public", { client });

  // The admin cancelled every change on the preview cards: say so without asking the model, which
  // would otherwise tend to propose the same change again.
  if (admin && last?.role === "assistant" && allDenied(last)) {
    const stream = createUIMessageStream<ChatMessage>({
      originalMessages: messages,
      execute: ({ writer }) => {
        // Close each cancelled preview, so the chat window does not send the cancellation again
        for (const p of last.parts) {
          const part = p as { toolCallId?: string; state?: string };
          if (part.toolCallId && part.state === "approval-responded") writer.write({ type: "tool-output-denied", toolCallId: part.toolCallId });
        }
        writer.write({ type: "start-step" });
        writer.write({ type: "text-start", id: "cancelled" });
        writer.write({ type: "text-delta", id: "cancelled", delta: body.lang === "ta" ? "சரி, ரத்து செய்யப்பட்டது. எதுவும் மாற்றப்படவில்லை." : "Okay, cancelled. Nothing was changed." });
        writer.write({ type: "text-end", id: "cancelled" });
        writer.write({ type: "finish-step" });
      },
    });
    return createUIMessageStreamResponse({ stream });
  }

  let answeredBy: string | undefined;
  const stream = createUIMessageStream<ChatMessage>({
    originalMessages: messages,
    onError: (e) => {
      const msg = (e as Error)?.message ?? "";
      return /quota|rate limit|429|high demand|overloaded/i.test(msg)
        ? "Both AI services are busy or out of free quota right now. Please try again in a minute."
        : "Sorry, something went wrong answering that. Please try again.";
    },
    execute: async ({ writer }) => {
      const tools = admin ? adminTools({ db, settings, actor: viewer!.email, writer }) : publicTools({ db, settings });
      const result = streamText({
        model,
        system: systemPrompt({ teamName: settings.team_name, admin, lang: body.lang, path: body.path, holders }),
        messages: await convertToModelMessages(messages, { tools, ignoreIncompleteToolCalls: true }),
        tools,
        stopWhen: stepCountIs(8),
        providerOptions: FAST_OPTIONS,
        maxRetries: 0,
        onStepFinish: (step) => {
          answeredBy = step.response.modelId;
        },
      });
      writer.merge(
        result.toUIMessageStream({
          messageMetadata: ({ part }) => (part.type === "finish" && answeredBy ? { model: answeredBy, provider: providerOf(answeredBy) } : undefined),
        }),
      );
    },
  });
  return createUIMessageStreamResponse({ stream });
}
