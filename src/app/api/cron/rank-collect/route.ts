import { rejectUnlessCron } from "@/lib/cron";
import { collectReadyTasks } from "@/lib/rank/collect";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Safety net for the webhook: picks up finished rank checks we did not receive. */
export async function GET(request: Request) {
  const denied = rejectUnlessCron(request);
  if (denied) return denied;

  const summary = await collectReadyTasks();
  console.info("[cron] rank-collect", JSON.stringify(summary));
  return Response.json({ ok: true, ...summary });
}
