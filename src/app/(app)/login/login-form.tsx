"use client";

import { Eye, EyeOff, Loader2, LogIn } from "lucide-react";
import { useActionState, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInWithPassword, type LoginState } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(signInWithPassword, {});
  const [show, setShow] = useState(false);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="next" value={next} />
      <div className="grid gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="username" required placeholder="you@gmail.com" defaultValue={state.email} className="h-10" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input id="password" name="password" type={show ? "text" : "password"} autoComplete="current-password" required className="h-10 pr-10" />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute top-1/2 right-1 -translate-y-1/2"
            aria-label={show ? "Hide password" : "Show password"}
            onClick={() => setShow(!show)}
          >
            {show ? <EyeOff /> : <Eye />}
          </Button>
        </div>
      </div>
      <Button type="submit" size="lg" className="h-10" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <LogIn />}
        Log in
      </Button>
      {state.message && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      <p className="text-xs text-muted-foreground">Forgot your password? Ask another admin to set a new one in Admin → Settings → Admins.</p>
    </form>
  );
}
