"use client";

import { Loader2, Lock, Save } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { updateMatchFinance } from "@/modules/finance/actions";
import { useAction } from "../use-action";

export function MatchSettingsForm({
  match,
}: {
  match: { id: string; chargeable: boolean; feePerPlayer: number; kind: string; notes: string | null; financeLocked: boolean };
}) {
  const [chargeable, setChargeable] = useState(match.chargeable);
  const [fee, setFee] = useState(String(match.feePerPlayer));
  const [kind, setKind] = useState<"individual" | "tournament">(match.kind === "tournament" ? "tournament" : "individual");
  const [notes, setNotes] = useState(match.notes ?? "");
  const { run, pending } = useAction();

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => updateMatchFinance({ matchId: match.id, chargeable, feePerPlayer: Number(fee || 0), kind, notes }),
          "Match fee settings saved",
        );
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex items-center justify-between gap-3 rounded-lg border p-3 sm:col-span-1">
          <div>
            <Label htmlFor="match-chargeable">Charge match fee</Label>
            <p className="text-xs text-muted-foreground">Off = nobody pays for this match</p>
          </div>
          <Switch id="match-chargeable" checked={chargeable} onCheckedChange={setChargeable} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="match-fee">Fee per player (₹)</Label>
          <Input
            id="match-fee"
            inputMode="numeric"
            className="h-10 tabular"
            value={fee}
            onChange={(e) => setFee(e.target.value.replace(/[^\d]/g, ""))}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="match-kind">Match type</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as "individual" | "tournament")}>
            <SelectTrigger id="match-kind" className="h-10 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="individual">Individual / practice</SelectItem>
              <SelectItem value="tournament">Tournament</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="match-notes">Notes (optional)</Label>
        <Textarea
          id="match-notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Ball cost shared, fee raised to ₹60"
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3.5" />
          {match.financeLocked
            ? "These settings are locked: the nightly CricHeroes sync will not change them."
            : "Saving locks these settings so the nightly CricHeroes sync no longer changes them."}
        </p>
        <Button type="submit" className="h-10" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />} Save settings
        </Button>
      </div>
    </form>
  );
}
