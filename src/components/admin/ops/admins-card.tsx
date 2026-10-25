"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useAction } from "@/components/admin/use-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addAdmin, removeAdmin } from "@/modules/settings/actions";

function RemoveAdmin({ email }: { email: string }) {
  const [armed, setArmed] = useState(false);
  const { run, pending } = useAction();
  if (!armed) {
    return (
      <Button variant="ghost" size="icon-sm" aria-label={`Remove ${email}`} onClick={() => setArmed(true)}>
        <Trash2 />
      </Button>
    );
  }
  return (
    <span className="inline-flex gap-1">
      <Button variant="destructive" size="sm" disabled={pending} onClick={() => run(() => removeAdmin({ email }), `${email} removed`)}>
        {pending ? <Loader2 className="animate-spin" /> : "Remove"}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setArmed(false)}>
        Cancel
      </Button>
    </span>
  );
}

export function AdminsCard({ admins, me }: { admins: { email: string; addedBy: string | null }[]; me: string | null }) {
  const [email, setEmail] = useState("");
  const { run, pending } = useAction();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-2xl tracking-wide">Admins</CardTitle>
        <CardDescription>People who can log in to the admin portal. They sign in with a link sent to this email.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <ul className="divide-y">
          {admins.map((a) => (
            <li key={a.email} className="flex items-center gap-2 py-2">
              <span className="min-w-0 flex-1 truncate font-medium">{a.email}</span>
              {a.email === me ? <Badge variant="secondary">You</Badge> : admins.length > 1 && <RemoveAdmin email={a.email} />}
            </li>
          ))}
        </ul>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => addAdmin({ email }), `${email} can now log in`, () => setEmail(""));
          }}
        >
          <div className="grid min-w-0 flex-1 gap-1.5">
            <Label htmlFor="new-admin-email">Add admin email</Label>
            <Input id="new-admin-email" type="email" required placeholder="name@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Plus />} Add
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
