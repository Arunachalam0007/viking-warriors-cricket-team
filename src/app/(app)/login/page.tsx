import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getViewer } from "@/lib/auth";
import { signInWithGoogle } from "./actions";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Admin login" };

const ERRORS: Record<string, string> = {
  not_admin: "You are signed in, but this email is not on the admin list.",
  google: "Google sign-in is not available right now.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error, next } = await searchParams;
  const viewer = await getViewer();
  const target = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/admin";
  if (viewer?.isAdmin) redirect(target);
  const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true";

  return (
    <div className="mx-auto grid max-w-md gap-4 pt-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-3xl tracking-wide">Admin login</CardTitle>
          <CardDescription>
            Admins manage match fees, payments, expenses and settings. Team members don&apos;t need to log in: every
            public page is open.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {typeof error === "string" && ERRORS[error] && (
            <Alert variant="destructive">
              <AlertDescription>{ERRORS[error]}</AlertDescription>
            </Alert>
          )}
          <LoginForm next={target} />
          {googleEnabled && (
            <>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <Separator className="flex-1" /> or <Separator className="flex-1" />
              </div>
              <form action={signInWithGoogle}>
                <Button type="submit" variant="outline" size="lg" className="h-10 w-full">
                  Continue with Google
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
