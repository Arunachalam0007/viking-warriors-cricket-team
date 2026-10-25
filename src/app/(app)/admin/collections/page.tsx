import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { COLLECTION_KIND_LABELS, NewCollectionForm } from "@/components/admin/finance/collection-forms";
import { EmptyState, PageHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { formatDate, todayIst } from "@/lib/dates";
import { rupees } from "@/lib/format";
import { cn } from "@/lib/utils";
import { listCollections } from "@/modules/admin/queries";
import { getChargeRows } from "@/modules/finance/queries";
import { listPlayers } from "@/modules/players/queries";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Collections" };

export default async function CollectionsPage() {
  // Layouts and pages render in parallel, so each admin page must check on its own.
  await requireAdmin();
  const db = getDb();
  const [collections, rows, players] = await Promise.all([
    listCollections(db),
    getChargeRows(db, { kind: "collection" }),
    listPlayers(db),
  ]);

  const totals = new Map<string, { players: number; charged: number; paid: number; due: number }>();
  for (const r of rows) {
    if (!r.collectionId) continue;
    const t = totals.get(r.collectionId) ?? { players: 0, charged: 0, paid: 0, due: 0 };
    t.players++;
    if (!r.waived) t.charged += r.amount;
    t.paid += r.paid;
    t.due += r.due;
    totals.set(r.collectionId, t);
  }

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Collections"
        description="Money collected outside match fees: tournament shares, monthly fees, special match splits."
      />

      {collections.length === 0 ? (
        <EmptyState title="No collections yet">Create one below, for example a tournament entry split.</EmptyState>
      ) : (
        <ul className="grid gap-2">
          {collections.map((c) => {
            const t = totals.get(c.id) ?? { players: 0, charged: 0, paid: 0, due: 0 };
            return (
              <li key={c.id}>
                <Link
                  href={`/admin/collections/${c.id}`}
                  className="grid gap-2 rounded-lg border bg-card p-4 transition-colors hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold">{c.title}</span>
                      <Badge variant="secondary">{COLLECTION_KIND_LABELS[c.kind as keyof typeof COLLECTION_KIND_LABELS] ?? c.kind}</Badge>
                    </div>
                    <div className="mt-0.5 text-sm text-muted-foreground">
                      Due {formatDate(c.dueOn)} · {rupees(c.defaultAmount)} × {t.players} players
                    </div>
                  </div>
                  <div className="flex gap-4 text-sm tabular">
                    <span>
                      <span className="text-muted-foreground">Charged </span>
                      {rupees(t.charged)}
                    </span>
                    <span className="text-success">
                      <span className="text-muted-foreground">Paid </span>
                      {rupees(t.paid)}
                    </span>
                    <span className={cn(t.due > 0 && "font-semibold text-destructive")}>
                      <span className="font-normal text-muted-foreground">Due </span>
                      {rupees(t.due)}
                    </span>
                  </div>
                  <ChevronRight className="hidden size-5 text-muted-foreground sm:block" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-2xl tracking-wide">New collection</CardTitle>
          <CardDescription>
            Every selected player is charged the amount. You can change individual amounts or the player list afterwards.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewCollectionForm
            players={players.map((p) => ({ id: p.id, name: p.name, isMember: p.isMember, isActive: p.isActive }))}
            today={todayIst()}
          />
        </CardContent>
      </Card>
    </div>
  );
}
