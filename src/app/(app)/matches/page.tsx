import { MapPin } from "lucide-react";
import Link from "next/link";
import { EmptyState, OutcomeBadge, PageHeader, PlayerAvatar } from "@/components/shared";
import { flatParams, MONTH_RE } from "@/components/public/search-params";
import { UrlSelect } from "@/components/url-select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getDb } from "@/db";
import { formatDate, formatMonth, istMonth, monthDateRange, monthsBetween } from "@/lib/dates";
import { getSettings } from "@/modules/settings/settings";
import { getMatches } from "@/modules/stats/queries";

export const metadata = { title: "Matches" };

export default async function MatchesPage(props: PageProps<"/matches">) {
  const sp = flatParams(await props.searchParams);
  const db = getDb();
  const settings = await getSettings(db);
  const [latest] = await getMatches(db, { limit: 1 });
  // Up to this month, or further if a fixture is already scheduled later
  const lastMonth = [istMonth(new Date()), latest ? istMonth(latest.startTime) : ""].sort().at(-1)!;
  const months = monthsBetween(settings.sync_start_date.slice(0, 7), lastMonth);
  const month = sp.month && MONTH_RE.test(sp.month) ? sp.month : undefined;
  const kind = sp.kind === "individual" || sp.kind === "tournament" ? sp.kind : undefined;

  const range = month ? monthDateRange(month) : {};
  const list = await getMatches(db, { ...range, kind });

  return (
    <div className="space-y-5">
      <PageHeader title="Matches & tournaments" description="Fixtures and results synced nightly from CricHeroes." />

      <div className="flex flex-wrap gap-2">
        <UrlSelect name="month" label="Month" allLabel="All months" options={months.map((m) => ({ value: m, label: formatMonth(m) }))} />
        <UrlSelect
          name="kind"
          label="Match type"
          allLabel="All match types"
          options={[
            { value: "individual", label: "Individual / practice" },
            { value: "tournament", label: "Tournament" },
          ]}
        />
      </div>

      {list.length === 0 ? (
        <EmptyState title="No matches found">Try a different month or match type.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {list.map((m) => (
            <li key={m.id}>
              <Link href={`/matches/${m.id}`} className="block rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                <Card className="gap-0 py-0 transition-shadow hover:shadow-md">
                  <CardContent className="flex items-center gap-3 px-3 py-3 sm:px-4">
                    <div className="w-14 shrink-0 text-center">
                      <div className="font-heading text-2xl leading-none font-bold">{formatDate(m.startTime, { day: "numeric" })}</div>
                      <div className="text-xs text-muted-foreground uppercase">{formatDate(m.startTime, { month: "short" })}</div>
                    </div>
                    <PlayerAvatar name={m.opponentName} photo={m.opponentLogo} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">vs {m.opponentName}</div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        {m.status === "past" ? (
                          <span className="tabular">
                            {m.ourScore ?? "–"} · {m.opponentScore ?? "–"}
                          </span>
                        ) : (
                          <span>{formatDate(m.startTime, { hour: "numeric", minute: "2-digit" })}</span>
                        )}
                        {m.ground && (
                          <span className="inline-flex items-center gap-0.5">
                            <MapPin className="size-3" />
                            {m.ground}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <OutcomeBadge outcome={m.outcome} startTime={m.startTime} />
                      <Badge variant="secondary" className="text-[10px]">
                        {m.kind === "tournament" ? "Tournament" : "Individual"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
