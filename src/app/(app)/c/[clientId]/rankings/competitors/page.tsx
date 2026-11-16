import type { Metadata } from "next";
import Link from "next/link";
import { Swords } from "lucide-react";
import { BarList } from "@/components/charts/bar-list";
import { AddCompetitorForm, RemoveCompetitorButton } from "@/components/rank/rank-dialogs";
import { RankNav } from "@/components/rank/rank-nav";
import { DateRangePicker } from "@/components/shell/date-range-picker";
import { PageHeader } from "@/components/shell/page-header";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/card";
import { requireClientAccess } from "@/lib/auth/guards";
import { cn } from "@/lib/cn";
import { resolveRange } from "@/lib/dates";
import { formatDecimal, formatInt } from "@/lib/format";
import { carryQuery, parseRankFilters } from "@/lib/rank/params";
import { getCompetitorComparison, getKeywordTags } from "@/lib/rank/queries";

export const metadata: Metadata = { title: "Competitors" };

export default async function CompetitorsPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { clientId } = await params;
  const sp = await searchParams;
  const ctx = await requireClientAccess(clientId);
  const { client, isStaff } = ctx;

  const selection = resolveRange(sp, client.timezone, { endOffset: 0 });
  const filters = parseRankFilters(sp);
  const query = carryQuery(sp);
  const [comparison, tags] = await Promise.all([
    getCompetitorComparison(ctx, selection.current, filters),
    getKeywordTags(ctx),
  ]);
  const { competitors, summary, rows } = comparison;

  // How often the client outranks every tracked competitor.
  const wins = rows.filter(
    (r) =>
      r.own !== null &&
      competitors.every((c) => {
        const p = r.rivals[c.id];
        return p == null || r.own! < p;
      }),
  ).length;

  return (
    <>
      <PageHeader
        eyebrow={client.name}
        title="Rankings"
        description={`How ${client.domain} compares with competitors on the same searches.`}
        actions={
          <DateRangePicker
            preset={selection.preset}
            label={selection.label}
            from={selection.current.from}
            to={selection.current.to}
            compare={selection.compare}
            showCompare={false}
          />
        }
      />
      <RankNav clientId={client.id} query={query} filters={filters} tags={tags} showExport={false} />

      <div className="space-y-5">
        {isStaff ? (
          <Card>
            <CardHeader
              title="Competitors tracked"
              description="Competitor positions come from the same searches as the client's keywords, so tracking them costs nothing extra. Up to 7."
            />
            <div className="space-y-4 px-5 pb-5">
              {competitors.length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                  {competitors.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center gap-2 rounded-lg border border-line bg-paper py-1 pr-1 pl-3 text-sm"
                    >
                      <span className="font-medium text-ink">{c.label}</span>
                      {c.label !== c.domain ? <span className="text-xs text-muted">{c.domain}</span> : null}
                      <RemoveCompetitorButton clientId={client.id} competitorId={c.id} label={c.label} />
                    </li>
                  ))}
                </ul>
              ) : null}
              <AddCompetitorForm clientId={client.id} />
            </div>
          </Card>
        ) : null}

        {competitors.length === 0 ? (
          <Card>
            <EmptyState icon={<Swords className="h-5 w-5" />} title="No competitors are being tracked yet">
              {isStaff
                ? "Add the websites this client competes with to see who ranks above them for each keyword."
                : "omniSEO has not added competitors to track yet. Ask us if there are rivals you would like to keep an eye on."}
            </EmptyState>
          </Card>
        ) : rows.length === 0 ? (
          <Card>
            <EmptyState icon={<Swords className="h-5 w-5" />} title="Waiting for the first rank check">
              Competitor positions are recorded each time the client&apos;s keywords are checked.
            </EmptyState>
          </Card>
        ) : (
          <>
            <div className="grid gap-5 lg:grid-cols-2">
              <Card>
                <CardHeader
                  title="Keywords in the top 10"
                  description={`Out of ${formatInt(rows.length)} tracked keywords.`}
                />
                <div className="px-5 pb-5">
                  <BarList
                    items={[...summary]
                      .sort((a, b) => b.top10 - a.top10)
                      .map((s) => ({
                        key: s.id ?? "own",
                        label: s.label,
                        title: s.label,
                        value: s.top10,
                        display: formatInt(s.top10),
                        highlight: s.id === null,
                      }))}
                  />
                </div>
              </Card>

              <Card>
                <CardHeader
                  title="Head to head"
                  description={`${client.name} ranks above every tracked competitor on ${formatInt(wins)} of ${formatInt(rows.length)} keywords.`}
                />
                <div className="overflow-x-auto pb-2">
                  <table className="w-full min-w-[420px] text-sm">
                    <thead>
                      <tr className="border-y border-line text-left text-xs text-muted">
                        <th className="px-5 py-2.5 font-medium">Website</th>
                        <th className="px-3 py-2.5 text-right font-medium">Ranking</th>
                        <th className="px-3 py-2.5 text-right font-medium">Top 3</th>
                        <th className="px-3 py-2.5 text-right font-medium">Top 10</th>
                        <th className="px-5 py-2.5 text-right font-medium">Avg. position</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {summary.map((s) => (
                        <tr key={s.id ?? "own"} className={s.id === null ? "bg-brand-50/60" : undefined}>
                          <td className="px-5 py-2.5">
                            <span className="flex items-center gap-2 font-medium text-ink">
                              {s.label}
                              {s.id === null ? <Badge tone="brand">You</Badge> : null}
                            </span>
                            <span className="text-xs text-muted">{s.domain}</span>
                          </td>
                          <td className="tabular px-3 py-2.5 text-right">{formatInt(s.ranked)}</td>
                          <td className="tabular px-3 py-2.5 text-right">{formatInt(s.top3)}</td>
                          <td className="tabular px-3 py-2.5 text-right">{formatInt(s.top10)}</td>
                          <td className="tabular px-5 py-2.5 text-right">
                            {formatDecimal(s.averagePosition, 1)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>

            <Card>
              <CardHeader
                title="Position by keyword"
                description="Latest position for each website. The best position in each row is highlighted."
              />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-y border-line text-left text-xs text-muted">
                      <th className="px-5 py-2.5 font-medium">Keyword</th>
                      <th className="px-3 py-2.5 text-right font-medium">{client.name}</th>
                      {competitors.map((c) => (
                        <th key={c.id} className="px-3 py-2.5 text-right font-medium last:pr-5">
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {rows.map((r) => {
                      const all = [r.own, ...competitors.map((c) => r.rivals[c.id] ?? null)];
                      const best = Math.min(...all.filter((p): p is number => p !== null));
                      const cell = (p: number | null, own: boolean) => (
                        <span
                          className={cn(
                            "tabular inline-flex min-w-8 justify-center rounded-md px-1.5 py-0.5",
                            p === null && "text-subtle",
                            p !== null && p === best && (own ? "bg-up-bg font-semibold text-up" : "bg-paper font-semibold text-ink"),
                            p !== null && p !== best && own && "font-semibold text-ink",
                          )}
                        >
                          {p ?? "-"}
                        </span>
                      );
                      return (
                        <tr key={r.keywordId} className="hover:bg-brand-50/50">
                          <td className="px-5 py-2">
                            <Link
                              href={`/c/${client.id}/rankings/${r.keywordId}${query ? `?${query}` : ""}`}
                              className="font-medium text-ink hover:text-brand-700 hover:underline"
                            >
                              {r.keyword}
                            </Link>
                            {r.device === "mobile" ? (
                              <span className="ml-2 text-xs text-muted">mobile</span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-right">{cell(r.own, true)}</td>
                          {competitors.map((c) => (
                            <td key={c.id} className="px-3 py-2 text-right last:pr-5">
                              {cell(r.rivals[c.id] ?? null, false)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
