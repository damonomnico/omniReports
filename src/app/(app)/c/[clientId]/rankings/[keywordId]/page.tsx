import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Monitor, Pencil, Smartphone } from "lucide-react";
import { TimeSeriesChart } from "@/components/charts/time-series-chart";
import { MovementBadge, PositionValue } from "@/components/rank/movement-badge";
import { DeleteKeywordButton, EditKeywordForm } from "@/components/rank/rank-dialogs";
import { DateRangePicker } from "@/components/shell/date-range-picker";
import { PageHeader } from "@/components/shell/page-header";
import { Badge, Card, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { StatTile } from "@/components/ui/stat-tile";
import { deleteKeywordAndReturnAction } from "@/lib/actions/rank";
import { requireClientAccess } from "@/lib/auth/guards";
import { formatDay, resolveRange } from "@/lib/dates";
import { formatInt, pathOfUrl } from "@/lib/format";
import { describeMovement, FEATURE_LABELS, OWNED_FEATURES } from "@/lib/rank/display";
import { carryQuery } from "@/lib/rank/params";
import { getKeywordHistory } from "@/lib/rank/queries";

export const metadata: Metadata = { title: "Keyword" };

export default async function KeywordPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string; keywordId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { clientId, keywordId } = await params;
  const sp = await searchParams;
  const ctx = await requireClientAccess(clientId);
  const { client, isStaff } = ctx;

  const selection = resolveRange(sp, client.timezone, { endOffset: 0, defaultPreset: "90d" });
  const history = /^[0-9a-f-]{36}$/i.test(keywordId)
    ? await getKeywordHistory(ctx, keywordId, selection.current)
    : null;
  if (!history) notFound();

  const { keyword, competitors, points, stats } = history;
  const query = carryQuery(sp);
  const latest = points.at(-1) ?? null;
  const first = points[0] ?? null;
  const movement = describeMovement(
    latest?.position ?? null,
    first?.position ?? null,
    points.length > 1,
    latest !== null,
  );

  const chartData = points.map((p) => ({
    date: p.date,
    own: p.position,
    ...Object.fromEntries(competitors.map((c) => [c.id, p.competitors[c.id] ?? null])),
  }));
  const maxPosition = Math.max(
    10,
    ...points.flatMap((p) => [p.position ?? 0, ...competitors.map((c) => p.competitors[c.id] ?? 0)]),
  );

  // Newest first for the table, each row compared with the check before it.
  const tableRows = points
    .map((p, i) => ({ ...p, previous: i > 0 ? points[i - 1]! : null }))
    .reverse()
    .slice(0, 31);

  return (
    <>
      <Link
        href={`/c/${client.id}/rankings${query ? `?${query}` : ""}`}
        className="no-print mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All keywords
      </Link>

      <PageHeader
        eyebrow={`${client.name} · Rankings`}
        title={keyword.keyword}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              {keyword.device === "mobile" ? (
                <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Monitor className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Google {keyword.device}
            </span>
            <span>{keyword.locationName.replace(/,/g, ", ")}</span>
            {keyword.tags.map((t) => (
              <Badge key={t}>{t}</Badge>
            ))}
          </span>
        }
        actions={
          <>
            <DateRangePicker
              preset={selection.preset}
              label={selection.label}
              from={selection.current.from}
              to={selection.current.to}
              compare={selection.compare}
              showCompare={false}
            />
            {isStaff ? (
              <>
                <Dialog
                  trigger={
                    <>
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                      Edit
                    </>
                  }
                  triggerVariant="secondary"
                  title="Edit keyword"
                >
                  <EditKeywordForm
                    clientId={client.id}
                    keywordId={keyword.id}
                    tags={keyword.tags}
                    trackMaps={keyword.trackMaps}
                  />
                </Dialog>
                <DeleteKeywordButton
                  onDelete={deleteKeywordAndReturnAction.bind(null, client.id, keyword.id)}
                />
              </>
            ) : null}
          </>
        }
      />

      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile
            label="Current position"
            value={
              <PositionValue
                position={latest?.position ?? null}
                checked={latest !== null}
                depth={client.rankDepth}
                className="font-display"
              />
            }
            hint={
              <span className="inline-flex items-center gap-1.5">
                <MovementBadge movement={movement} />
                {points.length > 1 ? `since ${formatDay(first!.date)}` : null}
              </span>
            }
          />
          <StatTile
            label="Best position"
            value={stats.best ?? "-"}
            hint={stats.firstOn ? `Tracked since ${formatDay(stats.firstOn)}` : undefined}
          />
          <StatTile
            label="Local pack"
            value={latest?.localPackPosition ?? "-"}
            hint={
              latest?.localPackPosition
                ? "Position in the map results"
                : latest?.serpFeatures.includes("local_pack")
                  ? "Map results shown, not listed"
                  : "No map results for this search"
            }
          />
          <StatTile
            label="Searches per month"
            value={keyword.searchVolume === null ? "-" : formatInt(keyword.searchVolume)}
            hint={keyword.locationName.split(",")[0]}
          />
        </div>

        <TimeSeriesChart
          title="Position over time"
          description={
            competitors.length > 0
              ? `${client.domain} against tracked competitors. Higher on the chart is better.`
              : "Higher on the chart is better. Gaps mean the site was not found."
          }
          data={chartData}
          series={[
            { key: "own", label: client.name },
            ...competitors.map((c) => ({ key: c.id, label: c.label })),
          ]}
          format="position"
          invert
          yMax={maxPosition}
          height={320}
          emptyMessage="No checks in this period yet."
        />

        {latest && latest.serpFeatures.length > 0 ? (
          <Card>
            <CardHeader
              title="What Google shows for this search"
              description={`Features on the results page at the last check (${formatDay(latest.date)}).`}
            />
            <div className="flex flex-wrap gap-2 px-5 pb-5">
              {latest.serpFeatures.map((f) => (
                <Badge key={f} tone={OWNED_FEATURES.has(f) ? "lime" : "brand"} className="px-2 py-1 text-xs">
                  {FEATURE_LABELS[f] ?? f}
                </Badge>
              ))}
            </div>
          </Card>
        ) : null}

        <Card>
          <CardHeader
            title="Check history"
            description={
              points.length > 31
                ? "The 31 most recent checks. Use Show table on the chart above for the whole period."
                : "Most recent first."
            }
          />
          {tableRows.length === 0 ? (
            <p className="px-5 pb-6 text-sm text-muted">No checks in this period yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-y border-line text-left text-xs text-muted">
                    <th className="px-5 py-2.5 font-medium">Date</th>
                    <th className="px-3 py-2.5 text-right font-medium">Position</th>
                    <th className="px-3 py-2.5 text-right font-medium">Change</th>
                    <th className="px-3 py-2.5 text-right font-medium">Local pack</th>
                    {keyword.trackMaps ? (
                      <th className="px-3 py-2.5 text-right font-medium">Maps</th>
                    ) : null}
                    <th className="px-5 py-2.5 font-medium">Ranking page</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {tableRows.map((p) => (
                    <tr key={p.date}>
                      <td className="px-5 py-2 text-muted">{formatDay(p.date)}</td>
                      <td className="px-3 py-2 text-right">
                        <PositionValue position={p.position} checked depth={client.rankDepth} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <MovementBadge
                          movement={describeMovement(
                            p.position,
                            p.previous?.position ?? null,
                            p.previous !== null,
                            true,
                          )}
                        />
                      </td>
                      <td className="tabular px-3 py-2 text-right">{p.localPackPosition ?? "-"}</td>
                      {keyword.trackMaps ? (
                        <td className="tabular px-3 py-2 text-right">{p.mapsPosition ?? "-"}</td>
                      ) : null}
                      <td className="max-w-72 px-5 py-2">
                        {p.url ? (
                          <a
                            href={p.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block truncate text-xs text-brand-600 hover:underline"
                            title={p.url}
                          >
                            {pathOfUrl(p.url)}
                          </a>
                        ) : (
                          <span className="text-xs text-subtle">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
