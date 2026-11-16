import "server-only";
import { safeEqual } from "@/lib/crypto";
import { cronSecret } from "@/lib/env";

/**
 * Guards the scheduled endpoints. Vercel Cron sends
 * "Authorization: Bearer <CRON_SECRET>" automatically when the CRON_SECRET
 * environment variable is set. Returns an error response, or null if allowed.
 */
export function rejectUnlessCron(request: Request): Response | null {
  const secret = cronSecret();
  if (!secret) {
    return Response.json(
      { error: "CRON_SECRET is not set (needs at least 16 characters)." },
      { status: 503 },
    );
  }
  const header = request.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!given || !safeEqual(given, secret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
