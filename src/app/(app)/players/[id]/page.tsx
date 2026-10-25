import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChargeStatusBadge, EmptyState, Money, OutcomeBadge, PlayerAvatar, StatTile } from "@/components/shared";
import { UUID_RE } from "@/components/public/search-params";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db";
import { formatDate } from "@/lib/dates";
import { average, ballsToOvers, economy, rupees, strikeRate } from "@/lib/format";
import { cricheroesPlayerUrl } from "@/modules/cricheroes/client";
import { getChargeRows, getPlayerBalances } from "@/modules/finance/queries";
import { getPlayer, playerPhoto } from "@/modules/players/queries";
import { getSetting } from "@/modules/settings/settings";
import { mvpPoints } from "@/modules/stats/mvp";
import { getPlayerMatchLog, getPlayerStats } from "@/modules/stats/queries";

export async function generateMetadata(props: PageProps<"/players/[id]">) {
  const { id } = await props.params;
  if (!UUID_RE.test(id)) return { title: "Player" };
  const player = await getPlayer(getDb(), id);
  return { title: player?.name ?? "Player" };
}

export default async function PlayerProfilePage(props: PageProps<"/players/[id]">) {
  const { id } = await props.params;
  if (!UUID_RE.test(id)) notFound();
  const db = getDb();
  const player = await getPlayer(db, id);
  if (!player) notFound();

  const [[stats], log, showBalances] = await Promise.all([
    getPlayerStats(db, {}, id),
    getPlayerMatchLog(db, id, 20),
    getSetting("public_show_balances", db),
  ]);
  const [balances, charges] = showBalances
    ? await Promise.all([getPlayerBalances(db), getChargeRows(db, { playerId: id })])
    : [[], []];
  const balance = balances.find((b) => b.playerId === id);
  const role = [player.battingStyle, player.bowlingStyle].filter(Boolean).join(" · ");

  return (
    <div className="space-y-6">
      <section className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-end sm:text-left">
        <PlayerAvatar name={player.name} photo={playerPhoto(player)} className="size-28 sm:size-32" />
        <div className="min-w-0 flex-1 space-y-2">
          <h1 className="font-heading text-4xl font-bold tracking-wide text-balance">{player.name}</h1>
          {role && <p className="text-muted-foreground">{role}</p>}
          <div className="flex flex-wrap justify-center gap-1.5 sm:justify-start">
            {player.isCaptain && <Badge>Captain</Badge>}
            <Badge variant="outline">{player.isMember ? "Squad member" : "Guest player"}</Badge>
            {!player.isActive && <Badge variant="outline">Inactive</Badge>}
          </div>
        </div>
        {player.cricheroesPlayerId && (
          <Button asChild variant="outline">
            <a href={cricheroesPlayerUrl(player.cricheroesPlayerId)} target="_blank" rel="noreferrer">
              CricHeroes profile <ExternalLink />
            </a>
          </Button>
        )}
      </section>

      {!stats ? (
        <EmptyState title="No matches recorded yet">Stats appear once this player features in a synced scorecard.</EmptyState>
      ) : (
        <>
          <section aria-label="Summary" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Matches" value={stats.matches} />
            <StatTile label="Runs" value={stats.runs} />
            <StatTile label="Wickets" value={stats.wickets} />
            <StatTile label="MVP points" value={stats.mvp} />
          </section>

          <div className="grid gap-4 md:grid-cols-3">
            <StatsCard
              title="Batting"
              rows={[
                ["Innings", stats.innings],
                ["Runs", stats.runs],
                ["Average", average(stats.runs, stats.outs)],
                ["Strike rate", strikeRate(stats.runs, stats.balls)],
                ["Highest", stats.innings ? `${stats.highest}${stats.highestNotOut ? "*" : ""}` : "–"],
                ["50s / 100s", `${stats.fifties} / ${stats.hundreds}`],
                ["4s / 6s", `${stats.fours} / ${stats.sixes}`],
              ]}
            />
            <StatsCard
              title="Bowling"
              rows={[
                ["Overs", ballsToOvers(stats.ballsBowled)],
                ["Wickets", stats.wickets],
                ["Runs conceded", stats.runsConceded],
                ["Economy", economy(stats.runsConceded, stats.ballsBowled)],
                ["Best", stats.bestRuns < 0 ? "–" : `${stats.bestWickets}/${stats.bestRuns}`],
                ["Maidens", stats.maidens],
              ]}
            />
            <StatsCard
              title="Fielding"
              rows={[
                ["Catches", stats.catches],
                ["Stumpings", stats.stumpings],
                ["Run outs", stats.runOuts],
              ]}
            />
          </div>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-xl tracking-wide">Recent matches</CardTitle>
        </CardHeader>
        <CardContent>
          {log.length === 0 ? (
            <EmptyState title="No matches yet" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Opponent</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead className="text-right">Batting</TableHead>
                  <TableHead className="text-right">Bowling</TableHead>
                  <TableHead className="text-right">MVP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {log.map((m) => (
                  <TableRow key={m.matchId}>
                    <TableCell className="whitespace-nowrap">{formatDate(m.startTime, { day: "numeric", month: "short" })}</TableCell>
                    <TableCell>
                      <Link href={`/matches/${m.matchId}`} className="font-medium hover:underline">
                        {m.opponent}
                      </Link>
                      {m.kind === "tournament" && <span className="ml-1 text-xs text-muted-foreground">(T)</span>}
                    </TableCell>
                    <TableCell>
                      <OutcomeBadge outcome={m.outcome} />
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {m.stats?.batted ? `${m.stats.runs}${m.stats.isOut ? "" : "*"} (${m.stats.ballsFaced})` : "–"}
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {m.stats && m.stats.ballsBowled > 0 ? `${m.stats.wickets}/${m.stats.runsConceded} (${ballsToOvers(m.stats.ballsBowled)})` : "–"}
                    </TableCell>
                    <TableCell className="text-right tabular">{m.stats ? mvpPoints(m.stats) : 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {showBalances && (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-xl tracking-wide">Match fees & dues</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-3 gap-2 text-center">
              <div>
                <dt className="text-xs text-muted-foreground uppercase">Charged</dt>
                <dd className="font-heading text-xl font-bold tabular">{rupees(balance?.charged ?? 0)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase">Paid</dt>
                <dd className="font-heading text-xl font-bold text-success tabular">{rupees(balance?.paid ?? 0)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase">Balance</dt>
                <dd className="font-heading text-xl font-bold">
                  {(balance?.balance ?? 0) === 0 ? "Settled" : <Money value={balance?.balance ?? 0} signed />}
                </dd>
              </div>
            </dl>
            {!player.isMember && <p className="text-sm text-muted-foreground">Guest players are not charged match fees.</p>}
            {charges.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>For</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {charges.map((c) => (
                    <TableRow key={c.chargeId}>
                      <TableCell className="whitespace-nowrap">{formatDate(c.chargeDate, { day: "numeric", month: "short" })}</TableCell>
                      <TableCell>
                        {c.matchId ? (
                          <Link href={`/matches/${c.matchId}`} className="hover:underline">
                            {c.description}
                          </Link>
                        ) : (
                          c.description
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular">{rupees(c.amount)}</TableCell>
                      <TableCell className="text-right">
                        <ChargeStatusBadge status={c.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatsCard({ title, rows }: { title: string; rows: [string, string | number][] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-xl tracking-wide">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="divide-y">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between py-1.5 text-sm">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-semibold tabular">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
