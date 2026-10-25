import type { ReactNode } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { initials, rupees } from "@/lib/format";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 pb-4">
      <div className="min-w-0">
        <h1 className="font-heading text-3xl font-bold tracking-wide text-balance sm:text-4xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground sm:text-base">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PlayerAvatar({ name, photo, size = "default", className }: { name: string; photo: string | null; size?: "sm" | "default" | "lg"; className?: string }) {
  return (
    <Avatar size={size} className={className}>
      {photo && <AvatarImage src={photo} alt="" />}
      <AvatarFallback className="bg-accent text-xs font-semibold text-accent-foreground">{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

export function StatTile({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "good" | "bad" | "warn" }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="px-4">
        <div className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{label}</div>
        <div
          className={cn(
            "mt-1 font-heading text-3xl font-bold tabular",
            tone === "good" && "text-success",
            tone === "bad" && "text-destructive",
            tone === "warn" && "text-warning",
          )}
        >
          {value}
        </div>
        {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

const STATUS_STYLE: Record<string, string> = {
  paid: "bg-success/15 text-success border-success/30",
  partial: "bg-warning/15 text-warning border-warning/30",
  unpaid: "bg-destructive/10 text-destructive border-destructive/30",
  waived: "bg-muted text-muted-foreground border-border",
};

export function ChargeStatusBadge({ status }: { status: string }) {
  const label = { paid: "Paid", partial: "Part paid", unpaid: "Not paid", waived: "Waived" }[status] ?? status;
  return (
    <Badge variant="outline" className={cn("font-semibold", STATUS_STYLE[status])}>
      {label}
    </Badge>
  );
}

const OUTCOME_STYLE: Record<string, string> = {
  won: "bg-success/15 text-success border-success/30",
  lost: "bg-destructive/10 text-destructive border-destructive/30",
  abandoned: "bg-muted text-muted-foreground",
  tied: "bg-warning/15 text-warning border-warning/30",
  no_result: "bg-muted text-muted-foreground",
};

export function OutcomeBadge({ outcome }: { outcome: string | null }) {
  if (!outcome) return <Badge variant="outline">Upcoming</Badge>;
  const label = { won: "Won", lost: "Lost", abandoned: "Abandoned", tied: "Tied", no_result: "No result" }[outcome] ?? outcome;
  return (
    <Badge variant="outline" className={cn("font-semibold", OUTCOME_STYLE[outcome])}>
      {label}
    </Badge>
  );
}

export function Money({ value, className, signed }: { value: number; className?: string; signed?: boolean }) {
  return (
    <span className={cn("tabular", signed && value > 0 && "text-destructive", signed && value < 0 && "text-success", className)}>
      {signed && value < 0 ? `${rupees(-value)} credit` : rupees(value)}
    </span>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

/** Horizontal scroll wrapper so wide tables never widen the page on phones. */
export function TableScroll({ children }: { children: ReactNode }) {
  return <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">{children}</div>;
}
