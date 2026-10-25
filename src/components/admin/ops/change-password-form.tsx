"use client";

import { KeyRound, Loader2 } from "lucide-react";
import { useState } from "react";
import { useAction } from "@/components/admin/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changeOwnPassword } from "@/modules/auth/actions";

const EMPTY = { current: "", next: "", confirm: "" };

export function ChangePasswordForm() {
  const [v, setV] = useState(EMPTY);
  const { run, pending } = useAction();
  const field = (key: keyof typeof EMPTY, label: string, autoComplete: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`pw-${key}`}>{label}</Label>
      <Input
        id={`pw-${key}`}
        type="password"
        autoComplete={autoComplete}
        required
        minLength={key === "current" ? 1 : 8}
        value={v[key]}
        onChange={(e) => setV({ ...v, [key]: e.target.value })}
      />
    </div>
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => changeOwnPassword(v), "Password changed. Use the new one next time you log in.", () => setV(EMPTY));
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-2xl tracking-wide">Change password</CardTitle>
          <CardDescription>At least 8 characters. You stay logged in on this device.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {field("current", "Current password", "current-password")}
          {field("next", "New password", "new-password")}
          {field("confirm", "Confirm new password", "new-password")}
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <KeyRound />} Change password
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
