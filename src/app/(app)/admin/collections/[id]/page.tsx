import { eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ChargeActions, ChargeAmountInput } from "@/components/admin/finance/charge-controls";
import {
  COLLECTION_KIND_LABELS,
  CollectionPlayersEditor,
  DeleteCollectionButton,
} from "@/components/admin/finance/collection-forms";
import { ChargeStatusBadge, EmptyState, PageHeader, PlayerAvatar, StatTile } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { collections } from "@/db/schema";
import { formatDate, todayIst } from "@/lib/dates";
import { rupees } from "@/lib/format";
import { listCashHolders } from "@/modules/admin/queries";
import { getChargeRows } from "@/modules/finance/queries";
import { listPlayers } from "@/modules/players/queries";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Collection" };

export default async function CollectionPage({ params }: PageProps<"/admin/collections/[id]">) {
  // Layouts and pages render in parallel, so each admin page must check on its own.
  await requireAdmin();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const db = getDb();
  const [collection] = await db.select().from(collections).where(eq(collections.id, id));
  if (!collection) notFound();

  const [rows, holders, players] = await Promise.all([
    getChargeRows(db, { kind: "collection" }).then((all) => all.filter((r) => r.collectionId === id)),
    listCashHolders(db),
    listPlayers(db),
  ]);
  rows.sort((a, b) => a.playerName.localeCompare(b.playerName));
  const holderOptions = holders.filter((h) => h.isActive).map((h) => ({ id: h.id, name: h.name, isDefault: h.isDefault }));
  const today = todayIst();
  const charged = rows.filter((r) => !r.waived).reduce((s, r) => s + r.amount, 0);
  const paid = rows.reduce((s, r) => s + r.paid, 0);
  const due = rows.reduce((s, r) => s + r.due, 0);

  return (
    <div className="grid gap-5">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link href="/admin/collections">
          <ArrowLeft /> All collections
        </Link>
      </Button>

      <PageHeader
        title={collection.title}
        description={
          <>
            {COLLECTION_KIND_LABELS[collection.kind as keyof typeof COLLECTION_KIND_LABELS] ?? collection.kind} · due{" "}
            {formatDate(collection.dueOn)} · {rupees(collection.defaultAmount)} per player
            {collection.description && <span className="block">{collection.description}</span>}
          </>
        }
        actions={<DeleteCollectionButton collectionId={collection.id} title={collection.title} />}
      />

      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Charged" value={rupees(charged)} />
        <StatTile label="Collected" value={rupees(paid)} tone="good" />
        <StatTile label="Due" value={rupees(due)} tone={due > 0 ? "bad" : undefined} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-2xl tracking-wide">Players</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState title="No players in this collection">Add players below.</EmptyState>
          ) : (
            <ul className="grid gap-2">
              {rows.map((r) => (
                <li
                  key={r.chargeId}
                  className="grid gap-3 rounded-lg border p-3 md:grid-cols-[minmax(0,1.4fr)_auto_minmax(0,2fr)] md:items-center"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <PlayerAvatar name={r.playerName} photo={r.playerPhoto} />
                    <span className="truncate font-semibold">{r.playerName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ChargeAmountInput key={r.amount} charge={r} label={`Amount for ${r.playerName}`} />
                    <ChargeStatusBadge status={r.status} />
                  </div>
                  <div className="md:justify-self-end">
                    <ChargeActions charge={r} holders={holderOptions} today={today} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-2xl tracking-wide">Edit player list</CardTitle>
        </CardHeader>
        <CardContent>
          <CollectionPlayersEditor
            collectionId={collection.id}
            players={players.map((p) => ({ id: p.id, name: p.name, isMember: p.isMember, isActive: p.isActive }))}
            initial={rows.map((r) => r.playerId)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
