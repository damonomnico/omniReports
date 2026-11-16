import "server-only";
import type { ClientContext } from "@/lib/auth/guards";
import { eachDay, todayInTz, type DateRange, type RangeSelection } from "@/lib/dates";
import { demoGa4Report } from "@/lib/demo/google";
import { ttlForRange, withCache } from "./cache";
import { googleFetch } from "./connections";
import { describeFailure, getIntegration } from "./integrations";
import type { Ga4Breakdown, Ga4Point, Ga4Report, Ga4Totals, ReportState } from "./types";

/**
 * Google Analytics 4: Data API for reports, Admin API to list properties.
 * https://developers.google.com/analytics/devguides/reporting/data/v1
 */

type ReportRequest = {
  dateRanges: { startDate: string; endDate: string }[];
  dimensions?: { name: string }[];
  metrics: { name: string }[];
  dimensionFilter?: unknown;
  orderBys?: unknown[];
  limit?: number;
};

type ReportResponse = {
  rows?: { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] }[];
};

const ORGANIC_FILTER = {
  filter: {
    fieldName: "sessionDefaultChannelGroup",
    stringFilter: { matchType: "EXACT", value: "Organic Search" },
  },
};

/** Up to five reports per call. */
async function batch(connectionId: string, propertyId: string, requests: ReportRequest[]) {
  const res = await googleFetch<{ reports?: ReportResponse[] }>(
    connectionId,
    `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:batchRunReports`,
    { body: { requests } },
  );
  return requests.map((_, i) => res.reports?.[i]?.rows ?? []);
}

export type Ga4Property = { id: string; name: string; account: string };

