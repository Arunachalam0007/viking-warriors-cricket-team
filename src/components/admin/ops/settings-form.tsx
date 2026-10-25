"use client";

import { ExternalLink, Loader2, Save } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useAction } from "@/components/admin/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { saveSettingsAction } from "@/modules/settings/actions";

export type SettingsValues = {
  team_name: string;
  team_id: number;
  match_fee: number;
  finance_start_date: string;
  sync_start_date: string;
  google_sheet_url: string;
  public_show_balances: boolean;
  upi_id: string;
};

function Field({ id, label, hint, children }: { id: string; label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function SettingsForm({ initial, serviceAccountEmail }: { initial: SettingsValues; serviceAccountEmail: string | null }) {
  const [v, setV] = useState(initial);
  const { run, pending } = useAction();
  const sheetValid = /\/spreadsheets\/d\/[a-zA-Z0-9-_]+/.test(v.google_sheet_url);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveSettingsAction(v), "Settings saved");
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-2xl tracking-wide">Team & finance settings</CardTitle>
          <CardDescription>These apply across the whole site and to the nightly sync.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="set-team-name" label="Team name">
              <Input id="set-team-name" required minLength={2} maxLength={60} value={v.team_name} onChange={(e) => setV({ ...v, team_name: e.target.value })} />
            </Field>
            <Field id="set-team-id" label="CricHeroes team ID" hint="The number in the CricHeroes team link, e.g. team-profile/2921535/…">
              <Input id="set-team-id" type="number" inputMode="numeric" min={1} required value={v.team_id} onChange={(e) => setV({ ...v, team_id: Number(e.target.value) })} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="set-fee" label="Match fee per player (₹)" hint="Only affects matches that finish after you change it. Existing matches keep their fee.">
              <Input id="set-fee" type="number" inputMode="numeric" min={0} step={1} required value={v.match_fee} onChange={(e) => setV({ ...v, match_fee: Number(e.target.value) })} />
            </Field>
            <Field id="set-finance-start" label="Charge fees from" hint="Matches before this date are never charged.">
              <Input id="set-finance-start" type="date" required value={v.finance_start_date} onChange={(e) => setV({ ...v, finance_start_date: e.target.value })} />
            </Field>
            <Field id="set-sync-start" label="Import matches from" hint="Matches before this date are not imported from CricHeroes.">
              <Input id="set-sync-start" type="date" required value={v.sync_start_date} onChange={(e) => setV({ ...v, sync_start_date: e.target.value })} />
            </Field>
          </div>

          <Field
            id="set-sheet"
            label="Google Sheet link"
            hint={
              <>
                Share this sheet with <span className="font-medium break-all text-foreground">{serviceAccountEmail ?? "the service account email"}</span> as
                Editor, or the app cannot write to it. The app rewrites its own tabs; don&apos;t edit them by hand.
              </>
            }
          >
            <div className="flex gap-2">
              <Input
                id="set-sheet"
                type="url"
                className="min-w-0"
                placeholder="https://docs.google.com/spreadsheets/d/…"
                value={v.google_sheet_url}
                onChange={(e) => setV({ ...v, google_sheet_url: e.target.value })}
              />
              {sheetValid && (
                <Button asChild variant="outline">
                  <a href={v.google_sheet_url} target="_blank" rel="noreferrer">
                    <ExternalLink /> Open sheet
                  </a>
                </Button>
              )}
            </div>
          </Field>

          <div className="flex items-start justify-between gap-4 rounded-md border p-3">
            <div>
              <Label htmlFor="set-public-balances">Show player balances publicly</Label>
              <p className="text-xs text-muted-foreground">When off, the public Finance page shows team totals only.</p>
            </div>
            <Switch id="set-public-balances" checked={v.public_show_balances} onCheckedChange={(c) => setV({ ...v, public_show_balances: c })} />
          </div>

          <Field id="set-upi" label="UPI ID for payments" hint="Shown on the public Finance page so players can pay. Leave empty to hide.">
            <Input id="set-upi" maxLength={80} placeholder="name@okbank" value={v.upi_id} onChange={(e) => setV({ ...v, upi_id: e.target.value })} />
          </Field>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Save />} Save settings
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
