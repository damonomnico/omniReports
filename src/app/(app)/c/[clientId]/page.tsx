import type { Metadata } from "next";
import Link from "next/link";
import { eq, sql } from "drizzle-orm";
import { ArrowRight, Check, Circle } from "lucide-react";
import { db } from "@/db";
import { clientUsers } from "@/db/schema";
import { StackedBarChart } from "@/components/charts/stacked-bar-chart";
import { RANK_BANDS } from "@/components/charts/theme";
import { TimeSeriesChart } from "@/components/charts/time-series-chart";
import { MovementBadge, PositionValue } from "@/components/rank/movement-badge";
import { DateRangePicker } from "@/components/shell/date-range-picker";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import {
  countDelta,
  percentDelta,
  positionDelta,
  StatTile,
} from "@/components/ui/stat-tile";
import { requireClientAccess, type ClientContext } from "@/lib/auth/guards";
import { formatDay, resolveRange } from "@/lib/dates";
import { formatCompact, formatDecimal, formatInt } from "@/lib/format";
import { getGa4Report } from "@/lib/google/ga4";
import { getGbpReport } from "@/lib/google/gbp";
import { getGscReport } from "@/lib/google/gsc";
import { getIntegrations } from "@/lib/google/integrations";
import { getLinks, getLinkStats } from "@/lib/links/queries";
import { linkTypeLabel } from "@/lib/links/types";
import { describeMovement } from "@/lib/rank/display";
import {
  bucketDistribution,
  getDistributionSeries,
  getKeywordRows,
  movement,
  summariseRanks,
} from "@/lib/rank/queries";

export const metadata: Metadata = { title: "Overview" };

function SectionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="no-print inline-flex items-center gap-1 text-[13px] font-medium text-brand-600 hover:underline"
    >
      {children}
      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
    </Link>
  );
}

/** Tile shown in place of a figure when its data source is not available. */
function MissingTile({ label, reason, href, cta }: { label: string; reason: string; href?: string; cta?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong bg-surface/60 p-4">
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <p className="mt-2 text-sm text-muted">{reason}</p>
      {href && cta ? (
        <Link href={href} className="mt-2 inline-block text-[13px] font-medium text-brand-600 hover:underline">
          {cta}
        </Link>
      ) : null}
    </div>
  );
}

