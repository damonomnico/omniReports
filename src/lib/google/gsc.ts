import "server-only";
import type { ClientContext } from "@/lib/auth/guards";
import { eachDay, todayInTz, type RangeSelection } from "@/lib/dates";
import { demoGscReport } from "@/lib/demo/google";
import { ttlForRange, withCache } from "./cache";
import { googleFetch } from "./connections";
import { describeFailure, getIntegration } from "./integrations";
import type { GscPoint, GscReport, GscRow, GscTotals, ReportState } from "./types";

/**
 * Search Console API.
 * https://developers.google.com/webmaster-tools/v1/searchanalytics/query
 */

type ApiRow = { keys?: string[]; clicks: number; impressions: number; ctr: number; position: number };
type ApiResponse = { rows?: ApiRow[] };

type Query = {
  startDate: string;
  endDate: string;
  dimensions?: ("date" | "query" | "page" | "device" | "country")[];
  rowLimit?: number;
};

async function query(connectionId: string, siteUrl: string, body: Query): Promise<ApiRow[]> {
  const res = await googleFetch<ApiResponse>(
    connectionId,
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      // "all" includes the most recent days, which Google marks as still settling.
      body: { type: "web", dataState: "all", rowLimit: 1000, ...body },
    },
  );
  return res.rows ?? [];
}

export type GscSite = { siteUrl: string; permissionLevel: string };

/** Verified properties the connected account can read. */
export async function listGscSites(connectionId: string): Promise<GscSite[]> {
  const res = await googleFetch<{ siteEntry?: GscSite[] }>(
    connectionId,
    "https://www.googleapis.com/webmasters/v3/sites",
  );
  return (res.siteEntry ?? [])
    .filter((s) => s.permissionLevel !== "siteUnverifiedUser")
    .sort((a, b) => a.siteUrl.localeCompare(b.siteUrl));
}

/** "sc-domain:example.co.uk" reads better as "example.co.uk (whole domain)". */
export function describeGscSite(siteUrl: string): string {
  return siteUrl.startsWith("sc-domain:")
    ? `${siteUrl.slice("sc-domain:".length)} (whole domain)`
    : siteUrl;
}

export function totalsOf(points: Pick<GscPoint, "clicks" | "impressions" | "position">[]): GscTotals {
  let clicks = 0;
  let impressions = 0;
  let weighted = 0;
  for (const p of points) {
    clicks += p.clicks;
    impressions += p.impressions;
    if (p.position !== null) weighted += p.position * p.impressions;
  }
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: impressions > 0 ? weighted / impressions : null,
  };
}

function mergeRows(current: ApiRow[], previous: ApiRow[] | null, limit: number): GscRow[] {
  const before = new Map((previous ?? []).map((r) => [r.keys?.[0] ?? "", r]));
  return current.slice(0, limit).map((r) => {
    const key = r.keys?.[0] ?? "";
    const prev = before.get(key);
    return {
      key,
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
      previousClicks: previous ? (prev?.clicks ?? 0) : null,
      previousImpressions: previous ? (prev?.impressions ?? 0) : null,
      previousPosition: prev?.position ?? null,
    };
  });
}

async function fetchReport(
  connectionId: string,
  siteUrl: string,
  selection: RangeSelection,
): Promise<GscReport> {
  const { current, previous } = selection;
  const span = { startDate: previous?.from ?? current.from, endDate: current.to };
  const now = { startDate: current.from, endDate: current.to };
  const before = previous ? { startDate: previous.from, endDate: previous.to } : null;

  const [byDate, queries, queriesBefore, pages, pagesBefore, devices, countries] = await Promise.all([
    query(connectionId, siteUrl, { ...span, dimensions: ["date"], rowLimit: 1000 }),
    query(connectionId, siteUrl, { ...now, dimensions: ["query"], rowLimit: 250 }),
    before ? query(connectionId, siteUrl, { ...before, dimensions: ["query"], rowLimit: 1000 }) : null,
    query(connectionId, siteUrl, { ...now, dimensions: ["page"], rowLimit: 250 }),
    before ? query(connectionId, siteUrl, { ...before, dimensions: ["page"], rowLimit: 1000 }) : null,
    query(connectionId, siteUrl, { ...now, dimensions: ["device"] }),
    query(connectionId, siteUrl, { ...now, dimensions: ["country"], rowLimit: 10 }),
  ]);

  const daily = new Map(byDate.map((r) => [r.keys?.[0] ?? "", r]));
  const point = (date: string) => {
    const r = daily.get(date);
    return {
      clicks: r?.clicks ?? 0,
      impressions: r?.impressions ?? 0,
      ctr: r?.ctr ?? 0,
      position: r && r.impressions > 0 ? r.position : null,
    };
  };

  const previousDays = previous ? eachDay(previous) : [];
  const series: GscPoint[] = eachDay(current).map((date, i) => {
    const prevDate = previousDays[i];
    const prev = prevDate ? point(prevDate) : null;
    return {
      date,
      ...point(date),
      ...(prev
        ? {
            previousDate: prevDate,
            previousClicks: prev.clicks,
            previousImpressions: prev.impressions,
            previousCtr: prev.ctr,
            previousPosition: prev.position,
          }
        : {}),
    };
  });

  return {
    totals: totalsOf(series),
    previousTotals: previous ? totalsOf(previousDays.map(point)) : null,
    series,
    queries: mergeRows(queries, queriesBefore, 100),
    pages: mergeRows(pages, pagesBefore, 100),
    devices: devices.map((r) => ({
      key: (r.keys?.[0] ?? "").toLowerCase(),
      clicks: r.clicks,
      impressions: r.impressions,
    })),
    countries: countries.map((r) => ({
      key: (r.keys?.[0] ?? "").toUpperCase(),
      clicks: r.clicks,
      impressions: r.impressions,
    })),
  };
}

export async function getGscReport(
  ctx: ClientContext,
  selection: RangeSelection,
): Promise<ReportState<GscReport>> {
  if (ctx.client.isDemo) {
    return {
      status: "ok",
      source: "demo",
      fetchedAt: new Date().toISOString(),
      data: demoGscReport(ctx.client.domain, selection),
    };
  }
  const integration = await getIntegration(ctx, "gsc");
  if (!integration) return { status: "not_connected" };

  const key = `gsc:${integration.externalId}:${selection.current.from}:${selection.current.to}:${selection.previous?.from ?? "-"}`;
  try {
    const { value, fetchedAt } = await withCache(
      ctx.client.id,
      key,
      ttlForRange(selection.current, todayInTz(ctx.client.timezone)),
      () => fetchReport(integration.connectionId, integration.externalId, selection),
    );
    return { status: "ok", source: "google", fetchedAt: fetchedAt.toISOString(), data: value };
  } catch (err) {
    return describeFailure(err, ctx, "Search Console");
  }
}
