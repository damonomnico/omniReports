import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  clients,
  competitorRanks,
  competitors,
  keywords,
  rankResults,
  rankTasks,
} from "@/db/schema";
import {
  DFS_NO_RESULTS,
  DFS_OK,
  type DfsTask,
  type SerpResult,
} from "@/lib/dataforseo/client";
import { parseMapsResult, parseOrganicResult } from "@/lib/dataforseo/parse";

export type IngestOutcome = "stored" | "unknown_task" | "failed";

/**
 * Stores one finished DataForSEO task. Safe to call more than once for the
 * same task (webhook plus fallback collector): the result row is upserted.
 */
export async function ingestSerpTask(task: DfsTask<SerpResult>): Promise<IngestOutcome> {
  if (!task?.id) return "unknown_task";

  const [row] = await db
    .select({ task: rankTasks, keyword: keywords, client: clients })
    .from(rankTasks)
    .innerJoin(keywords, eq(keywords.id, rankTasks.keywordId))
    .innerJoin(clients, eq(clients.id, rankTasks.clientId))
    .where(eq(rankTasks.providerTaskId, task.id));
  if (!row) return "unknown_task";

  const { task: rankTask, keyword, client } = row;
  const noResults = task.status_code === DFS_NO_RESULTS;

  if (task.status_code !== DFS_OK && !noResults) {
    await db
      .update(rankTasks)
      .set({
        status: "failed",
        error: `${task.status_code}: ${task.status_message}`.slice(0, 500),
        completedAt: new Date(),
      })
      .where(eq(rankTasks.id, rankTask.id));
    return "failed";
  }

  const result = task.result?.[0] ?? null;
  const target = { domain: client.domain, businessName: client.businessName ?? client.name };
  const base = {
    clientId: client.id,
    keywordId: keyword.id,
    checkedOn: rankTask.forDate,
    checkedAt: new Date(),
    source: "dataforseo",
  };

  if (rankTask.kind === "maps") {
    const mapsPosition = parseMapsResult(result, target);
    await db
      .insert(rankResults)
      .values({ ...base, mapsPosition })
      .onConflictDoUpdate({
        target: [rankResults.keywordId, rankResults.checkedOn],
        set: { mapsPosition },
      });
  } else {
    const rivals = await db
      .select({ id: competitors.id, domain: competitors.domain })
      .from(competitors)
      .where(eq(competitors.clientId, client.id));
    const parsed = parseOrganicResult(result, target, rivals);
    const values = {
      position: parsed.position,
      absolutePosition: parsed.absolutePosition,
      url: parsed.url,
      localPackPosition: parsed.localPackPosition,
      serpFeatures: parsed.serpFeatures,
      resultsCount: parsed.resultsCount,
      checkedAt: new Date(),
      source: "dataforseo",
    };
    await db
      .insert(rankResults)
      .values({ ...base, ...values })
      .onConflictDoUpdate({
        target: [rankResults.keywordId, rankResults.checkedOn],
        set: values,
      });

    for (const rival of rivals) {
      const o = parsed.competitors[rival.id];
      if (!o) continue;
      const rivalValues = {
        position: o.position,
        url: o.url,
        localPackPosition: o.localPackPosition,
      };
      await db
        .insert(competitorRanks)
        .values({
          clientId: client.id,
          keywordId: keyword.id,
          competitorId: rival.id,
          checkedOn: rankTask.forDate,
          ...rivalValues,
        })
        .onConflictDoUpdate({
          target: [
            competitorRanks.keywordId,
            competitorRanks.competitorId,
            competitorRanks.checkedOn,
          ],
          set: rivalValues,
        });
    }
  }

  await db
    .update(rankTasks)
    .set({ status: "done", error: null, completedAt: new Date() })
    .where(and(eq(rankTasks.id, rankTask.id)));
  return "stored";
}

/** Marks tasks that never came back as failed so they can be retried. */
export async function expireStaleTasks(olderThanHours = 24): Promise<number> {
  const rows = await db
    .update(rankTasks)
    .set({ status: "failed", error: "No result received", completedAt: new Date() })
    .where(
      and(
        eq(rankTasks.status, "posted"),
        sql`${rankTasks.postedAt} < now() - make_interval(hours => ${olderThanHours})`,
      ),
    )
    .returning({ id: rankTasks.id });
  return rows.length;
}
