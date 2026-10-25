"use client";

import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useAction } from "@/components/admin/use-action";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ActionResult } from "@/lib/action";
import { deleteExpense, deleteIncome, saveExpense, saveIncome } from "@/modules/finance/actions";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, PAYMENT_MODES, type Holder } from "./labels";

const NONE = "__none__";

function Field({ id, label, children, hint }: { id: string; label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function OptionSelect({ id, value, onChange, options }: { id: string; value: string; onChange: (v: string) => void; options: Record<string, string> }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(options).map(([v, l]) => (
          <SelectItem key={v} value={v}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function holderOptions(holders: Holder[], current: string | null) {
  const opts: Record<string, string> = { [NONE]: "Not assigned" };
  for (const h of holders) if (h.isActive || h.id === current) opts[h.id] = h.name;
  return opts;
}

export type ExpenseValues = {
  id?: string;
  spentOn: string;
  category: keyof typeof EXPENSE_CATEGORIES;
  description: string;
  amount: number;
  holderId: string | null;
  paidBy: string | null;
  mode: keyof typeof PAYMENT_MODES;
};

export function ExpenseDialog({ holders, initial, today }: { holders: Holder[]; initial?: ExpenseValues; today: string }) {
  const defaultHolder = holders.find((h) => h.isDefault)?.id ?? null;
  const blank: ExpenseValues = { spentOn: today, category: "balls", description: "", amount: 0, holderId: defaultHolder, paidBy: "", mode: "upi" };
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<ExpenseValues>(initial ?? blank);
  const { run, pending } = useAction();
  const prefix = `expense-${initial?.id ?? "new"}`;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setV(initial ?? blank);
      }}
    >
      <DialogTrigger asChild>
        {initial ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Edit expense ${initial.description}`}>
            <Pencil />
          </Button>
        ) : (
          <Button>
            <Plus /> Add expense
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Edit expense" : "Add expense"}</DialogTitle>
          <DialogDescription>Money spent from team funds. Pick who paid it out so cash in hand stays right.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => saveExpense({ ...v, holderId: v.holderId || null, paidBy: v.paidBy || null }),
              initial ? "Expense updated" : "Expense added",
              () => setOpen(false),
            );
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field id={`${prefix}-date`} label="Date">
              <Input id={`${prefix}-date`} type="date" required value={v.spentOn} onChange={(e) => setV({ ...v, spentOn: e.target.value })} />
            </Field>
            <Field id={`${prefix}-amount`} label="Amount (₹)">
              <Input
                id={`${prefix}-amount`}
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                required
                value={v.amount || ""}
                onChange={(e) => setV({ ...v, amount: Number(e.target.value) })}
              />
            </Field>
          </div>
          <Field id={`${prefix}-category`} label="Category">
            <OptionSelect id={`${prefix}-category`} value={v.category} onChange={(c) => setV({ ...v, category: c as ExpenseValues["category"] })} options={EXPENSE_CATEGORIES} />
          </Field>
          <Field id={`${prefix}-description`} label="Description">
            <Input id={`${prefix}-description`} required minLength={2} maxLength={200} placeholder="e.g. 6 leather balls" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id={`${prefix}-holder`} label="Paid from">
              <OptionSelect
                id={`${prefix}-holder`}
                value={v.holderId ?? NONE}
                onChange={(h) => setV({ ...v, holderId: h === NONE ? null : h })}
                options={holderOptions(holders, v.holderId)}
              />
            </Field>
            <Field id={`${prefix}-mode`} label="Mode">
              <OptionSelect id={`${prefix}-mode`} value={v.mode} onChange={(m) => setV({ ...v, mode: m as ExpenseValues["mode"] })} options={PAYMENT_MODES} />
            </Field>
          </div>
          <Field id={`${prefix}-paidby`} label="Paid by (person)" hint="Optional, e.g. when a player paid and the team reimbursed them.">
            <Input id={`${prefix}-paidby`} maxLength={500} value={v.paidBy ?? ""} onChange={(e) => setV({ ...v, paidBy: e.target.value })} />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {initial ? "Save changes" : "Add expense"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export type IncomeValues = {
  id?: string;
  receivedOn: string;
  category: keyof typeof INCOME_CATEGORIES;
  description: string;
  amount: number;
  holderId: string | null;
  mode: keyof typeof PAYMENT_MODES;
};

export function IncomeDialog({ holders, initial, today }: { holders: Holder[]; initial?: IncomeValues; today: string }) {
  const defaultHolder = holders.find((h) => h.isDefault)?.id ?? null;
  const blank: IncomeValues = { receivedOn: today, category: "sponsorship", description: "", amount: 0, holderId: defaultHolder, mode: "upi" };
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<IncomeValues>(initial ?? blank);
  const { run, pending } = useAction();
  const prefix = `income-${initial?.id ?? "new"}`;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setV(initial ?? blank);
      }}
    >
      <DialogTrigger asChild>
        {initial ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Edit income ${initial.description}`}>
            <Pencil />
          </Button>
        ) : (
          <Button>
            <Plus /> Add income
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Edit income" : "Add income"}</DialogTitle>
          <DialogDescription>Money coming in that is not a player fee: sponsors, ball sales, prize money.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveIncome({ ...v, holderId: v.holderId || null }), initial ? "Income updated" : "Income added", () => setOpen(false));
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field id={`${prefix}-date`} label="Date">
              <Input id={`${prefix}-date`} type="date" required value={v.receivedOn} onChange={(e) => setV({ ...v, receivedOn: e.target.value })} />
            </Field>
            <Field id={`${prefix}-amount`} label="Amount (₹)">
              <Input
                id={`${prefix}-amount`}
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                required
                value={v.amount || ""}
                onChange={(e) => setV({ ...v, amount: Number(e.target.value) })}
              />
            </Field>
          </div>
          <Field id={`${prefix}-category`} label="Category">
            <OptionSelect id={`${prefix}-category`} value={v.category} onChange={(c) => setV({ ...v, category: c as IncomeValues["category"] })} options={INCOME_CATEGORIES} />
          </Field>
          <Field id={`${prefix}-description`} label="Description">
            <Input id={`${prefix}-description`} required minLength={2} maxLength={200} placeholder="e.g. Sponsor for jerseys" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id={`${prefix}-holder`} label="Received by">
              <OptionSelect
                id={`${prefix}-holder`}
                value={v.holderId ?? NONE}
                onChange={(h) => setV({ ...v, holderId: h === NONE ? null : h })}
                options={holderOptions(holders, v.holderId)}
              />
            </Field>
            <Field id={`${prefix}-mode`} label="Mode">
              <OptionSelect id={`${prefix}-mode`} value={v.mode} onChange={(m) => setV({ ...v, mode: m as IncomeValues["mode"] })} options={PAYMENT_MODES} />
            </Field>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {initial ? "Save changes" : "Add income"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Two-step delete: first tap asks, second tap deletes. */
export function ConfirmDelete({ label, onDelete }: { label: string; onDelete: () => Promise<ActionResult> }) {
  const [armed, setArmed] = useState(false);
  const { run, pending } = useAction();
  if (!armed) {
    return (
      <Button variant="ghost" size="icon-sm" aria-label={`Delete ${label}`} onClick={() => setArmed(true)}>
        <Trash2 />
      </Button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <Button variant="destructive" size="sm" disabled={pending} onClick={() => run(onDelete, "Deleted", () => setArmed(false))}>
        {pending ? <Loader2 className="animate-spin" /> : "Delete"}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setArmed(false)}>
        Cancel
      </Button>
    </span>
  );
}

export function DeleteExpenseButton({ id, label }: { id: string; label: string }) {
  return <ConfirmDelete label={label} onDelete={() => deleteExpense({ id })} />;
}

export function DeleteIncomeButton({ id, label }: { id: string; label: string }) {
  return <ConfirmDelete label={label} onDelete={() => deleteIncome({ id })} />;
}
