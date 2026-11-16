import { requireClientAccess } from "@/lib/auth/guards";
import { resolveRange } from "@/lib/dates";
import { ALL_SECTIONS, buildReportData, type ReportSectionKey } from "@/lib/reports/data";
import { renderReportPdf } from "@/lib/reports/pdf";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Downloads the report for a period as a PDF. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const { clientId } = await params;
  const ctx = await requireClientAccess(clientId);
  const url = new URL(request.url);
  const sp = Object.fromEntries(url.searchParams);
  const selection = resolveRange({ ...sp, compare: "1" }, ctx.client.timezone, {
    defaultPreset: "last-month",
  });

  const requested = (url.searchParams.get("sections") ?? "")
    .split(",")
    .filter((s): s is ReportSectionKey => (ALL_SECTIONS as string[]).includes(s));

  // Always the client's view, so a PDF can never carry staff-only fields
  // even when a team member downloads it.
  const data = await buildReportData(
    { ...ctx, isStaff: false },
    selection,
    requested.length > 0 ? requested : ALL_SECTIONS,
  );
  const pdf = await renderReportPdf(data);

  const filename = `${ctx.client.domain}-seo-report-${selection.current.from}-to-${selection.current.to}.pdf`
    .replace(/[^a-z0-9._-]+/gi, "-");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${url.searchParams.get("inline") ? "inline" : "attachment"}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
