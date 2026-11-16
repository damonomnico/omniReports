import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { competitorRanks, competitors, keywords, rankResults } from "@/db/schema";
import type { ClientContext } from "@/lib/auth/guards";
import { addDays, type DateRange } from "@/lib/dates";

export type RankFilters = { device?: "desktop" | "mobile"; tag?: string };

export type KeywordRow = {
  id: string;
  keyword: string;
  locationName: string;
  device: "desktop" | "mobile";
  tags: string[];
  trackMaps: boolean;
  searchVolume: number | null;
  /** Latest position on or before the end of the range. Null = not found. */
  position: number | null;
  /** Date of that latest check, or null if never checked. */
  checkedOn: string | null;
  url: string | null;
  localPackPosition: number | null;
  mapsPosition: number | null;
  serpFeatures: string[];
  /** Position at the start of the range (or the first check inside it). */
  startPosition: number | null;
  /** False when there is nothing earlier to compare with. */
  hasStart: boolean;
  best: number | null;
  /** Positions across the range, oldest first, for the trend line. */
  trend: (number | null)[];
};

function filterSql(filters: RankFilters) {
  return sql`${filters.device ? sql`and k.device = ${filters.device}` : sql``} ${
    filters.tag ? sql`and ${filters.tag} = any(k.tags)` : sql``
  }`;
}

/** One row per tracked keyword with its current, starting and best positions. */
export async function getKeywordRows(
  ctx: ClientContext,
  range: DateRange,
  filters: RankFilters = {},
): Promise<KeywordRow[]> {
  const clientId = ctx.client.id;
  const result = await db.execute<{
    id: string;
    keyword: string;
    location_name: string;
    device: "desktop" | "mobile";
    tags: string[];
    track_maps: boolean;
    search_volume: number | null;
    position: number | null;
    checked_on: string | null;
    url: string | null;
    local_pack_position: number | null;
    maps_position: number | null;
    serp_features: string[] | null;
    base_position: number | null;
    base_on: string | null;
    first_position: number | null;
    first_on: string | null;
    best: number | null;
  }>(sql`
    select
      k.id, k.keyword, k.location_name, k.device, k.tags, k.track_maps, k.search_volume,
      cur.position, cur.checked_on::text as checked_on, cur.url,
      cur.local_pack_position, cur.maps_position, cur.serp_features,
      base.position as base_position, base.checked_on::text as base_on,
      firstin.position as first_position, firstin.checked_on::text as first_on,
      agg.best
    from keywords k
    left join lateral (
      select r.position, r.checked_on, r.url, r.local_pack_position, r.maps_position, r.serp_features
      from rank_results r
      where r.keyword_id = k.id and r.checked_on <= ${range.to}
      order by r.checked_on desc limit 1
    ) cur on true
    left join lateral (
      select r.position, r.checked_on from rank_results r
      where r.keyword_id = k.id and r.checked_on <= ${range.from}
      order by r.checked_on desc limit 1
    ) base on true
    left join lateral (
      select r.position, r.checked_on from rank_results r
      where r.keyword_id = k.id and r.checked_on > ${range.from} and r.checked_on <= ${range.to}
      order by r.checked_on asc limit 1
    ) firstin on true
    left join lateral (
      select min(r.position) as best from rank_results r where r.keyword_id = k.id
    ) agg on true
    where k.client_id = ${clientId} and k.is_active ${filterSql(filters)}
    order by k.keyword asc, k.device asc
  `);

  const trendRows = await db.execute<{ keyword_id: string; position: number | null }>(sql`
    select r.keyword_id, r.position
    from rank_results r
    join keywords k on k.id = r.keyword_id
    where r.client_id = ${clientId} and k.is_active ${filterSql(filters)}
      and r.checked_on between ${range.from} and ${range.to}
    order by r.checked_on asc
  `);
  const trends = new Map<string, (number | null)[]>();
  for (const t of trendRows.rows) {
    if (!trends.has(t.keyword_id)) trends.set(t.keyword_id, []);
    trends.get(t.keyword_id)!.push(t.position);
  }

  return result.rows.map((r) => {
    // Compare with the position at the start of the range; if the keyword was
    // first checked during the range, compare with that first check instead.
    const hasBase = r.base_on !== null;
    const hasFirst = r.first_on !== null && r.first_on !== r.checked_on;
    return {
      id: r.id,
      keyword: r.keyword,
      locationName: r.location_name,
      device: r.device,
      tags: r.tags ?? [],
      trackMaps: r.track_maps,
      searchVolume: r.search_volume,
      position: r.position,
      checkedOn: r.checked_on,
      url: r.url,
      localPackPosition: r.local_pack_position,
      mapsPosition: r.maps_position,
      serpFeatures: r.serp_features ?? [],
      startPosition: hasBase ? r.base_position : hasFirst ? r.first_position : null,
      hasStart: hasBase || hasFirst,
      best: r.best,
      trend: trends.get(r.id) ?? [],
    };
  });
}

