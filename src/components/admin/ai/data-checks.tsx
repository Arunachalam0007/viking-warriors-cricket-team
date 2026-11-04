import { AlertTriangle, CheckCircle2, ChevronRight, Info, Sparkles } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Executor } from "@/db";
import { runSyncChecks } from "@/modules/ai/checks";
import { getAiTexts } from "@/modules/ai/content";

/**
 * "Data checks": rule-based checks run on every page view (exact, from the database), with the
 * AI's short summary of them on top when one has been written. `compact` lists warnings only.
 */
export async function DataChecksCard({ db, compact = false }: { db: Executor; compact?: boolean }) {
  const [checks, summary] = await Promise.all([runSyncChecks(db), getAiTexts(db, "sync_check", "latest")]);
  const shown = compact ? checks.filter((c) => c.severity === "warn") : checks;
  if (compact && shown.length === 0) return null;
  const en = summary.find((s) => s.lang === "en");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-2xl tracking-wide">Data checks</CardTitle>
        <CardDescription>{checks.length ? `${checks.length} thing${checks.length > 1 ? "s" : ""} to look at after the latest sync.` : "Nothing to look at."}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!compact && en && checks.length > 0 && (
          <div className="ai-text-card relative rounded-xl bg-muted/40 px-3 py-2.5 text-sm">
            <span className="ai-badge mb-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase">
              <Sparkles className="size-3" /> AI summary
            </span>
            <p className="leading-relaxed">{en.body}</p>
          </div>
        )}
        {shown.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-success">
            <CheckCircle2 className="size-4" /> All clear.
          </p>
        ) : (
          <ul className="divide-y">
            {shown.map((c) => {
              const body = (
                <div className="flex items-start gap-3 py-2.5">
                  {c.severity === "warn" ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" /> : <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{c.title}</p>
                    <p className="text-xs text-muted-foreground">{c.detail}</p>
                  </div>
                  {c.href && <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                </div>
              );
              return <li key={c.id}>{c.href ? <Link href={c.href} className="block rounded-lg hover:bg-muted/40">{body}</Link> : body}</li>;
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
