import "server-only";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { clients, keywords } from "@/db/schema";
import { fetchSearchVolume } from "@/lib/dataforseo/client";
import { dataForSeoConfigured } from "@/lib/env";

const STALE_DAYS = 30;

export type VolumeSummary = { requests: number; updated: number; cost: number; errors: string[] };

/**
 * Fills in monthly search volume for keywords that have none or whose figure
 * is over a month old. DataForSEO bills per request (not per keyword), so
 * keywords are grouped by location and language and sent together.
 */
export async function refreshSearchVolumes(
  opts: { clientId?: string; maxRequests?: number } = {},
): Promise<VolumeSummary> {
  const summary: VolumeSummary = { requests: 0, updated: 0, cost: 0, errors: [] };
  if (!dataForSeoConfigured()) return summary;

  const stale = new Date(Date.now() - STALE_DAYS * 86_400_000);
  const rows = await db
    .select({
      id: keywords.id,
      keyword: keywords.keyword,
      locationCode: keywords.locationCode,
      languageCode: keywords.languageCode,
    })
    .from(keywords)
    .innerJoin(clients, eq(clients.id, keywords.clientId))
    .where(
      and(
        eq(keywords.isActive, true),
        eq(clients.status, "active"),
        eq(clients.isDemo, false),
        opts.clientId ? eq(keywords.clientId, opts.clientId) : undefined,
        or(isNull(keywords.volumeUpdatedAt), lt(keywords.volumeUpdatedAt, stale)),
      ),
    );

  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = `${r.locationCode}:${r.languageCode}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  for (const group of groups.values()) {
    for (let i = 0; i < group.length; i += 1000) {
      if (summary.requests >= (opts.maxRequests ?? 20)) return summary;
      const chunk = group.slice(i, i + 1000);
      const unique = [...new Set(chunk.map((c) => c.keyword.toLowerCase()))];
      try {
        const { rows: volumes, cost } = await fetchSearchVolume(
          unique,
          chunk[0]!.locationCode,
          chunk[0]!.languageCode,
        );
        summary.requests++;
        summary.cost += cost;
        const byKeyword = new Map(volumes.map((v) => [v.keyword.toLowerCase(), v]));
        for (const k of chunk) {
          const v = byKeyword.get(k.keyword.toLowerCase());
          await db
            .update(keywords)
            .set({
              searchVolume: v?.search_volume ?? null,
              cpc: v?.cpc == null ? null : String(v.cpc),
              volumeUpdatedAt: new Date(),
            })
            .where(eq(keywords.id, k.id));
          summary.updated++;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!summary.errors.includes(message)) summary.errors.push(message);
        return summary;
      }
    }
  }
  return summary;
}

/** Number of keywords waiting for a search volume figure. */
export async function countMissingVolumes(clientId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(keywords)
    .where(
      and(
        eq(keywords.clientId, clientId),
        eq(keywords.isActive, true),
        isNull(keywords.volumeUpdatedAt),
      ),
    );
  return row?.n ?? 0;
}
