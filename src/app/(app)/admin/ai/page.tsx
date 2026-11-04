import { CheckCircle2, MessageCircle, ScanLine, Sparkles, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AiContentManager, AiSettingsForm } from "@/components/admin/ai/ai-admin";
import { PageHeader, StatTile } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { providerHealth } from "@/modules/ai/models";
import { aiContentList, aiDashboard } from "@/modules/ai/queries";
import { getSettings } from "@/modules/settings/settings";

export const metadata: Metadata = { title: "AI" };

const FEATURE_LABEL: Record<string, string> = {
  chat_public: "AI-Viking-Bot (team)",
  chat_admin: "AI-Viking-Bot (admin)",
  match_summary: "Match reports",
  period_writeup: "Performer write-ups",
  player_insight: "Player form notes",
  sync_check: "Data checks summary",
  payment_scan: "Screenshot reading",
  reminder: "Reminder drafts",
};

export default async function AiAdminPage() {
  // Layouts and pages render in parallel, so each admin page must check on its own.
  await requireAdmin();
  const db = getDb();
  const [settings, dash, content] = await Promise.all([getSettings(db), aiDashboard(db), aiContentList(db)]);
  const health = providerHealth();
  const sum = (rows: typeof dash.todayRows, f: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + f(r), 0);
  const features = [...new Set(dash.weekRows.map((r) => r.feature))];

  return (
    <div className="grid gap-6">
      <PageHeader
        title="AI"
        description={
          <>
            AI-Viking-Bot, AI texts, screenshot reading and reminder drafts, on the free Gemini and Groq tiers. How it works:{" "}
            <span className="font-mono text-xs">docs/ai features/</span>.
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="AI calls today" value={sum(dash.todayRows, (r) => r.calls)} hint={`${sum(dash.todayRows, (r) => r.failed)} switched or failed`} />
        <StatTile label="Public questions today" value={dash.questionsToday} hint="No limit; Groq takes over when Gemini is full" />
        <StatTile label="Tokens today" value={sum(dash.todayRows, (r) => r.tokens).toLocaleString("en-IN")} />
        <StatTile label="AI texts" value={content.filter((c) => c.lang === "en").length} hint="Tamil + English each" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <AiSettingsForm
          initial={{
            ai_enabled: Boolean(settings.ai_enabled),
            ai_public_chat: Boolean(settings.ai_public_chat),
            ai_primary_provider: settings.ai_primary_provider === "groq" ? "groq" : "gemini",
          }}
        />
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-2xl tracking-wide">Providers</CardTitle>
            <CardDescription>Each model has its own free quota. Calls go down the list, switching provider each step, until one answers.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {health.map((p) => {
              const today = dash.todayRows.filter((r) => r.provider === p.provider);
              return (
                <div key={p.provider} className="space-y-2">
                  <div className="flex items-center gap-2">
                    {p.configured ? <CheckCircle2 className="size-5 text-success" /> : <XCircle className="size-5 text-destructive" />}
                    <span className="font-semibold">{p.label}</span>
                    {settings.ai_primary_provider === p.provider && <Badge>First</Badge>}
                    <span className="ml-auto text-xs text-muted-foreground tabular">
                      today {sum(today, (r) => r.calls - r.failed)} ok · {sum(today, (r) => r.failed)} failed
                    </span>
                  </div>
                  {!p.configured && <p className="text-sm text-muted-foreground">Add {p.provider === "gemini" ? "GEMINI_API_KEY" : "GROQ_API_KEY"} to the environment.</p>}
                  <div className="flex flex-wrap gap-1.5">
                    {p.models.map((m) => (
                      <Badge key={m.modelId} variant={m.restingUntil ? "outline" : "secondary"} title={m.lastError ?? undefined} className={m.restingUntil ? "text-muted-foreground line-through" : undefined}>
                        {m.modelId}
                      </Badge>
                    ))}
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground">Crossed out = resting after a quota or overload error on this server (it is tried again later).</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <QuickLink href="/admin/payments" icon={<ScanLine className="size-5" />} title="Read a payment screenshot" text="Payments → Scan screenshot" />
        <QuickLink href="/admin/reminders" icon={<MessageCircle className="size-5" />} title="Draft dues reminders" text="Friendly WhatsApp messages in Tamil & English" />
        <QuickLink href="/admin/sync" icon={<Sparkles className="size-5" />} title="Data checks" text="What to look at after each sync" />
      </div>

      <AiContentManager
        rows={content.map((c) => ({
          id: c.id,
          kind: c.kind,
          subjectId: c.subjectId,
          lang: c.lang,
          title: c.title,
          body: c.body,
          model: c.model,
          edited: c.edited,
          hidden: c.hidden,
          updatedAt: c.updatedAt.toISOString(),
          label: c.label,
        }))}
      />

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-2xl tracking-wide">Last 7 days</CardTitle>
          <CardDescription>Model calls per feature. A “failed” call was answered by the next model in the chain unless every model failed.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Feature</TableHead>
                <TableHead className="text-right">Gemini</TableHead>
                <TableHead className="text-right">Groq</TableHead>
                <TableHead className="text-right">Failed</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {features.map((f) => {
                const rows = dash.weekRows.filter((r) => r.feature === f);
                const ok = (p: string) => sum(rows.filter((r) => r.provider === p), (r) => r.calls - r.failed);
                return (
                  <TableRow key={f}>
                    <TableCell>{FEATURE_LABEL[f] ?? f}</TableCell>
                    <TableCell className="text-right tabular">{ok("gemini")}</TableCell>
                    <TableCell className="text-right tabular">{ok("groq")}</TableCell>
                    <TableCell className="text-right tabular">{sum(rows, (r) => r.failed)}</TableCell>
                    <TableCell className="text-right tabular">{sum(rows, (r) => r.tokens).toLocaleString("en-IN")}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {dash.lastErrors.length > 0 && (
            <div className="mt-4 space-y-1">
              <p className="text-sm font-semibold">Latest switches</p>
              {dash.lastErrors.map((e) => (
                <p key={e.id} className="truncate text-xs text-muted-foreground" title={e.error ?? undefined}>
                  {formatDateTime(e.at)} · {e.model} · {e.error}
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function QuickLink({ href, icon, title, text }: { href: string; icon: React.ReactNode; title: string; text: string }) {
  return (
    <Link href={href} className="block">
      <Card className="h-full transition-shadow hover:shadow-md">
        <CardContent className="flex items-start gap-3">
          <span className="team-gradient-x grid size-10 shrink-0 place-items-center rounded-xl text-white">{icon}</span>
          <div>
            <p className="font-semibold">{title}</p>
            <p className="text-sm text-muted-foreground">{text}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