export type RankSummary = {
  total: number;
  checked: number;
  ranked: number;
  top3: number;
  top10: number;
  top20: number;
  top100: number;
  averagePosition: number | null;
  /** Same figures at the start of the range, for keywords that have a comparison. */
  start: { top3: number; top10: number; top20: number; averagePosition: number | null };
  comparable: number;
  improved: number;
  declined: number;
  unchanged: number;
  /** Sum of positions gained minus positions lost across comparable keywords. */
  netChange: number;
  lastChecked: string | null;
};

/** A missing rank is treated as one past the tracked depth when measuring movement. */
export function movement(row: Pick<KeywordRow, "position" | "startPosition" | "hasStart">, depth: number): number | null {
  if (!row.hasStart) return null;
  const from = row.startPosition ?? depth + 1;
  const to = row.position ?? depth + 1;
  return from - to;
}

export function summariseRanks(rows: KeywordRow[], depth: number): RankSummary {
  const checked = rows.filter((r) => r.checkedOn !== null);
  const ranked = checked.filter((r) => r.position !== null);
  const within = (n: number, pick: (r: KeywordRow) => number | null) =>
    checked.filter((r) => {
      const p = pick(r);
      return p !== null && p <= n;
    }).length;
  const avg = (values: (number | null)[]) => {
    const nums = values.filter((v): v is number => v !== null);
    return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
  };

  const comparable = checked.filter((r) => r.hasStart);
  let improved = 0;
  let declined = 0;
  let unchanged = 0;
  let netChange = 0;
  for (const r of comparable) {
    const m = movement(r, depth) ?? 0;
    netChange += m;
    if (m > 0) improved++;
    else if (m < 0) declined++;
    else unchanged++;
  }

  const lastChecked = checked.reduce<string | null>(
    (max, r) => (r.checkedOn && (!max || r.checkedOn > max) ? r.checkedOn : max),
    null,
  );

  return {
    total: rows.length,
    checked: checked.length,
    ranked: ranked.length,
    top3: within(3, (r) => r.position),
    top10: within(10, (r) => r.position),
    top20: within(20, (r) => r.position),
    top100: within(100, (r) => r.position),
    averagePosition: avg(ranked.map((r) => r.position)),
    start: {
      top3: comparable.filter((r) => r.startPosition !== null && r.startPosition <= 3).length,
      top10: comparable.filter((r) => r.startPosition !== null && r.startPosition <= 10).length,
      top20: comparable.filter((r) => r.startPosition !== null && r.startPosition <= 20).length,
      averagePosition: avg(comparable.map((r) => r.startPosition)),
    },
    comparable: comparable.length,
    improved,
    declined,
    unchanged,
    netChange,
    lastChecked,
  };
}

export type DistributionPoint = {
  date: string;
  top3: number;
  top10: number;
  top20: number;
  top50: number;
  top100: number;
  unranked: number;
  averagePosition: number | null;
};

/** Keywords per position band for each check date in the range. */
export async function getDistributionSeries(
  ctx: ClientContext,
  range: DateRange,
  filters: RankFilters = {},
): Promise<DistributionPoint[]> {
  const result = await db.execute<{
    date: string;
    top3: number;
    top10: number;
    top20: number;
    top50: number;
    top100: number;
    unranked: number;
    average_position: string | null;
  }>(sql`
    select
      r.checked_on::text as date,
      count(*) filter (where r.position between 1 and 3)::int as top3,
      count(*) filter (where r.position between 4 and 10)::int as top10,
      count(*) filter (where r.position between 11 and 20)::int as top20,
      count(*) filter (where r.position between 21 and 50)::int as top50,
      count(*) filter (where r.position > 50)::int as top100,
      count(*) filter (where r.position is null)::int as unranked,
      avg(r.position)::text as average_position
    from rank_results r
    join keywords k on k.id = r.keyword_id
    where r.client_id = ${ctx.client.id} and k.is_active ${filterSql(filters)}
      and r.checked_on between ${range.from} and ${range.to}
    group by r.checked_on
    order by r.checked_on asc
  `);

  const points: DistributionPoint[] = result.rows.map((r) => ({
    date: r.date,
    top3: r.top3,
    top10: r.top10,
    top20: r.top20,
    top50: r.top50,
    top100: r.top100,
    unranked: r.unranked,
    averagePosition: r.average_position === null ? null : Number(r.average_position),
  }));
  return points;
}

