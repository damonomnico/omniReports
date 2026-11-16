import "server-only";
import type { ClientContext } from "@/lib/auth/guards";
import { todayInTz, type DateRange, type RangeSelection } from "@/lib/dates";
import { getGa4Report } from "@/lib/google/ga4";
import { getGbpReport } from "@/lib/google/gbp";
import { getGscReport } from "@/lib/google/gsc";
import type { Ga4Report, GbpReport, GscReport } from "@/lib/google/types";
import { getLinks, getLinkStats, type LinkStats } from "@/lib/links/queries";
import type { LinkForClient } from "@/lib/links/types";
import {
  getDistributionSeries,
  getKeywordRows,
  movement,
  summariseRanks,
  type DistributionPoint,
  type KeywordRow,
  type RankSummary,
} from "@/lib/rank/queries";

export const REPORT_SECTIONS = [
  { key: "rankings", label: "Rankings" },
  { key: "gsc", label: "Search Console" },
  { key: "ga4", label: "Analytics" },
  { key: "gbp", label: "Business Profile" },
  { key: "links", label: "Links built" },
] as const;

export type ReportSectionKey = (typeof REPORT_SECTIONS)[number]["key"];
export const ALL_SECTIONS: ReportSectionKey[] = REPORT_SECTIONS.map((s) => s.key);

export type ReportData = {
  client: { id: string; name: string; domain: string };
  period: DateRange;
  previous: DateRange | null;
  generatedOn: string;
  /** True for the demo client: the PDF is stamped as sample data. */
  isSample: boolean;
  rankings: {
    summary: RankSummary;
    depth: number;
    /** Latest band counts in the period. */
    latest: DistributionPoint | null;
    keywords: KeywordRow[];
    movers: { keyword: string; position: number | null; change: number }[];
  } | null;
  gsc: GscReport | null;
  ga4: Ga4Report | null;
  gbp: GbpReport | null;
  links: { stats: LinkStats; built: LinkForClient[] } | null;
  /** Sections that were asked for but have no data source connected. */
  unavailable: string[];
};

/**
 * Collects everything a report shows. Uses the same functions as the
 * dashboard pages, so the PDF always agrees with what the client sees online.
 */
export async function buildReportData(
  ctx: ClientContext,
  selection: RangeSelection,
  sections: ReportSectionKey[] = ALL_SECTIONS,
): Promise<ReportData> {
  const want = (key: ReportSectionKey) => sections.includes(key);
  const unavailable: string[] = [];

  const [gscState, ga4State, gbpState, keywordRows, distribution, linkStats, built] = await Promise.all([
    want("gsc") ? getGscReport(ctx, selection) : null,
    want("ga4") ? getGa4Report(ctx, selection) : null,
    want("gbp") ? getGbpReport(ctx, selection) : null,
    want("rankings") ? getKeywordRows(ctx, selection.current) : null,
    want("rankings") ? getDistributionSeries(ctx, selection.current) : null,
    want("links") ? getLinkStats(ctx, selection.current, selection.previous) : null,
    want("links") ? getLinks(ctx, selection.current) : null,
  ]);

  const pick = <T,>(state: { status: string; data?: T } | null, name: string): T | null => {
    if (!state) return null;
    if (state.status === "ok") return state.data as T;
    unavailable.push(name);
    return null;
  };

  let rankings: ReportData["rankings"] = null;
  if (keywordRows && keywordRows.some((r) => r.checkedOn !== null)) {
    const depth = ctx.client.rankDepth;
    const movers = keywordRows
      .filter((r) => r.checkedOn !== null && r.hasStart)
      .map((r) => ({ keyword: r.keyword, position: r.position, change: movement(r, depth) ?? 0 }))
      .filter((m) => m.change !== 0)
      .sort((a, b) => b.change - a.change);
    rankings = {
      summary: summariseRanks(keywordRows, depth),
      depth,
      latest: distribution?.at(-1) ?? null,
      keywords: [...keywordRows]
        .filter((r) => r.checkedOn !== null)
        .sort((a, b) => (a.position ?? 10_000) - (b.position ?? 10_000) || a.keyword.localeCompare(b.keyword)),
      movers,
    };
  } else if (want("rankings")) {
    unavailable.push("Rankings");
  }

  return {
    client: { id: ctx.client.id, name: ctx.client.name, domain: ctx.client.domain },
    period: selection.current,
    previous: selection.previous,
    generatedOn: todayInTz(ctx.client.timezone),
    isSample: ctx.client.isDemo,
    rankings,
    gsc: pick<GscReport>(gscState, "Search Console"),
    ga4: pick<Ga4Report>(ga4State, "Analytics"),
    gbp: pick<GbpReport>(gbpState, "Business Profile"),
    links: linkStats && built && linkStats.totalAll > 0 ? { stats: linkStats, built: built as LinkForClient[] } : null,
    unavailable,
  };
}
