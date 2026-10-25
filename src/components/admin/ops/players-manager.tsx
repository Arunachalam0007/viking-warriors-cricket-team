"use client";

import { ImageUp, Loader2, Pencil, Plus, RotateCcw, Search } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useAction } from "@/components/admin/use-action";
import { EmptyState, PlayerAvatar } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { createPlayer, resetPlayerPhoto, updatePlayer, uploadPlayerPhoto } from "@/modules/players/actions";

export type ManagedPlayer = {
  id: string;
  name: string;
  chName: string | null;
  photo: string | null;
  hasCustomPhoto: boolean;
  hasChPhoto: boolean;
  phone: string | null;
  isMember: boolean;
  isActive: boolean;
  isCaptain: boolean;
  nameLocked: boolean;
  notes: string | null;
  cricheroesPlayerId: number | null;
};

type Filter = "all" | "members" | "guests" | "inactive";

export function PlayersManager({ players }: { players: ManagedPlayer[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("members");

  const counts = {
    all: players.length,
    members: players.filter((p) => p.isMember && p.isActive).length,
    guests: players.filter((p) => !p.isMember).length,
    inactive: players.filter((p) => !p.isActive).length,
  };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return players.filter((p) => {
      if (filter === "members" && !(p.isMember && p.isActive)) return false;
      if (filter === "guests" && p.isMember) return false;
      if (filter === "inactive" && p.isActive) return false;
      if (!q) return true;
      return [p.name, p.chName, p.phone].some((v) => v?.toLowerCase().includes(q));
    });
  }, [players, query, filter]);

  const chips: { key: Filter; label: string }[] = [
    { key: "members", label: "Members" },
    { key: "guests", label: "Guests" },
    { key: "inactive", label: "Inactive" },
    { key: "all", label: "All" },
  ];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <Label htmlFor="player-search" className="sr-only">
            Search players
          </Label>
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="player-search" placeholder="Search by name or phone" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8" />
        </div>
        <AddPlayerDialog />
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter players">
        {chips.map((c) => (
          <Button key={c.key} size="sm" variant={filter === c.key ? "default" : "outline"} aria-pressed={filter === c.key} onClick={() => setFilter(c.key)}>
            {c.label} <span className="tabular opacity-70">{counts[c.key]}</span>
          </Button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState title="No players match">Try another search or filter.</EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((p) => (
            <li key={p.id}>
              <Card className={cn("h-full py-4", !p.isActive && "opacity-70")}>
                <CardContent className="flex items-start gap-3 px-4">
                  <PlayerAvatar name={p.name} photo={p.photo} size="lg" className="size-12" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">{p.name}</div>
                        {p.chName && p.chName !== p.name && <div className="truncate text-xs text-muted-foreground">CricHeroes: {p.chName}</div>}
                      </div>
                      <EditPlayerDialog player={p} />
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground tabular">{p.phone ?? "No phone"}</div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Badge variant={p.isMember ? "default" : "outline"}>{p.isMember ? "Member" : "Guest"}</Badge>
                      {!p.isActive && <Badge variant="outline">Inactive</Badge>}
                      {p.isCaptain && <Badge variant="secondary">Captain</Badge>}
                      {!p.cricheroesPlayerId && <Badge variant="outline">Added by admin</Badge>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EditPlayerDialog({ player }: { player: ManagedPlayer }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: player.name, phone: player.phone ?? "", isMember: player.isMember, isActive: player.isActive, notes: player.notes ?? "" });
  const fileRef = useRef<HTMLInputElement>(null);
  const save = useAction();
  const photo = useAction();
  const p = `player-${player.id}`;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setV({ name: player.name, phone: player.phone ?? "", isMember: player.isMember, isActive: player.isActive, notes: player.notes ?? "" });
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${player.name}`}>
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit {player.name}</DialogTitle>
          <DialogDescription>Phone numbers are only visible to admins.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3">
          <PlayerAvatar name={player.name} photo={player.photo} size="lg" className="size-16" />
          <div className="grid gap-2">
            <input
              ref={fileRef}
              id={`${p}-photo`}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const form = new FormData();
                form.set("playerId", player.id);
                form.set("file", file);
                photo.run(() => uploadPlayerPhoto(form), "Photo updated");
                e.target.value = "";
              }}
            />
            <Button type="button" variant="outline" size="sm" disabled={photo.pending} onClick={() => fileRef.current?.click()}>
              {photo.pending ? <Loader2 className="animate-spin" /> : <ImageUp />} Upload photo
            </Button>
            {player.hasCustomPhoto && player.hasChPhoto && (
              <Button type="button" variant="ghost" size="sm" disabled={photo.pending} onClick={() => photo.run(() => resetPlayerPhoto({ id: player.id }), "Using CricHeroes photo")}>
                <RotateCcw /> Use CricHeroes photo
              </Button>
            )}
          </div>
        </div>
        <Separator />

        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.run(() => updatePlayer({ id: player.id, ...v }), "Player saved", () => setOpen(false));
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor={`${p}-name`}>Display name</Label>
            <Input id={`${p}-name`} required maxLength={80} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
            <p className="text-xs text-muted-foreground">
              {player.nameLocked
                ? "This name is locked: the CricHeroes sync will not change it."
                : "Renaming locks the name so the nightly CricHeroes sync no longer overwrites it."}
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${p}-phone`}>Mobile number</Label>
            <Input id={`${p}-phone`} type="tel" inputMode="tel" maxLength={20} placeholder="+91 98765 43210" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
            <p className="text-xs text-muted-foreground">Used later for WhatsApp payment reminders.</p>
          </div>
          <div className="flex items-start justify-between gap-4 rounded-md border p-3">
            <div>
              <Label htmlFor={`${p}-member`}>Team member</Label>
              <p className="text-xs text-muted-foreground">Members pay match fees, guests don&apos;t. Changing this recalculates fees for every match they played.</p>
            </div>
            <Switch id={`${p}-member`} checked={v.isMember} onCheckedChange={(c) => setV({ ...v, isMember: c })} />
          </div>
          <div className="flex items-start justify-between gap-4 rounded-md border p-3">
            <div>
              <Label htmlFor={`${p}-active`}>Active</Label>
              <p className="text-xs text-muted-foreground">Inactive players are hidden from lists but keep their history.</p>
            </div>
            <Switch id={`${p}-active`} checked={v.isActive} onCheckedChange={(c) => setV({ ...v, isActive: c })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${p}-notes`}>Notes (admin only)</Label>
            <Textarea id={`${p}-notes`} maxLength={500} rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={save.pending}>
              {save.pending && <Loader2 className="animate-spin" />} Save player
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddPlayerDialog() {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: "", phone: "", isMember: true });
  const { run, pending } = useAction();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setV({ name: "", phone: "", isMember: true });
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus /> Add player
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add player</DialogTitle>
          <DialogDescription>
            For players who are not on CricHeroes yet. Players who appear in a CricHeroes scorecard are added automatically.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => createPlayer({ name: v.name, phone: v.phone || undefined, isMember: v.isMember }), "Player added", () => setOpen(false));
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="new-player-name">Name</Label>
            <Input id="new-player-name" required maxLength={80} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="new-player-phone">Mobile number</Label>
            <Input id="new-player-phone" type="tel" inputMode="tel" maxLength={20} value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-md border p-3">
            <Label htmlFor="new-player-member">Team member (pays match fees)</Label>
            <Switch id="new-player-member" checked={v.isMember} onCheckedChange={(c) => setV({ ...v, isMember: c })} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />} Add player
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