/**
 * Thins a daily series for column charts: beyond about two months of daily
 * checks the columns stop being readable, so keep the last check of each week
 * (or of each month for very long ranges).
 */
export function bucketDistribution(points: DistributionPoint[]): DistributionPoint[] {
  if (points.length <= 62) return points;
  const monthly = points.length > 420;
  const bucket = (d: string) => {
    if (monthly) return d.slice(0, 7);
    const day = new Date(`${d}T00:00:00Z`).getUTCDay();
    return addDays(d, -((day + 6) % 7)); // Monday of that week
  };
  const byBucket = new Map<string, DistributionPoint>();
  for (const p of points) byBucket.set(bucket(p.date), p);
  return [...byBucket.values()];
}

export type KeywordHistoryPoint = {
  date: string;
  position: number | null;
  url: string | null;
  localPackPosition: number | null;
  mapsPosition: number | null;
  serpFeatures: string[];
  competitors: Record<string, number | null>;
};

/** A single keyword (must belong to the client) with its full history in range. */
export async function getKeywordHistory(ctx: ClientContext, keywordId: string, range: DateRange) {
  const [keyword] = await db
    .select()
    .from(keywords)
    .where(and(eq(keywords.id, keywordId), eq(keywords.clientId, ctx.client.id)));
  if (!keyword) return null;

  const rivals = await db
    .select()
    .from(competitors)
    .where(eq(competitors.clientId, ctx.client.id))
    .orderBy(asc(competitors.label));

  const results = await db
    .select()
    .from(rankResults)
    .where(
      and(
        eq(rankResults.keywordId, keyword.id),
        sql`${rankResults.checkedOn} between ${range.from} and ${range.to}`,
      ),
    )
    .orderBy(asc(rankResults.checkedOn));

  const rivalRanks = await db
    .select()
    .from(competitorRanks)
    .where(
      and(
        eq(competitorRanks.keywordId, keyword.id),
        sql`${competitorRanks.checkedOn} between ${range.from} and ${range.to}`,
      ),
    );
  const rivalByDate = new Map<string, Record<string, number | null>>();
  for (const r of rivalRanks) {
    if (!rivalByDate.has(r.checkedOn)) rivalByDate.set(r.checkedOn, {});
    rivalByDate.get(r.checkedOn)![r.competitorId] = r.position;
  }

  const [stats] = await db
    .select({
      best: sql<number | null>`min(${rankResults.position})`,
      firstOn: sql<string | null>`min(${rankResults.checkedOn})::text`,
      checks: sql<number>`count(*)::int`,
    })
    .from(rankResults)
    .where(eq(rankResults.keywordId, keyword.id));

  const points: KeywordHistoryPoint[] = results.map((r) => ({
    date: r.checkedOn,
    position: r.position,
    url: r.url,
    localPackPosition: r.localPackPosition,
    mapsPosition: r.mapsPosition,
    serpFeatures: r.serpFeatures,
    competitors: rivalByDate.get(r.checkedOn) ?? {},
  }));

  return { keyword, competitors: rivals, points, stats: stats ?? { best: null, firstOn: null, checks: 0 } };
}

export type CompetitorComparison = {
  competitors: { id: string; label: string; domain: string }[];
  /** Summary per domain. `id` is null for the client itself. */
  summary: {
    id: string | null;
    label: string;
    domain: string;
    ranked: number;
    top3: number;
    top10: number;
    averagePosition: number | null;
  }[];
  rows: {
    keywordId: string;
    keyword: string;
    locationName: string;
    device: "desktop" | "mobile";
    own: number | null;
    rivals: Record<string, number | null>;
  }[];
};

