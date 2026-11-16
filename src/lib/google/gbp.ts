import "server-only";
import type { ClientContext } from "@/lib/auth/guards";
import {
  eachDay,
  formatMonth,
  startOfMonth,
  todayInTz,
  type DateRange,
  type RangeSelection,
} from "@/lib/dates";
import { demoGbpReport } from "@/lib/demo/google";
import { ttlForRange, withCache } from "./cache";
import { googleFetch } from "./connections";
import { describeFailure, getIntegration } from "./integrations";
import type { GbpPoint, GbpReport, GbpReview, GbpTotals, ReportState } from "./types";

/**
 * Google Business Profile.
 * Performance API: https://developers.google.com/my-business/reference/performance/rest
 * A location is stored as "accounts/{a}/locations/{l}": the performance
 * endpoints need "locations/{l}" and reviews need the full path.
 */

const METRICS = [
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
  "CALL_CLICKS",
  "WEBSITE_CLICKS",
  "BUSINESS_DIRECTION_REQUESTS",
] as const;
type Metric = (typeof METRICS)[number];

type ApiDate = { year?: number; month?: number; day?: number };
type PerformanceResponse = {
  multiDailyMetricTimeSeries?: {
    dailyMetricTimeSeries?: {
      dailyMetric: Metric;
      timeSeries?: { datedValues?: { date: ApiDate; value?: string }[] };
    }[];
  }[];
};

function splitDate(prefix: string, date: string): [string, string][] {
  const [y, m, d] = date.split("-").map(Number);
  return [
    [`${prefix}.year`, String(y)],
    [`${prefix}.month`, String(m)],
    [`${prefix}.day`, String(d)],
  ];
}

