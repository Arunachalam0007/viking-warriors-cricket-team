import { CheckCircle2, XCircle } from "lucide-react";
import type { Metadata } from "next";
import { AdminsCard } from "@/components/admin/ops/admins-card";
import { SettingsForm } from "@/components/admin/ops/settings-form";
import { PageHeader } from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { getViewer } from "@/lib/auth";
import { supabaseConfigured } from "@/lib/supabase/server";
import { listAdmins } from "@/modules/admin/queries";
import { getSettings } from "@/modules/settings/settings";
import { sheetsConfigured } from "@/modules/sheets/sheets";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Settings" };

function StatusRow({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-3 py-2">
      {ok ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" /> : <XCircle className="mt-0.5 size-5 shrink-0 text-destructive" />}
      <div className="min-w-0">
        <div className="font-medium">
          {label}: {ok ? "set up" : "not set up"}
        </div>
        <div className="text-sm text-muted-foreground">{detail}</div>
      </div>
    </li>
  );
}

export default async function SettingsPage() {
  // Layouts and pages render in parallel, so each admin page must check on its own.
  await requireAdmin();
  const db = getDb();
  const [settings, admins, viewer] = await Promise.all([getSettings(db), listAdmins(db), getViewer()]);
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? null;

  return (
    <div className="grid gap-6">
      <PageHeader title="Settings" description="Team details, match fee rules, the Google Sheet, and who can administer the site." />
      <SettingsForm
        serviceAccountEmail={serviceAccountEmail}
        initial={{
          team_name: settings.team_name,
          cricheroes_team_url: settings.cricheroes_team_url,
          match_fee: Number(settings.match_fee),
          finance_start_date: settings.finance_start_date,
          sync_start_date: settings.sync_start_date,
          google_sheet_url: settings.google_sheet_url,
          public_show_balances: Boolean(settings.public_show_balances),
          upi_id: settings.upi_id,
        }}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <AdminsCard admins={admins.map((a) => ({ email: a.email, addedBy: a.addedBy }))} me={viewer?.email ?? null} />
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-2xl tracking-wide">Integrations</CardTitle>
            <CardDescription>Keys live in the hosting environment (Vercel), never in the database. Values are not shown here.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              <StatusRow ok={supabaseConfigured()} label="Admin login (Supabase)" detail="NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" />
              <StatusRow ok={Boolean(process.env.SUPABASE_SECRET_KEY)} label="Photo uploads (Supabase Storage)" detail="SUPABASE_SECRET_KEY" />
              <StatusRow ok={sheetsConfigured()} label="Google Sheets" detail="GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY" />
              <StatusRow ok={Boolean(process.env.CRON_SECRET)} label="Nightly sync" detail="CRON_SECRET (Vercel Cron, 23:30 IST)" />
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
