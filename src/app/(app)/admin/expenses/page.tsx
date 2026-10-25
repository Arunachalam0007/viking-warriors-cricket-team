import type { Metadata } from "next";
import { CashHoldersCard } from "@/components/admin/ops/cash-holders-card";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, PAYMENT_MODES } from "@/components/admin/ops/labels";
import { DeleteExpenseButton, DeleteIncomeButton, ExpenseDialog, IncomeDialog } from "@/components/admin/ops/money-forms";
import { EmptyState, PageHeader, StatTile } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UrlSelect } from "@/components/url-select";
import { getDb } from "@/db";
import { formatDate, formatMonth, monthsBetween, todayIst } from "@/lib/dates";
import { rupees } from "@/lib/format";
import { listCashHolders, listExpenses, listIncome } from "@/modules/admin/queries";
import { getSettings } from "@/modules/settings/settings";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Expenses & income" };

export default async function ExpensesPage({ searchParams }: PageProps<"/admin/expenses">) {
  // Layouts and pages render in parallel, so each admin page must check on its own.
  await requireAdmin();
  const sp = await searchParams;
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : undefined;
  const tab = sp.tab === "income" ? "income" : "expenses";
  const db = getDb();
  const [holders, allExpenses, allIncome, settings] = await Promise.all([listCashHolders(db), listExpenses(db), listIncome(db), getSettings(db)]);
  const today = todayIst();

  const expenses = month ? allExpenses.filter((e) => e.expense.spentOn.startsWith(month)) : allExpenses;
  const incomeRows = month ? allIncome.filter((i) => i.income.receivedOn.startsWith(month)) : allIncome;
  const expenseTotal = expenses.reduce((s, e) => s + e.expense.amount, 0);
  const incomeTotal = incomeRows.reduce((s, i) => s + i.income.amount, 0);

  const firstMonth = [settings.finance_start_date, ...allExpenses.map((e) => e.expense.spentOn), ...allIncome.map((i) => i.income.receivedOn)]
    .sort()[0]
    .slice(0, 7);
  const monthOptions = monthsBetween(firstMonth, today.slice(0, 7)).map((m) => ({ value: m, label: formatMonth(m) }));
  const holderList = holders.map((h) => ({ id: h.id, name: h.name, isDefault: h.isDefault, isActive: h.isActive }));

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Expenses & income"
        description="Team spending (balls, grounds, kit) and money that is not a player fee (sponsors, ball sales)."
        actions={<UrlSelect name="month" label="Month" allLabel="All months" options={monthOptions} />}
      />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Totals">
        <StatTile label="Expenses" value={rupees(expenseTotal)} hint={month ? formatMonth(month) : "All time"} />
        <StatTile label="Income" value={rupees(incomeTotal)} hint={month ? formatMonth(month) : "All time"} />
        <StatTile label="Net" value={rupees(incomeTotal - expenseTotal)} tone={incomeTotal - expenseTotal < 0 ? "bad" : "good"} hint="Income − expenses" />
      </section>

      <Tabs defaultValue={tab}>
        <TabsList>
          <TabsTrigger value="expenses">Expenses ({expenses.length})</TabsTrigger>
          <TabsTrigger value="income">Income ({incomeRows.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="expenses" className="grid gap-3 pt-3">
          <div className="flex justify-end">
            <ExpenseDialog holders={holderList} today={today} />
          </div>
          <Card className="py-0">
            <CardContent className="px-0">
              {expenses.length === 0 ? (
                <div className="p-4">
                  <EmptyState title="No expenses recorded">Add the first one with “Add expense”.</EmptyState>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="hidden md:table-cell">Paid from</TableHead>
                      <TableHead className="hidden md:table-cell">Mode</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="w-24 pr-4">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.map(({ expense: e, holderName }) => (
                      <TableRow key={e.id}>
                        <TableCell className="pl-4 whitespace-nowrap">{formatDate(e.spentOn, { day: "numeric", month: "short" })}</TableCell>
                        <TableCell className="min-w-48 whitespace-normal">
                          <div className="font-medium">{e.description}</div>
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            <Badge variant="secondary">{EXPENSE_CATEGORIES[e.category as keyof typeof EXPENSE_CATEGORIES] ?? e.category}</Badge>
                            {e.paidBy && <span className="text-xs text-muted-foreground">Paid by {e.paidBy}</span>}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">{holderName ?? "—"}</TableCell>
                        <TableCell className="hidden md:table-cell">{PAYMENT_MODES[e.mode as keyof typeof PAYMENT_MODES] ?? e.mode}</TableCell>
                        <TableCell className="text-right font-semibold tabular">{rupees(e.amount)}</TableCell>
                        <TableCell className="pr-4">
                          <div className="flex justify-end gap-1">
                            <ExpenseDialog
                              holders={holderList}
                              today={today}
                              initial={{
                                id: e.id,
                                spentOn: e.spentOn,
                                category: e.category as keyof typeof EXPENSE_CATEGORIES,
                                description: e.description,
                                amount: e.amount,
                                holderId: e.holderId,
                                paidBy: e.paidBy,
                                mode: e.mode as keyof typeof PAYMENT_MODES,
                              }}
                            />
                            <DeleteExpenseButton id={e.id} label={e.description} />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell className="pl-4" colSpan={2}>
                        Total
                      </TableCell>
                      <TableCell className="hidden md:table-cell" colSpan={2} />
                      <TableCell className="text-right tabular">{rupees(expenseTotal)}</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableFooter>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="income" className="grid gap-3 pt-3">
          <div className="flex justify-end">
            <IncomeDialog holders={holderList} today={today} />
          </div>
          <Card className="py-0">
            <CardContent className="px-0">
              {incomeRows.length === 0 ? (
                <div className="p-4">
                  <EmptyState title="No income recorded">Sponsorships, ball sales and prize money go here.</EmptyState>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="hidden md:table-cell">Received by</TableHead>
                      <TableHead className="hidden md:table-cell">Mode</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="w-24 pr-4">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {incomeRows.map(({ income: i, holderName }) => (
                      <TableRow key={i.id}>
                        <TableCell className="pl-4 whitespace-nowrap">{formatDate(i.receivedOn, { day: "numeric", month: "short" })}</TableCell>
                        <TableCell className="min-w-48 whitespace-normal">
                          <div className="font-medium">{i.description}</div>
                          <Badge variant="secondary" className="mt-0.5">
                            {INCOME_CATEGORIES[i.category as keyof typeof INCOME_CATEGORIES] ?? i.category}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">{holderName ?? "—"}</TableCell>
                        <TableCell className="hidden md:table-cell">{PAYMENT_MODES[i.mode as keyof typeof PAYMENT_MODES] ?? i.mode}</TableCell>
                        <TableCell className="text-right font-semibold tabular">{rupees(i.amount)}</TableCell>
                        <TableCell className="pr-4">
                          <div className="flex justify-end gap-1">
                            <IncomeDialog
                              holders={holderList}
                              today={today}
                              initial={{
                                id: i.id,
                                receivedOn: i.receivedOn,
                                category: i.category as keyof typeof INCOME_CATEGORIES,
                                description: i.description,
                                amount: i.amount,
                                holderId: i.holderId,
                                mode: i.mode as keyof typeof PAYMENT_MODES,
                              }}
                            />
                            <DeleteIncomeButton id={i.id} label={i.description} />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell className="pl-4" colSpan={2}>
                        Total
                      </TableCell>
                      <TableCell className="hidden md:table-cell" colSpan={2} />
                      <TableCell className="text-right tabular">{rupees(incomeTotal)}</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableFooter>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <CashHoldersCard holders={holderList} />
    </div>
  );
}
