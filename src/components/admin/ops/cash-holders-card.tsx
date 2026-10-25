"use client";

import { Check, Loader2, Pencil, Plus, Star, X } from "lucide-react";
import { useState } from "react";
import { useAction } from "@/components/admin/use-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveCashHolder } from "@/modules/finance/actions";
import type { Holder } from "./labels";

function HolderRow({ holder }: { holder: Holder }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(holder.name);
  const { run, pending } = useAction();
  const save = (patch: Partial<Holder>, msg: string) =>
    run(
      () => saveCashHolder({ id: holder.id, name: patch.name ?? holder.name, isDefault: patch.isDefault ?? holder.isDefault, isActive: patch.isActive ?? holder.isActive }),
      msg,
      () => setEditing(false),
    );

  return (
    <li className="flex flex-wrap items-center gap-2 py-2">
      {editing ? (
        <form
          className="flex min-w-0 flex-1 items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save({ name }, "Holder renamed");
          }}
        >
          <Label htmlFor={`holder-name-${holder.id}`} className="sr-only">
            Holder name
          </Label>
          <Input id={`holder-name-${holder.id}`} value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={60} required className="min-w-0" />
          <Button type="submit" size="icon-sm" aria-label="Save name" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Check />}
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Cancel" onClick={() => setEditing(false)}>
            <X />
          </Button>
        </form>
      ) : (
        <>
          <span className={holder.isActive ? "font-medium" : "font-medium text-muted-foreground line-through"}>{holder.name}</span>
          {holder.isDefault && <Badge variant="secondary">Default</Badge>}
          {!holder.isActive && <Badge variant="outline">Inactive</Badge>}
          <span className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" aria-label={`Rename ${holder.name}`} onClick={() => setEditing(true)}>
              <Pencil />
            </Button>
            {!holder.isDefault && holder.isActive && (
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => save({ isDefault: true }, `${holder.name} is now the default holder`)}>
                <Star /> Make default
              </Button>
            )}
            {!holder.isDefault && (
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => save({ isActive: !holder.isActive }, holder.isActive ? "Holder deactivated" : "Holder reactivated")}>
                {holder.isActive ? "Deactivate" : "Reactivate"}
              </Button>
            )}
          </span>
        </>
      )}
    </li>
  );
}

export function CashHoldersCard({ holders }: { holders: Holder[] }) {
  const [name, setName] = useState("");
  const { run, pending } = useAction();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-2xl tracking-wide">Cash holders</CardTitle>
        <CardDescription>
          People who physically hold team money. The default holder is preselected when recording payments and expenses.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <ul className="divide-y">
          {holders.map((h) => (
            <HolderRow key={h.id} holder={h} />
          ))}
        </ul>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveCashHolder({ name, isDefault: false, isActive: true }), "Holder added", () => setName(""));
          }}
        >
          <div className="grid min-w-0 flex-1 gap-1.5">
            <Label htmlFor="new-holder-name">Add a holder</Label>
            <Input id="new-holder-name" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={60} required />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Plus />} Add
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
