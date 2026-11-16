import "server-only";
import { and, eq, gt, like, lt } from "drizzle-orm";
import { db } from "@/db";
import { apiCache } from "@/db/schema";
import { addDays, type DateRange } from "@/lib/dates";

/**
 * Remembers API responses in Postgres so dashboards load quickly and stay
 * well inside Google's quotas. Entries are scoped to one client.
 */
export async function withCache<T>(
  clientId: string,
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<{ value: T; fetchedAt: Date }> {
  const [hit] = await db
    .select({ payload: apiCache.payload, fetchedAt: apiCache.fetchedAt })
    .from(apiCache)
    .where(
      and(eq(apiCache.clientId, clientId), eq(apiCache.cacheKey, key), gt(apiCache.expiresAt, new Date())),
    );
  if (hit) return { value: hit.payload as T, fetchedAt: hit.fetchedAt };

  const value = await load();
  const now = new Date();
  const row = { payload: value as object, fetchedAt: now, expiresAt: new Date(now.getTime() + ttlMs) };
  await db
    .insert(apiCache)
    .values({ clientId, cacheKey: key, ...row })
    .onConflictDoUpdate({ target: [apiCache.clientId, apiCache.cacheKey], set: row });

  // Occasional housekeeping of this client's expired entries.
  if (Math.random() < 0.05) {
    await db
      .delete(apiCache)
      .where(and(eq(apiCache.clientId, clientId), lt(apiCache.expiresAt, now)));
  }
  return { value, fetchedAt: now };
}

/** Recent data keeps changing for a few days; older data is settled. */
export function ttlForRange(range: DateRange, today: string): number {
  return range.to >= addDays(today, -7) ? 3 * 3_600_000 : 7 * 86_400_000;
}

/** Drops cached responses for one data source, e.g. after switching property. */
export async function clearCache(clientId: string, prefix: string): Promise<void> {
  await db
    .delete(apiCache)
    .where(and(eq(apiCache.clientId, clientId), like(apiCache.cacheKey, `${prefix}:%`)));
}
