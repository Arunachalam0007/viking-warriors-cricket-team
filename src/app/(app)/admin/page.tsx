import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { RevenueChart } from "@/components/admin/ops/revenue-chart";
import { SyncNowButton } from "@/components/admin/ops/sync-buttons";
import { SyncStatusLine } from "@/components/admin/ops/sync-status";
import { ADMIN_NAV } from "@/components/layout/nav-items";
import { EmptyState, Money, PageHeader, PlayerAvatar, StatTile } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db";
import { formatMonth } from "@/lib/dates";
import { rupees } from "@/lib/format";
import { lastSuccessfulSync } from "@/modules/admin/queries";
import { getPlayerBalances, getRevenueSummary } from "@/modules/finance/queries";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Revenue overview" };

export default async function AdminOverviewPage() {
  // Layouts and pages render in parallel, so each admin page must check on its own.
  await requireAdmin();
  const db = getDb();
  const [revenue, balances, chSync, sheetSync] = await Promise.all([
    getRevenueSummary(db),
    getPlayerBalances(db),
    lastSuccessfulSync(db, "cricheroes"),
    lastSuccessfulSync(db, "sheets"),
  ]);
  const owing = balances.filter((b) => b.balance > 0).sort((a, b) => b.balance - a.balance).slice(0, 10);
  const chart = revenue.monthly.map((m) => ({ ...m, label: formatMonth(m.month, true) }));
  const inHand = revenue.holders.reduce((s, h) => s + h.balance, 0);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Revenue overview"
        description="Everything the team has charged, collected and spent, and who is holding the money."
        actions={
          <Button asChild variant="outline">
            <a href="/api/export/finance?scope=admin" download>
              <Download />
              Download full admin Excel
            </a>
          </Button>
        }
      />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Totals">
        <StatTile label="Fund balance" value={rupees(revenue.fundBalance)} hint="Collected + income − expenses" tone={revenue.fundBalance < 0 ? "bad" : "good"} />
        <StatTile label="Outstanding dues" value={rupees(revenue.outstanding)} hint="Owed by players" tone={revenue.outstanding > 0 ? "bad" : undefined} />
        <StatTile label="Collected" value={rupees(revenue.collected)} hint="Payments from players" />
        <StatTile label="Fees charged" value={rupees(revenue.charged)} hint="Not counting waived" />
        <StatTile label="Player credit" value={rupees(revenue.credit)} hint="Paid in advance" />
        <StatTile label="Other income" value={rupees(revenue.income)} hint="Sponsors, ball sales…" />
        <StatTile label="Expenses" value={rupees(revenue.expenses)} hint="Balls, grounds, kit…" />
        <StatTile label="Cash in hand" value={rupees(inHand)} hint="Across all holders" />
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-2xl tracking-wide">Month by month</CardTitle>
          <CardDescription>Fees charged against money collected, other income and expenses.</CardDescription>
        </CardHeader>
        <CardContent>
          {chart.length ? <RevenueChart data={chart} /> : <EmptyState title="No finance activity yet" />}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="font-heading text-2xl tracking-wide">Cash in hand</CardTitle>
            <CardDescription>Who holds the team&apos;s money. Payments and expenses are recorded against a holder.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Holder</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">Income</TableHead>
                  <TableHead className="text-right">Spent</TableHead>
                  <TableHead className="text-right">In hand</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {revenue.holders.map((h) => (
                  <TableRow key={h.id ?? "none"}>
                    <TableCell className="font-medium">{h.name}</TableCell>
                    <TableCell className="text-right tabular">{rupees(h.received)}</TableCell>
                    <TableCell className="text-right tabular">{rupees(h.income)}</TableCell>
                    <TableCell className="text-right tabular">{rupees(h.spent)}</TableCell>
                    <TableCell className="text-right font-semibold tabular">{rupees(h.balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell>Total</TableCell>
                  <TableCell colSpan={4} className="text-right tabular">
                    {rupees(inHand)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
            <p className="mt-3 text-sm text-muted-foreground">
              Manage holders on <Link className="text-primary underline-offset-4 hover:underline" href="/admin/expenses">Expenses &amp; income</Link>.
            </p>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="font-heading text-2xl tracking-wide">Top dues</CardTitle>
            <CardDescription>Players who owe the most right now.</CardDescription>
          </CardHeader>
          <CardContent>
            {owing.length === 0 ? (
              <EmptyState title="Nobody owes anything">All match fees are paid.</EmptyState>
            ) : (
              <ul className="grid gap-1">
                {owing.map((b) => (
                  <li key={b.playerId} className="flex items-center gap-3 rounded-md px-1 py-1.5">
                    <PlayerAvatar name={b.name} photo={b.photo} size="sm" />
                    <Link href={`/players/${b.playerId}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                      {b.name}
                    </Link>
                    <span className="text-xs text-muted-foreground tabular">{b.matchFees} matches</span>
                    <Money value={b.balance} signed className="font-semibold" />
                  </li>
                ))}
              </ul>
            )}
            <Button asChild variant="link" className="mt-2 px-0">
              <Link href="/admin/payments">Record payments →</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="font-heading text-2xl tracking-wide">Sync status</CardTitle>
            <CardDescription>CricHeroes and the Google Sheet update every night at 23:30 IST.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <div className="divide-y">
              <SyncStatusLine label="CricHeroes" last={chSync.last} lastSuccess={chSync.lastSuccess} />
              <SyncStatusLine label="Google Sheet" last={sheetSync.last} lastSuccess={sheetSync.lastSuccess} />
            </div>
            <SyncNowButton />
            <Link href="/admin/sync" className="text-sm text-primary underline-offset-4 hover:underline">
              See sync history and audit log
            </Link>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="font-heading text-2xl tracking-wide">Admin pages</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {ADMIN_NAV.filter((n) => n.href !== "/admin").map((n) => (
                <li key={n.href}>
                  <Link href={n.href} className="flex items-center gap-2 rounded-md border px-3 py-2.5 text-sm font-medium hover:bg-muted">
                    <n.icon className="size-4 text-primary" />
                    {n.label}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
