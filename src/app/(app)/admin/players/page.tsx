import type { Metadata } from "next";
import { PlayersManager, type ManagedPlayer } from "@/components/admin/ops/players-manager";
import { PageHeader } from "@/components/shared";
import { getDb } from "@/db";
import { listPlayers, playerPhoto } from "@/modules/players/queries";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Manage players" };

export default async function ManagePlayersPage() {
  // Layouts and pages render in parallel, so each admin page must check on its own.
  await requireAdmin();
  const rows = await listPlayers(getDb());
  const players: ManagedPlayer[] = rows.map((p) => ({
    id: p.id,
    name: p.name,
    chName: p.chName,
    photo: playerPhoto(p),
    hasCustomPhoto: Boolean(p.photoUrl),
    hasChPhoto: Boolean(p.chPhotoUrl),
    phone: p.phone,
    isMember: p.isMember,
    isActive: p.isActive,
    isCaptain: p.isCaptain,
    nameLocked: p.nameLocked,
    notes: p.notes,
    cricheroesPlayerId: p.cricheroesPlayerId,
  }));

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Manage players"
        description="Names and photos come from CricHeroes every night. Edit a player to change their name, photo, phone or member status."
      />
      <PlayersManager players={players} />
    </div>
  );
}
