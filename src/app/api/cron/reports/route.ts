import { rejectUnlessCron } from "@/lib/cron";
import { runDueReports } from "@/lib/reports/schedule";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Daily: email every scheduled report that is due today. */
export async function GET(request: Request) {
  const denied = rejectUnlessCron(request);
  if (denied) return denied;

  const summary = await runDueReports();
  console.info("[cron] reports", JSON.stringify(summary));
  return Response.json({ ok: true, ...summary });
}
