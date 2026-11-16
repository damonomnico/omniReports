import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { links } from "@/db/schema";
import type { ClientContext } from "@/lib/auth/guards";
import { addMonths, startOfMonth, type DateRange } from "@/lib/dates";
import type { LinkForClient, LinkForStaff } from "./types";

const clientColumns = {
  id: links.id,
  sourceUrl: links.sourceUrl,
  sourceDomain: links.sourceDomain,
  targetUrl: links.targetUrl,
  anchorText: links.anchorText,
  linkType: links.linkType,
  rel: links.rel,
  domainRating: links.domainRating,
  status: links.status,
  builtOn: links.builtOn,
  clientNote: links.clientNote,
};

/**
 * Links built for the client, newest first. Cost and internal notes are only
 * selected for staff, so they can never reach a client user by accident.
 */
export async function getLinks(
  ctx: ClientContext,
  range?: DateRange,
): Promise<LinkForClient[] | LinkForStaff[]> {
  const where = and(
    eq(links.clientId, ctx.client.id),
    range ? sql`${links.builtOn} between ${range.from} and ${range.to}` : undefined,
  );
  const order = [desc(links.builtOn), desc(links.createdAt)] as const;

  if (ctx.isStaff) {
    return db
      .select({ ...clientColumns, cost: links.cost, internalNote: links.internalNote })
      .from(links)
      .where(where)
      .orderBy(...order);
  }
  return db.select(clientColumns).from(links).where(where).orderBy(...order);
}

export type LinkStats = {
  builtInRange: number;
  builtInPrevious: number | null;
  averageRatingInRange: number | null;
  totalLive: number;
  totalAll: number;
  referringDomains: number;
  /** Spend in the range. Null for client users. */
  spendInRange: number | null;
};

export async function getLinkStats(
  ctx: ClientContext,
  range: DateRange,
  previous: DateRange | null,
): Promise<LinkStats> {
  const result = await db.execute<{
    built: number;
    built_prev: number;
    avg_dr: string | null;
    live: number;
    total: number;
    domains: number;
    spend: string | null;
  }>(sql`
    select
      count(*) filter (where built_on between ${range.from} and ${range.to})::int as built,
      count(*) filter (where built_on between ${previous?.from ?? range.from} and ${previous?.to ?? range.from})::int as built_prev,
      avg(domain_rating) filter (where built_on between ${range.from} and ${range.to})::text as avg_dr,
      count(*) filter (where status = 'live')::int as live,
      count(*)::int as total,
      count(distinct source_domain) filter (where status <> 'lost')::int as domains,
      sum(cost) filter (where built_on between ${range.from} and ${range.to})::text as spend
    from links
    where client_id = ${ctx.client.id}
  `);
  const r = result.rows[0];
  return {
    builtInRange: r?.built ?? 0,
    builtInPrevious: previous ? (r?.built_prev ?? 0) : null,
    averageRatingInRange: r?.avg_dr == null ? null : Number(r.avg_dr),
    totalLive: r?.live ?? 0,
    totalAll: r?.total ?? 0,
    referringDomains: r?.domains ?? 0,
    spendInRange: ctx.isStaff ? (r?.spend == null ? 0 : Number(r.spend)) : null,
  };
}

/** Links built in each of the last `months` calendar months, oldest first. */
export async function getLinksByMonth(
  ctx: ClientContext,
  endDate: string,
  months = 12,
): Promise<{ date: string; links: number }[]> {
  const firstMonth = startOfMonth(addMonths(endDate, -(months - 1)));
  const result = await db.execute<{ month: string; n: number }>(sql`
    select to_char(built_on, 'YYYY-MM') as month, count(*)::int as n
    from links
    where client_id = ${ctx.client.id} and built_on >= ${firstMonth} and built_on <= ${endDate}
    group by 1
  `);
  const counts = new Map(result.rows.map((r) => [r.month, r.n]));
  const out: { date: string; links: number }[] = [];
  for (let i = 0; i < months; i++) {
    const month = addMonths(firstMonth, i).slice(0, 7);
    out.push({ date: month, links: counts.get(month) ?? 0 });
  }
  return out;
}
