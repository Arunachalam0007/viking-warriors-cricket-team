"use client";

import { FileSpreadsheet, Loader2, RefreshCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useAction } from "@/components/admin/use-action";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { runSyncNow, syncSheetNow } from "@/modules/settings/actions";

type SyncSummary = {
  matchesSeen: number;
  matchesNew: number;
  matchesUpdated: number;
  matchesRemoved?: number;
  scorecardsFetched: number;
  playersNew: number;
  chargesCreated: number;
  chargesRemoved: number;
  warnings: string[];
};

type SheetResult = { status?: string; reason?: string; tabs?: string[] };

export function SyncNowButton({ showSummary = true, size = "default" }: { showSummary?: boolean; size?: "default" | "sm" }) {
  const { run, pending } = useAction();
  const router = useRouter();
  const [result, setResult] = useState<{ summary: SyncSummary; sheets: SheetResult } | null>(null);

  return (
    <div className="grid gap-3">
      <Button
        size={size}
        disabled={pending}
        onClick={() =>
          run(runSyncNow, undefined, (data) => {
            if (data && "queued" in data) {
              // Live site: the sync helper on the team's Mac runs it (see modules/sync/queue.ts)
              toast.success(data.alreadyQueued ? "A sync is already on its way" : "Sync requested", {
                description: "The sync helper on the Mac picks it up within a minute. This page updates when it's done.",
              });
              router.refresh();
              return;
            }
            toast.success("CricHeroes sync finished");
            setResult((data as { summary: SyncSummary; sheets: SheetResult }) ?? null);
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : <RefreshCcw />}
        {pending ? "Syncing…" : "Sync CricHeroes now"}
      </Button>
      {showSummary && result && <SyncSummaryView summary={result.summary} sheets={result.sheets} />}
    </div>
  );
}

export function RebuildSheetButton() {
  const { run, pending } = useAction();
  return (
    <Button variant="outline" disabled={pending} onClick={() => run(syncSheetNow, "Google Sheet rebuilt")}>
      {pending ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />}
      {pending ? "Rebuilding…" : "Rebuild Google Sheet now"}
    </Button>
  );
}

function SyncSummaryView({ summary, sheets }: { summary: SyncSummary; sheets: SheetResult }) {
  const items: [string, number][] = [
    ["Matches seen", summary.matchesSeen],
    ["New matches", summary.matchesNew],
    ["Updated matches", summary.matchesUpdated],
    ["Removed matches", summary.matchesRemoved ?? 0],
    ["Scorecards read", summary.scorecardsFetched],
    ["New players", summary.playersNew],
    ["Fees created", summary.chargesCreated],
    ["Fees removed", summary.chargesRemoved],
  ];
  return (
    <Alert>
      <AlertTitle>Last sync result</AlertTitle>
      <AlertDescription>
        <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
          {items.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-semibold tabular">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-sm">
          Google Sheet: {sheets?.status === "success" ? "updated" : (sheets?.reason ?? sheets?.status ?? "not run")}
        </p>
        {summary.warnings.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-sm text-warning">
            {summary.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
      </AlertDescription>
    </Alert>
  );
}
