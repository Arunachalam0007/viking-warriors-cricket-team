import type { Metadata } from "next";
import { RemindersWorkspace } from "@/components/admin/ai/reminders";
import { PageHeader } from "@/components/shared";
import { getDb } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { lastReminded, recentReminders } from "@/modules/ai/reminders";
import { getPlayerBalances } from "@/modules/finance/queries";
import { listPlayers, playerPhoto } from "@/modules/players/queries";
import { getSettings } from "@/modules/settings/settings";

export const metadata: Metadata = { title: "Dues reminders" };

export default async function RemindersPage() {
  // Layouts and pages render in parallel, so each admin page must check on its own.
  await requireAdmin();
  const db = getDb();
  const [balances, squad, reminded, history, settings] = await Promise.all([
    getPlayerBalances(db),
    listPlayers(db, { membersOnly: true }),
    lastReminded(db),
    recentReminders(db),
    getSettings(db),
  ]);
  const phoneOf = (id: string) => squad.find((p) => p.id === id)?.phone ?? null;
  const owing = balances
    .filter((b) => b.isMember && b.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .map((b) => ({ playerId: b.playerId, name: b.name, photo: b.photo, owes: b.balance, phone: phoneOf(b.playerId), lastRemindedAt: reminded.get(b.playerId)?.toISOString() ?? null }));

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Dues reminders"
        description="Friendly WhatsApp messages in Tamil and English with the exact amount, the unpaid matches and the GPay number. You send them, one tap each: nothing goes out automatically."
      />
      <RemindersWorkspace
        owing={owing}
        members={squad.filter((p) => p.isActive).map((p) => ({ playerId: p.id, name: p.name, photo: playerPhoto(p), phone: p.phone }))}
        contact={{ gpay_name: settings.gpay_name, gpay_number: settings.gpay_number }}
        history={history.map((h) => ({ id: h.id, name: h.name, sentAt: h.sentAt?.toISOString() ?? null, message: h.message }))}
      />
    </div>
  );
}
