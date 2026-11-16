import "server-only";
import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { rankTasks } from "@/db/schema";
import {
  DataForSeoError,
  DFS_IN_PROGRESS,
  getSerpTask,
  listReadyTasks,
} from "@/lib/dataforseo/client";
import { dataForSeoConfigured } from "@/lib/env";
import { expireStaleTasks, ingestSerpTask } from "./ingest";

export type CollectSummary = { stored: number; failed: number; pending: number; expired: number; errors: string[] };

async function collectOne(kind: "organic" | "maps", providerTaskId: string, summary: CollectSummary) {
  try {
    const task = await getSerpTask(kind, providerTaskId);
    if (!task) return;
    if (DFS_IN_PROGRESS.has(task.status_code)) {
      summary.pending++;
      return;
    }
    const outcome = await ingestSerpTask(task);
    if (outcome === "stored") summary.stored++;
    else if (outcome === "failed") summary.failed++;
  } catch (err) {
    if (err instanceof DataForSeoError && DFS_IN_PROGRESS.has(err.code)) {
      summary.pending++;
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    if (summary.errors.length < 5 && !summary.errors.includes(message)) summary.errors.push(message);
  }
}

/**
 * Fallback for the webhook: asks DataForSEO which tasks are finished and
 * stores any we have not received yet. Run on a schedule.
 */
export async function collectReadyTasks(limit = 400): Promise<CollectSummary> {
  const summary: CollectSummary = { stored: 0, failed: 0, pending: 0, expired: 0, errors: [] };
  if (!dataForSeoConfigured()) return summary;

  try {
    const ready = await listReadyTasks();
    if (ready.length > 0) {
      const ours = await db
        .select({ providerTaskId: rankTasks.providerTaskId, kind: rankTasks.kind })
        .from(rankTasks)
        .where(
          and(
            eq(rankTasks.status, "posted"),
            inArray(
              rankTasks.providerTaskId,
              ready.map((r) => r.id),
            ),
          ),
        )
        .limit(limit);
      for (const t of ours) {
        if (t.providerTaskId) await collectOne(t.kind, t.providerTaskId, summary);
      }
    }
  } catch (err) {
    summary.errors.push(err instanceof Error ? err.message : String(err));
  }

  summary.expired = await expireStaleTasks(24);
  return summary;
}

/**
 * Checks one client's outstanding tasks directly. Used by the "refresh"
 * button and wherever the webhook cannot reach the app (local development).
 */
export async function collectForClient(clientId: string, limit = 150): Promise<CollectSummary> {
  const summary: CollectSummary = { stored: 0, failed: 0, pending: 0, expired: 0, errors: [] };
  if (!dataForSeoConfigured()) return summary;

  const outstanding = await db
    .select({ providerTaskId: rankTasks.providerTaskId, kind: rankTasks.kind })
    .from(rankTasks)
    .where(
      and(
        eq(rankTasks.clientId, clientId),
        eq(rankTasks.status, "posted"),
        isNotNull(rankTasks.providerTaskId),
        // Give DataForSEO a moment before the first poll.
        sql`${rankTasks.postedAt} < now() - interval '20 seconds'`,
      ),
    )
    .orderBy(asc(rankTasks.postedAt))
    .limit(limit);

  // A few at a time keeps well inside DataForSEO's 30 simultaneous requests.
  for (let i = 0; i < outstanding.length; i += 8) {
    await Promise.all(
      outstanding
        .slice(i, i + 8)
        .map((t) => collectOne(t.kind, t.providerTaskId!, summary)),
    );
    if (summary.errors.length > 0) break;
  }
  return summary;
}
