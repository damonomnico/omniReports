import type { Metadata } from "next";
import { AlertTriangle, TrendingUp } from "lucide-react";
import { StackedBarChart } from "@/components/charts/stacked-bar-chart";
import { RANK_BANDS } from "@/components/charts/theme";
import { TimeSeriesChart } from "@/components/charts/time-series-chart";
import { KeywordTable } from "@/components/rank/keyword-table";
import {
  AddKeywordsDialog,
  CheckNowDialog,
  FetchVolumesButton,
  PendingChecks,
} from "@/components/rank/rank-dialogs";
import { RankNav } from "@/components/rank/rank-nav";
import { DateRangePicker } from "@/components/shell/date-range-picker";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { countDelta, positionDelta, StatTile } from "@/components/ui/stat-tile";
import { requireClientAccess } from "@/lib/auth/guards";
import { estimateCheckCost } from "@/lib/dataforseo/client";
import { PRICE_PER_PAGE_STANDARD } from "@/lib/dataforseo/pricing";
import { formatDay, formatDayShort, resolveRange, todayInTz } from "@/lib/dates";
import { dataForSeoConfigured } from "@/lib/env";
import { formatDecimal, formatInt } from "@/lib/format";
import { carryQuery, parseRankFilters } from "@/lib/rank/params";
import {
  bucketDistribution,
  getCheckStatus,
  getDistributionSeries,
  getKeywordRows,
  getKeywordTags,
  getRecentTaskErrors,
  summariseRanks,
} from "@/lib/rank/queries";
import { countMissingVolumes } from "@/lib/rank/volume";

export const metadata: Metadata = { title: "Rankings" };

