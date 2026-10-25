"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

type Row = Record<string, string | number>;

const resultsConfig = {
  won: { label: "Won", color: "var(--success)" },
  lost: { label: "Lost", color: "var(--destructive)" },
} satisfies ChartConfig;

const performanceConfig = {
  runs: { label: "Runs", color: "var(--chart-1)" },
  wickets: { label: "Wickets", color: "var(--chart-2)" },
} satisfies ChartConfig;

const feesConfig = {
  charged: { label: "Charged", color: "var(--chart-4)" },
  collected: { label: "Collected", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function ResultsChart({ data }: { data: Row[] }) {
  return (
    <ChartContainer config={resultsConfig} className="aspect-auto h-64 w-full">
      <BarChart data={data} accessibilityLayer>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="won" stackId="r" fill="var(--color-won)" radius={[0, 0, 4, 4]} />
        <Bar dataKey="lost" stackId="r" fill="var(--color-lost)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}

export function PerformanceChart({ data }: { data: Row[] }) {
  return (
    <ChartContainer config={performanceConfig} className="aspect-auto h-64 w-full">
      <LineChart data={data} accessibilityLayer margin={{ left: 4, right: 4 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis yAxisId="runs" tickLine={false} axisLine={false} width={36} />
        <YAxis yAxisId="wickets" orientation="right" allowDecimals={false} tickLine={false} axisLine={false} width={28} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Line yAxisId="runs" dataKey="runs" stroke="var(--color-runs)" strokeWidth={2} dot={{ r: 3 }} />
        <Line yAxisId="wickets" dataKey="wickets" stroke="var(--color-wickets)" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ChartContainer>
  );
}

export function FeesChart({ data }: { data: Row[] }) {
  return (
    <ChartContainer config={feesConfig} className="aspect-auto h-64 w-full">
      <BarChart data={data} accessibilityLayer>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => `₹${v}`} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="charged" fill="var(--color-charged)" radius={4} />
        <Bar dataKey="collected" fill="var(--color-collected)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}
