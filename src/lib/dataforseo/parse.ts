import { hostMatchesDomain } from "@/lib/format";
import type { SerpItem, SerpResult } from "./client";

/**
 * Turns a raw DataForSEO results page into the numbers the rank tracker
 * stores. Pure functions with no I/O so they are easy to test.
 */

export type Target = { domain: string; businessName?: string | null };

export type RankOutcome = {
  /** Position among the ranking results on the page. Null = not found. */
  position: number | null;
  /** Position counting every element on the page (ads, packs, features). */
  absolutePosition: number | null;
  url: string | null;
  /** Position inside the local pack (1 to 3), when the business appears. */
  localPackPosition: number | null;
};

export type ParsedOrganic = RankOutcome & {
  serpFeatures: string[];
  resultsCount: number | null;
  competitors: Record<string, RankOutcome>;
};

/** SERP elements worth showing as badges, in display order. */
const FEATURES = [
  "ai_overview",
  "featured_snippet",
  "local_pack",
  "people_also_ask",
  "knowledge_graph",
  "images",
  "video",
  "top_stories",
  "shopping",
  "paid",
] as const;

function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(ltd|limited|llp|plc|inc|llc|co)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Loose business-name match: equal, or one contains the other as whole words. */
export function businessNameMatches(listingTitle: string | null | undefined, businessName: string | null | undefined): boolean {
  if (!listingTitle || !businessName) return false;
  const a = normaliseName(listingTitle);
  const b = normaliseName(businessName);
  if (!a || !b || b.length < 3) return false;
  if (a === b) return true;
  return ` ${a} `.includes(` ${b} `) || (a.length >= 6 && ` ${b} `.includes(` ${a} `));
}

function listingMatches(item: SerpItem, target: Target): boolean {
  if (hostMatchesDomain(item.domain ?? null, target.domain)) return true;
  if (item.url && hostMatchesDomain(safeHost(item.url), target.domain)) return true;
  return businessNameMatches(item.title, target.businessName);
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * The results a person reads as "the rankings": the featured snippet (if any)
 * followed by the organic results, in page order. A featured snippet counts
 * as position 1 and pushes the organic results down by one, which matches
 * what the searcher sees.
 */
function rankingResults(items: SerpItem[]): SerpItem[] {
  return items
    .filter((i) => i.type === "organic" || i.type === "featured_snippet")
    .sort((a, b) => (a.rank_absolute ?? 1e9) - (b.rank_absolute ?? 1e9));
}

function outcomeFor(items: SerpItem[], ranked: SerpItem[], target: Target): RankOutcome {
  const index = ranked.findIndex(
    (i) =>
      hostMatchesDomain(i.domain ?? null, target.domain) ||
      (i.url ? hostMatchesDomain(safeHost(i.url), target.domain) : false),
  );
  const hit = index >= 0 ? ranked[index]! : null;

  const pack = items
    .filter((i) => i.type === "local_pack")
    .sort((a, b) => (a.rank_group ?? 1e9) - (b.rank_group ?? 1e9));
  const packIndex = pack.findIndex((i) => listingMatches(i, target));

  return {
    position: hit ? index + 1 : null,
    absolutePosition: hit?.rank_absolute ?? null,
    url: hit?.url ?? null,
    localPackPosition: packIndex >= 0 ? (pack[packIndex]!.rank_group ?? packIndex + 1) : null,
  };
}

/** True if the client is cited anywhere inside an AI overview block. */
function citedInAiOverview(items: SerpItem[], domain: string): boolean {
  const seen = new Set<unknown>();
  const walk = (node: unknown, depth: number): boolean => {
    if (!node || typeof node !== "object" || depth > 6 || seen.has(node)) return false;
    seen.add(node);
    if (Array.isArray(node)) return node.some((n) => walk(n, depth + 1));
    const obj = node as Record<string, unknown>;
    if (typeof obj.domain === "string" && hostMatchesDomain(obj.domain, domain)) return true;
    if (typeof obj.url === "string" && hostMatchesDomain(safeHost(obj.url), domain)) return true;
    return Object.values(obj).some((v) => walk(v, depth + 1));
  };
  return items.filter((i) => i.type === "ai_overview").some((i) => walk(i, 0));
}

export function parseOrganicResult(
  result: SerpResult | null | undefined,
  target: Target,
  competitors: { id: string; domain: string }[] = [],
): ParsedOrganic {
  const items = result?.items ?? [];
  const ranked = rankingResults(items);
  const types = new Set<string>([...(result?.item_types ?? []), ...items.map((i) => i.type)]);

  const serpFeatures: string[] = FEATURES.filter((f) => types.has(f));
  const own = outcomeFor(items, ranked, target);

  // Extra markers for features the client itself holds.
  const ownsSnippet = ranked.some(
    (i) => i.type === "featured_snippet" && hostMatchesDomain(i.domain ?? null, target.domain),
  );
  if (ownsSnippet) serpFeatures.push("featured_snippet_owned");
  if (types.has("ai_overview") && citedInAiOverview(items, target.domain)) {
    serpFeatures.push("ai_overview_cited");
  }

  const competitorOutcomes: Record<string, RankOutcome> = {};
  for (const c of competitors) {
    competitorOutcomes[c.id] = outcomeFor(items, ranked, { domain: c.domain });
  }

  return {
    ...own,
    serpFeatures,
    resultsCount: result?.se_results_count ?? null,
    competitors: competitorOutcomes,
  };
}

/** Position of the business in a Google Maps search, or null. */
export function parseMapsResult(result: SerpResult | null | undefined, target: Target): number | null {
  const listings = (result?.items ?? [])
    .filter((i) => i.type === "maps_search")
    .sort((a, b) => (a.rank_group ?? 1e9) - (b.rank_group ?? 1e9));
  const index = listings.findIndex((i) => listingMatches(i, target));
  return index >= 0 ? (listings[index]!.rank_group ?? index + 1) : null;
}
