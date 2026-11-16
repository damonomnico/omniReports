import "server-only";
import { createHmac } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { clients, keywords, rankTasks, type Client } from "@/db/schema";
import {
  MAX_TASKS_PER_POST,
  postMapsTasks,
  postOrganicTasks,
  type SerpTaskInput,
} from "@/lib/dataforseo/client";
import { isoWeekday, todayInTz } from "@/lib/dates";
import { appSecret, appUrl, dataForSeoConfigured } from "@/lib/env";

/**
 * Token DataForSEO echoes back on the webhook URL. Derived from APP_SECRET so
 * no reusable secret is ever sent to a third party.
 */
export function webhookToken(): string {
  return createHmac("sha256", appSecret()).update("dataforseo-webhook").digest("base64url");
}

/** Public webhook URL, or null when the app is not reachable from the internet. */
export function postbackUrl(kind: "organic" | "maps"): string | undefined {
  const base = appUrl();
  if (/\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(base) || !base.startsWith("https://")) {
    return undefined;
  }
  // $id and $tag are substituted by DataForSEO.
  return `${base}/api/webhooks/dataforseo?token=${webhookToken()}&kind=${kind}&id=$id&tag=$tag`;
}

/** Whether a client's schedule says to check rankings on the given date. */
export function isDueOn(client: Pick<Client, "rankFrequency" | "rankWeekday">, date: string): boolean {
  switch (client.rankFrequency) {
    case "daily":
      return true;
    case "weekly":
      return isoWeekday(date) === client.rankWeekday;
    case "monthly":
      return date.endsWith("-01");
    default:
      return false;
  }
}

export type DispatchSummary = {
  clients: number;
  posted: number;
  failed: number;
  skipped: number;
  cost: number;
  errors: string[];
};

/**
 * Queues rank checks with DataForSEO.
 * With no clientId it processes every active client that is due today (the
 * daily cron). With a clientId it checks that client now ("Check now").
 * Keywords that already have a pending or finished check for the date are
 * skipped unless `force` is set, so running it twice never double-bills.
 */
export async function dispatchRankChecks(
  opts: { clientId?: string; force?: boolean; priority?: 1 | 2 } = {},
): Promise<DispatchSummary> {
  const summary: DispatchSummary = {
    clients: 0,
    posted: 0,
    failed: 0,
    skipped: 0,
    cost: 0,
    errors: [],
  };
  if (!dataForSeoConfigured()) {
    summary.errors.push("DataForSEO is not configured.");
    return summary;
  }

  const candidates = await db
    .select()
    .from(clients)
    .where(
      and(
        eq(clients.status, "active"),
        eq(clients.isDemo, false),
        opts.clientId ? eq(clients.id, opts.clientId) : undefined,
      ),
    );

  for (const client of candidates) {
    const forDate = todayInTz(client.timezone);
    if (!opts.clientId && !isDueOn(client, forDate)) continue;

    const active = await db
      .select()
      .from(keywords)
      .where(and(eq(keywords.clientId, client.id), eq(keywords.isActive, true)));
    if (active.length === 0) continue;

    // What is already queued or finished for this date.
    const existing = await db
      .select({ keywordId: rankTasks.keywordId, kind: rankTasks.kind })
      .from(rankTasks)
      .where(
        and(
          eq(rankTasks.clientId, client.id),
          eq(rankTasks.forDate, forDate),
          inArray(rankTasks.status, ["posted", "done"]),
        ),
      );
    const have = new Set(existing.map((e) => `${e.keywordId}:${e.kind}`));

    const jobs: { kind: "organic" | "maps"; keywordId: string; input: Omit<SerpTaskInput, "tag"> }[] = [];
    for (const k of active) {
      const input = {
        keyword: k.keyword,
        locationCode: k.locationCode,
        languageCode: k.languageCode,
        device: k.device,
        depth: client.rankDepth,
        priority: opts.priority ?? 1,
      } as const;
      if (opts.force || !have.has(`${k.id}:organic`)) {
        jobs.push({ kind: "organic", keywordId: k.id, input });
      } else {
        summary.skipped++;
      }
      if (k.trackMaps && (opts.force || !have.has(`${k.id}:maps`))) {
        jobs.push({ kind: "maps", keywordId: k.id, input });
      }
    }
    if (jobs.length === 0) continue;
    summary.clients++;

    for (const kind of ["organic", "maps"] as const) {
      const ofKind = jobs.filter((j) => j.kind === kind);
      for (let i = 0; i < ofKind.length; i += MAX_TASKS_PER_POST) {
        const chunk = ofKind.slice(i, i + MAX_TASKS_PER_POST);
        // Create our records first so each task carries its id as the tag.
        const records = await db
          .insert(rankTasks)
          .values(
            chunk.map((j) => ({
              clientId: client.id,
              keywordId: j.keywordId,
              kind,
              forDate,
              status: "posted" as const,
            })),
          )
          .returning({ id: rankTasks.id });

        const inputs: SerpTaskInput[] = chunk.map((j, idx) => ({
          ...j.input,
          tag: records[idx]!.id,
          postbackUrl: postbackUrl(kind),
        }));

        try {
          const posted =
            kind === "organic" ? await postOrganicTasks(inputs) : await postMapsTasks(inputs);
          for (const p of posted) {
            if (p.ok && p.id) {
              await db
                .update(rankTasks)
                .set({ providerTaskId: p.id, cost: String(p.cost) })
                .where(eq(rankTasks.id, p.tag));
              summary.posted++;
              summary.cost += p.cost;
            } else {
              await db
                .update(rankTasks)
                .set({
                  status: "failed",
                  error: `${p.statusCode}: ${p.statusMessage}`.slice(0, 500),
                  completedAt: new Date(),
                })
                .where(eq(rankTasks.id, p.tag));
              summary.failed++;
              if (summary.errors.length < 5) summary.errors.push(p.statusMessage);
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await db
            .update(rankTasks)
            .set({ status: "failed", error: message.slice(0, 500), completedAt: new Date() })
            .where(
              inArray(
                rankTasks.id,
                records.map((r) => r.id),
              ),
            );
          summary.failed += records.length;
          if (!summary.errors.includes(message)) summary.errors.push(message);
          // An account-level problem (no credit, unverified) will fail every
          // remaining batch too, so stop instead of hammering the API.
          return summary;
        }
      }
    }
  }
  return summary;
}

/** How many checks are still waiting on DataForSEO for a client. */
export async function countPendingTasks(clientId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(rankTasks)
    .where(and(eq(rankTasks.clientId, clientId), eq(rankTasks.status, "posted")));
  return row?.n ?? 0;
}
