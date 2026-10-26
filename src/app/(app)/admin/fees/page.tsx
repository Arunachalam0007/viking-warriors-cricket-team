import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, OutcomeBadge, PageHeader, StatTile } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { UrlSelect } from "@/components/url-select";
import { getDb } from "@/db";
import { formatDate, formatMonth, istMonth, monthsBetween, todayIst } from "@/lib/dates";
import { rupees } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getMatchFinanceSummaries } from "@/modules/finance/queries";
import { getSettings } from "@/modules/settings/settings";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Match fees" };

export default async function FeesPage({ searchParams }: PageProps<"/admin/fees">) {
  // Layouts and pages render in parallel, so each admin page must check on its own.
  await requireAdmin();
  const sp = await searchParams;
  const db = getDb();
  const cfg = await getSettings(db);
  const months = monthsBetween(cfg.finance_start_date.slice(0, 7), todayIst().slice(0, 7));

  let month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : null;
  if (!month) {
    const latest = (await getMatchFinanceSummaries(db))[0];
    month = latest ? istMonth(latest.startTime) : todayIst().slice(0, 7);
  }
  if (!months.includes(month)) months.unshift(month);

  const list = await getMatchFinanceSummaries(db, { month });
  const totals = list.reduce(
    (t, m) => ({ charged: t.charged + m.charged, paid: t.paid + m.paid, due: t.due + m.due }),
    { charged: 0, paid: 0, due: 0 },
  );

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Match fees"
        description="Pick a match to set who played, change fees, and mark payments."
        actions={
          <UrlSelect
            name="month"
            label="Month"
            options={months.map((m) => ({ value: m, label: formatMonth(m) }))}
            className="h-10"
          />
        }
      />

      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Charged" value={rupees(totals.charged)} hint={formatMonth(month)} />
        <StatTile label="Collected" value={rupees(totals.paid)} tone="good" />
        <StatTile label="Due" value={rupees(totals.due)} tone={totals.due > 0 ? "bad" : undefined} />
      </div>

      {list.length === 0 ? (
        <EmptyState title={`No completed matches in ${formatMonth(month)}`}>
          Matches appear here after the nightly CricHeroes sync, or after you press Sync now in Sync &amp; logs.
        </EmptyState>
      ) : (
        <ul className="grid gap-2">
          {list.map((m) => (
            <li key={m.matchId}>
              <Link
                href={`/admin/fees/${m.matchId}`}
                className="grid gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold">vs {m.opponent}</span>
                    <OutcomeBadge outcome={m.outcome} startTime={m.startTime} />
                    <Badge variant="secondary" className="capitalize">
                      {m.kind}
                    </Badge>
                  </div>
                  <div className="mt-0.5 text-sm text-muted-foreground">
                    {formatDate(m.startTime, { weekday: "short", day: "numeric", month: "short" })} ·{" "}
                    {m.chargeable ? `${rupees(m.feePerPlayer)} × ${m.players} players` : "Not charged"}
                  </div>
                </div>
                <div className="flex gap-4 text-sm tabular sm:justify-end">
                  <span>
                    <span className="text-muted-foreground">Charged </span>
                    {rupees(m.charged)}
                  </span>
                  <span className="text-success">
                    <span className="text-muted-foreground">Paid </span>
                    {rupees(m.paid)}
                  </span>
                  <span className={cn(m.due > 0 && "font-semibold text-destructive")}>
                    <span className="font-normal text-muted-foreground">Due </span>
                    {rupees(m.due)}
                  </span>
                </div>
                <ChevronRight className="hidden size-5 text-muted-foreground sm:block" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