/** What is left to set up for this client. Only the omniSEO team sees it. */
async function SetupChecklist({ ctx, keywordCount, linkCount }: { ctx: ClientContext; keywordCount: number; linkCount: number }) {
  const { client } = ctx;
  const [integrations, [logins]] = await Promise.all([
    getIntegrations(ctx),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(clientUsers)
      .where(eq(clientUsers.clientId, client.id)),
  ]);
  const has = (type: string) => integrations.some((i) => i.type === type);
  const base = `/c/${client.id}`;
  const steps = [
    { done: keywordCount > 0, label: "Add keywords to track", href: `${base}/rankings` },
    { done: has("gsc"), label: "Connect Search Console", href: `${base}/settings/integrations` },
    { done: has("ga4"), label: "Connect Google Analytics", href: `${base}/settings/integrations` },
    { done: has("gbp"), label: "Connect Business Profile", href: `${base}/settings/integrations` },
    { done: linkCount > 0, label: "Record the links you have built", href: `${base}/links` },
    { done: (logins?.n ?? 0) > 0, label: "Invite the client", href: `${base}/settings/users` },
  ];
  const remaining = steps.filter((s) => !s.done).length;
  if (remaining === 0) return null;

  return (
    <Card className="no-print">
      <CardHeader
        title="Finish setting up this client"
        description={`${steps.length - remaining} of ${steps.length} done. Only the omniSEO team sees this.`}
      />
      <ul className="grid gap-x-6 gap-y-1 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((s) => (
          <li key={s.label}>
            <Link
              href={s.href}
              className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-brand-50"
            >
              {s.done ? (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-up-bg text-up">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              ) : (
                <Circle className="h-5 w-5 text-line-strong" aria-hidden="true" />
              )}
              <span className={s.done ? "text-muted line-through" : "font-medium text-ink"}>{s.label}</span>
              <span className="sr-only">{s.done ? "(done)" : "(to do)"}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default async function OverviewPage({
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
  const base = `/c/${client.id}`;

  // Each source uses the same dates as its own page, so the figures match.
  const picker = resolveRange(sp, client.timezone);
  const rankSel = resolveRange(sp, client.timezone, { endOffset: 0 });
  const gscSel = resolveRange(sp, client.timezone, { endOffset: -2 });
  const gbpSel = resolveRange(sp, client.timezone, { endOffset: -4 });
  const linkSel = resolveRange(sp, client.timezone, { endOffset: 0 });

  const query = new URLSearchParams();
  for (const key of ["range", "from", "to", "compare"]) {
    const v = sp[key];
    if (typeof v === "string" && v) query.set(key, v);
  }
  const qs = query.size > 0 ? `?${query}` : "";

  const [gsc, ga4, gbp, keywordRows, distribution, linkStats, recentLinks] = await Promise.all([
    getGscReport(ctx, gscSel),
    getGa4Report(ctx, picker),
    getGbpReport(ctx, gbpSel),
    getKeywordRows(ctx, rankSel.current),
    getDistributionSeries(ctx, rankSel.current),
    getLinkStats(ctx, linkSel.current, linkSel.previous),
    getLinks(ctx, linkSel.current),
  ]);
  const ranks = summariseRanks(keywordRows, client.rankDepth);
  const hasRanks = ranks.checked > 0;
  const vs = picker.previous ? "vs previous period" : undefined;
  const connectHref = isStaff ? `${base}/settings/integrations` : `${base}/connect`;
  const notConnected = (name: string) =>
    isStaff ? `${name} is not connected.` : `${name} is not connected yet.`;

  const movers = keywordRows
    .filter((r) => r.checkedOn !== null && r.hasStart)
    .map((r) => ({ row: r, change: movement(r, client.rankDepth) ?? 0 }))
    .filter((m) => m.change !== 0)
    .sort((a, b) => b.change - a.change);
  const topMovers = [...movers.slice(0, 5), ...movers.slice(-3).filter((m) => m.change < 0)].filter(
    (m, i, all) => all.findIndex((x) => x.row.id === m.row.id) === i,
  );

  return (
    <>
      <PageHeader
        eyebrow={client.name}
        title="Overview"
        description={`How ${client.domain} is performing in search.`}
        actions={
          <DateRangePicker
            preset={picker.preset}
            label={picker.label}
            from={picker.current.from}
            to={picker.current.to}
            compare={picker.compare}
          />
        }
      />

      <div className="space-y-5">
        {isStaff && !client.isDemo ? (
          <SetupChecklist ctx={ctx} keywordCount={ranks.total} linkCount={linkStats.totalAll} />
        ) : null}

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          {gsc.status === "ok" ? (
            <>
              <StatTile
                label="Clicks from Google"
                value={formatCompact(gsc.data.totals.clicks)}
                delta={percentDelta(gsc.data.totals.clicks, gsc.data.previousTotals?.clicks)}
                hint={vs}
              />
              <StatTile
                label="Search impressions"
                value={formatCompact(gsc.data.totals.impressions)}
                delta={percentDelta(gsc.data.totals.impressions, gsc.data.previousTotals?.impressions)}
                hint={vs}
              />
            </>
          ) : (
            <div className="col-span-2">
              <MissingTile
                label="Clicks and impressions"
                reason={gsc.status === "error" ? gsc.message : notConnected("Search Console")}
                href={connectHref}
                cta={gsc.status === "not_connected" ? "Connect Search Console" : undefined}
              />
            </div>
          )}

          {ga4.status === "ok" ? (
            <>
              <StatTile
                label="Website sessions"
                value={formatCompact(ga4.data.totals.sessions)}
                delta={percentDelta(ga4.data.totals.sessions, ga4.data.previousTotals?.sessions)}
                hint={vs}
              />
              <StatTile
                label="Key events"
                value={formatCompact(ga4.data.totals.keyEvents)}
                delta={percentDelta(ga4.data.totals.keyEvents, ga4.data.previousTotals?.keyEvents)}
                hint={vs ?? "enquiries and other goals"}
              />
            </>
          ) : (
            <div className="col-span-2">
              <MissingTile
                label="Sessions and key events"
                reason={ga4.status === "error" ? ga4.message : notConnected("Google Analytics")}
                href={connectHref}
                cta={ga4.status === "not_connected" ? "Connect Analytics" : undefined}
              />
            </div>
          )}

          {hasRanks ? (
            <StatTile
              label="Top 10 keywords"
              value={formatInt(ranks.top10)}
              delta={ranks.comparable > 0 ? countDelta(ranks.top10, ranks.start.top10) : null}
              hint={`of ${formatInt(ranks.total)} tracked`}
            />
          ) : (
            <MissingTile
              label="Top 10 keywords"
              reason={ranks.total > 0 ? "Waiting for the first rank check." : "No keywords are tracked yet."}
              href={isStaff ? `${base}/rankings` : undefined}
              cta={isStaff && ranks.total === 0 ? "Add keywords" : undefined}
            />
          )}

          <StatTile
            label="Links built"
            value={formatInt(linkStats.builtInRange)}
            delta={
              linkStats.builtInPrevious === null
                ? null
                : countDelta(linkStats.builtInRange, linkStats.builtInPrevious)
            }
            hint={`${formatInt(linkStats.totalLive)} live in total`}
          />
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          {gsc.status === "ok" ? (
            <div>
              <TimeSeriesChart
                title="Clicks from Google Search"
                description="People who clicked through to the website from Google's results."
                data={gsc.data.series.map((p) => ({
                  date: p.date,
                  previousDate: p.previousDate,
                  clicks: p.clicks,
                  previousClicks: p.previousClicks,
                }))}
                series={[{ key: "clicks", label: "Clicks" }]}
                previousKey="previousClicks"
                area
                height={240}
              />
              <p className="mt-2 text-right">
                <SectionLink href={`${base}/search-console${qs}`}>Search Console</SectionLink>
              </p>
            </div>
          ) : ga4.status === "ok" ? (
            <div>
              <TimeSeriesChart
                title="Website sessions"
                description="Visits to the website from all sources."
                data={ga4.data.series.map((p) => ({
                  date: p.date,
                  previousDate: p.previousDate,
                  sessions: p.sessions,
                  previousSessions: p.previousSessions,
                }))}
                series={[{ key: "sessions", label: "Sessions" }]}
                previousKey="previousSessions"
                area
                height={240}
              />
              <p className="mt-2 text-right">
                <SectionLink href={`${base}/analytics${qs}`}>Analytics</SectionLink>
              </p>
            </div>
          ) : null}

          {hasRanks ? (
            <div>
              <StackedBarChart
                title="Keywords by position"
                description="How many tracked keywords sit in each band of Google's results."
                data={bucketDistribution(distribution)}
                segments={RANK_BANDS.map((b) => ({ key: b.key, label: b.label, color: b.color }))}
                totalLabel="keywords checked"
                height={240}
              />
              <p className="mt-2 text-right">
                <SectionLink href={`${base}/rankings${qs}`}>Rankings</SectionLink>
              </p>
            </div>
          ) : null}
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          {hasRanks ? (
            <Card>
              <CardHeader
                title="Ranking highlights"
                description={
                  ranks.comparable > 0
                    ? `${formatInt(ranks.improved)} keywords improved and ${formatInt(ranks.declined)} declined since ${formatDay(rankSel.current.from)}.`
                    : "Movement appears once keywords have been checked more than once."
                }
                action={
                  <span className="flex items-center gap-3 text-sm">
                    <span className="text-muted">Average position</span>
                    <span className="font-display text-lg font-semibold">
                      {formatDecimal(ranks.averagePosition, 1)}
                    </span>
                  </span>
                }
              />
              {topMovers.length === 0 ? (
                <p className="px-5 pb-6 text-sm text-muted">No keywords changed position in this period.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y border-line text-left text-xs text-muted">
                      <th className="px-5 py-2.5 font-medium">Biggest movers</th>
                      <th className="px-3 py-2.5 text-right font-medium">Position</th>
                      <th className="px-5 py-2.5 text-right font-medium">Change</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {topMovers.map(({ row }) => (
                      <tr key={row.id}>
                        <td className="w-full max-w-0 py-2 pr-2 pl-5">
                          <Link
                            href={`${base}/rankings/${row.id}${qs}`}
                            className="block truncate font-medium text-ink hover:text-brand-700 hover:underline"
                          >
                            {row.keyword}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <PositionValue position={row.position} checked depth={client.rankDepth} />
                        </td>
                        <td className="px-5 py-2 text-right">
                          <MovementBadge
                            movement={describeMovement(row.position, row.startPosition, row.hasStart, true)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="px-5 py-3 text-right">
                <SectionLink href={`${base}/rankings${qs}`}>All keywords</SectionLink>
              </p>
            </Card>
          ) : null}

          {gsc.status === "ok" && gsc.data.queries.length > 0 ? (
            <Card>
              <CardHeader
                title="Top searches"
                description="The Google searches sending the most visitors."
                action={
                  gsc.data.totals.position !== null ? (
                    <span className="flex items-center gap-3 text-sm">
                      <span className="text-muted">Average position</span>
                      <span className="font-display text-lg font-semibold">
                        {formatDecimal(gsc.data.totals.position, 1)}
                      </span>
                    </span>
                  ) : undefined
                }
              />
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-line text-left text-xs text-muted">
                    <th className="px-5 py-2.5 font-medium">Search</th>
                    <th className="px-3 py-2.5 text-right font-medium">Clicks</th>
                    <th className="px-5 py-2.5 text-right font-medium">Position</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {gsc.data.queries.slice(0, 8).map((q) => (
                    <tr key={q.key}>
                      <td className="w-full max-w-0 py-2 pr-2 pl-5">
                        <span className="block truncate text-ink">{q.key}</span>
                      </td>
                      <td className="tabular px-3 py-2 text-right font-semibold text-ink">
                        {formatInt(q.clicks)}
                      </td>
                      <td className="tabular px-5 py-2 text-right text-muted">
                        {formatDecimal(q.position, 1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-5 py-3 text-right">
                <SectionLink href={`${base}/search-console${qs}`}>All searches</SectionLink>
              </p>
            </Card>
          ) : null}
        </div>

        {gbp.status === "ok" ? (
          <section>
            <div className="mb-3 flex items-end justify-between gap-4">
              <h2 className="font-display text-[15px] font-semibold text-ink">Google Business Profile</h2>
              <SectionLink href={`${base}/business-profile${qs}`}>Business Profile</SectionLink>
            </div>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatTile
                label="People who saw the profile"
                value={formatCompact(gbp.data.totals.impressions)}
                delta={percentDelta(gbp.data.totals.impressions, gbp.data.previousTotals?.impressions)}
                hint={vs}
              />
              <StatTile
                label="Calls"
                value={formatInt(gbp.data.totals.calls)}
                delta={percentDelta(gbp.data.totals.calls, gbp.data.previousTotals?.calls)}
                hint={vs}
              />
              <StatTile
                label="Website clicks"
                value={formatInt(gbp.data.totals.websiteClicks)}
                delta={percentDelta(gbp.data.totals.websiteClicks, gbp.data.previousTotals?.websiteClicks)}
                hint={vs}
              />
              <StatTile
                label="Direction requests"
                value={formatInt(gbp.data.totals.directions)}
                delta={percentDelta(gbp.data.totals.directions, gbp.data.previousTotals?.directions)}
                hint={vs}
              />
            </div>
          </section>
        ) : null}

        {recentLinks.length > 0 ? (
          <Card>
            <CardHeader
              title="Recent links built"
              description={`${formatInt(linkStats.builtInRange)} in this period${
                linkStats.averageRatingInRange !== null
                  ? `, average domain rating ${formatDecimal(linkStats.averageRatingInRange, 0)}`
                  : ""
              }.`}
            />
            <ul className="divide-y divide-line border-t border-line">
              {recentLinks.slice(0, 5).map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5 text-sm">
                  <span className="w-24 shrink-0 text-muted">{formatDay(l.builtOn)}</span>
                  <a
                    href={l.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="min-w-0 flex-1 truncate font-medium text-ink hover:text-brand-700 hover:underline"
                  >
                    {l.sourceDomain}
                  </a>
                  <span className="text-muted">{linkTypeLabel(l.linkType)}</span>
                  {l.domainRating !== null ? (
                    <span className="tabular w-14 text-right text-muted">DR {l.domainRating}</span>
                  ) : null}
                </li>
              ))}
            </ul>
            <p className="px-5 py-3 text-right">
              <SectionLink href={`${base}/links${qs}`}>All links</SectionLink>
            </p>
          </Card>
        ) : null}

        {!hasRanks && gsc.status !== "ok" && ga4.status !== "ok" && gbp.status !== "ok" && recentLinks.length === 0 && !isStaff ? (
          <Card>
            <div className="px-6 py-12 text-center">
              <h2 className="font-display text-lg font-semibold">Your reports are being set up</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
                omniSEO is connecting your data. Rankings, traffic and links will appear here as soon as
                they are ready.
              </p>
            </div>
          </Card>
        ) : null}
      </div>
    </>
  );
}
