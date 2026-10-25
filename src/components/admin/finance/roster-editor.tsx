"use client";

import { CheckCheck, Loader2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ChargeStatusBadge, PlayerAvatar } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { rupees } from "@/lib/format";
import { cn } from "@/lib/utils";
import { markAllPaidForMatch, setMatchPlayer } from "@/modules/finance/actions";
import { useAction } from "../use-action";
import { ChargeActions, ChargeAmountInput, type ChargeLite } from "./charge-controls";
import { PaymentOptions, usePaymentOptions, type HolderOption } from "./payment-options";

export type RosterRow = {
  playerId: string;
  name: string;
  photo: string | null;
  isMember: boolean;
  played: boolean;
  source: string;
  charge: ChargeLite | null;
};

export function RosterEditor({
  matchId,
  chargeable,
  rows,
  otherPlayers,
  holders,
  today,
}: {
  matchId: string;
  chargeable: boolean;
  rows: RosterRow[];
  otherPlayers: { id: string; name: string; isMember: boolean }[];
  holders: HolderOption[];
  today: string;
}) {
  const charges = rows.map((r) => r.charge).filter((c): c is ChargeLite => c !== null);
  const total = {
    charged: charges.filter((c) => !c.waived).reduce((s, c) => s + c.amount, 0),
    paid: charges.reduce((s, c) => s + c.paid, 0),
    due: charges.reduce((s, c) => s + c.due, 0),
  };

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle className="font-heading text-2xl tracking-wide">Players &amp; fees</CardTitle>
        <div className="flex flex-wrap gap-2">
          <AddPlayer matchId={matchId} otherPlayers={otherPlayers} />
          {total.due > 0 && <MarkAllPaid matchId={matchId} due={total.due} holders={holders} today={today} />}
        </div>
      </CardHeader>
      <CardContent className="grid gap-2">
        {!chargeable && (
          <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            This match is not charged, so no fees are created. Turn on &ldquo;Charge match fee&rdquo; above to charge the
            members who played.
          </p>
        )}
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No players recorded for this match yet. CricHeroes had no scorecard, so add the players who played.
          </p>
        )}
        <ul className="grid gap-2">
          {rows.map((r) => (
            <RosterItem key={r.playerId} matchId={matchId} row={r} holders={holders} today={today} />
          ))}
        </ul>
        {charges.length > 0 && (
          <div className="mt-2 flex flex-wrap justify-end gap-x-6 gap-y-1 border-t pt-3 text-sm">
            <span>
              Charged <b className="tabular">{rupees(total.charged)}</b>
            </span>
            <span className="text-success">
              Paid <b className="tabular">{rupees(total.paid)}</b>
            </span>
            <span className={cn(total.due > 0 && "text-destructive")}>
              Due <b className="tabular">{rupees(total.due)}</b>
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RosterItem({ matchId, row, holders, today }: { matchId: string; row: RosterRow; holders: HolderOption[]; today: string }) {
  const { run, pending } = useAction();
  const switchId = `played-${row.playerId}`;
  return (
    <li
      className={cn(
        "grid gap-3 rounded-lg border p-3 md:grid-cols-[minmax(0,1.4fr)_auto_auto_minmax(0,2fr)] md:items-center",
        !row.played && "bg-muted/50",
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <PlayerAvatar name={row.name} photo={row.photo} />
        <div className="min-w-0">
          <div className="truncate font-semibold">{row.name}</div>
          <div className="flex flex-wrap gap-1">
            {!row.isMember && <Badge variant="outline">Guest</Badge>}
            {row.source === "admin" && <Badge variant="secondary">Added by admin</Badge>}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id={switchId}
          checked={row.played}
          disabled={pending}
          onCheckedChange={(played) =>
            run(() => setMatchPlayer({ matchId, playerId: row.playerId, played }), played ? `${row.name}: played` : `${row.name}: did not play`)
          }
        />
        <Label htmlFor={switchId} className="text-sm">
          {pending ? <Loader2 className="size-4 animate-spin" /> : row.played ? "Played" : "Did not play"}
        </Label>
      </div>

      <div className="flex items-center gap-2">
        {row.charge ? (
          <>
            <ChargeAmountInput key={row.charge.amount} charge={row.charge} label={`Fee for ${row.name}`} />
            <ChargeStatusBadge status={row.charge.status} />
          </>
        ) : !row.isMember && row.played ? (
          <span className="text-xs text-muted-foreground">
            Not charged (guest).{" "}
            <Link href="/admin/players" className="underline underline-offset-2">
              Make member
            </Link>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">No fee</span>
        )}
      </div>

      <div className="md:justify-self-end">
        {row.charge && <ChargeActions charge={row.charge} holders={holders} today={today} />}
      </div>
    </li>
  );
}

function AddPlayer({ matchId, otherPlayers }: { matchId: string; otherPlayers: { id: string; name: string; isMember: boolean }[] }) {
  const [playerId, setPlayerId] = useState<string>("");
  const { run, pending } = useAction();
  if (otherPlayers.length === 0) return null;
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="add-player" className="sr-only">
        Add a player who played
      </Label>
      <Select value={playerId} onValueChange={setPlayerId}>
        <SelectTrigger id="add-player" className="h-10 w-48">
          <SelectValue placeholder="Add player who played" />
        </SelectTrigger>
        <SelectContent>
          {otherPlayers.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
              {!p.isMember && " (guest)"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        className="h-10"
        disabled={!playerId || pending}
        onClick={() => run(() => setMatchPlayer({ matchId, playerId, played: true }), "Player added", () => setPlayerId(""))}
      >
        {pending ? <Loader2 className="animate-spin" /> : <UserPlus />} Add
      </Button>
    </div>
  );
}

function MarkAllPaid({ matchId, due, holders, today }: { matchId: string; due: number; holders: HolderOption[]; today: string }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = usePaymentOptions(holders, today);
  const { run, pending } = useAction();
  return (
    <>
      <Button className="h-10" onClick={() => setOpen(true)}>
        <CheckCheck /> Mark all paid
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark everyone paid</DialogTitle>
            <DialogDescription>Records {rupees(due)} received for every unpaid fee in this match.</DialogDescription>
          </DialogHeader>
          <PaymentOptions idPrefix="pay-all" holders={holders} value={opts} onChange={setOpts} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                run(() => markAllPaidForMatch({ matchId, ...opts }), "All fees for this match marked paid", () => setOpen(false))
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : <CheckCheck />} Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
