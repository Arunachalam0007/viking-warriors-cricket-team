import type { Metadata } from "next";
import { RebuildSheetButton, SyncNowButton } from "@/components/admin/ops/sync-buttons";
import { AutoRefreshWhile } from "@/components/admin/ops/auto-refresh";
import { RunStatusBadge, SyncAgentLine, SyncStatusLine } from "@/components/admin/ops/sync-status";
import { EmptyState, PageHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db";
import { formatDateTime } from "@/lib/dates";
import { lastSuccessfulSync, listAudit, listSyncRuns } from "@/modules/admin/queries";
import { agentStatus, syncViaAgent } from "@/modules/sync/queue";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Sync & logs" };

function duration(start: Date, end: Date | null) {
  if (!end) return "—";
  const s = Math.round((end.getTime() - start.getTime()) / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

const SUMMARY_LABELS: Record<string, string> = {
  matchesSeen: "seen",
  matchesNew: "new",
  scorecardsFetched: "scorecards",
  playersNew: "new players",
  chargesCreated: "fees +",
  chargesRemoved: "fees −",
};

function SummaryText({ kind, summary }: { kind: string; summary: unknown }) {
  if (!summary || typeof summary !== "object") return null;
  const s = summary as Record<string, unknown>;
  if (kind === "sheets") {
    const tabs = Array.isArray(s.tabs) ? s.tabs.length : null;
    return tabs !== null ? <span>{tabs} tabs written</span> : null;
  }
  const parts = Object.entries(SUMMARY_LABELS)
    .filter(([k]) => typeof s[k] === "number")
    .map(([k, label]) => `${s[k]} ${label}`);
  const warnings = Array.isArray(s.warnings) ? (s.warnings as string[]) : [];
  return (
    <span>
      {parts.join(" · ")}
      {warnings.length > 0 && (
        <span className="block text-warning">
          {warnings.length} warning{warnings.length > 1 ? "s" : ""}: {warnings[0]}
        </span>
      )}
    </span>
  );
}

export default async function SyncPage() {
  // Layouts and pages render in parallel, so each admin page must check on its own.
  await requireAdmin();
  const db = getDb();
  const [runs, auditRows, ch, sheets, agent] = await Promise.all([
    listSyncRuns(db, 40),
    listAudit(db, 100),
    lastSuccessfulSync(db, "cricheroes"),
    lastSuccessfulSync(db, "sheets"),
    agentStatus(db),
  ]);
  const syncInFlight = runs.some((r) => r.status === "queued" || r.status === "running");

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Sync & logs"
        description="CricHeroes and the Google Sheet update automatically every night at 23:30 IST. Use these buttons to update right now."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="font-heading text-2xl tracking-wide">CricHeroes</CardTitle>
            <CardDescription>Reads the team&apos;s matches, scorecards and squad, then applies match fees. Admin edits are never overwritten.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <SyncStatusLine label="Last run" last={ch.last} lastSuccess={ch.lastSuccess} />
            {syncViaAgent() && <SyncAgentLine {...agent} />}
            <SyncNowButton />
            <AutoRefreshWhile active={syncInFlight} />
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="font-heading text-2xl tracking-wide">Google Sheet</CardTitle>
            <CardDescription>Rewrites the month-wise tabs, summary, payments, expenses and income from the database.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <SyncStatusLine label="Last run" last={sheets.last} lastSuccess={sheets.lastSuccess} />
            <RebuildSheetButton />
          </CardContent>
        </Card>
      </div>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="font-heading text-2xl tracking-wide">Sync history</CardTitle>
          <CardDescription>The last 40 runs.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {runs.length === 0 ? (
            <div className="px-6">
              <EmptyState title="No syncs yet">Run the first sync with “Sync CricHeroes now”.</EmptyState>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Started</TableHead>
                  <TableHead>What</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Took</TableHead>
                  <TableHead className="pr-6">Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="pl-6 whitespace-nowrap">{formatDateTime(r.startedAt)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {r.kind === "cricheroes" ? "CricHeroes" : "Google Sheet"}
                      <span className="block text-xs text-muted-foreground">{{ cron: "Nightly", manual: "Manual", change: "After an edit" }[r.trigger] ?? r.trigger}</span>
                    </TableCell>
                    <TableCell>
                      <RunStatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="hidden sm:table-cell tabular">{duration(r.startedAt, r.finishedAt)}</TableCell>
                    <TableCell className="max-w-md min-w-56 pr-6 text-sm whitespace-normal">
                      {r.error ? <span className="text-destructive">{r.error}</span> : <SummaryText kind={r.kind} summary={r.summary} />}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="font-heading text-2xl tracking-wide">Audit log</CardTitle>
          <CardDescription>Every admin change: who made it, when, and what changed. The latest 100 entries.</CardDescription>
        </CardHeader>
        <CardContent>
          {auditRows.length === 0 ? (
            <EmptyState title="No admin changes yet" />
          ) : (
            <ul className="divide-y">
              {auditRows.map((a) => (
                <li key={a.id} className="py-2.5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Badge variant="secondary" className="font-mono text-[11px]">
                      {a.action}
                    </Badge>
                    <span className="text-sm">{a.actor}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{formatDateTime(a.at)}</span>
                  </div>
                  {(a.before != null || a.after != null) && (
                    <details className="mt-1 text-sm">
                      <summary className="cursor-pointer text-muted-foreground select-none">
                        {a.entity}
                        {a.entityId ? ` · ${a.entityId.slice(0, 8)}` : ""} — show details
                      </summary>
                      <div className="mt-2 grid gap-2 md:grid-cols-2">
                        {a.before != null && (
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-muted-foreground uppercase">Before</div>
                            <pre className="mt-1 overflow-x-auto rounded-md bg-muted p-2 text-xs">{JSON.stringify(a.before, null, 2)}</pre>
                          </div>
                        )}
                        {a.after != null && (
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-muted-foreground uppercase">After</div>
                            <pre className="mt-1 overflow-x-auto rounded-md bg-muted p-2 text-xs">{JSON.stringify(a.after, null, 2)}</pre>
                          </div>
                        )}
                      </div>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
