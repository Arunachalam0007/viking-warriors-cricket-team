"use client";

import { Ban, Check, Loader2, RotateCcw, Undo2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { rupees } from "@/lib/format";
import { markPaid, markUnpaid, updateChargeAmount, waiveCharge } from "@/modules/finance/actions";
import { useAction } from "../use-action";
import { PaymentOptions, usePaymentOptions, type HolderOption } from "./payment-options";

export type ChargeLite = {
  chargeId: string;
  amount: number;
  paid: number;
  due: number;
  waived: boolean;
  status: string;
  description: string;
  playerName: string;
};

/** Inline amount editor: saves on blur or Enter. */
export function ChargeAmountInput({ charge, label }: { charge: ChargeLite; label: string }) {
  const [value, setValue] = useState(String(charge.amount));
  const { run, pending } = useAction();
  const save = () => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0) {
      setValue(String(charge.amount));
      return;
    }
    if (n === charge.amount) return;
    run(() => updateChargeAmount({ chargeId: charge.chargeId, amount: n }), `${charge.playerName}: amount set to ${rupees(n)}`);
  };
  return (
    <div className="relative w-24">
      <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
      <Input
        aria-label={label}
        inputMode="numeric"
        className="h-10 pl-6 tabular"
        value={value}
        disabled={pending || charge.waived}
        onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ""))}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
    </div>
  );
}

/** Mark paid (with mode / holder / date), mark unpaid, waive / un-waive. */
export function ChargeActions({ charge, holders, today }: { charge: ChargeLite; holders: HolderOption[]; today: string }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = usePaymentOptions(holders, today);
  const { run, pending } = useAction();
  const hasPaid = charge.paid > 0;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {!charge.waived && charge.due > 0 && (
        <Button size="sm" className="h-9" disabled={pending} onClick={() => setOpen(true)}>
          <Check /> Mark paid
        </Button>
      )}
      {!charge.waived && hasPaid && (
        <Button
          size="sm"
          variant="outline"
          className="h-9"
          disabled={pending}
          onClick={() => run(() => markUnpaid({ chargeId: charge.chargeId }), `${charge.playerName}: marked not paid`)}
        >
          <Undo2 /> Unpaid
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="h-9"
        disabled={pending}
        onClick={() =>
          run(
            () => waiveCharge({ chargeId: charge.chargeId, waived: !charge.waived }),
            charge.waived ? `${charge.playerName}: charge restored` : `${charge.playerName}: charge waived`,
          )
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : charge.waived ? <RotateCcw /> : <Ban />}
        {charge.waived ? "Restore" : "Waive"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark {rupees(charge.due)} as paid</DialogTitle>
            <DialogDescription>
              {charge.playerName} · {charge.description}
            </DialogDescription>
          </DialogHeader>
          <PaymentOptions idPrefix={`pay-${charge.chargeId}`} holders={holders} value={opts} onChange={setOpts} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                run(
                  () => markPaid({ chargeId: charge.chargeId, ...opts }),
                  `${charge.playerName}: ${rupees(charge.due)} marked paid`,
                  () => setOpen(false),
                )
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : <Check />} Confirm paid
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