/** Every GA4 property the connected account can read. */
export async function listGa4Properties(connectionId: string): Promise<Ga4Property[]> {
  const out: Ga4Property[] = [];
  let pageToken = "";
  for (let page = 0; page < 10; page++) {
    const res = await googleFetch<{
      accountSummaries?: {
        displayName?: string;
        propertySummaries?: { property: string; displayName?: string }[];
      }[];
      nextPageToken?: string;
    }>(
      connectionId,
      `https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200${
        pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""
      }`,
    );
    for (const account of res.accountSummaries ?? []) {
      for (const p of account.propertySummaries ?? []) {
        out.push({
          id: p.property.replace(/^properties\//, ""),
          name: p.displayName ?? p.property,
          account: account.displayName ?? "",
        });
      }
    }
    if (!res.nextPageToken) break;
    pageToken = res.nextPageToken;
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

const TOTAL_METRICS = [
  "sessions",
  "totalUsers",
  "newUsers",
  "engagedSessions",
  "engagementRate",
  "averageSessionDuration",
  "screenPageViews",
  "keyEvents",
] as const;

const num = (v: string | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function totalsFrom(rows: ReportResponse["rows"]): Ga4Totals {
  const m = rows?.[0]?.metricValues ?? [];
  return {
    sessions: num(m[0]?.value),
    users: num(m[1]?.value),
    newUsers: num(m[2]?.value),
    engagedSessions: num(m[3]?.value),
    engagementRate: num(m[4]?.value),
    averageSessionDuration: num(m[5]?.value),
    pageViews: num(m[6]?.value),
    keyEvents: num(m[7]?.value),
  };
}

/** GA4 returns dates as YYYYMMDD. */
const isoDate = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;

function breakdown(
  current: NonNullable<ReportResponse["rows"]>,
  previous: NonNullable<ReportResponse["rows"]> | null,
): Ga4Breakdown[] {
  const before = new Map(
    (previous ?? []).map((r) => [r.dimensionValues?.[0]?.value ?? "", num(r.metricValues?.[0]?.value)]),
  );
  return current.map((r) => {
    const key = r.dimensionValues?.[0]?.value ?? "";
    return {
      key,
      sessions: num(r.metricValues?.[0]?.value),
      keyEvents: num(r.metricValues?.[1]?.value),
      engagementRate: r.metricValues?.[2] ? num(r.metricValues[2].value) : null,
      previousSessions: previous ? (before.get(key) ?? 0) : null,
    };
  });
}

async function fetchReport(
  connectionId: string,
  propertyId: string,
  selection: RangeSelection,
  segment: "all" | "organic",
): Promise<Ga4Report> {
  const { current, previous } = selection;
  const filter = segment === "organic" ? { dimensionFilter: ORGANIC_FILTER } : {};
  const range = (r: DateRange) => [{ startDate: r.from, endDate: r.to }];
  const bySessions = [{ metric: { metricName: "sessions" }, desc: true }];

  const totals = (r: DateRange): ReportRequest => ({
    dateRanges: range(r),
    metrics: TOTAL_METRICS.map((name) => ({ name })),
    ...filter,
  });
  const daily = (r: DateRange): ReportRequest => ({
    dateRanges: range(r),
    dimensions: [{ name: "date" }],
    metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "keyEvents" }],
    limit: 1000,
    ...filter,
  });
  const by = (dimension: string, r: DateRange, limit: number): ReportRequest => ({
    dateRanges: range(r),
    dimensions: [{ name: dimension }],
    metrics: [{ name: "sessions" }, { name: "keyEvents" }, { name: "engagementRate" }],
    orderBys: bySessions,
    limit,
    ...filter,
  });

  // Channels always describe all traffic, so the organic share stays visible.
  const channels = (r: DateRange): ReportRequest => ({
    dateRanges: range(r),
    dimensions: [{ name: "sessionDefaultChannelGroup" }],
    metrics: [{ name: "sessions" }, { name: "keyEvents" }, { name: "engagementRate" }],
    orderBys: bySessions,
    limit: 12,
  });

  const first: ReportRequest[] = [
    totals(current),
    daily(current),
    channels(current),
    by("landingPagePlusQueryString", current, 50),
    by("deviceCategory", current, 5),
  ];
  const second: ReportRequest[] = previous
    ? [totals(previous), daily(previous), channels(previous), by("landingPagePlusQueryString", previous, 250)]
    : [];

  const [a, b] = await Promise.all([
    batch(connectionId, propertyId, first),
    second.length > 0 ? batch(connectionId, propertyId, second) : Promise.resolve(null),
  ]);

  const dailyMap = (rows: NonNullable<ReportResponse["rows"]>) =>
    new Map(
      rows.map((r) => [
        isoDate(r.dimensionValues?.[0]?.value ?? ""),
        {
          sessions: num(r.metricValues?.[0]?.value),
          users: num(r.metricValues?.[1]?.value),
          keyEvents: num(r.metricValues?.[2]?.value),
        },
      ]),
    );
  const now = dailyMap(a[1]!);
  const before = b ? dailyMap(b[1]!) : null;
  const previousDays = previous ? eachDay(previous) : [];
  const zero = { sessions: 0, users: 0, keyEvents: 0 };

  const series: Ga4Point[] = eachDay(current).map((date, i) => {
    const prevDate = previousDays[i];
    const prev = before && prevDate ? (before.get(prevDate) ?? zero) : null;
    return {
      date,
      ...(now.get(date) ?? zero),
      ...(prev
        ? {
            previousDate: prevDate,
            previousSessions: prev.sessions,
            previousUsers: prev.users,
            previousKeyEvents: prev.keyEvents,
          }
        : {}),
    };
  });

  return {
    segment,
    totals: totalsFrom(a[0]),
    previousTotals: b ? totalsFrom(b[0]) : null,
    series,
    channels: breakdown(a[2]!, b ? b[2]! : null),
    landingPages: breakdown(a[3]!, b ? b[3]! : null),
    devices: a[4]!.map((r) => ({
      key: (r.dimensionValues?.[0]?.value ?? "").toLowerCase(),
      sessions: num(r.metricValues?.[0]?.value),
    })),
  };
}

export async function getGa4Report(
  ctx: ClientContext,
  selection: RangeSelection,
  segment: "all" | "organic" = "all",
): Promise<ReportState<Ga4Report>> {
  if (ctx.client.isDemo) {
    return {
      status: "ok",
      source: "demo",
      fetchedAt: new Date().toISOString(),
      data: demoGa4Report(ctx.client.domain, selection, segment),
    };
  }
  const integration = await getIntegration(ctx, "ga4");
  if (!integration) return { status: "not_connected" };

  const key = `ga4:${integration.externalId}:${segment}:${selection.current.from}:${selection.current.to}:${selection.previous?.from ?? "-"}`;
  try {
    const { value, fetchedAt } = await withCache(
      ctx.client.id,
      key,
      ttlForRange(selection.current, todayInTz(ctx.client.timezone)),
      () => fetchReport(integration.connectionId, integration.externalId, selection, segment),
    );
    return { status: "ok", source: "google", fetchedAt: fetchedAt.toISOString(), data: value };
  } catch (err) {
    return describeFailure(err, ctx, "Google Analytics");
  }
}
