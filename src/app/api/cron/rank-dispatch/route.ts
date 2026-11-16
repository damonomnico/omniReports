import { rejectUnlessCron } from "@/lib/cron";
import { dispatchRankChecks } from "@/lib/rank/dispatch";
import { refreshSearchVolumes } from "@/lib/rank/volume";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Daily: queue rank checks for every client that is due, then top up search volumes. */
export async function GET(request: Request) {
  const denied = rejectUnlessCron(request);
  if (denied) return denied;

  const ranks = await dispatchRankChecks();
  // Skip the paid volume lookups if the account itself is the problem.
  const volumes =
    ranks.errors.length > 0 && ranks.posted === 0
      ? { requests: 0, updated: 0, cost: 0, errors: [] }
      : await refreshSearchVolumes({ maxRequests: 10 });

  console.info("[cron] rank-dispatch", JSON.stringify({ ranks, volumes }));
  return Response.json({ ok: true, ranks, volumes });
}
