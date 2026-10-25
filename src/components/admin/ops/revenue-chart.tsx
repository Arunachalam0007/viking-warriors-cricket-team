"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const config = {
  charged: { label: "Fees charged", color: "var(--chart-5)" },
  collected: { label: "Collected", color: "var(--chart-1)" },
  income: { label: "Other income", color: "var(--chart-3)" },
  expenses: { label: "Expenses", color: "var(--chart-2)" },
} satisfies ChartConfig;

export type RevenueMonth = { label: string; charged: number; collected: number; income: number; expenses: number };

export function RevenueChart({ data }: { data: RevenueMonth[] }) {
  return (
    <ChartContainer config={config} className="aspect-auto h-72 w-full">
      <BarChart data={data} margin={{ left: 4, right: 4 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => `₹${v.toLocaleString("en-IN")}`} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="charged" fill="var(--color-charged)" radius={3} />
        <Bar dataKey="collected" fill="var(--color-collected)" radius={3} />
        <Bar dataKey="income" fill="var(--color-income)" radius={3} />
        <Bar dataKey="expenses" fill="var(--color-expenses)" radius={3} />
      </BarChart>
    </ChartContainer>
  );
}
