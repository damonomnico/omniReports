"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { keywords, rankResults } from "@/db/schema";
import { requireClientStaff } from "@/lib/auth/guards";
import { isIsoDate, todayInTz } from "@/lib/dates";
import { parseRankImport, type ImportFormat } from "@/lib/rank/import-parse";

export type ImportPreview = {
  format: ImportFormat;
  columns: string[];
  keywordCount: number;
  newKeywordCount: number;
  resultCount: number;
  dateRange: { from: string; to: string } | null;
  sample: { keyword: string; date: string; position: number | null }[];
};

export type ImportState =
  | {
      error?: string;
      message?: string;
      warnings?: string[];
      preview?: ImportPreview;
      imported?: boolean;
    }
  | undefined;

const MAX_BYTES = 7 * 1024 * 1024;

/**
 * Previews or imports ranking history from a CSV export. Imported positions
 * never overwrite positions that omniReports checked itself.
 */
export async function importRankHistoryAction(
  clientId: string,
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const ctx = await requireClientStaff(clientId);
  if (ctx.client.isDemo) return { error: "The demo client uses generated data." };

  const file = formData.get("file");
  let text = String(formData.get("text") ?? "");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) return { error: "That file is over 7 MB. Split it into smaller exports." };
    text = await file.text();
  }
  if (!text.trim()) return { error: "Choose a CSV file or paste the rows from your spreadsheet." };
  if (text.length > MAX_BYTES) return { error: "That is too much data in one go. Import it in parts." };

  const today = todayInTz(ctx.client.timezone);
  const rawDate = String(formData.get("snapshotDate") ?? "");
  const snapshotDate = isIsoDate(rawDate) && rawDate <= today ? rawDate : undefined;
  const device: "desktop" | "mobile" = formData.get("device") === "mobile" ? "mobile" : "desktop";

  const parsed = parseRankImport(text, { snapshotDate });
  if (parsed.keywords.length === 0 || (parsed.results.length === 0 && parsed.format !== "snapshot")) {
    return { error: parsed.warnings[0] ?? "No rankings could be read from that file.", warnings: parsed.warnings.slice(1) };
  }
  const future = parsed.results.filter((r) => r.date > today).length;
  const results = parsed.results.filter((r) => r.date <= today);
  const warnings = [...parsed.warnings];
  if (future > 0) warnings.push(`${future} result${future === 1 ? "" : "s"} dated in the future were ignored.`);

  const existing = await db
    .select({ id: keywords.id, keyword: keywords.keyword })
    .from(keywords)
    .where(and(eq(keywords.clientId, ctx.client.id), eq(keywords.device, device)));
  const idByKeyword = new Map(existing.map((k) => [k.keyword, k.id]));
  const newKeywords = parsed.keywords.filter((k) => !idByKeyword.has(k.keyword));

  const preview: ImportPreview = {
    format: parsed.format,
    columns: parsed.columns,
    keywordCount: parsed.keywords.length,
    newKeywordCount: newKeywords.length,
    resultCount: results.length,
    dateRange: parsed.dateRange,
    sample: results.slice(0, 6).map((r) => ({ keyword: r.keyword, date: r.date, position: r.position })),
  };

  if (formData.get("mode") !== "import") return { preview, warnings };
  if (results.length === 0) {
    return { error: warnings[0] ?? "There are no dated positions to import.", preview, warnings: warnings.slice(1) };
  }

  // 1. Create any keywords that are not tracked yet, using the client's default location.
  for (let i = 0; i < newKeywords.length; i += 500) {
    const created = await db
      .insert(keywords)
      .values(
        newKeywords.slice(i, i + 500).map((k) => ({
          clientId: ctx.client.id,
          keyword: k.keyword,
          locationCode: ctx.client.defaultLocationCode,
          locationName: ctx.client.defaultLocationName,
          languageCode: ctx.client.defaultLanguageCode,
          device,
          tags: k.tags,
          searchVolume: k.volume,
        })),
      )
      .onConflictDoUpdate({
        target: [
          keywords.clientId,
          keywords.keyword,
          keywords.locationCode,
          keywords.languageCode,
          keywords.device,
        ],
        set: { isActive: true },
      })
      .returning({ id: keywords.id, keyword: keywords.keyword });
    for (const k of created) idByKeyword.set(k.keyword, k.id);
  }

  // Fill in search volume and tags on keywords that were already tracked but had none.
  for (const k of parsed.keywords) {
    const id = idByKeyword.get(k.keyword);
    if (!id || (k.volume === null && k.tags.length === 0)) continue;
    await db
      .update(keywords)
      .set({
        ...(k.volume !== null ? { searchVolume: sql`coalesce(${keywords.searchVolume}, ${k.volume})` } : {}),
        ...(k.tags.length > 0
          ? { tags: sql`case when cardinality(${keywords.tags}) = 0 then ${sql`array[${sql.join(k.tags.map((t) => sql`${t}`), sql`, `)}]::text[]`} else ${keywords.tags} end` }
          : {}),
      })
      .where(and(eq(keywords.clientId, ctx.client.id), eq(keywords.id, id)));
  }

  // 2. Store the positions. A date that already has a real check is left alone.
  let stored = 0;
  const rows = results
    .map((r) => ({ r, keywordId: idByKeyword.get(r.keyword) }))
    .filter((x): x is { r: (typeof results)[number]; keywordId: string } => Boolean(x.keywordId));
  for (let i = 0; i < rows.length; i += 1000) {
    const inserted = await db
      .insert(rankResults)
      .values(
        rows.slice(i, i + 1000).map(({ r, keywordId }) => ({
          clientId: ctx.client.id,
          keywordId,
          checkedOn: r.date,
          checkedAt: new Date(`${r.date}T12:00:00Z`),
          position: r.position,
          url: r.url,
          source: "import",
        })),
      )
      .onConflictDoUpdate({
        target: [rankResults.keywordId, rankResults.checkedOn],
        set: { position: sql`excluded.position`, url: sql`excluded.url` },
        setWhere: eq(rankResults.source, "import"),
      })
      .returning({ id: rankResults.id });
    stored += inserted.length;
  }

  revalidatePath(`/c/${ctx.client.id}`, "layout");
  const kept = rows.length - stored;
  return {
    imported: true,
    warnings,
    message:
      `Imported ${stored.toLocaleString("en-GB")} position${stored === 1 ? "" : "s"} for ${parsed.keywords.length.toLocaleString("en-GB")} keyword${parsed.keywords.length === 1 ? "" : "s"}` +
      (newKeywords.length > 0 ? ` (${newKeywords.length} newly added to tracking)` : "") +
      "." +
      (kept > 0 ? ` ${kept} date${kept === 1 ? "" : "s"} already had a live check and were left as they were.` : ""),
  };
}
