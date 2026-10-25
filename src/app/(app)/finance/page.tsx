import { Download } from "lucide-react";
import Link from "next/link";
import { ChargeStatusBadge, EmptyState, Money, PageHeader, PlayerAvatar, StatTile } from "@/components/shared";
import { CopyButton } from "@/components/public/copy-button";
import { LinkTabs } from "@/components/public/link-tabs";
import { flatParams, MONTH_RE, UUID_RE } from "@/components/public/search-params";
import { UrlSelect } from "@/components/url-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db";
import { formatDate, formatMonth, istMonth, monthDateRange, monthsBetween } from "@/lib/dates";
import { rupees } from "@/lib/format";
import {
  getChargeRows,
  getMatchFinanceSummaries,
  getPlayerBalances,
  summarizeByPlayer,
  type ChargeRow,
  type FinanceFilter,
} from "@/modules/finance/queries";
import { getSettings } from "@/modules/settings/settings";
import { getMatches } from "@/modules/stats/queries";

export const metadata = { title: "Finance" };

const STATUSES = ["due", "unpaid", "partial", "paid", "waived"] as const;
const STATUS_LABEL: Record<(typeof STATUSES)[number], string> = {
  due: "Not fully paid",
  unpaid: "Not paid",
  partial: "Part paid",
  paid: "Paid",
  waived: "Waived",
};

type View = "players" | "matches" | "charges";

export default async function FinancePage(props: PageProps<"/finance">) {
  const sp = flatParams(await props.searchParams);
  const db = getDb();
  const settings = await getSettings(db);
  const showPlayers = settings.public_show_balances;

  const months = monthsBetween(settings.finance_start_date.slice(0, 7), istMonth(new Date()));
  const month = sp.month && MONTH_RE.test(sp.month) ? sp.month : undefined;
  const matchId = sp.matchId && UUID_RE.test(sp.matchId) ? sp.matchId : undefined;
  const playerId = showPlayers && sp.playerId && UUID_RE.test(sp.playerId) ? sp.playerId : undefined;
  const status = (STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as FinanceFilter["status"]) : undefined;
  const requestedView: View = sp.view === "matches" || sp.view === "charges" ? sp.view : "players";
  const view: View = showPlayers ? requestedView : "matches";

  const filter: FinanceFilter = { month, matchId, playerId, status };
  const monthRange = month ? monthDateRange(month) : { from: settings.finance_start_date, to: undefined };

  const [rows, matchList, balances] = await Promise.all([
    getChargeRows(db, filter),
    getMatches(db, { status: "past", ...monthRange }),
    getPlayerBalances(db),
  ]);

  const live = rows.filter((r) => !r.waived);
  const charged = live.reduce((s, r) => s + r.amount, 0);
  const collected = rows.reduce((s, r) => s + r.paid, 0);
  const due = rows.reduce((s, r) => s + r.due, 0);

  const exportParams = new URLSearchParams();
  for (const [k, v] of Object.entries({ month, matchId, playerId, status, view })) if (v) exportParams.set(k, v);

  const tabParams = { month, matchId, playerId, status };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Finance"
        description={`Match fees are ${rupees(settings.match_fee)} per squad member for every completed or abandoned individual match since ${formatDate(settings.finance_start_date)}. Tournament and other collections are added by the admin.`}
        actions={
          <Button asChild variant="outline">
            <a href={`/api/export/finance?${exportParams.toString()}`} download>
              <Download /> Export to Excel
            </a>
          </Button>
        }
      />

      {settings.upi_id && (
        <Card className="py-3">
          <CardContent className="flex flex-wrap items-center gap-3 px-4">
            <span className="text-sm text-muted-foreground">Pay via UPI:</span>
            <span className="font-mono font-semibold select-all">{settings.upi_id}</span>
            <CopyButton value={settings.upi_id} label="Copy UPI ID" />
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <UrlSelect
          name="month"
          label="Month"
          allLabel="All months"
          resets={["matchId"]}
          options={months.map((m) => ({ value: m, label: formatMonth(m) }))}
        />
        <UrlSelect
          name="matchId"
          label="Match"
          allLabel="All matches"
          className="max-w-64"
          options={matchList.map((m) => ({
            value: m.id,
            label: `${formatDate(m.startTime, { day: "numeric", month: "short" })} · vs ${m.opponentName}`,
          }))}
        />
        {showPlayers && (
          <UrlSelect
            name="playerId"
            label="Player"
            allLabel="All players"
            options={balances.filter((b) => b.isMember || b.charged > 0).map((b) => ({ value: b.playerId, label: b.name }))}
          />
        )}
        <UrlSelect name="status" label="Status" allLabel="Any status" options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))} />
      </div>

      <section aria-label="Totals" className="grid grid-cols-3 gap-3">
        <StatTile label="Charged" value={rupees(charged)} hint={month ? formatMonth(month) : "All months"} />
        <StatTile label="Collected" value={rupees(collected)} tone="good" />
        <StatTile label="Due" value={rupees(due)} tone={due > 0 ? "bad" : undefined} />
      </section>

      {showPlayers && (
        <LinkTabs
          param="view"
          current={view}
          basePath="/finance"
          searchParams={tabParams}
          tabs={[
            { value: "players", label: "By player" },
            { value: "matches", label: "By match" },
            { value: "charges", label: "All entries" },
          ]}
        />
      )}

      {view === "players" && <PlayersView rows={rows} balances={new Map(balances.map((b) => [b.playerId, b.balance]))} />}
      {view === "matches" && <MatchesView filter={filter} />}
      {view === "charges" && <ChargesView rows={rows} />}
    </div>
  );
}

