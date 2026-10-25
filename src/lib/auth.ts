import "server-only";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db";
import { admins } from "@/db/schema";
import { createSupabaseServerClient, supabaseConfigured } from "./supabase/server";

export type Viewer = { email: string; isAdmin: boolean } | null;

/**
 * Local development without Supabase: set DEV_ADMIN_EMAIL to act as that admin.
 * Ignored in production builds.
 */
function devAdminEmail(): string | null {
  if (process.env.NODE_ENV !== "development") return null;
  return process.env.DEV_ADMIN_EMAIL?.toLowerCase() ?? null;
}

export const getViewer = cache(async (): Promise<Viewer> => {
  let email: string | null = null;
  if (supabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getClaims();
    email = (data?.claims?.email as string | undefined)?.toLowerCase() ?? null;
  }
  email ??= devAdminEmail();
  if (!email) return null;
  return { email, isAdmin: await isAdminEmail(email) };
});

export async function isAdminEmail(email: string) {
  const rows = await getDb().select().from(admins).where(eq(admins.email, email.toLowerCase()));
  return rows.length > 0;
}

/** Use at the top of every admin page and server action. Returns the admin's email. */
export async function requireAdmin(): Promise<string> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/admin");
  if (!viewer.isAdmin) redirect("/login?error=not_admin");
  return viewer.email;
}
