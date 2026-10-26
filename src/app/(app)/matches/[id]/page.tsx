import { ExternalLink, MapPin, Trophy } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChargeStatusBadge, EmptyState, OutcomeBadge, PlayerAvatar } from "@/components/shared";
import { UUID_RE } from "@/components/public/search-params";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db";
import { formatDateTime } from "@/lib/dates";
import { ballsToOvers, economy, rupees, strikeRate } from "@/lib/format";
import { cricheroesMatchUrl } from "@/modules/cricheroes/urls";
import { getChargeRows } from "@/modules/finance/queries";
import { cricheroesTeam, getSettings } from "@/modules/settings/settings";
import { getMatchDetail } from "@/modules/stats/queries";

export async function generateMetadata(props: PageProps<"/matches/[id]">) {
  const { id } = await props.params;
  if (!UUID_RE.test(id)) return { title: "Match" };
  const detail = await getMatchDetail(getDb(), id);
  return { title: detail ? `vs ${detail.match.opponentName}` : "Match" };
}

export default async function MatchDetailPage(props: PageProps<"/matches/[id]">) {
  const { id } = await props.params;
  if (!UUID_RE.test(id)) notFound();
  const db = getDb();
  const detail = await getMatchDetail(db, id);
  if (!detail) notFound();
  const { match, roster } = detail;

  const [settings, charges] = await Promise.all([getSettings(db), getChargeRows(db, { matchId: id })]);
  const { team_name: teamName, public_show_balances: showBalances } = settings;
  const cricheroesOrigin = cricheroesTeam(settings).origin;

  const xi = roster.filter((r) => r.played);
  const pom = match.pomCricheroesPlayerId ? roster.find((r) => r.cricheroesPlayerId === match.pomCricheroesPlayerId) : undefined;
  const batters = xi.filter((r) => r.stats?.batted).sort((a, b) => (b.stats?.runs ?? 0) - (a.stats?.runs ?? 0));
  const bowlers = xi.filter((r) => (r.stats?.ballsBowled ?? 0) > 0).sort((a, b) => (b.stats?.wickets ?? 0) - (a.stats?.wickets ?? 0));
  const didNotBat = xi.filter((r) => !r.stats?.batted);
  const live = charges.filter((c) => !c.waived);

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <OutcomeBadge outcome={match.outcome} startTime={match.startTime} />
          <Badge variant="secondary">{match.kind === "tournament" ? (match.tournamentName ?? "Tournament") : "Individual match"}</Badge>
          {match.overs && <Badge variant="outline">{match.overs} overs</Badge>}
          {match.ballType && <Badge variant="outline">{match.ballType.toLowerCase()} ball</Badge>}
        </div>
        <h1 className="font-heading text-3xl font-bold tracking-wide text-balance sm:text-4xl">
          {teamName} vs {match.opponentName}
        </h1>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>{formatDateTime(match.startTime)}</span>
          {match.ground && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-4" />
              {[match.ground, match.city].filter(Boolean).join(", ")}
            </span>
          )}
        </div>
        {match.status === "past" && (
          <div className="grid grid-cols-2 gap-3">
            <Card className="py-3">
              <CardContent className="px-4">
                <div className="truncate text-xs text-muted-foreground uppercase">{teamName}</div>
                <div className="font-heading text-3xl font-bold tabular">{match.ourScore ?? "–"}</div>
              </CardContent>
            </Card>
            <Card className="py-3">
              <CardContent className="flex items-center gap-2 px-4">
                <div className="min-w-0">
                  <div className="truncate text-xs text-muted-foreground uppercase">{match.opponentName}</div>
                  <div className="font-heading text-3xl font-bold tabular">{match.opponentScore ?? "–"}</div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
        {match.resultText && <p className="font-medium">{match.resultText}</p>}
        <div className="flex flex-wrap gap-2">
          {pom && (
            <Link href={`/players/${pom.playerId}`} className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm hover:bg-muted/50">
              <Trophy className="size-4 text-warning" />
              Player of the match: <span className="font-semibold">{pom.name}</span>
            </Link>
          )}
          {match.cricheroesMatchId && (
            <Button asChild variant="outline" size="sm">
              <a href={cricheroesMatchUrl(cricheroesOrigin, match.cricheroesMatchId)} target="_blank" rel="noreferrer">
                Full scorecard on CricHeroes <ExternalLink />
              </a>
            </Button>
          )}
        </div>
      </section>

      {xi.length === 0 ? (
        <EmptyState title={match.status === "past" ? "No playing XI recorded" : "Not played yet"}>
          {match.status === "past" ? "CricHeroes had no scorecard for this match. An admin can add the players." : "The playing XI appears after the match is scored."}
        </EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-xl tracking-wide">Batting</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Batter</TableHead>
                    <TableHead className="text-right">R</TableHead>
                    <TableHead className="text-right">B</TableHead>
                    <TableHead className="text-right">4s</TableHead>
                    <TableHead className="text-right">6s</TableHead>
                    <TableHead className="text-right">SR</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batters.map((r) => (
                    <TableRow key={r.playerId}>
                      <TableCell>
                        <Link href={`/players/${r.playerId}`} className="font-medium hover:underline">
                          {r.name}
                        </Link>
                        <div className="max-w-48 truncate text-xs text-muted-foreground">{r.stats?.isOut ? r.stats.dismissal : "not out"}</div>
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular">{r.stats?.runs}</TableCell>
                      <TableCell className="text-right tabular">{r.stats?.ballsFaced}</TableCell>
                      <TableCell className="text-right tabular">{r.stats?.fours}</TableCell>
                      <TableCell className="text-right tabular">{r.stats?.sixes}</TableCell>
                      <TableCell className="text-right tabular">{strikeRate(r.stats?.runs ?? 0, r.stats?.ballsFaced ?? 0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {didNotBat.length > 0 && (
                <p className="mt-3 text-xs text-muted-foreground">Did not bat: {didNotBat.map((r) => r.name).join(", ")}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-xl tracking-wide">Bowling & fielding</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {bowlers.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bowler</TableHead>
                      <TableHead className="text-right">O</TableHead>
                      <TableHead className="text-right">M</TableHead>
                      <TableHead className="text-right">R</TableHead>
                      <TableHead className="text-right">W</TableHead>
                      <TableHead className="text-right">Econ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bowlers.map((r) => (
                      <TableRow key={r.playerId}>
                        <TableCell>
                          <Link href={`/players/${r.playerId}`} className="font-medium hover:underline">
                            {r.name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right tabular">{ballsToOvers(r.stats?.ballsBowled ?? 0)}</TableCell>
                        <TableCell className="text-right tabular">{r.stats?.maidens}</TableCell>
                        <TableCell className="text-right tabular">{r.stats?.runsConceded}</TableCell>
                        <TableCell className="text-right font-semibold tabular">{r.stats?.wickets}</TableCell>
                        <TableCell className="text-right tabular">{economy(r.stats?.runsConceded ?? 0, r.stats?.ballsBowled ?? 0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <div>
                <h3 className="mb-2 text-sm font-semibold">MVP points this match</h3>
                <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {[...xi]
                    .sort((a, b) => b.mvp - a.mvp)
                    .map((r) => (
                      <li key={r.playerId} className="flex items-center gap-2 text-sm">
                        <PlayerAvatar name={r.name} photo={r.photo} size="sm" />
                        <span className="min-w-0 flex-1 truncate">
                          {r.name}
                          {!r.isMember && <span className="ml-1 text-xs text-muted-foreground">(guest)</span>}
                        </span>
                        <span className="text-xs text-muted-foreground tabular">
                          {(r.stats?.catches ?? 0) + (r.stats?.stumpings ?? 0) + (r.stats?.runOuts ?? 0) > 0
                            ? `${r.stats?.catches ?? 0}ct ${r.stats?.stumpings ?? 0}st ${r.stats?.runOuts ?? 0}ro`
                            : ""}
                        </span>
                        <span className="w-8 text-right font-semibold tabular">{r.mvp}</span>
                      </li>
                    ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-xl tracking-wide">Match fees</CardTitle>
        </CardHeader>
        <CardContent>
          {match.status !== "past" ? (
            <p className="text-sm text-muted-foreground">Fees are charged after the match is played.</p>
          ) : !match.chargeable ? (
            <p className="text-sm text-muted-foreground">
              No match fee for this match{match.kind === "tournament" ? " (tournament matches are collected separately)" : ""}.
            </p>
          ) : !showBalances ? (
            <p className="text-sm text-muted-foreground">
              {rupees(match.feePerPlayer)} per player · {live.length} players · {rupees(live.reduce((s, c) => s + c.paid, 0))} collected of{" "}
              {rupees(live.reduce((s, c) => s + c.amount, 0))}
            </p>
          ) : charges.length === 0 ? (
            <p className="text-sm text-muted-foreground">No fees charged for this match.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Player</TableHead>
                  <TableHead className="text-right">Fee</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {charges.map((c) => (
                  <TableRow key={c.chargeId}>
                    <TableCell>
                      <Link href={`/players/${c.playerId}`} className="flex items-center gap-2 hover:underline">
                        <PlayerAvatar name={c.playerName} photo={c.playerPhoto} size="sm" />
                        <span className="font-medium">{c.playerName}</span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular">{rupees(c.amount)}</TableCell>
                    <TableCell className="text-right tabular">{rupees(c.paid)}</TableCell>
                    <TableCell className="text-right">
                      <ChargeStatusBadge status={c.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell>Total ({live.length} players)</TableCell>
                  <TableCell className="text-right tabular">{rupees(live.reduce((s, c) => s + c.amount, 0))}</TableCell>
                  <TableCell className="text-right tabular">{rupees(charges.reduce((s, c) => s + c.paid, 0))}</TableCell>
                  <TableCell className="text-right tabular text-destructive">{rupees(charges.reduce((s, c) => s + c.due, 0))} due</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
