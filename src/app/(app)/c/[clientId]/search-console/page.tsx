import type { Metadata } from "next";
import { BarList } from "@/components/charts/bar-list";
import { MetricChart } from "@/components/charts/metric-chart";
import { ChangeCell, ReportGate } from "@/components/reports/report-gate";
import { ShowMoreRows } from "@/components/reports/show-more";
import { DateRangePicker } from "@/components/shell/date-range-picker";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { percentDelta, positionDelta, StatTile } from "@/components/ui/stat-tile";
import { requireClientAccess } from "@/lib/auth/guards";
import { countryNameFromAlpha3 } from "@/lib/countries";
import { resolveRange } from "@/lib/dates";
import { formatCompact, formatDecimal, formatInt, formatPercent, pathOfUrl } from "@/lib/format";
import { getGscReport } from "@/lib/google/gsc";
import type { GscRow } from "@/lib/google/types";

export const metadata: Metadata = { title: "Search Console" };

const DEVICE_LABEL: Record<string, string> = { mobile: "Mobile", desktop: "Desktop", tablet: "Tablet" };

function RowsTable({ rows, label, isPage }: { rows: GscRow[]; label: string; isPage?: boolean }) {
  const comparing = rows.some((r) => r.previousClicks !== null);
  if (rows.length === 0) {
    return <p className="px-5 pb-8 text-sm text-muted">No data for this period.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-y border-line text-left text-xs text-muted">
            <th className="px-5 py-2.5 font-medium">{label}</th>
            <th className="px-2 py-2.5 text-right font-medium">Clicks</th>
            {comparing ? <th className="px-1 py-2.5 text-right font-medium">Change</th> : null}
            <th className="px-2 py-2.5 text-right font-medium">Impr.</th>
            <th className="px-2 py-2.5 text-right font-medium">CTR</th>
            <th className="py-2.5 pr-5 pl-2 text-right font-medium">Pos.</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          <ShowMoreRows columns={6} noun={isPage ? "pages" : "searches"}>
            {rows.map((r) => (
              <tr key={r.key} className="hover:bg-brand-50/50">
                <td className="w-full max-w-0 py-2 pr-2 pl-5">
                  {isPage ? (
                    <a
                      href={r.key}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-brand-700 hover:underline"
                      title={r.key}
                    >
                      {pathOfUrl(r.key)}
                    </a>
                  ) : (
                    <span className="block truncate text-ink" title={r.key}>
                      {r.key}
                    </span>
                  )}
                </td>
                <td className="tabular px-2 py-2 text-right font-semibold text-ink">{formatInt(r.clicks)}</td>
                {comparing ? (
                  <td className="px-1 py-2 text-right">
                    <ChangeCell current={r.clicks} previous={r.previousClicks} />
                  </td>
                ) : null}
                <td className="tabular px-2 py-2 text-right text-muted">{formatCompact(r.impressions)}</td>
                <td className="tabular px-2 py-2 text-right whitespace-nowrap text-muted">{formatPercent(r.ctr)}</td>
                <td className="tabular py-2 pr-5 pl-2 text-right text-muted">{formatDecimal(r.position, 1)}</td>
              </tr>
            ))}
          </ShowMoreRows>
        </tbody>
      </table>
    </div>
  );
}

export default async function SearchConsolePage({
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
  // Search Console data takes a couple of days to arrive, so end two days back.
  const selection = resolveRange(sp, client.timezone, { endOffset: -2 });
  const state = await getGscReport(ctx, selection);
  const vs = selection.previous ? "vs previous period" : undefined;

  return (
    <>
      <PageHeader
        eyebrow={client.name}
        title="Search Console"
        description={`How ${client.domain} performs in Google Search: how often it is shown and clicked.`}
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
        sourceName="Search Console"
        explanation="This page shows the searches that bring people to the website, straight from Google."
      >
        {(data) => {
          const { totals, previousTotals: prev } = data;
          const positionChange = positionDelta(totals.position, prev?.position);
          return (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatTile
                  label="Clicks"
                  value={formatCompact(totals.clicks)}
                  delta={percentDelta(totals.clicks, prev?.clicks)}
                  hint={vs}
                />
                <StatTile
                  label="Impressions"
                  value={formatCompact(totals.impressions)}
                  delta={percentDelta(totals.impressions, prev?.impressions)}
                  hint={vs}
                />
                <StatTile
                  label="Click-through rate"
                  value={formatPercent(totals.ctr)}
                  delta={percentDelta(totals.ctr, prev?.ctr)}
                  hint={vs}
                />
                <StatTile
                  label="Average position"
                  value={formatDecimal(totals.position, 1)}
                  delta={positionChange}
                  hint={positionChange ? "places, vs previous period" : "across all searches"}
                />
              </div>

              <MetricChart
                title="Search performance"
                data={data.series.map((p) => ({ ...p }))}
                metrics={[
                  { key: "clicks", label: "Clicks", format: "int", previousKey: "previousClicks" },
                  { key: "impressions", label: "Impressions", format: "compact", previousKey: "previousImpressions" },
                  { key: "ctr", label: "Click-through rate", format: "percent", previousKey: "previousCtr" },
                  {
                    key: "position",
                    label: "Average position",
                    format: "position",
                    previousKey: "previousPosition",
                    invert: true,
                    description: "Higher on the chart is better.",
                  },
                ]}
              />

              <div className="grid gap-5 xl:grid-cols-2">
                <Card>
                  <CardHeader title="Top searches" description="What people typed into Google before clicking through." />
                  <RowsTable rows={data.queries} label="Search" />
                </Card>
                <Card>
                  <CardHeader title="Top pages" description="The pages people landed on from Google." />
                  <RowsTable rows={data.pages} label="Page" isPage />
                </Card>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <Card>
                  <CardHeader title="Clicks by device" />
                  <div className="px-5 pb-5">
                    <BarList
                      items={data.devices.map((d) => ({
                        key: d.key,
                        label: DEVICE_LABEL[d.key] ?? d.key,
                        value: d.clicks,
                        display: formatInt(d.clicks),
                      }))}
                    />
                  </div>
                </Card>
                <Card>
                  <CardHeader title="Clicks by country" />
                  <div className="px-5 pb-5">
                    <BarList
                      items={data.countries.slice(0, 6).map((c) => ({
                        key: c.key,
                        label: countryNameFromAlpha3(c.key),
                        value: c.clicks,
                        display: formatInt(c.clicks),
                      }))}
                    />
                  </div>
                </Card>
              </div>

              <p className="text-xs text-subtle">
                {state.status === "ok" && state.source === "google"
                  ? "Source: Google Search Console. The most recent two days are still being finalised by Google."
                  : "Sample data."}
              </p>
            </div>
          );
        }}
      </ReportGate>
    </>
  );
}
