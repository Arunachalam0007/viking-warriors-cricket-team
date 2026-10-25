import Link from "next/link";
import { EmptyState, PageHeader, PlayerAvatar } from "@/components/shared";
import { LinkTabs } from "@/components/public/link-tabs";
import { DATE_RE, flatParams, MONTH_RE } from "@/components/public/search-params";
import { UrlSelect } from "@/components/url-select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db";
import { addDays, formatDate, formatMonth, istMonth, monthDateRange, monthsBetween, todayIst, weekStart } from "@/lib/dates";
import { economy, strikeRate } from "@/lib/format";
import { getSettings } from "@/modules/settings/settings";
import { MVP_POINTS } from "@/modules/stats/mvp";
import { getPlayerStats, type PlayerStats } from "@/modules/stats/queries";

export const metadata = { title: "Leaderboard" };

type Period = "week" | "month" | "season";

export default async function LeaderboardPage(props: PageProps<"/leaderboard">) {
  const sp = flatParams(await props.searchParams);
  const db = getDb();
  const settings = await getSettings(db);
  const today = todayIst();

  const period: Period = sp.period === "week" || sp.period === "season" ? sp.period : "month";

  const thisWeek = weekStart(today);
  const weeks = Array.from({ length: 12 }, (_, i) => addDays(thisWeek, -7 * i));
  const months = monthsBetween(settings.sync_start_date.slice(0, 7), istMonth(new Date()));

  let from: string;
  let to: string;
  let title: string;
  if (period === "week") {
    const week = sp.week && DATE_RE.test(sp.week) ? weekStart(sp.week) : thisWeek;
    from = week;
    to = addDays(week, 6);
    title = `Week of ${formatDate(from, { day: "numeric", month: "short" })}`;
  } else if (period === "month") {
    const month = sp.month && MONTH_RE.test(sp.month) ? sp.month : months[0];
    ({ from, to } = monthDateRange(month));
    title = formatMonth(month);
  } else {
    from = settings.sync_start_date;
    to = today;
    title = `Season since ${formatDate(from)}`;
  }

  const stats = await getPlayerStats(db, { from, to });
  const mvp = [...stats].sort((a, b) => b.mvp - a.mvp || b.runs - a.runs).slice(0, 10);
  const runs = [...stats].filter((s) => s.runs > 0).sort((a, b) => b.runs - a.runs).slice(0, 5);
  const wickets = [...stats]
    .filter((s) => s.wickets > 0)
    .sort((a, b) => b.wickets - a.wickets || a.runsConceded / Math.max(a.ballsBowled, 1) - b.runsConceded / Math.max(b.ballsBowled, 1))
    .slice(0, 5);
  const fielders = [...stats]
    .filter((s) => s.catches + s.stumpings + s.runOuts > 0)
    .sort((a, b) => b.catches + b.stumpings + b.runOuts - (a.catches + a.stumpings + a.runOuts))
    .slice(0, 5);
  const strikers = [...stats]
    .filter((s) => s.balls >= 30)
    .sort((a, b) => b.runs / b.balls - a.runs / a.balls)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <PageHeader title="Leaderboard" description="Weekly top players, monthly performers and the season table, ranked by MVP points." />

      <div className="flex flex-wrap items-center gap-3">
        <LinkTabs
          param="period"
          current={period}
          basePath="/leaderboard"
          searchParams={{}}
          tabs={[
            { value: "week", label: "Weekly top" },
            { value: "month", label: "Monthly performers" },
            { value: "season", label: "Season" },
          ]}
        />
        {period === "week" && (
          <UrlSelect
            name="week"
            label="Week"
            options={weeks.map((w) => ({
              value: w,
              label: `${formatDate(w, { day: "numeric", month: "short" })} – ${formatDate(addDays(w, 6), { day: "numeric", month: "short" })}`,
            }))}
          />
        )}
        {period === "month" && <UrlSelect name="month" label="Month" options={months.map((m) => ({ value: m, label: formatMonth(m) }))} />}
      </div>

      <h2 className="font-heading text-2xl font-bold tracking-wide">{title}</h2>

      {stats.length === 0 ? (
        <EmptyState title="No matches in this period">Pick another week or month.</EmptyState>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-xl tracking-wide">MVP ranking</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Player</TableHead>
                    <TableHead className="text-right">Mat</TableHead>
                    <TableHead className="text-right">Runs</TableHead>
                    <TableHead className="text-right">Wkts</TableHead>
                    <TableHead className="text-right">Ct/St/RO</TableHead>
                    <TableHead className="text-right">Points</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mvp.map((p, i) => (
                    <TableRow key={p.playerId}>
                      <TableCell className="font-heading text-lg font-bold text-primary">{i + 1}</TableCell>
                      <TableCell>
                        <PlayerLink p={p} />
                      </TableCell>
                      <TableCell className="text-right tabular">{p.matches}</TableCell>
                      <TableCell className="text-right tabular">{p.runs}</TableCell>
                      <TableCell className="text-right tabular">{p.wickets}</TableCell>
                      <TableCell className="text-right tabular">
                        {p.catches}/{p.stumpings}/{p.runOuts}
                      </TableCell>
                      <TableCell className="text-right font-heading text-lg font-bold tabular">{p.mvp}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Board title="Most runs" rows={runs} value={(p) => p.runs} detail={(p) => `${p.innings} inns · SR ${strikeRate(p.runs, p.balls)}`} />
            <Board title="Most wickets" rows={wickets} value={(p) => p.wickets} detail={(p) => `Econ ${economy(p.runsConceded, p.ballsBowled)}`} />
            <Board
              title="Most catches & dismissals"
              rows={fielders}
              value={(p) => p.catches + p.stumpings + p.runOuts}
              detail={(p) => `${p.catches} ct · ${p.stumpings} st · ${p.runOuts} ro`}
            />
            <Board
              title="Best strike rate (30+ balls)"
              rows={strikers}
              value={(p) => strikeRate(p.runs, p.balls)}
              detail={(p) => `${p.runs} runs off ${p.balls}`}
            />
          </div>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-xl tracking-wide">How MVP points work</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3 lg:grid-cols-4">
            {(
              [
                ["Each run", MVP_POINTS.run],
                ["Each four (bonus)", MVP_POINTS.four],
                ["Each six (bonus)", MVP_POINTS.six],
                ["Fifty", MVP_POINTS.fifty],
                ["Hundred", MVP_POINTS.hundred],
                ["Each wicket", MVP_POINTS.wicket],
                ["3+ wickets (bonus)", MVP_POINTS.threeWicketHaul],
                ["Maiden over", MVP_POINTS.maiden],
                ["Catch", MVP_POINTS.catch],
                ["Stumping", MVP_POINTS.stumping],
                ["Run out", MVP_POINTS.runOut],
              ] as const
            ).map(([label, pts]) => (
              <div key={label} className="flex justify-between border-b py-1">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-semibold tabular">{pts}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

function PlayerLink({ p }: { p: PlayerStats }) {
  return (
    <Link href={`/players/${p.playerId}`} className="flex min-w-0 items-center gap-2 hover:underline">
      <PlayerAvatar name={p.name} photo={p.photo} size="sm" />
      <span className="truncate font-medium">{p.name}</span>
      {!p.isMember && (
        <Badge variant="outline" className="text-[10px]">
          Guest
        </Badge>
      )}
    </Link>
  );
}

function Board({
  title,
  rows,
  value,
  detail,
}: {
  title: string;
  rows: PlayerStats[];
  value: (p: PlayerStats) => string | number;
  detail: (p: PlayerStats) => string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-xl tracking-wide">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody qualifies yet.</p>
        ) : (
          <ol className="space-y-1.5">
            {rows.map((p, i) => (
              <li key={p.playerId} className="flex items-center gap-2">
                <span className="w-5 text-center text-sm font-semibold text-muted-foreground">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <PlayerLink p={p} />
                  <div className="pl-8 text-xs text-muted-foreground">{detail(p)}</div>
                </div>
                <span className="font-heading text-xl font-bold tabular">{value(p)}</span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
