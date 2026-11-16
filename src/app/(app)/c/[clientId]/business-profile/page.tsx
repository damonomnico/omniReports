import type { Metadata } from "next";
import { Star } from "lucide-react";
import { BarList } from "@/components/charts/bar-list";
import { MetricChart } from "@/components/charts/metric-chart";
import { ReportGate } from "@/components/reports/report-gate";
import { ShowMoreRows } from "@/components/reports/show-more";
import { DateRangePicker } from "@/components/shell/date-range-picker";
import { PageHeader } from "@/components/shell/page-header";
import { Badge, Card, CardHeader } from "@/components/ui/card";
import { percentDelta, StatTile } from "@/components/ui/stat-tile";
import { requireClientAccess } from "@/lib/auth/guards";
import { resolveRange } from "@/lib/dates";
import { formatCompact, formatDecimal, formatInt } from "@/lib/format";
import { getGbpReport } from "@/lib/google/gbp";

export const metadata: Metadata = { title: "Business Profile" };

const REVIEW_DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={n <= Math.round(rating) ? "h-3.5 w-3.5 fill-[#eda100] text-[#eda100]" : "h-3.5 w-3.5 text-line-strong"}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

export default async function BusinessProfilePage({
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
  // Google publishes Business Profile figures a few days in arrears.
  const selection = resolveRange(sp, client.timezone, { endOffset: -4 });
  const state = await getGbpReport(ctx, selection);
  const vs = selection.previous ? "vs previous period" : undefined;

  return (
    <>
      <PageHeader
        eyebrow={client.name}
        title="Business Profile"
        description="How people find and contact the business on Google Search and Google Maps."
        actions={
          <DateRangePicker
            preset={selection.preset}
            label={selection.label}
            from={selection.current.from}
            to={selection.current.to}
            compare={selection.compare}
          />
        }
      />

      <ReportGate
        state={state}
        clientId={client.id}
        isStaff={isStaff}
        sourceName="Business Profile"
        explanation="This page shows how many people saw the Google Business Profile and how many called, visited the website or asked for directions."
      >
        {(data) => {
          const { totals, previousTotals: prev } = data;
          return (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatTile
                  label="People who saw the profile"
                  value={formatCompact(totals.impressions)}
                  delta={percentDelta(totals.impressions, prev?.impressions)}
                  hint={vs}
                />
                <StatTile
                  label="Calls"
                  value={formatInt(totals.calls)}
                  delta={percentDelta(totals.calls, prev?.calls)}
                  hint={vs}
                />
                <StatTile
                  label="Website clicks"
                  value={formatInt(totals.websiteClicks)}
                  delta={percentDelta(totals.websiteClicks, prev?.websiteClicks)}
                  hint={vs}
                />
                <StatTile
                  label="Direction requests"
                  value={formatInt(totals.directions)}
                  delta={percentDelta(totals.directions, prev?.directions)}
                  hint={vs}
                />
              </div>

              <MetricChart
                title="Profile activity"
                data={data.series.map((p) => ({ ...p }))}
                metrics={[
                  {
                    key: "impressions",
                    label: "Profile views",
                    format: "int",
                    previousKey: "previousImpressions",
                    description: "Unique people per day who saw the profile on Search or Maps.",
                  },
                  {
                    key: "actions",
                    label: "Actions taken",
                    format: "int",
                    previousKey: "previousActions",
                    description: "Calls, website clicks and direction requests combined.",
                  },
                  { key: "calls", label: "Calls", format: "int" },
                  { key: "websiteClicks", label: "Website clicks", format: "int" },
                  { key: "directions", label: "Directions", format: "int" },
                ]}
              />

              <div className="grid gap-5 lg:grid-cols-2">
                <Card>
                  <CardHeader
                    title="Where people saw the profile"
                    description={`${formatInt(totals.searchImpressions)} on Google Search, ${formatInt(totals.mapsImpressions)} on Google Maps.`}
                  />
                  <div className="px-5 pb-5">
                    <BarList
                      items={data.surfaces.map((s) => ({
                        key: s.key,
                        label: s.key,
                        value: s.value,
                        display: formatInt(s.value),
                      }))}
                    />
                  </div>
                </Card>

                <Card>
                  <CardHeader
                    title="Searches that showed the profile"
                    description={
                      data.keywordsPeriod
                        ? `Google reports these by calendar month: ${data.keywordsPeriod}.`
                        : "What people searched for when the profile appeared."
                    }
                  />
                  {data.keywords.length === 0 ? (
                    <p className="px-5 pb-8 text-sm text-muted">
                      {data.warnings.includes("Search terms")
                        ? "Google did not return search terms for this period."
                        : "No search terms were reported for this period."}
                    </p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-y border-line text-left text-xs text-muted">
                          <th className="px-5 py-2.5 font-medium">Search</th>
                          <th className="px-5 py-2.5 text-right font-medium">People</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        <ShowMoreRows columns={2} initial={8} noun="searches">
                          {data.keywords.map((k) => (
                            <tr key={k.keyword}>
                              <td className="px-5 py-2 text-ink">{k.keyword}</td>
                              <td className="tabular px-5 py-2 text-right font-semibold text-ink">
                                {k.impressions !== null ? (
                                  formatInt(k.impressions)
                                ) : (
                                  <span className="font-normal text-muted">Fewer than {k.lessThan}</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </ShowMoreRows>
                      </tbody>
                    </table>
                  )}
                </Card>
              </div>

              {data.reviews ? (
                <Card>
                  <CardHeader
                    title="Google reviews"
                    description="The most recent reviews on the profile."
                    action={
                      data.reviews.averageRating !== null ? (
                        <div className="flex items-center gap-2.5">
                          <span className="font-display text-2xl leading-none font-semibold">
                            {formatDecimal(data.reviews.averageRating, 1)}
                          </span>
                          <span>
                            <Stars rating={data.reviews.averageRating} />
                            <span className="block text-xs text-muted">
                              {formatInt(data.reviews.total)} reviews
                            </span>
                          </span>
                        </div>
                      ) : undefined
                    }
                  />
                  {data.reviews.recent.length === 0 ? (
                    <p className="px-5 pb-8 text-sm text-muted">No reviews yet.</p>
                  ) : (
                    <ul className="divide-y divide-line border-t border-line">
                      {data.reviews.recent.slice(0, 6).map((r, i) => (
                        <li key={`${r.reviewer}-${i}`} className="px-5 py-3.5">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="text-sm font-medium text-ink">{r.reviewer}</span>
                            <Stars rating={r.rating} />
                            {r.createdAt ? (
                              <span className="text-xs text-muted">{REVIEW_DATE.format(new Date(r.createdAt))}</span>
                            ) : null}
                            {r.replied ? <Badge tone="up">Replied</Badge> : <Badge tone="warn">No reply yet</Badge>}
                          </div>
                          {r.comment ? (
                            <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted">{r.comment}</p>
                          ) : (
                            <p className="mt-1.5 text-sm text-subtle">Rating only, no comment.</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              ) : null}

              <p className="text-xs text-subtle">
                {state.status === "ok" && state.source === "google"
                  ? "Source: Google Business Profile. Google counts each person once per day and publishes figures a few days in arrears."
                  : "Sample data."}
                {isStaff && data.warnings.length > 0
                  ? ` Could not load: ${data.warnings.join(", ").toLowerCase()}.`
                  : ""}
              </p>
            </div>
          );
        }}
      </ReportGate>
    </>
  );
}