function PlayersView({ rows, balances }: { rows: ChargeRow[]; balances: Map<string, number> }) {
  const summary = summarizeByPlayer(rows);
  if (summary.length === 0) return <EmptyState title="No charges for this filter" />;
  const total = summary.reduce(
    (t, s) => ({ matches: t.matches + s.matches, charged: t.charged + s.charged, paid: t.paid + s.paid, due: t.due + s.due }),
    { matches: 0, charged: 0, paid: 0, due: 0 },
  );

  return (
    <>
      {/* Phones: cards */}
      <ul className="space-y-2 sm:hidden">
        {summary.map((s) => (
          <li key={s.playerId}>
            <Link href={`/players/${s.playerId}`} className="flex items-center gap-3 rounded-lg border p-3">
              <PlayerAvatar name={s.name} photo={s.photo} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{s.name}</div>
                <div className="text-xs text-muted-foreground tabular">
                  {s.matches} matches · {rupees(s.charged)} charged · {rupees(s.paid)} paid
                </div>
              </div>
              <div className="text-right">
                <div className={s.due > 0 ? "font-semibold text-destructive tabular" : "font-semibold text-success"}>
                  {s.due > 0 ? rupees(s.due) : "Paid"}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase">{s.due > 0 ? "due" : ""}</div>
              </div>
            </Link>
          </li>
        ))}
        <li className="flex justify-between rounded-lg bg-muted px-3 py-2 text-sm font-semibold">
          <span>Total due</span>
          <span className="tabular">{rupees(total.due)}</span>
        </li>
      </ul>

      {/* Tablet / desktop: table */}
      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Player</TableHead>
              <TableHead className="text-right">Matches</TableHead>
              <TableHead className="text-right">Charged</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Due</TableHead>
              <TableHead className="text-right">Overall balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.map((s) => (
              <TableRow key={s.playerId}>
                <TableCell>
                  <Link href={`/players/${s.playerId}`} className="flex items-center gap-2 hover:underline">
                    <PlayerAvatar name={s.name} photo={s.photo} size="sm" />
                    <span className="font-medium">{s.name}</span>
                  </Link>
                </TableCell>
                <TableCell className="text-right tabular">{s.matches}</TableCell>
                <TableCell className="text-right tabular">{rupees(s.charged)}</TableCell>
                <TableCell className="text-right tabular text-success">{rupees(s.paid)}</TableCell>
                <TableCell className="text-right tabular">
                  {s.due > 0 ? <span className="font-semibold text-destructive">{rupees(s.due)}</span> : <ChargeStatusBadge status="paid" />}
                </TableCell>
                <TableCell className="text-right">
                  {(balances.get(s.playerId) ?? 0) === 0 ? (
                    <span className="text-muted-foreground">Settled</span>
                  ) : (
                    <Money value={balances.get(s.playerId) ?? 0} signed />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>Total ({summary.length} players)</TableCell>
              <TableCell className="text-right tabular">{total.matches}</TableCell>
              <TableCell className="text-right tabular">{rupees(total.charged)}</TableCell>
              <TableCell className="text-right tabular">{rupees(total.paid)}</TableCell>
              <TableCell className="text-right tabular">{rupees(total.due)}</TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </>
  );
}

async function MatchesView({ filter }: { filter: FinanceFilter }) {
  const list = await getMatchFinanceSummaries(getDb(), filter);
  if (list.length === 0) return <EmptyState title="No played matches for this filter" />;
  return (
    <>
      <ul className="space-y-2 sm:hidden">
        {list.map((m) => (
          <li key={m.matchId}>
            <Link href={`/matches/${m.matchId}`} className="block rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">vs {m.opponent}</span>
                <span className="text-xs text-muted-foreground">{formatDate(m.startTime, { day: "numeric", month: "short" })}</span>
              </div>
              {m.chargeable ? (
                <div className="mt-1 flex justify-between text-xs tabular">
                  <span className="text-muted-foreground">
                    {m.players} × {rupees(m.feePerPlayer)} = {rupees(m.charged)}
                  </span>
                  <span className={m.due > 0 ? "font-semibold text-destructive" : "font-semibold text-success"}>
                    {m.due > 0 ? `${rupees(m.due)} due` : "All paid"}
                  </span>
                </div>
              ) : (
                <div className="mt-1 text-xs text-muted-foreground">No match fee ({m.kind === "tournament" ? "tournament" : "not charged"})</div>
              )}
            </Link>
          </li>
        ))}
      </ul>
      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Opponent</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Fee</TableHead>
              <TableHead className="text-right">Players</TableHead>
              <TableHead className="text-right">Charged</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Due</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((m) => (
              <TableRow key={m.matchId}>
                <TableCell className="whitespace-nowrap">{formatDate(m.startTime, { day: "numeric", month: "short", year: "numeric" })}</TableCell>
                <TableCell>
                  <Link href={`/matches/${m.matchId}`} className="font-medium hover:underline">
                    {m.opponent}
                  </Link>
                </TableCell>
                <TableCell>
                  {m.chargeable ? (
                    <Badge variant="secondary">{m.kind === "tournament" ? "Tournament" : "Individual"}</Badge>
                  ) : (
                    <Badge variant="outline">Not charged</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right tabular">{m.chargeable ? rupees(m.feePerPlayer) : "–"}</TableCell>
                <TableCell className="text-right tabular">{m.players}</TableCell>
                <TableCell className="text-right tabular">{rupees(m.charged)}</TableCell>
                <TableCell className="text-right tabular text-success">{rupees(m.paid)}</TableCell>
                <TableCell className={m.due > 0 ? "text-right font-semibold text-destructive tabular" : "text-right tabular"}>{rupees(m.due)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={5}>Total ({list.length} matches)</TableCell>
              <TableCell className="text-right tabular">{rupees(list.reduce((s, m) => s + m.charged, 0))}</TableCell>
              <TableCell className="text-right tabular">{rupees(list.reduce((s, m) => s + m.paid, 0))}</TableCell>
              <TableCell className="text-right tabular">{rupees(list.reduce((s, m) => s + m.due, 0))}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </>
  );
}

function ChargesView({ rows }: { rows: ChargeRow[] }) {
  if (rows.length === 0) return <EmptyState title="No entries for this filter" />;
  return (
    <>
      <ul className="space-y-2 sm:hidden">
        {rows.map((r) => (
          <li key={r.chargeId} className="flex items-center gap-3 rounded-lg border p-3">
            <PlayerAvatar name={r.playerName} photo={r.playerPhoto} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{r.playerName}</div>
              <div className="truncate text-xs text-muted-foreground">
                {formatDate(r.chargeDate, { day: "numeric", month: "short" })} · {r.description}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-sm font-semibold tabular">{rupees(r.amount)}</span>
              <ChargeStatusBadge status={r.status} />
            </div>
          </li>
        ))}
      </ul>
      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Player</TableHead>
              <TableHead>For</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.chargeId}>
                <TableCell className="whitespace-nowrap">{formatDate(r.chargeDate, { day: "numeric", month: "short", year: "numeric" })}</TableCell>
                <TableCell>
                  <Link href={`/players/${r.playerId}`} className="font-medium hover:underline">
                    {r.playerName}
                  </Link>
                </TableCell>
                <TableCell>
                  {r.matchId ? (
                    <Link href={`/matches/${r.matchId}`} className="hover:underline">
                      {r.description}
                    </Link>
                  ) : (
                    r.description
                  )}
                </TableCell>
                <TableCell className="text-right tabular">{rupees(r.amount)}</TableCell>
                <TableCell className="text-right tabular">{rupees(r.paid)}</TableCell>
                <TableCell className="text-right">
                  <ChargeStatusBadge status={r.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
