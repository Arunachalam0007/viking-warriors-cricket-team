import Link from "next/link";
import { EmptyState, PageHeader, PlayerAvatar } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getDb } from "@/db";
import { listPlayers, playerPhoto } from "@/modules/players/queries";
import { getPlayerStats, type PlayerStats } from "@/modules/stats/queries";

export const metadata = { title: "Players" };

export default async function PlayersPage() {
  const db = getDb();
  const [all, stats] = await Promise.all([listPlayers(db), getPlayerStats(db)]);
  const byId = new Map(stats.map((s) => [s.playerId, s]));

  const members = all.filter((p) => p.isMember);
  // Guests are only listed once they have played for us
  const guests = all.filter((p) => !p.isMember && byId.has(p.id));

  return (
    <div className="space-y-8">
      <PageHeader title="Players" description={`${members.length} squad members. Tap a player to see their profile, stats and match fees.`} />

      {members.length === 0 ? (
        <EmptyState title="No players yet">The squad is imported from CricHeroes by the nightly sync.</EmptyState>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {members.map((p) => (
            <li key={p.id}>
              <PlayerCard
                id={p.id}
                name={p.name}
                photo={playerPhoto(p)}
                role={[p.battingStyle, p.bowlingStyle].filter(Boolean).join(" · ")}
                captain={p.isCaptain}
                inactive={!p.isActive}
                stats={byId.get(p.id)}
              />
            </li>
          ))}
        </ul>
      )}

      {guests.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-heading text-2xl font-bold tracking-wide">Guest players</h2>
          <p className="text-sm text-muted-foreground">Played for us but are not in the squad. Guests are not charged match fees.</p>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {guests.map((p) => {
              const s = byId.get(p.id);
              return (
                <li key={p.id}>
                  <Link href={`/players/${p.id}`} className="flex items-center gap-3 rounded-lg border p-2.5 hover:bg-muted/40">
                    <PlayerAvatar name={p.name} photo={playerPhoto(p)} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground tabular">
                        {s?.matches ?? 0} matches · {s?.runs ?? 0} runs · {s?.wickets ?? 0} wkts
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function PlayerCard({
  id,
  name,
  photo,
  role,
  captain,
  inactive,
  stats,
}: {
  id: string;
  name: string;
  photo: string | null;
  role: string;
  captain: boolean;
  inactive: boolean;
  stats: PlayerStats | undefined;
}) {
  return (
    <Link href={`/players/${id}`} className="group block h-full rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
      <Card className="h-full gap-0 py-0 transition-shadow group-hover:shadow-md">
        <CardContent className="flex h-full flex-col items-center gap-2 px-3 py-4 text-center">
          <PlayerAvatar name={name} photo={photo} className="size-20 sm:size-24" />
          <div className="min-w-0">
            <div className="truncate font-heading text-lg font-bold">{name}</div>
            {role && <div className="line-clamp-2 text-xs text-muted-foreground">{role}</div>}
          </div>
          <div className="flex flex-wrap justify-center gap-1">
            {captain && <Badge>Captain</Badge>}
            {inactive && <Badge variant="outline">Inactive</Badge>}
          </div>
          <dl className="mt-auto grid w-full grid-cols-3 border-t pt-2 text-center">
            <div>
              <dt className="text-[10px] text-muted-foreground uppercase">Mat</dt>
              <dd className="font-semibold tabular">{stats?.matches ?? 0}</dd>
            </div>
            <div>
              <dt className="text-[10px] text-muted-foreground uppercase">Runs</dt>
              <dd className="font-semibold tabular">{stats?.runs ?? 0}</dd>
            </div>
            <div>
              <dt className="text-[10px] text-muted-foreground uppercase">Wkts</dt>
              <dd className="font-semibold tabular">{stats?.wickets ?? 0}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </Link>
  );
}