/** Latest position for the client and each competitor on every keyword. */
export async function getCompetitorComparison(
  ctx: ClientContext,
  range: DateRange,
  filters: RankFilters = {},
): Promise<CompetitorComparison> {
  const rivals = await db
    .select({ id: competitors.id, label: competitors.label, domain: competitors.domain })
    .from(competitors)
    .where(eq(competitors.clientId, ctx.client.id))
    .orderBy(asc(competitors.label));

  const own = await getKeywordRows(ctx, range, filters);

  const latest = await db.execute<{
    keyword_id: string;
    competitor_id: string;
    position: number | null;
  }>(sql`
    select distinct on (cr.keyword_id, cr.competitor_id)
      cr.keyword_id, cr.competitor_id, cr.position
    from competitor_ranks cr
    where cr.client_id = ${ctx.client.id} and cr.checked_on <= ${range.to}
    order by cr.keyword_id, cr.competitor_id, cr.checked_on desc
  `);
  const byKeyword = new Map<string, Record<string, number | null>>();
  for (const r of latest.rows) {
    if (!byKeyword.has(r.keyword_id)) byKeyword.set(r.keyword_id, {});
    byKeyword.get(r.keyword_id)![r.competitor_id] = r.position;
  }

  const rows = own
    .filter((k) => k.checkedOn !== null)
    .map((k) => ({
      keywordId: k.id,
      keyword: k.keyword,
      locationName: k.locationName,
      device: k.device,
      own: k.position,
      rivals: byKeyword.get(k.id) ?? {},
    }));

  const stats = (label: string, domain: string, id: string | null, positions: (number | null)[]) => {
    const nums = positions.filter((p): p is number => p !== null);
    return {
      id,
      label,
      domain,
      ranked: nums.length,
      top3: nums.filter((p) => p <= 3).length,
      top10: nums.filter((p) => p <= 10).length,
      averagePosition: nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null,
    };
  };

  return {
    competitors: rivals,
    summary: [
      stats(ctx.client.name, ctx.client.domain, null, rows.map((r) => r.own)),
      ...rivals.map((c) =>
        stats(c.label, c.domain, c.id, rows.map((r) => r.rivals[c.id] ?? null)),
      ),
    ],
    rows,
  };
}

/** Every distinct tag used on the client's keywords. */
export async function getKeywordTags(ctx: ClientContext): Promise<string[]> {
  const result = await db.execute<{ tag: string }>(sql`
    select distinct unnest(k.tags) as tag
    from keywords k
    where k.client_id = ${ctx.client.id} and k.is_active
    order by 1
  `);
  return result.rows.map((r) => r.tag);
}

/** Most recent failures, so staff can see why checks are not arriving. */
export async function getRecentTaskErrors(ctx: ClientContext) {
  const result = await db.execute<{ error: string; n: number; last: string }>(sql`
    select t.error, count(*)::int as n, max(t.completed_at)::text as last
    from rank_tasks t
    where t.client_id = ${ctx.client.id} and t.status = 'failed'
      and t.completed_at > now() - interval '3 days' and t.error is not null
    group by t.error
    order by max(t.completed_at) desc
    limit 3
  `);
  return result.rows;
}


/** Counts used by the "Check now" dialog. */
export async function getCheckStatus(ctx: ClientContext, today: string) {
  const result = await db.execute<{ total: number; done_today: number; pending: number; maps: number }>(sql`
    select
      (select count(*)::int from keywords k where k.client_id = ${ctx.client.id} and k.is_active) as total,
      (select count(*)::int from keywords k where k.client_id = ${ctx.client.id} and k.is_active and k.track_maps) as maps,
      (select count(distinct t.keyword_id)::int from rank_tasks t
         join keywords k on k.id = t.keyword_id and k.is_active
        where t.client_id = ${ctx.client.id} and t.for_date = ${today}
          and t.kind = 'organic' and t.status in ('posted', 'done')) as done_today,
      (select count(*)::int from rank_tasks t
        where t.client_id = ${ctx.client.id} and t.status = 'posted') as pending
  `);
  const row = result.rows[0] ?? { total: 0, done_today: 0, pending: 0, maps: 0 };
  return {
    keywordCount: row.total,
    mapsCount: row.maps,
    dueCount: Math.max(row.total - row.done_today, 0),
    pending: row.pending,
  };
}
