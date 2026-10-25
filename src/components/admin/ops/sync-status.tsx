import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";

const STYLE: Record<string, string> = {
  success: "bg-success/15 text-success border-success/30",
  failed: "bg-destructive/10 text-destructive border-destructive/30",
  running: "bg-warning/15 text-warning border-warning/30",
  queued: "bg-warning/15 text-warning border-warning/30",
  skipped: "bg-muted text-muted-foreground",
};

export function RunStatusBadge({ status }: { status: string }) {
  const label = { success: "Success", failed: "Failed", running: "Running", queued: "Queued", skipped: "Skipped" }[status] ?? status;
  return (
    <Badge variant="outline" className={cn("font-semibold", STYLE[status])}>
      {label}
    </Badge>
  );
}

type Run = { status: string; startedAt: Date; finishedAt: Date | null; error: string | null } | null;

export function SyncStatusLine({ label, last, lastSuccess }: { label: string; last: Run; lastSuccess: Run }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-2">
      <div className="min-w-0">
        <div className="font-medium">{label}</div>
        <div className="text-sm text-muted-foreground">
          {lastSuccess ? `Last success ${formatDateTime(lastSuccess.startedAt)}` : "Never synced successfully"}
        </div>
        {last?.status === "failed" && last.error && <div className="text-sm break-words text-destructive">{last.error}</div>}
      </div>
      {last ? <RunStatusBadge status={last.status} /> : <Badge variant="outline">Not run</Badge>}
    </div>
  );
}
