"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isAdminEmail } from "@/lib/auth";
import { createSupabaseServerClient, supabaseConfigured } from "@/lib/supabase/server";

export type LoginState = { message?: string; email?: string };

const WRONG = "Wrong email or password.";

async function siteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
}

/** Email + password login. Only emails on the admin list may sign in. */
export async function signInWithPassword(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const nextParam = String(form.get("next") ?? "/admin");
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/admin";

  if (!z.email().safeParse(email).success || !password) return { message: "Enter your email and password.", email };
  if (!supabaseConfigured()) return { message: "Login is not set up yet: add the Supabase keys to the environment.", email };
  // Same message for unknown emails and wrong passwords, so the admin list cannot be probed.
  if (!(await isAdminEmail(email))) return { message: WRONG, email };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (/invalid login credentials/i.test(error.message)) return { message: WRONG, email };
    return { message: `Could not log in: ${error.message}`, email };
  }
  redirect(next);
}

export async function signInWithGoogle() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await siteUrl()}/auth/callback?next=/admin` },
  });
  if (error || !data.url) redirect("/login?error=google");
  redirect(data.url);
}
