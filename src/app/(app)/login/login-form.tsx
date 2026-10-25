"use client";

import { Loader2, Mail } from "lucide-react";
import { useActionState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendMagicLink, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, {});
  return (
    <form action={action} className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="email">Admin email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@gmail.com" className="h-10" />
      </div>
      <Button type="submit" size="lg" className="h-10" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Mail />}
        Email me a login link
      </Button>
      {state.message && (
        <Alert variant={state.ok ? "default" : "destructive"}>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
