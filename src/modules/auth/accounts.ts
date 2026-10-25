import "server-only";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Admin logins are Supabase Auth email + password accounts. No emails are ever sent: admins set
 * each other's passwords in Settings, change their own in My account, and `npm run admin:password`
 * recovers access from the command line. Being in the `admins` table is what grants access.
 */

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters");

export async function findAuthUser(email: string) {
  const supabase = createSupabaseAdminClient();
  const target = email.toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Could not read login accounts: ${error.message}`);
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

/** Creates the login if it does not exist, otherwise replaces its password. */
export async function setLoginPassword(email: string, password: string) {
  const supabase = createSupabaseAdminClient();
  const existing = await findAuthUser(email);
  const { error } = existing
    ? await supabase.auth.admin.updateUserById(existing.id, { password, email_confirm: true })
    : await supabase.auth.admin.createUser({ email: email.toLowerCase(), password, email_confirm: true });
  if (error) throw new Error(`Could not set the password: ${error.message}`);
}

export async function deleteLogin(email: string) {
  const user = await findAuthUser(email);
  if (!user) return;
  const { error } = await createSupabaseAdminClient().auth.admin.deleteUser(user.id);
  if (error) throw new Error(`Could not remove the login: ${error.message}`);
}

/** Readable temporary password, e.g. "vikings-4821-tq7m". */
export function temporaryPassword() {
  const letters = "abcdefghjkmnpqrstuvwxyz23456789";
  const pick = (n: number) => Array.from({ length: n }, () => letters[randomInt(letters.length)]).join("");
  return `vikings-${randomInt(1000, 10000)}-${pick(4)}`;
}
