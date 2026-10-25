"use client";

import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createCollection, deleteCollection, setCollectionPlayers } from "@/modules/finance/actions";
import { useAction } from "../use-action";

export type ChecklistPlayer = { id: string; name: string; isMember: boolean; isActive: boolean };
type Kind = "tournament" | "monthly" | "special" | "other";

export const COLLECTION_KIND_LABELS: Record<Kind, string> = {
  tournament: "Tournament share",
  monthly: "Monthly fee",
  special: "Special match",
  other: "Other",
};

export function PlayerChecklist({
  idPrefix,
  players,
  selected,
  onChange,
}: {
  idPrefix: string;
  players: ChecklistPlayer[];
  selected: Set<string>;
  onChange: (s: Set<string>) => void;
}) {
  const toggle = (id: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    onChange(next);
  };
  return (
    <fieldset className="grid gap-2">
      <legend className="sr-only">Players</legend>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{selected.size} selected</span>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange(new Set(players.map((p) => p.id)))}>
          Select all
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange(new Set(players.filter((p) => p.isMember && p.isActive).map((p) => p.id)))}
        >
          Active members
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(new Set())}>
          Clear
        </Button>
      </div>
      <ul className="grid max-h-80 gap-1 overflow-y-auto rounded-lg border p-2 sm:grid-cols-2 lg:grid-cols-3">
        {players.map((p) => {
          const id = `${idPrefix}-${p.id}`;
          return (
            <li key={p.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
              <Checkbox id={id} checked={selected.has(p.id)} onCheckedChange={(v) => toggle(p.id, v === true)} />
              <Label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 font-normal">
                <span className="truncate">{p.name}</span>
                {!p.isMember && <Badge variant="outline">Guest</Badge>}
                {!p.isActive && <Badge variant="secondary">Inactive</Badge>}
              </Label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

export function NewCollectionForm({ players, today }: { players: ChecklistPlayer[]; today: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("tournament");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueOn, setDueOn] = useState(today);
  const [amount, setAmount] = useState("");
  const [selected, setSelected] = useState(() => new Set(players.filter((p) => p.isMember && p.isActive).map((p) => p.id)));
  const { run, pending } = useAction();

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () =>
            createCollection({
              kind,
              title,
              description,
              dueOn,
              defaultAmount: Number(amount),
              playerIds: [...selected],
            }),
          `“${title}” created for ${selected.size} players`,
          (id) => {
            if (typeof id === "string") router.push(`/admin/collections/${id}`);
          },
        );
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-1.5">
          <Label htmlFor="coll-kind">Type</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
            <SelectTrigger id="coll-kind" className="h-10 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(COLLECTION_KIND_LABELS) as Kind[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {COLLECTION_KIND_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5 lg:col-span-1">
          <Label htmlFor="coll-title">Title</Label>
          <Input id="coll-title" className="h-10" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. CMC Elite Tournament" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="coll-amount">Amount per player (₹)</Label>
          <Input
            id="coll-amount"
            inputMode="numeric"
            required
            className="h-10 tabular"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="e.g. 400"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="coll-due">Due date</Label>
          <Input id="coll-due" type="date" className="h-10" required value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="coll-desc">Description (optional)</Label>
        <Textarea id="coll-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Entry fee ₹6,000 + balls, split between the squad" />
      </div>
      <PlayerChecklist idPrefix="coll-new" players={players} selected={selected} onChange={setSelected} />
      <Button type="submit" className="h-10 w-full sm:w-fit" disabled={pending || !title.trim() || !Number(amount) || selected.size === 0}>
        {pending ? <Loader2 className="animate-spin" /> : <Plus />} Create collection
      </Button>
    </form>
  );
}

export function CollectionPlayersEditor({ collectionId, players, initial }: { collectionId: string; players: ChecklistPlayer[]; initial: string[] }) {
  const [selected, setSelected] = useState(() => new Set(initial));
  const { run, pending } = useAction();
  const changed = selected.size !== initial.length || initial.some((id) => !selected.has(id));
  return (
    <div className="grid gap-3">
      <PlayerChecklist idPrefix={`coll-${collectionId}`} players={players} selected={selected} onChange={setSelected} />
      <p className="text-xs text-muted-foreground">
        Removing a player deletes their charge; money they already paid for it stays with them as credit.
      </p>
      <Button
        className="h-10 w-full sm:w-fit"
        disabled={pending || !changed}
        onClick={() => run(() => setCollectionPlayers({ collectionId, playerIds: [...selected] }), "Player list saved")}
      >
        {pending ? <Loader2 className="animate-spin" /> : <Save />} Save player list
      </Button>
    </div>
  );
}

export function DeleteCollectionButton({ collectionId, title }: { collectionId: string; title: string }) {
  const router = useRouter();
  const { run, pending } = useAction();
  return (
    <Button
      variant="destructive"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Delete “${title}” and all its charges? Money already paid for it becomes credit.`)) return;
        run(() => deleteCollection({ collectionId }), "Collection deleted", () => router.push("/admin/collections"));
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : <Trash2 />} Delete collection
    </Button>
  );
}
