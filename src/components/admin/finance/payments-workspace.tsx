"use client";

import { ArrowDownUp, HandCoins, Loader2, Plus } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Money, PlayerAvatar } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { rupees } from "@/lib/format";
import { addAdjustment, recordPaymentAction } from "@/modules/finance/actions";
import { useAction } from "../use-action";
import { PaymentOptions, usePaymentOptions, type HolderOption } from "./payment-options";

export type BalanceRow = {
  playerId: string;
  name: string;
  photo: string | null;
  isMember: boolean;
  charged: number;
  paid: number;
  balance: number;
};

function balanceLabel(b: number) {
  if (b > 0) return `owes ${rupees(b)}`;
  if (b < 0) return `${rupees(-b)} credit`;
  return "settled";
}

function PlayerSelect({ id, players, value, onChange }: { id: string; players: BalanceRow[]; value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="h-10 w-full">
        <SelectValue placeholder="Choose a player" />
      </SelectTrigger>
      <SelectContent>
        {players.map((p) => (
          <SelectItem key={p.playerId} value={p.playerId}>
            {p.name} · {balanceLabel(p.balance)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function PaymentsWorkspace({ balances, holders, today }: { balances: BalanceRow[]; holders: HolderOption[]; today: string }) {
  const [playerId, setPlayerId] = useState("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [opts, setOpts] = usePaymentOptions(holders, today);
  const { run, pending } = useAction();
  const formRef = useRef<HTMLDivElement>(null);
  const [sortDesc, setSortDesc] = useState(true);

  const sorted = useMemo(
    () => [...balances].sort((a, b) => (sortDesc ? b.balance - a.balance : a.balance - b.balance) || a.name.localeCompare(b.name)),
    [balances, sortDesc],
  );
  const selected = balances.find((b) => b.playerId === playerId);

  const prefill = (b: BalanceRow) => {
    setPlayerId(b.playerId);
    setAmount(b.balance > 0 ? String(b.balance) : "");
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="grid gap-5">
      <div ref={formRef} className="scroll-mt-20">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-heading text-2xl tracking-wide">
              <HandCoins className="size-5" /> Record a payment
            </CardTitle>
            <CardDescription>
              Money settles the player&apos;s oldest unpaid fees first. Anything extra is kept as credit and used
              automatically for their next fees.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                run(
                  () => recordPaymentAction({ playerId, amount: Number(amount), reference, note, ...opts }),
                  `${rupees(Number(amount))} recorded for ${selected?.name ?? "player"}`,
                  () => {
                    setAmount("");
                    setReference("");
                    setNote("");
                  },
                );
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="pay-player">Player</Label>
                  <PlayerSelect id="pay-player" players={sorted} value={playerId} onChange={setPlayerId} />
                  {selected && (
                    <p className="text-xs text-muted-foreground">
                      Charged {rupees(selected.charged)} · paid {rupees(selected.paid)} · {balanceLabel(selected.balance)}
                    </p>
                  )}
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="pay-amount">Amount (₹)</Label>
                  <Input
                    id="pay-amount"
                    inputMode="numeric"
                    required
                    className="h-10 tabular"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
                    placeholder="e.g. 200"
                  />
                </div>
              </div>
              <PaymentOptions idPrefix="pay" holders={holders} value={opts} onChange={setOpts} />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="pay-ref">UPI reference (optional)</Label>
                  <Input id="pay-ref" className="h-10" value={reference} onChange={(e) => setReference(e.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="pay-note">Note (optional)</Label>
                  <Input id="pay-note" className="h-10" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. October fees" />
                </div>
              </div>
              <Button type="submit" className="h-10 w-full sm:w-fit" disabled={pending || !playerId || !Number(amount)}>
                {pending ? <Loader2 className="animate-spin" /> : <Plus />} Record payment
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="font-heading text-2xl tracking-wide">Balances</CardTitle>
            <CardDescription>All-time: charged minus paid. Credit means the player paid in advance.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => setSortDesc((s) => !s)}>
            <ArrowDownUp /> {sortDesc ? "Highest due first" : "Most credit first"}
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Player</TableHead>
                <TableHead className="text-right">Charged</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((b) => (
                <TableRow key={b.playerId}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <PlayerAvatar name={b.name} photo={b.photo} size="sm" />
                      <span className="font-medium">{b.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular">{rupees(b.charged)}</TableCell>
                  <TableCell className="text-right tabular">{rupees(b.paid)}</TableCell>
                  <TableCell className="text-right font-semibold">
                    <Money value={b.balance} signed />
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" className="h-9" onClick={() => prefill(b)}>
                      Record payment
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AdjustmentForm players={sorted} today={today} />
    </div>
  );
}

function AdjustmentForm({ players, today }: { players: BalanceRow[]; today: string }) {
  const [playerId, setPlayerId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("Opening balance from old sheet");
  const [date, setDate] = useState(today);
  const { run, pending } = useAction();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-2xl tracking-wide">Adjustment / opening balance</CardTitle>
        <CardDescription>
          Adds a one-off amount a player owes, for example dues carried over from the old Excel sheet or a fine. To give
          credit instead, record a payment.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => addAdjustment({ playerId, amount: Number(amount), description, date }),
              "Adjustment added",
              () => setAmount(""),
            );
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="adj-player">Player</Label>
            <PlayerSelect id="adj-player" players={players} value={playerId} onChange={setPlayerId} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="adj-amount">Amount owed (₹)</Label>
            <Input
              id="adj-amount"
              inputMode="numeric"
              className="h-10 tabular"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="adj-desc">Description</Label>
            <Input id="adj-desc" className="h-10" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="adj-date">Date</Label>
            <Input id="adj-date" type="date" className="h-10" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <Button type="submit" variant="outline" className="h-10 sm:w-fit" disabled={pending || !playerId || !Number(amount)}>
            {pending ? <Loader2 className="animate-spin" /> : <Plus />} Add adjustment
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
