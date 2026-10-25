"use server";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { ActionResult } from "@/lib/action";
import { requireAdmin } from "@/lib/auth";
import { nodeRealtime } from "@/lib/supabase/server";
import { audit } from "@/modules/audit/audit";
import { passwordSchema, setLoginPassword } from "./accounts";

const changePasswordInput = z
  .object({ current: z.string().min(1, "Enter your current password"), next: passwordSchema, confirm: z.string() })
  .refine((v) => v.next === v.confirm, { message: "The new passwords do not match" })
  .refine((v) => v.next !== v.current, { message: "The new password must be different" });

/** The logged-in admin changes their own password after confirming the current one. */
export async function changeOwnPassword(raw: z.input<typeof changePasswordInput>): Promise<ActionResult> {
  const email = await requireAdmin();
  const parsed = changePasswordInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join(", ") };

  // Check the current password with a throwaway client, so the visitor's session cookies are untouched
  const check = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...nodeRealtime(),
  });
  const { error } = await check.auth.signInWithPassword({ email, password: parsed.data.current });
  if (error) return { ok: false, error: "Your current password is not correct" };

  try {
    await setLoginPassword(email, parsed.data.next);
    await audit({ actor: email, action: "admin.password_change", entity: "admin", entityId: email });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
