import { ArrowRight, CalendarClock, MapPin } from "lucide-react";
import Link from "next/link";
import { EmptyState, Money, OutcomeBadge, PageHeader, PlayerAvatar, StatTile } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { formatDate, formatDateTime, formatMonth, istMonth, monthDateRange } from "@/lib/dates";
import { rupees } from "@/lib/format";
import { getChargeRows, getPlayerBalances } from "@/modules/finance/queries";
import { getSettings } from "@/modules/settings/settings";
import { getMatches, getPlayerStats, getTeamRecord } from "@/modules/stats/queries";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const db = getDb();
  const month = istMonth(new Date());
  const { from, to } = monthDateRange(month);

  const [settings, record, upcoming, recent, monthStats, charges, balances] = await Promise.all([
    getSettings(db),
    getTeamRecord(db),
    getMatches(db, { status: "upcoming", limit: 1 }),
    getMatches(db, { status: "past", limit: 5 }),
    getPlayerStats(db, { from, to }),
    getChargeRows(db),
    getPlayerBalances(db),
  ]);

  const next = upcoming[0];
  const top = [...monthStats].sort((a, b) => b.mvp - a.mvp).slice(0, 3);
  const charged = charges.filter((c) => !c.waived).reduce((s, c) => s + c.amount, 0);
  const collected = charges.reduce((s, c) => s + c.paid, 0);
  const due = balances.reduce((s, b) => s + Math.max(b.balance, 0), 0);
  const winPct = record.won + record.lost > 0 ? Math.round((record.won * 100) / (record.won + record.lost)) : null;

  return (
    <div className="space-y-6">
      <PageHeader title={settings.team_name} description={`Matches, form and match fees since ${formatDate(settings.sync_start_date)}.`} />

      <section aria-label="Team record" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Played" value={record.played} />
        <StatTile label="Won" value={record.won} tone="good" hint={winPct !== null ? `${winPct}% of decided matches` : undefined} />
        <StatTile label="Lost" value={record.lost} tone="bad" />
        <StatTile label="Abandoned / other" value={record.abandoned + record.other} />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="font-heading text-xl tracking-wide">Next fixture</CardTitle>
          </CardHeader>
          <CardContent>
            {next ? (
              <Link href={`/matches/${next.id}`} className="flex items-center gap-4 rounded-lg p-1 hover:bg-muted/50">
                <PlayerAvatar name={next.opponentName} photo={next.opponentLogo} size="lg" />
                <div className="min-w-0">
                  <div className="font-heading text-2xl font-bold">vs {next.opponentName}</div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock className="size-4" />
                      {formatDateTime(next.startTime)}
                    </span>
                    {next.ground && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-4" />
                        {next.ground}
                      </span>
                    )}
                    {next.tournamentName && <span>{next.tournamentName}</span>}
                  </div>
                </div>
              </Link>
            ) : (
              <EmptyState title="No upcoming match scheduled">New fixtures appear after the nightly CricHeroes sync.</EmptyState>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-xl tracking-wide">Match fees</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <dl className="grid grid-cols-3 gap-2 text-center">
              <div>
                <dt className="text-xs text-muted-foreground uppercase">Charged</dt>
                <dd className="font-heading text-xl font-bold tabular">{rupees(charged)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase">Collected</dt>
                <dd className="font-heading text-xl font-bold text-success tabular">{rupees(collected)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase">Due</dt>
                <dd className="font-heading text-xl font-bold text-destructive tabular">{rupees(due)}</dd>
              </div>
            </dl>
            <Button asChild variant="outline" className="w-full">
              <Link href="/finance">
                See who has paid <ArrowRight />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-xl tracking-wide">Recent results</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <EmptyState title="No results yet" />
            ) : (
              <ul className="divide-y">
                {recent.map((m) => (
                  <li key={m.id}>
                    <Link href={`/matches/${m.id}`} className="flex items-center gap-3 py-2.5 hover:bg-muted/40">
                      <div className="w-16 shrink-0 text-xs text-muted-foreground">{formatDate(m.startTime, { day: "numeric", month: "short" })}</div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">vs {m.opponentName}</div>
                        <div className="truncate text-xs text-muted-foreground tabular">
                          {m.ourScore ?? "–"} · {m.opponentScore ?? "–"}
                        </div>
                      </div>
                      <OutcomeBadge outcome={m.outcome} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Button asChild variant="link" className="mt-2 px-0">
              <Link href="/matches">
                All matches <ArrowRight />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-xl tracking-wide">Top performers · {formatMonth(month)}</CardTitle>
          </CardHeader>
          <CardContent>
            {top.length === 0 ? (
              <EmptyState title="No matches played this month yet" />
            ) : (
              <ol className="space-y-2">
                {top.map((p, i) => (
                  <li key={p.playerId}>
                    <Link href={`/players/${p.playerId}`} className="flex items-center gap-3 rounded-lg p-1.5 hover:bg-muted/40">
                      <span className="w-6 text-center font-heading text-2xl font-bold text-primary">{i + 1}</span>
                      <PlayerAvatar name={p.name} photo={p.photo} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground tabular">
                          {p.runs} runs · {p.wickets} wkts · {p.catches} ct
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-heading text-xl font-bold tabular">{p.mvp}</div>
                        <div className="text-[10px] text-muted-foreground uppercase">MVP pts</div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
            <Button asChild variant="link" className="mt-2 px-0">
              <Link href="/leaderboard?period=month">
                Full leaderboard <ArrowRight />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {due > 0 && (
        <p className="text-sm text-muted-foreground">
          Team members owe <Money value={due} className="font-semibold text-destructive" /> in match fees and collections.
        </p>
      )}
    </div>
  );
}
