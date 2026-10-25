"use client";

import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/dates";
import { rupees } from "@/lib/format";
import { deletePaymentAction } from "@/modules/finance/actions";
import { useAction } from "../use-action";
import { MODE_LABELS, type PaymentMode } from "./payment-options";

export type PaymentListRow = {
  id: string;
  paidOn: string;
  playerName: string;
  amount: number;
  mode: string;
  holderName: string | null;
  reference: string | null;
  note: string | null;
  source: string;
};

export function PaymentsList({ payments }: { payments: PaymentListRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Player</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead>Mode</TableHead>
          <TableHead>Received by</TableHead>
          <TableHead>Note</TableHead>
          <TableHead className="w-0" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {payments.map((p) => (
          <TableRow key={p.id}>
            <TableCell className="whitespace-nowrap">{formatDate(p.paidOn)}</TableCell>
            <TableCell className="font-medium">{p.playerName}</TableCell>
            <TableCell className="text-right tabular">{rupees(p.amount)}</TableCell>
            <TableCell>{MODE_LABELS[p.mode as PaymentMode] ?? p.mode}</TableCell>
            <TableCell>{p.holderName ?? "–"}</TableCell>
            <TableCell className="max-w-56 truncate text-muted-foreground" title={[p.reference, p.note].filter(Boolean).join(" · ")}>
              {[p.reference, p.note].filter(Boolean).join(" · ") || (p.source === "quick" ? "Marked paid" : "–")}
            </TableCell>
            <TableCell>
              <DeletePayment payment={p} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function DeletePayment({ payment }: { payment: PaymentListRow }) {
  const { run, pending } = useAction();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Delete ${rupees(payment.amount)} payment from ${payment.playerName}`}
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Delete the ${rupees(payment.amount)} payment from ${payment.playerName}? The fees it paid become due again.`)) return;
        run(() => deletePaymentAction({ paymentId: payment.id }), "Payment deleted");
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : <Trash2 className="text-destructive" />}
    </Button>
  );
}
