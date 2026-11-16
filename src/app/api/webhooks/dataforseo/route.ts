import { gunzipSync } from "node:zlib";
import { safeEqual } from "@/lib/crypto";
import { getSerpTask, type DfsTask, type SerpResult } from "@/lib/dataforseo/client";
import { webhookToken } from "@/lib/rank/dispatch";
import { ingestSerpTask } from "@/lib/rank/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY_BYTES = 25 * 1024 * 1024;

/** Accepts the full API envelope, a bare task, or a list of tasks. */
function tasksIn(body: unknown): DfsTask<SerpResult>[] {
  if (!body || typeof body !== "object") return [];
  if (Array.isArray(body)) return body.flatMap(tasksIn);
  const obj = body as { tasks?: unknown; id?: unknown; result?: unknown };
  if (Array.isArray(obj.tasks)) return obj.tasks as DfsTask<SerpResult>[];
  if (typeof obj.id === "string" && "result" in obj) return [obj as unknown as DfsTask<SerpResult>];
  return [];
}

/**
 * DataForSEO posts each finished rank check here (gzip-compressed JSON). The
 * URL also carries the task id, so if the body cannot be used the result is
 * fetched from the API instead. Any failure returns an error status, which
 * makes DataForSEO list the task as "ready" for the collector job to pick up.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  let expected: string;
  try {
    expected = webhookToken();
  } catch {
    return Response.json({ error: "Not configured" }, { status: 503 });
  }
  if (!token || !safeEqual(token, expected)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let tasks: DfsTask<SerpResult>[] = [];
  try {
    let raw: Buffer = Buffer.from(await request.arrayBuffer());
    if (raw.length > MAX_BODY_BYTES) {
      return Response.json({ error: "Payload too large" }, { status: 413 });
    }
    // gzip magic number: the body may or may not already be decompressed
    // by the platform in front of us.
    if (raw.length > 2 && raw[0] === 0x1f && raw[1] === 0x8b) {
      raw = gunzipSync(raw, { maxOutputLength: 200 * 1024 * 1024 });
    }
    tasks = tasksIn(JSON.parse(raw.toString("utf8")));
  } catch {
    // Fall through: the task id in the URL lets us fetch the result ourselves.
  }

  let stored = 0;
  for (const task of tasks) {
    if ((await ingestSerpTask(task)) === "stored") stored++;
  }

  if (stored === 0) {
    const id = url.searchParams.get("id");
    const kind = url.searchParams.get("kind") === "maps" ? "maps" : "organic";
    if (id && /^[0-9a-f-]{20,60}$/i.test(id)) {
      try {
        const task = await getSerpTask(kind, id);
        if (task && (await ingestSerpTask(task)) === "stored") stored++;
      } catch (err) {
        console.error("[dataforseo webhook] could not fetch task", id, err);
      }
    }
  }

  if (stored === 0) {
    return Response.json({ ok: false, error: "No matching task could be stored" }, { status: 422 });
  }
  return Response.json({ ok: true, stored });
}
