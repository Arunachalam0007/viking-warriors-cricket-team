import { ArrowLeft, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { MatchSettingsForm } from "@/components/admin/finance/match-settings-form";
import { RosterEditor, type RosterRow } from "@/components/admin/finance/roster-editor";
import { OutcomeBadge, PageHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { formatDateTime, todayIst } from "@/lib/dates";
import { listCashHolders } from "@/modules/admin/queries";
import { cricheroesMatchUrl } from "@/modules/cricheroes/urls";
import { cricheroesTeam, getSettings } from "@/modules/settings/settings";
import { getChargeRows } from "@/modules/finance/queries";
import { listPlayers } from "@/modules/players/queries";
import { getMatchDetail } from "@/modules/stats/queries";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Edit match fees" };

export default async function MatchFeesPage({ params }: PageProps<"/admin/fees/[matchId]">) {
  // Layouts and pages render in parallel, so each admin page must check on its own.
  await requireAdmin();
  const { matchId } = await params;
  if (!z.uuid().safeParse(matchId).success) notFound();

  const db = getDb();
  const detail = await getMatchDetail(db, matchId);
  if (!detail) notFound();
  const { match, roster } = detail;

  const [charges, holders, allPlayers, settings] = await Promise.all([
    getChargeRows(db, { matchId, kind: "match_fee" }),
    listCashHolders(db),
    listPlayers(db),
    getSettings(db),
  ]);
  const cricheroesOrigin = cricheroesTeam(settings).origin;
  const chargeByPlayer = new Map(charges.map((c) => [c.playerId, c]));

  const rows: RosterRow[] = roster
    .map((r) => {
      const c = chargeByPlayer.get(r.playerId);
      return {
        playerId: r.playerId,
        name: r.name,
        photo: r.photo,
        isMember: r.isMember,
        played: r.played,
        source: r.source,
        charge: c
          ? { chargeId: c.chargeId, amount: c.amount, paid: c.paid, due: c.due, waived: c.waived, status: c.status, description: c.description, playerName: c.playerName }
          : null,
      };
    })
    // Members who played first, then guests, then players marked as not played
    .sort((a, b) => Number(b.played) - Number(a.played) || Number(b.isMember) - Number(a.isMember) || a.name.localeCompare(b.name));

  // Charges for players no longer in the roster (kept because they were paid or edited)
  const rosterIds = new Set(roster.map((r) => r.playerId));
  const orphanCharges = charges.filter((c) => !rosterIds.has(c.playerId));

  for (const c of orphanCharges) {
    rows.push({
      playerId: c.playerId,
      name: c.playerName,
      photo: c.playerPhoto,
      isMember: c.isMember,
      played: false,
      source: "cricheroes",
      charge: { chargeId: c.chargeId, amount: c.amount, paid: c.paid, due: c.due, waived: c.waived, status: c.status, description: c.description, playerName: c.playerName },
    });
  }

  const otherPlayers = allPlayers
    .filter((p) => !rosterIds.has(p.id) && p.isActive)
    .map((p) => ({ id: p.id, name: p.name, isMember: p.isMember }));

  return (
    <div className="grid gap-5">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link href="/admin/fees">
          <ArrowLeft /> All matches
        </Link>
      </Button>

      <PageHeader
        title={`vs ${match.opponentName}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>{formatDateTime(match.startTime)}</span>
            {match.ground && <span>· {match.ground}</span>}
            <OutcomeBadge outcome={match.outcome} startTime={match.startTime} />
            <Badge variant="secondary" className="capitalize">
              {match.kind}
            </Badge>
            {match.tournamentName && <Badge variant="outline">{match.tournamentName}</Badge>}
          </span>
        }
        actions={
          match.cricheroesMatchId ? (
            <Button asChild variant="outline" size="sm">
              <a href={cricheroesMatchUrl(cricheroesOrigin, match.cricheroesMatchId)} target="_blank" rel="noreferrer">
                CricHeroes <ExternalLink />
              </a>
            </Button>
          ) : null
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-2xl tracking-wide">Fee settings</CardTitle>
        </CardHeader>
        <CardContent>
          <MatchSettingsForm
            match={{
              id: match.id,
              chargeable: match.chargeable,
              feePerPlayer: match.feePerPlayer,
              kind: match.kind,
              notes: match.notes,
              financeLocked: match.financeLocked,
            }}
          />
        </CardContent>
      </Card>

      <RosterEditor
        matchId={match.id}
        chargeable={match.chargeable}
        rows={rows}
        otherPlayers={otherPlayers}
        holders={holders.filter((h) => h.isActive).map((h) => ({ id: h.id, name: h.name, isDefault: h.isDefault }))}
        today={todayIst()}
      />

    </div>
  );
}
