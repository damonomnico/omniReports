import type { Metadata } from "next";
import { ExternalLink, Link2 } from "lucide-react";
import { BarList } from "@/components/charts/bar-list";
import { StackedBarChart } from "@/components/charts/stacked-bar-chart";
import { SERIES_COLORS } from "@/components/charts/theme";
import {
  AddLinkDialog,
  DeleteLinkButton,
  EditLinkDialog,
  ImportLinksDialog,
} from "@/components/links/link-forms";
import { DateRangePicker } from "@/components/shell/date-range-picker";
import { PageHeader } from "@/components/shell/page-header";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/card";
import { countDelta, StatTile } from "@/components/ui/stat-tile";
import { requireClientAccess } from "@/lib/auth/guards";
import { describeRange, formatDay, resolveRange, todayInTz } from "@/lib/dates";
import { formatDecimal, formatInt, formatMoney, pathOfUrl } from "@/lib/format";
import { getLinks, getLinksByMonth, getLinkStats } from "@/lib/links/queries";
import { linkTypeLabel, type LinkForStaff } from "@/lib/links/types";

export const metadata: Metadata = { title: "Links" };

const STATUS_TONE = { live: "up", pending: "warn", lost: "down" } as const;
const STATUS_LABEL = { live: "Live", pending: "Pending", lost: "Lost" } as const;

