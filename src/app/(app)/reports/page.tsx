import Link from "next/link";
import { EmptyState, PageHeader, PlayerAvatar } from "@/components/shared";
import { FeesChart, PerformanceChart, ResultsChart } from "@/components/public/report-charts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db";
import { formatDate, formatMonth } from "@/lib/dates";
import { average, economy, strikeRate } from "@/lib/format";
import { getRevenueSummary } from "@/modules/finance/queries";
import { getSettings } from "@/modules/settings/settings";
import { getMonthlyTeamTrends, getPlayerStats } from "@/modules/stats/queries";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  const db = getDb();
  const settings = await getSettings(db);
  const season = { from: settings.sync_start_date };

  const [trends, revenue, stats] = await Promise.all([getMonthlyTeamTrends(db, season), getRevenueSummary(db), getPlayerStats(db, season)]);

  const trendRows = trends.map((t) => ({ ...t, label: formatMonth(t.month, true) }));
  // Public view: only match-fee charged vs collected. Expenses, income and cash holders are admin-only.
  const feeRows = revenue.monthly
    .filter((m) => m.month >= settings.finance_start_date.slice(0, 7))
    .map((m) => ({ month: m.month, label: formatMonth(m.month, true), charged: m.charged, collected: m.collected }));
  const top = [...stats].sort((a, b) => b.mvp - a.mvp).slice(0, 15);

  return (
    <div className="space-y-5">
      <PageHeader title="Reports & analytics" description={`Season trends since ${formatDate(settings.sync_start_date)}.`} />

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-xl tracking-wide">Season top performers</CardTitle>
        </CardHeader>
        <CardContent>
          {top.length === 0 ? (
            <EmptyState title="No stats yet" />
          ) : (
            <>
              {/* Phones: one tile per player. Tablet and up: the full table. */}
              <div className="grid gap-3 sm:hidden">
                {top.map((p, i) => (
                  <Link key={p.playerId} href={`/players/${p.playerId}`} className="rounded-lg border p-3 transition-colors hover:bg-muted/50">
                    <div className="flex items-center gap-3">
                      <span className="w-5 font-heading text-lg font-bold text-primary tabular">{i + 1}</span>
                      <PlayerAvatar name={p.name} photo={p.photo} size="sm" />
                      <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                      <span className="text-right leading-none">
                        <span className="font-heading text-xl font-bold tabular">{p.mvp}</span>
                        <span className="block text-[10px] tracking-wide text-muted-foreground uppercase">MVP pts</span>
                      </span>
                    </div>
                    <dl className="mt-3 grid grid-cols-4 gap-y-2 text-center">
                      {[
                        ["Mat", p.matches],
                        ["Runs", p.runs],
                        ["Avg", average(p.runs, p.outs)],
                        ["SR", strikeRate(p.runs, p.balls)],
                        ["Wkts", p.wickets],
                        ["Econ", economy(p.runsConceded, p.ballsBowled)],
                        ["Ct", p.catches],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <dt className="text-[10px] tracking-wide text-muted-foreground uppercase">{label}</dt>
                          <dd className="font-medium tabular">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </Link>
                ))}
              </div>
              <Table className="hidden sm:table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Player</TableHead>
                    <TableHead className="text-right">Mat</TableHead>
                    <TableHead className="text-right">Runs</TableHead>
                    <TableHead className="text-right">Avg</TableHead>
                    <TableHead className="text-right">SR</TableHead>
                    <TableHead className="text-right">Wkts</TableHead>
                    <TableHead className="text-right">Econ</TableHead>
                    <TableHead className="text-right">Ct</TableHead>
                    <TableHead className="text-right">MVP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {top.map((p) => (
                    <TableRow key={p.playerId}>
                      <TableCell>
                        <Link href={`/players/${p.playerId}`} className="flex items-center gap-2 hover:underline">
                          <PlayerAvatar name={p.name} photo={p.photo} size="sm" />
                          <span className="font-medium whitespace-nowrap">{p.name}</span>
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular">{p.matches}</TableCell>
                      <TableCell className="text-right tabular">{p.runs}</TableCell>
                      <TableCell className="text-right tabular">{average(p.runs, p.outs)}</TableCell>
                      <TableCell className="text-right tabular">{strikeRate(p.runs, p.balls)}</TableCell>
                      <TableCell className="text-right tabular">{p.wickets}</TableCell>
                      <TableCell className="text-right tabular">{economy(p.runsConceded, p.ballsBowled)}</TableCell>
                      <TableCell className="text-right tabular">{p.catches}</TableCell>
                      <TableCell className="text-right font-semibold tabular">{p.mvp}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      {trends.length === 0 ? (
        <EmptyState title="No matches played yet">Charts appear after the first synced match.</EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-xl tracking-wide">Results by month</CardTitle>
              <CardDescription>Won and lost (abandoned matches not shown)</CardDescription>
            </CardHeader>
            <CardContent>
              <ResultsChart data={trendRows} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-xl tracking-wide">Runs & wickets by month</CardTitle>
              <CardDescription>Team totals from our players</CardDescription>
            </CardHeader>
            <CardContent>
              <PerformanceChart data={trendRows} />
            </CardContent>
          </Card>
        </div>
      )}

      {feeRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-xl tracking-wide">Match fees by month</CardTitle>
            <CardDescription>Amount charged to players vs amount collected</CardDescription>
          </CardHeader>
          <CardContent>
            <FeesChart data={feeRows} />
          </CardContent>
        </Card>
      )}

    </div>
  );
}