const locationOnly = (externalId: string) => externalId.replace(/^accounts\/[^/]+\//, "");

async function fetchDaily(connectionId: string, externalId: string, range: DateRange) {
  const params = new URLSearchParams();
  for (const m of METRICS) params.append("dailyMetrics", m);
  for (const [k, v] of [
    ...splitDate("dailyRange.start_date", range.from),
    ...splitDate("dailyRange.end_date", range.to),
  ]) {
    params.set(k, v);
  }
  const res = await googleFetch<PerformanceResponse>(
    connectionId,
    `https://businessprofileperformance.googleapis.com/v1/${locationOnly(externalId)}:fetchMultiDailyMetricsTimeSeries?${params}`,
  );

  // date -> metric -> value
  const byDate = new Map<string, Partial<Record<Metric, number>>>();
  for (const group of res.multiDailyMetricTimeSeries ?? []) {
    for (const series of group.dailyMetricTimeSeries ?? []) {
      for (const dv of series.timeSeries?.datedValues ?? []) {
        const { year, month, day } = dv.date ?? {};
        if (!year || !month || !day) continue;
        const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        if (!byDate.has(date)) byDate.set(date, {});
        // Zero values are omitted by the API.
        byDate.get(date)![series.dailyMetric] = Number(dv.value ?? 0) || 0;
      }
    }
  }
  return byDate;
}

type Day = Partial<Record<Metric, number>>;
const v = (d: Day | undefined, m: Metric) => d?.[m] ?? 0;

function dayNumbers(d: Day | undefined) {
  const search = v(d, "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH") + v(d, "BUSINESS_IMPRESSIONS_MOBILE_SEARCH");
  const maps = v(d, "BUSINESS_IMPRESSIONS_DESKTOP_MAPS") + v(d, "BUSINESS_IMPRESSIONS_MOBILE_MAPS");
  const calls = v(d, "CALL_CLICKS");
  const websiteClicks = v(d, "WEBSITE_CLICKS");
  const directions = v(d, "BUSINESS_DIRECTION_REQUESTS");
  return {
    impressions: search + maps,
    searchImpressions: search,
    mapsImpressions: maps,
    calls,
    websiteClicks,
    directions,
    actions: calls + websiteClicks + directions,
  };
}

function sumTotals(days: (Day | undefined)[]): GbpTotals {
  const total: GbpTotals = {
    impressions: 0,
    searchImpressions: 0,
    mapsImpressions: 0,
    calls: 0,
    websiteClicks: 0,
    directions: 0,
    actions: 0,
  };
  for (const d of days) {
    const n = dayNumbers(d);
    for (const key of Object.keys(total) as (keyof GbpTotals)[]) total[key] += n[key];
  }
  return total;
}

type KeywordResponse = {
  searchKeywordsCounts?: {
    searchKeyword: string;
    insightsValue?: { value?: string; threshold?: string };
  }[];
  nextPageToken?: string;
};

/** Search terms are only reported per calendar month. */
async function fetchKeywords(connectionId: string, externalId: string, range: DateRange) {
  const from = startOfMonth(range.from);
  const to = startOfMonth(range.to);
  const params = new URLSearchParams({
    "monthlyRange.start_month.year": from.slice(0, 4),
    "monthlyRange.start_month.month": String(Number(from.slice(5, 7))),
    "monthlyRange.end_month.year": to.slice(0, 4),
    "monthlyRange.end_month.month": String(Number(to.slice(5, 7))),
    pageSize: "100",
  });
  const res = await googleFetch<KeywordResponse>(
    connectionId,
    `https://businessprofileperformance.googleapis.com/v1/${locationOnly(externalId)}/searchkeywords/impressions/monthly?${params}`,
  );
  const keywords = (res.searchKeywordsCounts ?? [])
    .map((k) => ({
      keyword: k.searchKeyword,
      impressions: k.insightsValue?.value ? Number(k.insightsValue.value) : null,
      lessThan: k.insightsValue?.threshold ? Number(k.insightsValue.threshold) : null,
    }))
    .sort((a, b) => (b.impressions ?? 0) - (a.impressions ?? 0))
    .slice(0, 50);
  const period = from === to ? formatMonth(from) : `${formatMonth(from)} to ${formatMonth(to)}`;
  return { keywords, period };
}

const STARS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

type ReviewsResponse = {
  reviews?: {
    reviewer?: { displayName?: string };
    starRating?: string;
    comment?: string;
    createTime?: string;
    reviewReply?: unknown;
  }[];
  averageRating?: number;
  totalReviewCount?: number;
};

async function fetchReviews(connectionId: string, externalId: string) {
  const res = await googleFetch<ReviewsResponse>(
    connectionId,
    `https://mybusiness.googleapis.com/v4/${externalId}/reviews?pageSize=10&orderBy=${encodeURIComponent("updateTime desc")}`,
  );
  const recent: GbpReview[] = (res.reviews ?? []).map((r) => ({
    reviewer: r.reviewer?.displayName ?? "Google user",
    rating: STARS[r.starRating ?? ""] ?? 0,
    // Google appends an auto-translation after this marker.
    comment: (r.comment ?? "").split("\n\n(Translated by Google)")[0]!.slice(0, 600),
    createdAt: r.createTime ?? "",
    replied: Boolean(r.reviewReply),
  }));
  return {
    averageRating: res.averageRating ?? null,
    total: res.totalReviewCount ?? recent.length,
    recent,
  };
}

async function fetchReport(
  connectionId: string,
  externalId: string,
  selection: RangeSelection,
): Promise<GbpReport> {
  const { current, previous } = selection;
  const span: DateRange = {
    from: previous?.from ?? current.from,
    to: current.to,
    days: 0,
  };
  const warnings: string[] = [];
  const optional = async <T>(label: string, load: () => Promise<T>): Promise<T | null> => {
    try {
      return await load();
    } catch (err) {
      console.error(`[gbp] ${label} failed`, err);
      warnings.push(label);
      return null;
    }
  };

  const [byDate, keywordData, reviews] = await Promise.all([
    fetchDaily(connectionId, externalId, span),
    optional("Search terms", () => fetchKeywords(connectionId, externalId, current)),
    externalId.startsWith("accounts/")
      ? optional("Reviews", () => fetchReviews(connectionId, externalId))
      : Promise.resolve(null),
  ]);

  const previousDays = previous ? eachDay(previous) : [];
  const currentDays = eachDay(current);
  const series: GbpPoint[] = currentDays.map((date, i) => {
    const n = dayNumbers(byDate.get(date));
    const prevDate = previousDays[i];
    const p = prevDate ? dayNumbers(byDate.get(prevDate)) : null;
    return {
      date,
      impressions: n.impressions,
      actions: n.actions,
      calls: n.calls,
      websiteClicks: n.websiteClicks,
      directions: n.directions,
      ...(p ? { previousDate: prevDate, previousImpressions: p.impressions, previousActions: p.actions } : {}),
    };
  });

  const days = currentDays.map((d) => byDate.get(d));
  const surface = (m: Metric) => days.reduce((sum, d) => sum + v(d, m), 0);

  return {
    totals: sumTotals(days),
    previousTotals: previous ? sumTotals(previousDays.map((d) => byDate.get(d))) : null,
    series,
    surfaces: [
      { key: "Google Search on mobile", value: surface("BUSINESS_IMPRESSIONS_MOBILE_SEARCH") },
      { key: "Google Search on desktop", value: surface("BUSINESS_IMPRESSIONS_DESKTOP_SEARCH") },
      { key: "Google Maps on mobile", value: surface("BUSINESS_IMPRESSIONS_MOBILE_MAPS") },
      { key: "Google Maps on desktop", value: surface("BUSINESS_IMPRESSIONS_DESKTOP_MAPS") },
    ].sort((a, b) => b.value - a.value),
    keywords: keywordData?.keywords ?? [],
    keywordsPeriod: keywordData?.period ?? null,
    reviews,
    warnings,
  };
}

export type GbpLocation = { id: string; name: string; address: string };

/** Every location in every Business Profile account the connection can manage. */
export async function listGbpLocations(connectionId: string): Promise<GbpLocation[]> {
  const accountList: { name: string; accountName?: string }[] = [];
  let accountToken = "";
  for (let page = 0; page < 5; page++) {
    const res = await googleFetch<{
      accounts?: { name: string; accountName?: string }[];
      nextPageToken?: string;
    }>(
      connectionId,
      `https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20${
        accountToken ? `&pageToken=${encodeURIComponent(accountToken)}` : ""
      }`,
    );
    accountList.push(...(res.accounts ?? []));
    if (!res.nextPageToken) break;
    accountToken = res.nextPageToken;
  }
  const out: GbpLocation[] = [];
  for (const account of accountList) {
    let pageToken = "";
    for (let page = 0; page < 10; page++) {
      const res = await googleFetch<{
        locations?: {
          name: string;
          title?: string;
          storefrontAddress?: { addressLines?: string[]; locality?: string; postalCode?: string };
        }[];
        nextPageToken?: string;
      }>(
        connectionId,
        `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title,storefrontAddress&pageSize=100${
          pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""
        }`,
      );
      for (const l of res.locations ?? []) {
        const a = l.storefrontAddress;
        out.push({
          id: `${account.name}/${l.name}`,
          name: l.title ?? l.name,
          address: [...(a?.addressLines ?? []), a?.locality, a?.postalCode].filter(Boolean).join(", "),
        });
      }
      if (!res.nextPageToken) break;
      pageToken = res.nextPageToken;
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getGbpReport(
  ctx: ClientContext,
  selection: RangeSelection,
): Promise<ReportState<GbpReport>> {
  if (ctx.client.isDemo) {
    return {
      status: "ok",
      source: "demo",
      fetchedAt: new Date().toISOString(),
      data: demoGbpReport(ctx.client.domain, selection),
    };
  }
  const integration = await getIntegration(ctx, "gbp");
  if (!integration) return { status: "not_connected" };

  const key = `gbp:${integration.externalId}:${selection.current.from}:${selection.current.to}:${selection.previous?.from ?? "-"}`;
  try {
    const { value, fetchedAt } = await withCache(
      ctx.client.id,
      key,
      ttlForRange(selection.current, todayInTz(ctx.client.timezone)),
      () => fetchReport(integration.connectionId, integration.externalId, selection),
    );
    return { status: "ok", source: "google", fetchedAt: fetchedAt.toISOString(), data: value };
  } catch (err) {
    return describeFailure(err, ctx, "Business Profile");
  }
}

