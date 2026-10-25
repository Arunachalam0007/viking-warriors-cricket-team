"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type HolderOption = { id: string; name: string; isDefault: boolean };
export type PaymentMode = "cash" | "upi" | "bank" | "other";
export type PaymentOptionsValue = { mode: PaymentMode; holderId: string | null; paidOn: string };

export const MODE_LABELS: Record<PaymentMode, string> = { upi: "UPI / GPay", cash: "Cash", bank: "Bank transfer", other: "Other" };
const NO_HOLDER = "__none__";

export function usePaymentOptions(holders: HolderOption[], today: string) {
  return useState<PaymentOptionsValue>({
    mode: "upi",
    holderId: holders.find((h) => h.isDefault)?.id ?? holders[0]?.id ?? null,
    paidOn: today,
  });
}

/** Mode, received-by and date pickers shared by every "mark paid" / "record payment" flow. */
export function PaymentOptions({
  idPrefix,
  holders,
  value,
  onChange,
}: {
  idPrefix: string;
  holders: HolderOption[];
  value: PaymentOptionsValue;
  onChange: (v: PaymentOptionsValue) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-mode`}>Paid by</Label>
        <Select value={value.mode} onValueChange={(mode) => onChange({ ...value, mode: mode as PaymentMode })}>
          <SelectTrigger id={`${idPrefix}-mode`} className="h-10 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(MODE_LABELS) as PaymentMode[]).map((m) => (
              <SelectItem key={m} value={m}>
                {MODE_LABELS[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-holder`}>Received by</Label>
        <Select
          value={value.holderId ?? NO_HOLDER}
          onValueChange={(h) => onChange({ ...value, holderId: h === NO_HOLDER ? null : h })}
        >
          <SelectTrigger id={`${idPrefix}-holder`} className="h-10 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {holders.map((h) => (
              <SelectItem key={h.id} value={h.id}>
                {h.name}
              </SelectItem>
            ))}
            <SelectItem value={NO_HOLDER}>Not assigned</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-date`}>Date paid</Label>
        <Input
          id={`${idPrefix}-date`}
          type="date"
          className="h-10"
          value={value.paidOn}
          onChange={(e) => onChange({ ...value, paidOn: e.target.value })}
        />
      </div>
    </div>
  );
}
