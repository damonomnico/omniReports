import { gunzipSync } from "node:zlib";
import { safeEqual } from "@/lib/crypto";
import type { DfsEnvelope, SerpResult } from "@/lib/dataforseo/client";
import { webhookToken } from "@/lib/rank/dispatch";
import { ingestSerpTask } from "@/lib/rank/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY_BYTES = 25 * 1024 * 1024;

/**
 * DataForSEO posts each finished rank check here (gzip-compressed JSON in the
 * same shape as task_get). If this endpoint fails or is slow, DataForSEO puts
 * the task on its "ready" list and the collector cron picks it up instead.
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

  let envelope: DfsEnvelope<SerpResult>;
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
    envelope = JSON.parse(raw.toString("utf8")) as DfsEnvelope<SerpResult>;
  } catch {
    return Response.json({ error: "Unreadable body" }, { status: 400 });
  }

  let stored = 0;
  let unknown = 0;
  for (const task of envelope.tasks ?? []) {
    const outcome = await ingestSerpTask(task);
    if (outcome === "stored") stored++;
    if (outcome === "unknown_task") unknown++;
  }
  return Response.json({ ok: true, stored, unknown });
}
