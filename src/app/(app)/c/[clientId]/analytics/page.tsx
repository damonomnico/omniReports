import type { Metadata } from "next";
import { BarList } from "@/components/charts/bar-list";
import { MetricChart } from "@/components/charts/metric-chart";
import { ChangeCell, ReportGate } from "@/components/reports/report-gate";
import { ShowMoreRows } from "@/components/reports/show-more";
import { DateRangePicker } from "@/components/shell/date-range-picker";
import { PageHeader } from "@/components/shell/page-header";
import { UrlSegments } from "@/components/shell/url-controls";
import { Card, CardHeader } from "@/components/ui/card";
import { Delta, percentDelta, StatTile } from "@/components/ui/stat-tile";
import { requireClientAccess } from "@/lib/auth/guards";
import { resolveRange } from "@/lib/dates";
import { formatCompact, formatDuration, formatInt, formatPercent } from "@/lib/format";
import { getGa4Report } from "@/lib/google/ga4";

export const metadata: Metadata = { title: "Analytics" };

const DEVICE_LABEL: Record<string, string> = { mobile: "Mobile", desktop: "Desktop", tablet: "Tablet" };

export default async function AnalyticsPage({
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
  const selection = resolveRange(sp, client.timezone);
  const segment = sp.segment === "organic" ? "organic" : "all";
  const state = await getGa4Report(ctx, selection, segment);
  const vs = selection.previous ? "vs previous period" : undefined;

  return (
    <>
      <PageHeader
        eyebrow={client.name}
        title="Analytics"
        description={`Visits to ${client.domain} and what visitors did, from Google Analytics.`}
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
        sourceName="Google Analytics"
        explanation="This page shows how many people visit the website, where they come from and what they do."
      >
        {(data) => {
          const { totals, previousTotals: prev } = data;
          const comparing = data.landingPages.some((p) => p.previousSessions !== null);
          return (
            <div className="space-y-5">
              <div className="no-print flex flex-wrap items-center gap-3">
                <UrlSegments
                  param="segment"
                  label="Traffic"
                  value={segment === "organic" ? "organic" : ""}
                  options={[
                    { value: "", label: "All traffic" },
                    { value: "organic", label: "Organic search only" },
                  ]}
                />
                {segment === "organic" ? (
                  <p className="text-xs text-muted">Showing visits that arrived from unpaid search results.</p>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
                <StatTile
                  label="Sessions"
                  value={formatCompact(totals.sessions)}
                  delta={percentDelta(totals.sessions, prev?.sessions)}
                  hint={vs}
                />
                <StatTile
                  label="Users"
                  value={formatCompact(totals.users)}
                  delta={percentDelta(totals.users, prev?.users)}
                  hint={vs}
                />
                <StatTile
                  label="New users"
                  value={formatCompact(totals.newUsers)}
                  delta={percentDelta(totals.newUsers, prev?.newUsers)}
                  hint={vs}
                />
                <StatTile
                  label="Key events"
                  value={formatCompact(totals.keyEvents)}
                  delta={percentDelta(totals.keyEvents, prev?.keyEvents)}
                  hint={vs ?? "enquiries, calls and other goals"}
                />
                <StatTile
                  label="Engagement rate"
                  value={formatPercent(totals.engagementRate)}
                  delta={percentDelta(totals.engagementRate, prev?.engagementRate)}
                  hint={vs}
                />
                <StatTile
                  label="Average session"
                  value={formatDuration(totals.averageSessionDuration)}
                  delta={percentDelta(totals.averageSessionDuration, prev?.averageSessionDuration)}
                  hint={vs}
                />
              </div>

              <MetricChart
                title="Website traffic"
                data={data.series.map((p) => ({ ...p }))}
                metrics={[
                  { key: "sessions", label: "Sessions", format: "int", previousKey: "previousSessions" },
                  { key: "users", label: "Users", format: "int", previousKey: "previousUsers" },
                  { key: "keyEvents", label: "Key events", format: "int", previousKey: "previousKeyEvents" },
                ]}
              />

              <div className="grid gap-5 xl:grid-cols-5">
                <Card className="xl:col-span-2">
                  <CardHeader
                    title="Where visitors came from"
                    description="Sessions by channel, all traffic."
                  />
                  <div className="px-5 pb-5">
                    <BarList
                      items={data.channels.map((c) => {
                        const delta = percentDelta(c.sessions, c.previousSessions);
                        return {
                          key: c.key,
                          label: c.key,
                          title: c.key,
                          value: c.sessions,
                          display: formatInt(c.sessions),
                          highlight: c.key === "Organic Search",
                          extra: delta ? <Delta delta={delta} /> : null,
                        };
                      })}
                    />
                  </div>
                </Card>

                <Card className="xl:col-span-3">
                  <CardHeader
                    title="Landing pages"
                    description="The first page people saw when they arrived."
                  />
                  {data.landingPages.length === 0 ? (
                    <p className="px-5 pb-8 text-sm text-muted">No data for this period.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-y border-line text-left text-xs text-muted">
                            <th className="px-5 py-2.5 font-medium">Page</th>
                            <th className="px-3 py-2.5 text-right font-medium">Sessions</th>
                            {comparing ? <th className="px-1 py-2.5 text-right font-medium">Change</th> : null}
                            <th className="px-3 py-2.5 text-right font-medium">Engagement</th>
                            <th className="py-2.5 pr-5 pl-3 text-right font-medium">Key events</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          <ShowMoreRows columns={5} initial={8} noun="pages">
                            {data.landingPages.map((p) => (
                              <tr key={p.key} className="hover:bg-brand-50/50">
                                <td className="w-full max-w-0 py-2 pr-2 pl-5">
                                  <span className="block truncate text-ink" title={p.key}>
                                    {p.key || "(not set)"}
                                  </span>
                                </td>
                                <td className="tabular px-3 py-2 text-right font-semibold text-ink">
                                  {formatInt(p.sessions)}
                                </td>
                                {comparing ? (
                                  <td className="px-1 py-2 text-right">
                                    <ChangeCell current={p.sessions} previous={p.previousSessions} />
                                  </td>
                                ) : null}
                                <td className="tabular px-3 py-2 text-right text-muted">
                                  {formatPercent(p.engagementRate, 0)}
                                </td>
                                <td className="tabular py-2 pr-5 pl-3 text-right text-muted">
                                  {formatInt(p.keyEvents)}
                                </td>
                              </tr>
                            ))}
                          </ShowMoreRows>
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              </div>

              <Card className="max-w-xl">
                <CardHeader title="Sessions by device" />
                <div className="px-5 pb-5">
                  <BarList
                    items={data.devices.map((d) => ({
                      key: d.key,
                      label: DEVICE_LABEL[d.key] ?? d.key,
                      value: d.sessions,
                      display: formatInt(d.sessions),
                    }))}
                  />
                </div>
              </Card>

              <p className="text-xs text-subtle">
                {state.status === "ok" && state.source === "google"
                  ? "Source: Google Analytics 4. A session is one visit; key events are the actions marked as goals in Analytics."
                  : "Sample data."}
              </p>
            </div>
          );
        }}
      </ReportGate>
    </>
  );
}