export default async function LinksPage({
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

  const selection = resolveRange(sp, client.timezone, { endOffset: 0, defaultPreset: "90d" });
  const today = todayInTz(client.timezone);

  const [links, stats, byMonth] = await Promise.all([
    getLinks(ctx, selection.current),
    getLinkStats(ctx, selection.current, selection.previous),
    getLinksByMonth(ctx, today, 12),
  ]);

  const byType = new Map<string, number>();
  for (const l of links) byType.set(l.linkType, (byType.get(l.linkType) ?? 0) + 1);

  return (
    <>
      <PageHeader
        eyebrow={client.name}
        title="Links"
        description={`Links omniSEO has built to ${client.domain}.`}
        actions={
          <>
            <DateRangePicker
              preset={selection.preset}
              label={selection.label}
              from={selection.current.from}
              to={selection.current.to}
              compare={selection.compare}
            />
            {isStaff ? (
              <>
                <ImportLinksDialog clientId={client.id} />
                <AddLinkDialog clientId={client.id} today={today} website={client.websiteUrl} />
              </>
            ) : null}
          </>
        }
      />

      {stats.totalAll === 0 ? (
        <Card>
          <EmptyState icon={<Link2 className="h-5 w-5" />} title="No links recorded yet">
            {isStaff
              ? "Record each link as it goes live, or paste a whole spreadsheet with Import. The client sees them here straight away."
              : "Every link we build to your website will be listed here as it goes live."}
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-5">
          <div className={`grid grid-cols-2 gap-4 ${isStaff ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
            <StatTile
              label="Links built"
              value={formatInt(stats.builtInRange)}
              delta={
                stats.builtInPrevious === null
                  ? null
                  : countDelta(stats.builtInRange, stats.builtInPrevious)
              }
              hint={stats.builtInPrevious === null ? selection.label.toLowerCase() : "vs previous period"}
            />
            <StatTile
              label="Average domain rating"
              value={formatDecimal(stats.averageRatingInRange, 0)}
              hint="of links built in this period"
            />
            <StatTile label="Live links" value={formatInt(stats.totalLive)} hint="all time" />
            <StatTile
              label="Referring websites"
              value={formatInt(stats.referringDomains)}
              hint="all time"
            />
            {isStaff && stats.spendInRange !== null ? (
              <StatTile
                label="Spend (omniSEO only)"
                value={formatMoney(stats.spendInRange)}
                hint="in this period"
              />
            ) : null}
          </div>

          <div className="grid gap-5 xl:grid-cols-5">
            <div className="xl:col-span-3">
              <StackedBarChart
                title="Links built each month"
                description="The last 12 months."
                data={byMonth}
                segments={[{ key: "links", label: "Links built", color: SERIES_COLORS[0] }]}
                height={240}
              />
            </div>
            <Card className="xl:col-span-2">
              <CardHeader title="By type" description={describeRange(selection.current)} />
              <div className="px-5 pb-5">
                <BarList
                  items={[...byType.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .map(([type, n]) => ({
                      key: type,
                      label: linkTypeLabel(type),
                      title: linkTypeLabel(type),
                      value: n,
                      display: formatInt(n),
                    }))}
                  emptyMessage="No links were built in this period."
                />
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader
              title="Links built"
              description={`${formatInt(links.length)} between ${describeRange(selection.current)}.`}
            />
            {links.length === 0 ? (
              <p className="px-5 pb-8 text-sm text-muted">
                No links were built in this period. Try a longer date range.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="border-y border-line text-left text-xs text-muted">
                      <th className="px-5 py-2.5 font-medium">Date</th>
                      <th className="px-3 py-2.5 font-medium">Linking website</th>
                      <th className="px-3 py-2.5 font-medium">Links to</th>
                      <th className="px-3 py-2.5 font-medium">Anchor text</th>
                      <th className="px-3 py-2.5 font-medium">Type</th>
                      <th className="px-3 py-2.5 text-right font-medium">DR</th>
                      <th className="px-3 py-2.5 font-medium">Status</th>
                      {isStaff ? <th className="px-3 py-2.5 text-right font-medium">Cost</th> : null}
                      {isStaff ? <th className="py-2.5 pr-5 pl-3" /> : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {links.map((l) => {
                      const staffLink = isStaff ? (l as LinkForStaff) : null;
                      return (
                        <tr key={l.id} className="align-top hover:bg-brand-50/50">
                          <td className="px-5 py-3 whitespace-nowrap text-muted">{formatDay(l.builtOn)}</td>
                          <td className="max-w-64 px-3 py-3">
                            <a
                              href={l.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer nofollow"
                              className="inline-flex max-w-full items-center gap-1.5 font-medium text-ink hover:text-brand-700 hover:underline"
                            >
                              <span className="truncate">{l.sourceDomain}</span>
                              <ExternalLink className="h-3 w-3 shrink-0 text-subtle" aria-hidden="true" />
                            </a>
                            <span className="block truncate text-xs text-muted" title={l.sourceUrl}>
                              {pathOfUrl(l.sourceUrl)}
                            </span>
                            {l.clientNote ? (
                              <span className="mt-1 block text-xs text-muted italic">{l.clientNote}</span>
                            ) : null}
                            {staffLink?.internalNote ? (
                              <span className="mt-1 block text-xs text-warn">
                                Internal: {staffLink.internalNote}
                              </span>
                            ) : null}
                          </td>
                          <td className="max-w-48 px-3 py-3">
                            <a
                              href={l.targetUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block truncate text-xs text-brand-600 hover:underline"
                              title={l.targetUrl}
                            >
                              {pathOfUrl(l.targetUrl)}
                            </a>
                          </td>
                          <td className="max-w-52 px-3 py-3 text-ink">
                            {l.anchorText || <span className="text-subtle">-</span>}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            {linkTypeLabel(l.linkType)}
                            {l.rel !== "dofollow" ? (
                              <span className="ml-1.5 text-xs text-muted">({l.rel})</span>
                            ) : null}
                          </td>
                          <td className="tabular px-3 py-3 text-right">{l.domainRating ?? "-"}</td>
                          <td className="px-3 py-3">
                            <Badge tone={STATUS_TONE[l.status]}>{STATUS_LABEL[l.status]}</Badge>
                          </td>
                          {staffLink ? (
                            <td className="tabular px-3 py-3 text-right text-muted">
                              {staffLink.cost === null ? "-" : formatMoney(Number(staffLink.cost))}
                            </td>
                          ) : null}
                          {staffLink ? (
                            <td className="py-2 pr-4 pl-3">
                              <div className="flex justify-end">
                                <EditLinkDialog
                                  clientId={client.id}
                                  link={staffLink}
                                  today={today}
                                  website={client.websiteUrl}
                                />
                                <DeleteLinkButton
                                  clientId={client.id}
                                  linkId={l.id}
                                  domain={l.sourceDomain}
                                />
                              </div>
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
