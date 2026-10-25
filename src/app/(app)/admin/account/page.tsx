import type { Metadata } from "next";
import { ChangePasswordForm } from "@/components/admin/ops/change-password-form";
import { PageHeader } from "@/components/shared";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "My account" };

export default async function AccountPage() {
  // Layouts and pages render in parallel, so each admin page must check on its own.
  const email = await requireAdmin();
  return (
    <div className="grid max-w-xl gap-6">
      <PageHeader title="My account" description={`Logged in as ${email}.`} />
      <ChangePasswordForm />
    </div>
  );
}
