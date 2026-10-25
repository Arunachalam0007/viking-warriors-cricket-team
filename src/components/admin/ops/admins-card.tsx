"use client";

import { KeyRound, Loader2, Plus, Trash2, Wand2 } from "lucide-react";
import { useState } from "react";
import { useAction } from "@/components/admin/use-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addAdmin, removeAdmin, setAdminPassword } from "@/modules/settings/actions";

/** Readable suggestion, shown in the field so the admin can copy it and pass it on. */
function suggestPassword() {
  const letters = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint32Array(8));
  const part = Array.from(bytes.slice(0, 4), (n) => letters[n % letters.length]).join("");
  return `vikings-${1000 + (bytes[4] % 9000)}-${part}`;
}

function PasswordInput({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1">
      <Input id={id} type="text" autoComplete="new-password" required minLength={8} placeholder="At least 8 characters" value={value} onChange={(e) => onChange(e.target.value)} />
      <Button type="button" variant="outline" size="icon" aria-label="Suggest a password" title="Suggest a password" onClick={() => onChange(suggestPassword())}>
        <Wand2 />
      </Button>
    </div>
  );
}

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

function ResetPassword({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const { run, pending } = useAction();
  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <KeyRound /> Set password
      </Button>
    );
  }
  return (
    <form
      className="grid w-full gap-1.5 pt-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => setAdminPassword({ email, password }), `New password set for ${email}. Share it with them privately.`, () => setOpen(false));
      }}
    >
      <Label htmlFor={`reset-${email}`}>New password for {email}</Label>
      <PasswordInput id={`reset-${email}`} value={password} onChange={setPassword} />
      <div className="flex gap-1">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <KeyRound />} Save password
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function AdminsCard({ admins, me }: { admins: { email: string; addedBy: string | null }[]; me: string | null }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { run, pending } = useAction();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-2xl tracking-wide">Admins</CardTitle>
        <CardDescription>
          People who can log in to the admin portal with their email and password. Give a new admin their starting password
          privately; they can change it in My account.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ul className="divide-y">
          {admins.map((a) => (
            <li key={a.email} className="flex flex-wrap items-center gap-2 py-2">
              <span className="min-w-0 flex-1 truncate font-medium">{a.email}</span>
              {a.email === me ? (
                <Badge variant="secondary">You</Badge>
              ) : (
                <>
                  <ResetPassword email={a.email} />
                  {admins.length > 1 && <RemoveAdmin email={a.email} />}
                </>
              )}
            </li>
          ))}
        </ul>
        <form
          className="grid gap-3 rounded-lg border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => addAdmin({ email, password }), `${email} can now log in. Share the password with them privately.`, () => {
              setEmail("");
              setPassword("");
            });
          }}
        >
          <p className="text-sm font-medium">Add an admin</p>
          <div className="grid gap-1.5">
            <Label htmlFor="new-admin-email">Email</Label>
            <Input id="new-admin-email" type="email" required placeholder="name@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="new-admin-password">Starting password</Label>
            <PasswordInput id="new-admin-password" value={password} onChange={setPassword} />
          </div>
          <Button type="submit" disabled={pending} className="justify-self-start">
            {pending ? <Loader2 className="animate-spin" /> : <Plus />} Add admin
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
