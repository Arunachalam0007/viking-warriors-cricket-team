"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isAdminEmail } from "@/lib/auth";
import { createSupabaseServerClient, supabaseConfigured } from "@/lib/supabase/server";

export type LoginState = { ok?: boolean; message?: string };

async function siteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
}

export async function sendMagicLink(_prev: LoginState, form: FormData): Promise<LoginState> {
  const parsed = z.email().safeParse(String(form.get("email") ?? "").trim().toLowerCase());
  if (!parsed.success) return { message: "Enter a valid email address." };
  if (!supabaseConfigured()) return { message: "Login is not set up yet: add the Supabase keys to the environment." };
  if (!(await isAdminEmail(parsed.data))) {
    return { message: "This email is not on the admin list. Ask an existing admin to add it in Settings." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { emailRedirectTo: `${await siteUrl()}/auth/callback?next=/admin`, shouldCreateUser: true },
  });
  if (error) return { message: `Could not send the link: ${error.message}` };
  return { ok: true, message: `Login link sent to ${parsed.data}. Open it in this browser.` };
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
