import type { Metadata } from "next";
import { PaymentsList } from "@/components/admin/finance/payments-list";
import { PaymentsWorkspace } from "@/components/admin/finance/payments-workspace";
import { EmptyState, PageHeader, StatTile } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { todayIst } from "@/lib/dates";
import { rupees } from "@/lib/format";
import { listCashHolders, listPayments } from "@/modules/admin/queries";
import { getPlayerBalances } from "@/modules/finance/queries";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsPage() {
  // Layouts and pages render in parallel, so each admin page must check on its own.
  await requireAdmin();
  const db = getDb();
  const [balances, holders, payments] = await Promise.all([getPlayerBalances(db), listCashHolders(db), listPayments(db)]);
  const due = balances.reduce((s, b) => s + Math.max(b.balance, 0), 0);
  const credit = balances.reduce((s, b) => s + Math.max(-b.balance, 0), 0);
  const collected = balances.reduce((s, b) => s + b.paid, 0);

  return (
    <div className="grid gap-5">
      <PageHeader title="Payments" description="Record money received from players and see who still owes." />

      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Collected" value={rupees(collected)} tone="good" hint="All time" />
        <StatTile label="Outstanding" value={rupees(due)} tone={due > 0 ? "bad" : undefined} />
        <StatTile label="Advance credit" value={rupees(credit)} />
      </div>

      <PaymentsWorkspace
        balances={balances.map((b) => ({
          playerId: b.playerId,
          name: b.name,
          photo: b.photo,
          isMember: b.isMember,
          charged: b.charged,
          paid: b.paid,
          balance: b.balance,
        }))}
        holders={holders.filter((h) => h.isActive).map((h) => ({ id: h.id, name: h.name, isDefault: h.isDefault }))}
        today={todayIst()}
      />

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-2xl tracking-wide">Payment history</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <EmptyState title="No payments recorded yet">Mark fees as paid, or record a payment above.</EmptyState>
          ) : (
            <PaymentsList
              payments={payments.map(({ payment: p, playerName, holderName }) => ({
                id: p.id,
                paidOn: p.paidOn,
                playerName,
                amount: p.amount,
                mode: p.mode,
                holderName,
                reference: p.reference,
                note: p.note,
                source: p.source,
              }))}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
