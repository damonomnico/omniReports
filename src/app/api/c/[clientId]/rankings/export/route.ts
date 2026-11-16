import { requireClientAccess } from "@/lib/auth/guards";
import { csvResponse, toCsv } from "@/lib/csv";
import { resolveRange } from "@/lib/dates";
import { parseRankFilters } from "@/lib/rank/params";
import { getKeywordRows } from "@/lib/rank/queries";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const { clientId } = await params;
  const ctx = await requireClientAccess(clientId);
  const sp = Object.fromEntries(new URL(request.url).searchParams);
  const selection = resolveRange(sp, ctx.client.timezone, { endOffset: 0 });
  const rows = await getKeywordRows(ctx, selection.current, parseRankFilters(sp));

  const csv = toCsv(
    [
      "Keyword",
      "Location",
      "Device",
      "Tags",
      "Position",
      `Position on ${selection.current.from}`,
      "Change",
      "Best position",
      "Local pack position",
      "Maps position",
      "Monthly searches",
      "Ranking page",
      "Last checked",
    ],
    rows.map((r) => [
      r.keyword,
      r.locationName,
      r.device,
      r.tags.join("; "),
      r.position,
      r.hasStart ? r.startPosition : null,
      r.hasStart && r.position !== null && r.startPosition !== null
        ? r.startPosition - r.position
        : null,
      r.best,
      r.localPackPosition,
      r.mapsPosition,
      r.searchVolume,
      r.url,
      r.checkedOn,
    ]),
  );
  return csvResponse(`${ctx.client.domain}-rankings-${selection.current.to}.csv`, csv);
}