export default async function RankingsPage({
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
  const range = selection.current;
  const filters = parseRankFilters(sp);
  const query = carryQuery(sp);

  const [rows, distribution, tags] = await Promise.all([
    getKeywordRows(ctx, range, filters),
    getDistributionSeries(ctx, range, filters),
    getKeywordTags(ctx),
  ]);
  const summary = summariseRanks(rows, client.rankDepth);

  const staffInfo = isStaff
    ? await Promise.all([
        getCheckStatus(ctx, todayInTz(client.timezone)),
        getRecentTaskErrors(ctx),
        countMissingVolumes(client.id),
      ])
    : null;
  const [status, taskErrors, missingVolumes] = staffInfo ?? [null, [], 0];

  const since = `since ${formatDayShort(range.from)}`;
  const averageDelta =
    summary.comparable > 0
      ? positionDelta(summary.averagePosition, summary.start.averagePosition)
      : null;
  const bandDelta = (now: number, start: number) =>
    summary.comparable > 0 ? countDelta(now, start) : null;

  const actions = (
    <>
      <DateRangePicker
        preset={selection.preset}
        label={selection.label}
        from={range.from}
        to={range.to}
        compare={selection.compare}
        showCompare={false}
      />
      {isStaff && status ? (
        <>
          <CheckNowDialog
            clientId={client.id}
            keywordCount={status.keywordCount}
            dueCount={status.dueCount}
            costPerKeyword={estimateCheckCost(client.rankDepth, 2)}
            disabledReason={
              client.isDemo
                ? "Demo clients use sample data and are never checked."
                : !dataForSeoConfigured()
                  ? "DataForSEO is not connected yet. Add DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD in the hosting settings."
                  : client.status !== "active"
                    ? "Restore this client before checking rankings."
                    : undefined
            }
          />
          <AddKeywordsDialog
            clientId={client.id}
            defaultLocation={{ code: client.defaultLocationCode, name: client.defaultLocationName }}
            languageCode={client.defaultLanguageCode}
            depth={client.rankDepth}
            pricePerPage={PRICE_PER_PAGE_STANDARD}
          />
        </>
      ) : null}
    </>
  );

  return (
    <>
      <PageHeader
        eyebrow={client.name}
        title="Rankings"
        description={
          summary.lastChecked
            ? `Where ${client.domain} appears on Google. Last checked ${formatDay(summary.lastChecked)}.`
            : `Where ${client.domain} appears on Google.`
        }
        actions={actions}
      />

      {isStaff && status ? <PendingChecks clientId={client.id} initialPending={status.pending} /> : null}

      {isStaff && taskErrors.length > 0 ? (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-down/20 bg-down-bg px-4 py-3 text-sm text-down">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">Some recent rank checks failed (only the omniSEO team sees this)</p>
            <ul className="mt-1 space-y-0.5 text-[13px]">
              {taskErrors.map((e) => (
                <li key={e.error}>
                  {e.n} check{e.n === 1 ? "" : "s"}: {e.error}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <RankNav clientId={client.id} query={query} filters={filters} tags={tags} />

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<TrendingUp className="h-5 w-5" />}
            title={filters.device || filters.tag ? "No keywords match these filters" : "No keywords are being tracked yet"}
          >
            {filters.device || filters.tag
              ? "Clear the device or tag filter to see every keyword."
              : isStaff
                ? "Add the search terms this client wants to be found for. Positions are checked automatically from then on."
                : "omniSEO is setting up the search terms we will track for you. They will appear here shortly."}
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
            <StatTile
              label="Keywords tracked"
              value={formatInt(summary.total)}
              hint={`${formatInt(summary.ranked)} ranking in the top ${client.rankDepth}`}
            />
            <StatTile
              label="Average position"
              value={formatDecimal(summary.averagePosition, 1)}
              delta={averageDelta}
              hint={averageDelta ? since : "of ranking keywords"}
            />
            <StatTile
              label="In the top 3"
              value={formatInt(summary.top3)}
              delta={bandDelta(summary.top3, summary.start.top3)}
              hint={summary.comparable > 0 ? since : undefined}
            />
            <StatTile
              label="In the top 10"
              value={formatInt(summary.top10)}
              delta={bandDelta(summary.top10, summary.start.top10)}
              hint={summary.comparable > 0 ? since : undefined}
            />
            <StatTile
              label="In the top 20"
              value={formatInt(summary.top20)}
              delta={bandDelta(summary.top20, summary.start.top20)}
              hint={summary.comparable > 0 ? since : undefined}
            />
            <StatTile
              label="Keywords improved"
              value={formatInt(summary.improved)}
              hint={
                summary.comparable > 0
                  ? `${formatInt(summary.declined)} declined, ${formatInt(summary.unchanged)} unchanged`
                  : "Needs two checks to compare"
              }
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-5">
            <div className="xl:col-span-3">
              <StackedBarChart
                title="Keywords by position"
                description={
                  distribution.length > 62
                    ? "How many tracked keywords sit in each band of Google's results, week by week."
                    : "How many tracked keywords sit in each band of Google's results."
                }
                data={bucketDistribution(distribution)}
                segments={RANK_BANDS.map((b) => ({ key: b.key, label: b.label, color: b.color }))}
                totalLabel="keywords checked"
                emptyMessage="Positions will appear here after the first rank check."
              />
            </div>
            <div className="xl:col-span-2">
              <TimeSeriesChart
                title="Average position"
                description="Across keywords that rank. Higher on the chart is better."
                data={distribution.map((d) => ({ date: d.date, average: d.averagePosition }))}
                series={[{ key: "average", label: "Average position" }]}
                format="position"
                invert
                emptyMessage="Positions will appear here after the first rank check."
              />
            </div>
          </div>

          <Card>
            <CardHeader
              title="Keywords"
              description={`Positions on Google for ${client.domain}.`}
              action={isStaff ? <FetchVolumesButton clientId={client.id} missing={missingVolumes} /> : undefined}
            />
            <KeywordTable
              rows={rows}
              clientId={client.id}
              depth={client.rankDepth}
              canEdit={isStaff}
              query={query}
            />
          </Card>
        </div>
      )}
    </>
  );
}
